const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
const ALLOWED_FORMATS = new Set(['mp3', 'mp4']);
const ALLOWED_RESOLUTIONS = new Set(['144', '360', '480', '720', '1080', '2160']);
const ALLOWED_MP3_BITRATES = new Set(['128', '192', '320']);
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

  const {
    url,
    outputFolder,
    format,
    resolution,
    mp3Bitrate,
    openFolderWhenFinished,
    downloadSubtitles,
    downloadId
  } = payload;

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
  if (format === 'mp4' && mp3Bitrate !== null && mp3Bitrate !== undefined) {
    throw new Error('MP3 bitrate is not allowed for MP4 downloads.');
  }
  if (format === 'mp3' && !ALLOWED_MP3_BITRATES.has(String(mp3Bitrate || '192'))) {
    throw new Error('Invalid MP3 bitrate.');
  }
  if (openFolderWhenFinished !== undefined && typeof openFolderWhenFinished !== 'boolean') {
    throw new Error('Invalid open-folder option.');
  }
  if (downloadSubtitles !== undefined && typeof downloadSubtitles !== 'boolean') {
    throw new Error('Invalid subtitle option.');
  }
  if (!Number.isInteger(downloadId) || downloadId < 1) {
    throw new Error('Invalid download ID.');
  }

  return {
    url,
    outputFolder: validateFolder(outputFolder),
    format,
    resolution: format === 'mp4' ? String(resolution) : null,
    mp3Bitrate: format === 'mp3' ? String(mp3Bitrate || '192') : null,
    openFolderWhenFinished: Boolean(openFolderWhenFinished),
    downloadSubtitles: Boolean(downloadSubtitles),
    downloadId
  };
}

function validateDownloadId(downloadId) {
  if (!Number.isInteger(downloadId) || downloadId < 1) {
    throw new Error('Invalid download ID.');
  }
  return downloadId;
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function resolveOutputFilePath({ outputFolder, title, format }) {
  const resolvedFolder = validateFolder(outputFolder);
  const preferredExt = format === 'mp3' ? '.mp3' : '.mp4';
  const titleKey = normalizeName(title);

  const entries = fs.readdirSync(resolvedFolder, { withFileTypes: true });
  const media = entries
    .filter((e) => e.isFile() && /\.(mp4|mp3|webm|mkv|m4a)$/i.test(e.name))
    .map((e) => {
      const fullPath = path.join(resolvedFolder, e.name);
      const stat = fs.statSync(fullPath);
      const ext = path.extname(e.name).toLowerCase();
      const base = path.basename(e.name, ext);
      const normalizedBase = normalizeName(base);
      const titleScore = titleKey && normalizedBase ? (
        normalizedBase.includes(titleKey) || titleKey.includes(normalizedBase) ? 1 : 0
      ) : 0;
      const extScore = ext === preferredExt ? 1 : 0;
      return {
        path: fullPath,
        mtime: stat.mtimeMs || 0,
        titleScore,
        extScore,
      };
    });

  media.sort((a, b) => {
    if (b.titleScore !== a.titleScore) return b.titleScore - a.titleScore;
    if (b.extScore !== a.extScore) return b.extScore - a.extScore;
    return b.mtime - a.mtime;
  });

  return media.length > 0 ? media[0].path : '';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 850,
    height: 990,
    minWidth: 850,
    minHeight: 990,
    icon: path.join(__dirname, 'assets', 'icon.ico'), // ← add this line
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    frame: false,
    backgroundColor: '#09090b'
  });

  mainWindow.loadFile('renderer/index.html');

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (typeof targetUrl === 'string' && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
      void shell.openExternal(targetUrl);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith('file://')) {
      event.preventDefault();
      if (typeof targetUrl === 'string' && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
        void shell.openExternal(targetUrl);
      }
    }
  });
}

