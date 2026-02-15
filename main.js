const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
const ALLOWED_FORMATS = new Set(['mp3', 'mp4']);
const ALLOWED_RESOLUTIONS = new Set(['144', '360', '480', '720', '1080', '2160']);
const runningDownloads = new Map();
const SETTINGS_FILE = 'settings.json';

function getToolPath(toolName) {
  if (isDev) {
    return path.join(__dirname, 'tools', toolName);
  }
  return path.join(process.resourcesPath, 'tools', toolName);
}

let mainWindow;

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

function readSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function isSafeHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateFolder(outputFolder) {
  if (typeof outputFolder !== 'string' || outputFolder.length === 0) {
    throw new Error('Output folder is required.');
  }

  const resolvedFolder = path.resolve(outputFolder);
  if (!path.isAbsolute(resolvedFolder)) {
    throw new Error('Output folder must be an absolute path.');
  }
  if (!fs.existsSync(resolvedFolder)) {
    throw new Error('Output folder does not exist.');
  }
  if (!fs.statSync(resolvedFolder).isDirectory()) {
    throw new Error('Output folder must be a directory.');
  }

  return resolvedFolder;
}

function validateFetchInput(url) {
  if (!isSafeHttpUrl(url)) {
    throw new Error('Invalid URL. Only HTTP/HTTPS URLs are allowed.');
  }
}

function validateDownloadInput(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid download request.');
  }

  const { url, outputFolder, format, resolution, downloadId } = payload;

  if (!isSafeHttpUrl(url)) {
    throw new Error('Invalid URL. Only HTTP/HTTPS URLs are allowed.');
  }
  if (!ALLOWED_FORMATS.has(format)) {
    throw new Error('Invalid format.');
  }
  if (format === 'mp4' && !ALLOWED_RESOLUTIONS.has(String(resolution || ''))) {
    throw new Error('Invalid resolution.');
  }
  if (format === 'mp3' && resolution !== null && resolution !== undefined) {
    throw new Error('Resolution is not allowed for MP3 downloads.');
  }
  if (!Number.isInteger(downloadId) || downloadId < 1) {
    throw new Error('Invalid download ID.');
  }

  return {
    url,
    outputFolder: validateFolder(outputFolder),
    format,
    resolution: format === 'mp4' ? String(resolution) : null,
    downloadId
  };
}

function validateDownloadId(downloadId) {
  if (!Number.isInteger(downloadId) || downloadId < 1) {
    throw new Error('Invalid download ID.');
  }
  return downloadId;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 950,
    height: 700,
    minWidth: 750,
    minHeight: 550,
    icon: path.join(__dirname, 'assets', 'icon.ico'), // ← add this line
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    frame: false,
    backgroundColor: '#0f0f1a'
  });

  mainWindow.loadFile('renderer/index.html');

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith('file://')) {
      event.preventDefault();
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Select download folder ──
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  const folder = result.filePaths[0];
  const settings = readSettings();
  settings.downloadFolder = folder;
  writeSettings(settings);
  return folder;
});

ipcMain.handle('get-download-folder', async () => {
  const settings = readSettings();
  const savedFolder = settings.downloadFolder;
  if (typeof savedFolder !== 'string' || savedFolder.length === 0) {
    return '';
  }
  try {
    const resolved = path.resolve(savedFolder);
    if (!fs.existsSync(resolved)) return '';
    if (!fs.statSync(resolved).isDirectory()) return '';
    return resolved;
  } catch {
    return '';
  }
});

ipcMain.handle('set-download-folder', async (event, folderPath) => {
  try {
    const resolvedFolder = validateFolder(folderPath);
    const settings = readSettings();
    settings.downloadFolder = resolvedFolder;
    const ok = writeSettings(settings);
    return { success: ok };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ── Fetch video info ──
ipcMain.handle('fetch-formats', async (event, url) => {
  return new Promise((resolve, reject) => {
    try {
      validateFetchInput(url);
    } catch (error) {
      reject(error);
      return;
    }

    const ytdlp = getToolPath('yt-dlp.exe');

    const proc = spawn(ytdlp, [
      '--dump-json',
      '--no-playlist',
      url
    ]);

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
    proc.on('error', () => reject(new Error('Failed to start yt-dlp process')));

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(errorOutput || 'Failed to fetch video info'));
        return;
      }
      try {
        const info = JSON.parse(output);
        resolve({
          title: info.title || 'Unknown Title',
          duration: info.duration_string || '',
          uploader: info.uploader || ''
        });
      } catch {
        reject(new Error('Could not parse video info'));
      }
    });
  });
});

