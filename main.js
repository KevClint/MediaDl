const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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
        mainWindow.webContents.send('download-progress', {
          downloadId: safeDownloadId,
          percent: 100,
          fileSize: '',
          status: 'completed'
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

// ── Window controls ──
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());