function killProcessTree(proc) {
  if (!proc || typeof proc.pid !== 'number' || proc.pid <= 0) {
    return Promise.resolve(false);
  }

  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true });
      killer.on('close', (code) => resolve(code === 0));
      killer.on('error', () => resolve(false));
    });
  }

  try {
    proc.kill('SIGTERM');
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
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
ipcMain.handle('start-download', async (
  event,
  { url, outputFolder, format, resolution, mp3Bitrate, openFolderWhenFinished, downloadSubtitles, downloadId }
) => {
  return new Promise((resolve, reject) => {
    let safeInput;
    try {
      safeInput = validateDownloadInput({
        url,
        outputFolder,
        format,
        resolution,
        mp3Bitrate,
        openFolderWhenFinished,
        downloadSubtitles,
        downloadId
      });
    } catch (error) {
      reject(error);
      return;
    }

    const ytdlp = getToolPath('yt-dlp.exe');
    const ffmpegDir = path.dirname(getToolPath('ffmpeg.exe'));
    const {
      url: safeUrl,
      outputFolder: safeOutputFolder,
      format: safeFormat,
      resolution: safeResolution,
      mp3Bitrate: safeMp3Bitrate,
      downloadSubtitles: safeDownloadSubtitles,
      downloadId: safeDownloadId
    } = safeInput;

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
        '--audio-quality', `${safeMp3Bitrate}K`
      ]);
    } else {
      const heightFilter = `[height<=${safeResolution}]`;
      args = args.concat([
        '-f', `bestvideo${heightFilter}+bestaudio/best${heightFilter}/best`,
        '--merge-output-format', 'mp4'
      ]);
    }
    if (safeDownloadSubtitles) {
      args = args.concat([
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs', 'en.*'
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
      void killProcessTree(proc);
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
      } else if (proc.cancelRequested) {
        mainWindow.webContents.send('download-progress', {
          downloadId: safeDownloadId,
          percent: 0,
          fileSize: '',
          status: 'canceled',
          error: 'Download canceled by user.'
        });
        resolve({ success: false, canceled: true });
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
    const errorMessage = await shell.openPath(folderPath);
    return errorMessage ? { success: false, message: errorMessage } : { success: true };
  } catch {
    return { success: false };
  }
});

ipcMain.handle('play-file', async (event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return { success: false };
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return { success: false, message: 'File not found.' };
    }
    const errorMessage = await shell.openPath(filePath);
    return errorMessage ? { success: false, message: errorMessage } : { success: true };
  } catch {
    return { success: false };
  }
});

ipcMain.handle('open-external-url', async (event, rawUrl) => {
  if (!isSafeHttpUrl(rawUrl)) {
    return { success: false, message: 'Invalid URL.' };
  }
  try {
    await shell.openExternal(rawUrl);
    return { success: true };
  } catch {
    return { success: false, message: 'Could not open external URL.' };
  }
});

ipcMain.handle('resolve-output-file', async (event, payload) => {
  try {
    if (!payload || typeof payload !== 'object') {
      return { success: false, message: 'Invalid payload.' };
    }
    const filePath = resolveOutputFilePath(payload);
    if (!filePath) return { success: false, message: 'No media file found.' };
    return { success: true, filePath };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-app-version', async () => {
  try {
    return { success: true, version: app.getVersion() };
  } catch {
    return { success: false, message: 'Could not read app version.' };
  }
});

ipcMain.handle('get-settings', async () => {
  return readSettings();
});

ipcMain.handle('set-settings', async (event, settings) => {
  if (!settings || typeof settings !== 'object') {
    return { success: false, message: 'Invalid settings payload.' };
  }
  const current = readSettings();
  if (settings.downloadFolder != null) current.downloadFolder = settings.downloadFolder;
  if (settings.defaultQuality != null) current.defaultQuality = settings.defaultQuality;
  if (settings.defaultFormat != null) current.defaultFormat = settings.defaultFormat;
  if (settings.theme === 'light' || settings.theme === 'dark' || settings.theme === 'system') {
    current.theme = settings.theme;
  }
  const ok = writeSettings(current);
  return ok ? { success: true } : { success: false, message: 'Could not save settings.' };
});

function getYtDlpVersion() {
  return new Promise((resolve) => {
    const ytdlp = getToolPath('yt-dlp.exe');
    const proc = spawn(ytdlp, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', () => resolve({ success: false, message: 'Failed to start yt-dlp.' }));
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, message: (stderr || 'Could not read yt-dlp version.').trim() });
        return;
      }
      const version = stdout.trim().split(/\r?\n/)[0] || '';
      if (!version) {
        resolve({ success: false, message: 'Could not read yt-dlp version.' });
        return;
      }
      resolve({ success: true, version });
    });
  });
}