// ── Start download ──
ipcMain.handle('start-download', async (event, { url, outputFolder, format, resolution, downloadId }) => {
  return new Promise((resolve, reject) => {
    let safeInput;
    try {
      safeInput = validateDownloadInput({ url, outputFolder, format, resolution, downloadId });
    } catch (error) {
      reject(error);
      return;
    }

    const ytdlp = getToolPath('yt-dlp.exe');
    const ffmpegDir = path.dirname(getToolPath('ffmpeg.exe'));
    const { url: safeUrl, outputFolder: safeOutputFolder, format: safeFormat, resolution: safeResolution, downloadId: safeDownloadId } = safeInput;

    let args = [
      '--ffmpeg-location', ffmpegDir,
      '--newline',
      '--no-playlist',
      '-o', path.join(safeOutputFolder, '%(title)s.%(ext)s'),
    ];

    if (safeFormat === 'mp3') {
      args = args.concat([
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0'
      ]);
    } else {
      const heightFilter = `[height<=${safeResolution}]`;
      args = args.concat([
        '-f', `bestvideo${heightFilter}+bestaudio/best${heightFilter}/best`,
        '--merge-output-format', 'mp4'
      ]);
    }

    args.push(safeUrl);

    if (runningDownloads.has(safeDownloadId)) {
      reject(new Error('Download is already running.'));
      return;
    }

    const proc = spawn(ytdlp, args);
    proc.cancelRequested = false;
    runningDownloads.set(safeDownloadId, proc);

    proc.on('error', () => {
      runningDownloads.delete(safeDownloadId);
      reject(new Error('Failed to start yt-dlp process'));
    });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Download timed out after 10 minutes'));
    }, 10 * 60 * 1000);

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        const match = line.match(/(\d+\.?\d*)%\s+of\s+~?\s*([\d.]+\s*\w+)/);
        if (match) {
          mainWindow.webContents.send('download-progress', {
            downloadId: safeDownloadId,
            percent: parseFloat(match[1]),
            fileSize: match[2],
            status: 'downloading'
          });
        }
        if (line.includes('[Merger]') || line.includes('[ExtractAudio]')) {
          mainWindow.webContents.send('download-progress', {
            downloadId: safeDownloadId,
            percent: 99,
            fileSize: '',
            status: 'processing'
          });
        }
      });
    });

    proc.stderr.on('data', (data) => {
      console.error('[yt-dlp stderr]', data.toString());
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      runningDownloads.delete(safeDownloadId);

      if (proc.cancelRequested) {
        mainWindow.webContents.send('download-progress', {
          downloadId: safeDownloadId,
          percent: 0,
          fileSize: '',
          status: 'canceled',
          error: 'Download canceled by user.'
        });
        resolve({ success: false, canceled: true });
        return;
      }

      if (code === 0) {
        let outputFilePath = '';
        try {
          const entries = fs.readdirSync(safeOutputFolder, { withFileTypes: true });
          const media = entries
            .filter((e) => e.isFile() && /\.(mp4|mp3|webm|mkv)$/i.test(e.name))
            .map((e) => ({
              name: e.name,
              path: path.join(safeOutputFolder, e.name),
              mtime: fs.statSync(path.join(safeOutputFolder, e.name)).mtimeMs
            }));
          media.sort((a, b) => b.mtime - a.mtime);
          if (media.length > 0) outputFilePath = media[0].path;
        } catch (_) {}
        mainWindow.webContents.send('download-progress', {
          downloadId: safeDownloadId,
          percent: 100,
          fileSize: '',
          status: 'completed',
          outputFilePath: outputFilePath || undefined
        });
        resolve({ success: true });
      } else {
        mainWindow.webContents.send('download-progress', {
          downloadId: safeDownloadId,
          percent: 0,
          fileSize: '',
          status: 'failed',
          error: 'Download failed. Check the URL or your connection.'
        });
        reject(new Error('yt-dlp exited with code ' + code));
      }
    });
  });
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  if (typeof folderPath !== 'string' || !folderPath) return { success: false };
  try {
    await shell.openPath(folderPath);
    return { success: true };
  } catch {
    return { success: false };
  }
});

ipcMain.handle('play-file', async (event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return { success: false };
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch {
    return { success: false };
  }
});

ipcMain.handle('get-settings', async () => {
  return readSettings();
});

ipcMain.handle('set-settings', async (event, settings) => {
  const current = readSettings();
  if (settings.downloadFolder != null) current.downloadFolder = settings.downloadFolder;
  if (settings.defaultQuality != null) current.defaultQuality = settings.defaultQuality;
  if (settings.defaultFormat != null) current.defaultFormat = settings.defaultFormat;
  writeSettings(current);
  return { success: true };
});

