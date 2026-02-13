const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;

function getToolPath(toolName) {
  if (isDev) {
    return path.join(__dirname, 'tools', toolName);
  }
  return path.join(process.resourcesPath, 'tools', toolName);
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 950,
    height: 700,
    minWidth: 750,
    minHeight: 550,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    frame: false,
    backgroundColor: '#0f0f1a'
  });

  mainWindow.loadFile('renderer/index.html');
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
  return result.canceled ? null : result.filePaths[0];
});

// ── Fetch video info ──
ipcMain.handle('fetch-formats', async (event, url) => {
  return new Promise((resolve, reject) => {
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
    const ytdlp = getToolPath('yt-dlp.exe');
    const ffmpegDir = path.dirname(getToolPath('ffmpeg.exe'));

    let args = [
      '--ffmpeg-location', ffmpegDir,
      '--newline',
      '--no-playlist',
      '-o', path.join(outputFolder, '%(title)s.%(ext)s'),
    ];

    if (format === 'mp3') {
      args = args.concat([
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0'
      ]);
    } else {
      const heightFilter = resolution ? `[height<=${resolution}]` : '';
      args = args.concat([
        '-f', `bestvideo${heightFilter}+bestaudio/best${heightFilter}/best`,
        '--merge-output-format', 'mp4'
      ]);
    }

    args.push(url);

    const proc = spawn(ytdlp, args);

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
            downloadId,
            percent: parseFloat(match[1]),
            fileSize: match[2],
            status: 'downloading'
          });
        }
        if (line.includes('[Merger]') || line.includes('[ExtractAudio]')) {
          mainWindow.webContents.send('download-progress', {
            downloadId,
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
      if (code === 0) {
        mainWindow.webContents.send('download-progress', {
          downloadId,
          percent: 100,
          fileSize: '',
          status: 'completed'
        });
        resolve({ success: true });
      } else {
        mainWindow.webContents.send('download-progress', {
          downloadId,
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

// ── Window controls ──
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());