ipcMain.handle('get-yt-dlp-version', async () => {
  return getYtDlpVersion();
});

ipcMain.handle('update-yt-dlp', async () => {
  return new Promise((resolve) => {
    const ytdlp = getToolPath('yt-dlp.exe');
    const proc = spawn(ytdlp, ['-U'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', () => resolve({ success: false, message: 'Failed to start yt-dlp.' }));
    proc.on('close', async (code) => {
      if (code === 0) {
        const versionResult = await getYtDlpVersion();
        if (versionResult.success) {
          resolve({ success: true, version: versionResult.version });
        } else {
          resolve({ success: true, message: (stdout || 'yt-dlp updated.').trim() });
        }
      } else {
        resolve({ success: false, message: (stderr || stdout || 'Update failed.').trim() });
      }
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
  const killed = await killProcessTree(proc);
  return killed ? { success: true } : { success: false, message: 'Failed to cancel download.' };
});

// ── Media Tools (FFmpeg) ──
const MEDIA_EXT = /\.(mp4|mp3|mov|avi|mkv|webm|wav|flac|m4a|aac|wma|ogg)$/i;
const VIDEO_FORMATS = new Set(['mp4', 'mov', 'avi', 'webm']);
const AUDIO_FORMATS = new Set(['mp3', 'wav', 'aac']);

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

async function hasVideoStream(inputPath) {
  const ffprobe = getFfprobePath();
  if (!ffprobe || typeof inputPath !== 'string' || !fs.existsSync(inputPath)) {
    const ext = path.extname(String(inputPath || '')).toLowerCase();
    return ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext);
  }

  return new Promise((resolve) => {
    const proc = spawn(ffprobe, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=nw=1:nk=1',
      inputPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => {
      if (code !== 0) return resolve(false);
      resolve(out.toLowerCase().includes('video'));
    });
  });
}

function parseFfmpegTime(stderrLine) {
  const m = stderrLine.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const s = parseInt(m[3], 10);
  const cs = parseInt(m[4], 10);
  return h * 3600 + min * 60 + s + cs / 100;
}

function parseFlexibleTimeToSeconds(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const sec = Number(raw);
    return Number.isFinite(sec) && sec >= 0 ? sec : null;
  }

  const parts = raw.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+(\.\d+)?$/.test(p))) return null;

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;

  if (parts.length === 2) {
    const [mm, ss] = nums;
    return (mm * 60) + ss;
  }

  const [hh, mm, ss] = nums;
  return (hh * 3600) + (mm * 60) + ss;
}

function normalizeTimeForFfmpeg(value) {
  const sec = parseFlexibleTimeToSeconds(value);
  if (sec == null) return '';
  const out = sec.toFixed(3);
  return out.replace(/\.?0+$/, '');
}

function sanitizeBaseName(fileName) {
  return fileName.replace(/[^\w.-]+/g, '_');
}

function formatFileSize(bytes) {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b <= 0) return '--';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = b;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function uniquePath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const ext = path.extname(targetPath);
  const name = targetPath.slice(0, -ext.length);
  let i = 1;
  while (true) {
    const candidate = `${name}_${i}${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
    i += 1;
  }
}

function sendMediaToolsProgress(payload) {
  if (!mainWindow || !mainWindow.webContents) return;
  mainWindow.webContents.send('media-tools-progress', payload);
}

function runFfmpegWithProgress({ inputPath, outputPath, args, durationSeconds, progressMeta }) {
  return new Promise((resolve, reject) => {
    const ffmpeg = getFfmpegPath();
    if (!fs.existsSync(ffmpeg)) {
      reject(new Error('FFmpeg not found.'));
      return;
    }

    const fullArgs = ['-y', '-i', inputPath, ...args, outputPath];
    const proc = spawn(ffmpeg, fullArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let lastPercent = 0;
    let stderrAll = '';

    proc.stderr.on('data', (data) => {
      const line = data.toString();
      stderrAll += line;
      const t = parseFfmpegTime(line);
      if (t != null && durationSeconds != null && durationSeconds > 0) {
        const p = Math.min(99, Math.round((t / durationSeconds) * 100));
        if (p > lastPercent) {
          lastPercent = p;
          const etaSeconds = Math.max(0, durationSeconds - t);
          sendMediaToolsProgress({
            percent: p,
            etaSeconds,
            ...progressMeta,
          });
        }
      }
    });

    proc.on('error', () => reject(new Error('Failed to start FFmpeg.')));
    proc.on('close', (code) => {
      if (code === 0) {
        sendMediaToolsProgress({
          percent: 100,
          etaSeconds: 0,
          ...progressMeta,
        });
        resolve({ outputPath });
        return;
      }
      const trimmedErr = String(stderrAll || '').trim();
      const details = trimmedErr ? `\n${trimmedErr.split(/\r?\n/).slice(-8).join('\n')}` : '';
      reject(new Error(`FFmpeg exited with code ${code}${details}`));
    });
  });
}

function getVideoCodecArgs(format, stripAudio) {
  if (format === 'mov') return stripAudio ? ['-c:v', 'libx264', '-an'] : ['-c:v', 'libx264', '-c:a', 'aac'];
  if (format === 'avi') return stripAudio ? ['-c:v', 'mpeg4', '-an'] : ['-c:v', 'mpeg4', '-c:a', 'mp3'];
  if (format === 'webm') return stripAudio ? ['-c:v', 'libvpx-vp9', '-an'] : ['-c:v', 'libvpx-vp9', '-c:a', 'libopus'];
  return stripAudio ? ['-c:v', 'libx264', '-movflags', '+faststart', '-an'] : ['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart'];
}

function getAudioCodecArgs(format) {
  if (format === 'wav') return ['-vn', '-c:a', 'pcm_s16le'];
  if (format === 'aac') return ['-vn', '-c:a', 'aac', '-b:a', '192k'];
  return ['-vn', '-c:a', 'libmp3lame', '-b:a', '192k'];
}

function buildVideoFilters({ resizePreset }) {
  const filters = [];
  if (resizePreset === '1080') filters.push('scale=-2:1080');
  if (resizePreset === '720') filters.push('scale=-2:720');
  if (resizePreset === '480') filters.push('scale=-2:480');
  return filters;
}

ipcMain.handle('select-media-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media', extensions: ['mp4', 'mp3', 'mov', 'avi', 'mkv', 'webm', 'wav', 'flac', 'm4a', 'aac', 'wma', 'ogg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths;
});

ipcMain.handle('media-tools-run-pipeline', async (event, payload) => {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid pipeline request.');
  const inputPaths = Array.isArray(payload.inputPaths) ? payload.inputPaths : [];
  const pipeline = payload.pipeline && typeof payload.pipeline === 'object' ? payload.pipeline : {};
  const outputFolderRaw = typeof payload.outputFolder === 'string' ? payload.outputFolder.trim() : '';

  if (inputPaths.length === 0) throw new Error('No input files selected.');
  const trimStartSeconds = parseFlexibleTimeToSeconds(pipeline.trimStart);
  const trimEndSeconds = parseFlexibleTimeToSeconds(pipeline.trimEnd);
  if (pipeline.trimEnabled) {
    if ((pipeline.trimStart && trimStartSeconds == null) || (pipeline.trimEnd && trimEndSeconds == null)) {
      throw new Error('Trim time format is invalid. Use SS, MM:SS, or HH:MM:SS.');
    }
    if (trimStartSeconds != null && trimEndSeconds != null && trimEndSeconds <= trimStartSeconds) {
      throw new Error('Trim end time must be greater than start time.');
    }
  }
  if (pipeline.convertEnabled && !VIDEO_FORMATS.has(String(pipeline.convertFormat || '').toLowerCase())) {
    throw new Error('Invalid convert format.');
  }
  if (pipeline.extractAudioEnabled && !AUDIO_FORMATS.has(String(pipeline.extractAudioFormat || '').toLowerCase())) {
    throw new Error('Invalid audio format.');
  }
  const selectedFeatures = [
    pipeline.convertEnabled ? 'convert' : '',
    pipeline.compressEnabled ? 'compress' : '',
    pipeline.extractAudioEnabled ? 'extract' : '',
    pipeline.stripAudio ? 'strip' : '',
    pipeline.trimEnabled ? 'trim' : '',
    pipeline.gifEnabled ? 'gif' : '',
    pipeline.resizePreset ? 'resize' : '',
  ].filter(Boolean);
  if (selectedFeatures.length === 0) {
    throw new Error('Select one feature to run.');
  }
  if (selectedFeatures.length > 1) {
    throw new Error('Only one feature can run at a time.');
  }
  const feature = selectedFeatures[0];

  const resolvedInputs = inputPaths
    .filter((p) => typeof p === 'string' && fs.existsSync(p) && MEDIA_EXT.test(path.basename(p)))
    .map((p) => path.resolve(p));
  if (resolvedInputs.length === 0) throw new Error('No valid media files selected.');

  const results = [];
  for (let i = 0; i < resolvedInputs.length; i += 1) {
    const inputPath = resolvedInputs[i];
    const sourceName = path.basename(inputPath);
    const sourceBase = sanitizeBaseName(path.basename(inputPath, path.extname(inputPath)));
    const sourceDir = path.dirname(inputPath);
    const outputDir = outputFolderRaw && fs.existsSync(outputFolderRaw) ? path.resolve(outputFolderRaw) : sourceDir;
    const duration = await getMediaDurationSeconds(inputPath);
    const requiresVideo = ['convert', 'compress', 'strip', 'gif', 'resize'].includes(feature);
    if (requiresVideo) {
      const hasVideo = await hasVideoStream(inputPath);
      if (!hasVideo) {
        throw new Error(`Feature "${feature}" requires a video stream. "${sourceName}" is audio-only.`);
      }
    }
    const trimArgs = [];
    if (feature === 'trim') {
      if (trimStartSeconds != null) trimArgs.push('-ss', normalizeTimeForFfmpeg(pipeline.trimStart));
      if (trimEndSeconds != null) trimArgs.push('-to', normalizeTimeForFfmpeg(pipeline.trimEnd));
    }

    if (feature === 'extract') {
      const outputAudioFormat = String(pipeline.extractAudioFormat).toLowerCase();
      const outputAudioPath = uniquePath(path.join(outputDir, `${sourceBase}_audio.${outputAudioFormat}`));
      await runFfmpegWithProgress({
        inputPath,
        outputPath: outputAudioPath,
        args: [...trimArgs, ...getAudioCodecArgs(outputAudioFormat)],
        durationSeconds: duration,
        progressMeta: {
          stage: 'Extract Audio',
          fileIndex: i,
          totalFiles: resolvedInputs.length,
          fileName: sourceName,
        },
      });
      const stat = fs.existsSync(outputAudioPath) ? fs.statSync(outputAudioPath) : null;
      results.push({
        inputPath,
        outputPath: outputAudioPath,
        outputName: path.basename(outputAudioPath),
        outputSize: stat ? formatFileSize(stat.size) : '--',
      });
    } else if (feature === 'gif') {
      const gifDuration = Number(pipeline.gifDuration);
      const gifArgs = [];
      if (trimStartSeconds != null) gifArgs.push('-ss', normalizeTimeForFfmpeg(pipeline.trimStart));
      gifArgs.push('-t', Number.isFinite(gifDuration) && gifDuration > 0 ? String(gifDuration) : '10');
      gifArgs.push('-vf', 'fps=10,scale=500:-1:flags=lanczos');
      const outputGifPath = uniquePath(path.join(outputDir, `${sourceBase}.gif`));
      await runFfmpegWithProgress({
        inputPath,
        outputPath: outputGifPath,
        args: gifArgs,
        durationSeconds: duration,
        progressMeta: {
          stage: 'GIF',
          fileIndex: i,
          totalFiles: resolvedInputs.length,
          fileName: sourceName,
        },
      });
      const stat = fs.existsSync(outputGifPath) ? fs.statSync(outputGifPath) : null;
      results.push({
        inputPath,
        outputPath: outputGifPath,
        outputName: path.basename(outputGifPath),
        outputSize: stat ? formatFileSize(stat.size) : '--',
      });
    } else {
      const compressionProfile = { small: { crf: 28, scale: '480' }, medium: { crf: 23, scale: '720' }, high: { crf: 20, scale: '1080' } }[pipeline.compressionQuality] || { crf: 23, scale: '720' };
      const inputExt = path.extname(inputPath).replace('.', '').toLowerCase();
      const outputVideoFormat = feature === 'convert'
        ? String(pipeline.convertFormat).toLowerCase()
        : (feature === 'trim' && inputExt ? inputExt : 'mp4');
      const outputVideoPath = uniquePath(path.join(outputDir, `${sourceBase}_processed.${outputVideoFormat}`));
      const filters = buildVideoFilters({ resizePreset: feature === 'resize' ? pipeline.resizePreset : '' });
      const args = [];

      if (feature === 'trim') {
        if (trimStartSeconds != null) args.push('-ss', normalizeTimeForFfmpeg(pipeline.trimStart));
        if (trimEndSeconds != null) args.push('-to', normalizeTimeForFfmpeg(pipeline.trimEnd));
        args.push('-c', 'copy');
      } else {
        args.push(...getVideoCodecArgs(outputVideoFormat, feature === 'strip'));
        if (feature === 'compress') {
          args.push('-crf', String(compressionProfile.crf));
          if (compressionProfile.scale === '1080') filters.push('scale=-2:1080');
          if (compressionProfile.scale === '720') filters.push('scale=-2:720');
          if (compressionProfile.scale === '480') filters.push('scale=-2:480');
        }
        if (filters.length > 0) args.push('-vf', filters.join(','));
      }

      await runFfmpegWithProgress({
        inputPath,
        outputPath: outputVideoPath,
        args,
        durationSeconds: duration,
        progressMeta: {
          stage: feature.charAt(0).toUpperCase() + feature.slice(1),
          fileIndex: i,
          totalFiles: resolvedInputs.length,
          fileName: sourceName,
        },
      });

      const stat = fs.existsSync(outputVideoPath) ? fs.statSync(outputVideoPath) : null;
      results.push({
        inputPath,
        outputPath: outputVideoPath,
        outputName: path.basename(outputVideoPath),
        outputSize: stat ? formatFileSize(stat.size) : '--',
      });
    }
  }

  return {
    success: true,
    results,
    outputFolder: outputFolderRaw || path.dirname(resolvedInputs[0]),
  };
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