ipcMain.handle('update-yt-dlp', async () => {
  return new Promise((resolve) => {
    const ytdlp = getToolPath('yt-dlp.exe');
    const proc = spawn(ytdlp, ['-U'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', () => resolve({ success: false, message: 'Failed to start yt-dlp.' }));
    proc.on('close', (code) => {
      if (code === 0) resolve({ success: true });
      else resolve({ success: false, message: stderr || 'Update failed.' });
    });
  });
});

ipcMain.handle('cancel-download', async (event, downloadId) => {
  let safeDownloadId;
  try {
    safeDownloadId = validateDownloadId(downloadId);
  } catch (error) {
    return { success: false, message: error.message };
  }

  const proc = runningDownloads.get(safeDownloadId);
  if (!proc) {
    return { success: false, message: 'Download is not running.' };
  }

  proc.cancelRequested = true;
  try {
    proc.kill();
    return { success: true };
  } catch {
    return { success: false, message: 'Failed to cancel download.' };
  }
});

// ── Media Tools (FFmpeg) ──
const MEDIA_EXT = /\.(mp4|mp3|mov|avi|mkv|webm|wav|flac|m4a|aac|wma|ogg)$/i;

function getFfmpegPath() {
  return getToolPath('ffmpeg.exe');
}

function getFfprobePath() {
  const base = path.join(isDev ? __dirname : process.resourcesPath, 'tools');
  const exe = path.join(base, 'ffprobe.exe');
  return fs.existsSync(exe) ? exe : null;
}

function getMediaDurationSeconds(inputPath) {
  const ffprobe = getFfprobePath();
  if (!ffprobe || typeof inputPath !== 'string' || !fs.existsSync(inputPath)) return null;
  return new Promise((resolve) => {
    const proc = spawn(ffprobe, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) return resolve(null);
      const num = parseFloat(out.trim());
      resolve(Number.isFinite(num) ? num : null);
    });
  });
}

function parseFfmpegTime(stderrLine) {
  const m = stderrLine.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10), s = parseInt(m[3], 10), cs = parseInt(m[4], 10);
  return h * 3600 + min * 60 + s + cs / 100;
}

function runFfmpegWithProgress(inputPath, outputPath, args, durationSeconds) {
  return new Promise((resolve, reject) => {
    const ffmpeg = getFfmpegPath();
    if (!fs.existsSync(ffmpeg)) {
      reject(new Error('FFmpeg not found.'));
      return;
    }
    const fullArgs = ['-i', inputPath, '-y', ...args, outputPath];
    const proc = spawn(ffmpeg, fullArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let lastPercent = 0;
    proc.stderr.on('data', (data) => {
      const line = data.toString();
      const t = parseFfmpegTime(line);
      if (t != null && durationSeconds != null && durationSeconds > 0 && mainWindow) {
        const p = Math.min(99, Math.round((t / durationSeconds) * 100));
        if (p > lastPercent) {
          lastPercent = p;
          mainWindow.webContents.send('media-tools-progress', { percent: p });
        }
      }
    });
    proc.on('error', () => reject(new Error('Failed to start FFmpeg.')));
    proc.on('close', (code) => {
      if (mainWindow) mainWindow.webContents.send('media-tools-progress', { percent: 100, outputPath });
      if (code === 0) resolve({ success: true, outputPath });
      else reject(new Error('FFmpeg exited with code ' + code));
    });
  });
}

ipcMain.handle('select-media-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Media', extensions: ['mp4', 'mp3', 'mov', 'avi', 'mkv', 'webm', 'wav', 'flac', 'm4a', 'aac', 'wma', 'ogg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('media-tools-convert', async (event, { inputPath, format }) => {
  if (typeof inputPath !== 'string' || !fs.existsSync(inputPath) || !['mp4', 'mp3', 'mov', 'avi'].includes(format)) {
    throw new Error('Invalid input or format.');
  }
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(dir, base + '.' + format);
  const duration = await getMediaDurationSeconds(inputPath);
  if (format === 'mp3') {
    return runFfmpegWithProgress(inputPath, outputPath, ['-vn', '-acodec', 'libmp3lame', '-q:a', '0'], duration);
  }
  if (format === 'mp4') {
    return runFfmpegWithProgress(inputPath, outputPath, ['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart'], duration);
  }
  if (format === 'mov') {
    return runFfmpegWithProgress(inputPath, outputPath, ['-c:v', 'libx264', '-c:a', 'aac'], duration);
  }
  if (format === 'avi') {
    return runFfmpegWithProgress(inputPath, outputPath, ['-c:v', 'mpeg4', '-c:a', 'mp3'], duration);
  }
  throw new Error('Unsupported format.');
});

ipcMain.handle('media-tools-compress', async (event, { inputPath, quality }) => {
  if (typeof inputPath !== 'string' || !fs.existsSync(inputPath)) throw new Error('Invalid input.');
  const crf = { small: 28, medium: 23, high: 18 }[quality] ?? 23;
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(dir, base + '_compressed.mp4');
  const duration = await getMediaDurationSeconds(inputPath);
  return runFfmpegWithProgress(inputPath, outputPath, ['-c:v', 'libx264', '-crf', String(crf), '-c:a', 'aac', '-movflags', '+faststart'], duration);
});

ipcMain.handle('media-tools-extract-audio', async (event, { inputPath }) => {
  if (typeof inputPath !== 'string' || !fs.existsSync(inputPath)) throw new Error('Invalid input.');
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(dir, base + '.mp3');
  const duration = await getMediaDurationSeconds(inputPath);
  return runFfmpegWithProgress(inputPath, outputPath, ['-vn', '-acodec', 'libmp3lame', '-q:a', '0'], duration);
});

ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return { success: false };
  try {
    shell.showItemInFolder(path.resolve(filePath));
    return { success: true };
  } catch {
    return { success: false };
  }
});

// ── Window controls ──
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());
