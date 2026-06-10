const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const isDev = !app.isPackaged;
const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const ALLOWED_FORMATS = new Set(['mp3', 'mp4']);
const ALLOWED_RESOLUTIONS = new Set(['144', '360', '480', '720', '1080', '2160']);
const ALLOWED_MP3_BITRATES = new Set(['128', '192', '320']);
const runningDownloads = new Map();
const runningSpotifyDownloads = new Map();
const activeProcesses = new Set();
const SETTINGS_FILE = 'settings.json';

function getToolPath(toolName) {
  const rootToolPath = path.join(__dirname, 'tools', toolName);
  if (fs.existsSync(rootToolPath)) return rootToolPath;

  const unpackedToolPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'tools', toolName);
  if (fs.existsSync(unpackedToolPath)) return unpackedToolPath;

  const packagedToolPath = path.join(process.resourcesPath, 'tools', toolName);
  return packagedToolPath;
}

function ensureRequiredToolsPresent() {
  const requiredTools = ['yt-dlp.exe', 'ffmpeg.exe'];
  const missing = [];
  for (const toolName of requiredTools) {
    const toolPath = getToolPath(toolName);
    if (!fs.existsSync(toolPath)) {
      missing.push(toolName);
      continue;
    }
    try {
      fs.accessSync(toolPath, fs.constants.F_OK | fs.constants.X_OK);
    } catch {
      if (process.platform !== 'win32') {
        try { fs.chmodSync(toolPath, '755'); } catch { }
      }
    }
  }
  if (missing.length === 0) return true;

  const message = `Missing required tool files: ${missing.join(', ')}.\nExpected under: ${path.join(process.resourcesPath, 'tools')}`;
  console.error('[electron] missing tools', { missing, expectedDir: path.join(process.resourcesPath, 'tools') });
  dialog.showErrorBox('MediaDl Startup Error', message);
  return false;
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

function normalizeThemePreference(theme) {
  if (theme === 'dark' || theme === 'light' || theme === 'system') {
    return theme;
  }
  return 'system';
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
    const trimmed = rawUrl.trim();
    if (!trimmed || /[\u0000-\u001F\u007F\s]/.test(trimmed)) return false;
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
}

function sanitizeHttpUrl(rawUrl) {
  if (!isSafeHttpUrl(rawUrl)) {
    throw new Error('Invalid URL. Only HTTP/HTTPS URLs are allowed.');
  }
  return new URL(rawUrl.trim()).toString();
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

function resolveRealPathForComparison(targetPath, label = 'Path') {
  const resolvedPath = path.resolve(targetPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`${label} does not exist.`);
  }
  try {
    return fs.realpathSync.native(resolvedPath);
  } catch {
    return fs.realpathSync(resolvedPath);
  }
}

function resolveComparableOutputPath(targetPath, label = 'Output path') {
  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  const resolvedPath = path.resolve(targetPath);
  if (!path.isAbsolute(resolvedPath)) {
    throw new Error(`${label} must be an absolute path.`);
  }

  const parentDir = path.dirname(resolvedPath);
  if (!fs.existsSync(parentDir)) {
    throw new Error(`${label} parent folder does not exist.`);
  }
  if (!fs.statSync(parentDir).isDirectory()) {
    throw new Error(`${label} parent folder must be a directory.`);
  }

  const comparableParent = resolveRealPathForComparison(parentDir, `${label} parent folder`);
  return path.join(comparableParent, path.basename(resolvedPath));
}

function normalizeComparablePath(targetPath) {
  const resolvedPath = path.resolve(targetPath);
  return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
}

function isPathInside(parentPath, childPath) {
  const normalizedParent = normalizeComparablePath(parentPath);
  const normalizedChild = normalizeComparablePath(childPath);
  const relative = path.relative(normalizedParent, normalizedChild);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getTrustedDownloadRoot() {
  const savedFolder = readSettings().downloadFolder;
  if (typeof savedFolder !== 'string' || savedFolder.trim().length === 0) {
    throw new Error('Select a download folder first.');
  }
  return validateFolder(savedFolder);
}

function validateFolderWithinBase(candidateFolder, baseFolder, label = 'Output folder') {
  const resolvedBase = validateFolder(baseFolder);
  const comparableBase = resolveRealPathForComparison(resolvedBase, 'Selected download folder');
  const resolvedCandidate = validateFolder(candidateFolder);
  const comparableCandidate = resolveRealPathForComparison(resolvedCandidate, label);
  if (!isPathInside(comparableBase, comparableCandidate)) {
    throw new Error(`${label} must stay inside the selected download folder.`);
  }
  return resolvedCandidate;
}

function validatePathWithinBase(candidatePath, baseFolder, label = 'Path') {
  if (typeof candidatePath !== 'string' || candidatePath.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  const resolvedBase = validateFolder(baseFolder);
  const comparableBase = resolveRealPathForComparison(resolvedBase, 'Selected download folder');
  const resolvedCandidate = path.resolve(candidatePath);
  const comparableCandidate = resolveRealPathForComparison(resolvedCandidate, label);
  if (!isPathInside(comparableBase, comparableCandidate)) {
    throw new Error(`${label} must stay inside the selected download folder.`);
  }
  return resolvedCandidate;
}

function validateOutputPathWithinBase(candidatePath, baseFolder, label = 'Output path') {
  const resolvedBase = validateFolder(baseFolder);
  const comparableBase = resolveRealPathForComparison(resolvedBase, 'Selected download folder');
  const resolvedCandidate = path.resolve(candidatePath);
  const comparableCandidate = resolveComparableOutputPath(resolvedCandidate, label);
  if (!isPathInside(comparableBase, comparableCandidate)) {
    throw new Error(`${label} must stay inside the selected download folder.`);
  }
  return resolvedCandidate;
}

function validateFetchInput(url) {
  return sanitizeHttpUrl(url);
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
    title,
    downloadId
  } = payload;

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
  if (title !== undefined && typeof title !== 'string') {
    throw new Error('Invalid title.');
  }

  return {
    url: sanitizeHttpUrl(url),
    outputFolder: validateFolderWithinBase(outputFolder, getTrustedDownloadRoot()),
    format,
    resolution: format === 'mp4' ? String(resolution) : null,
    mp3Bitrate: format === 'mp3' ? String(mp3Bitrate || '192') : null,
    openFolderWhenFinished: Boolean(openFolderWhenFinished),
    downloadSubtitles: Boolean(downloadSubtitles),
    title: String(title || ''),
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

function buildSafeTitleStem(rawTitle, id, maxWords = 5, maxChars = 48) {
  const words = String(rawTitle || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/[^\x20-\x7E]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, maxWords);

  const limited = words.join('_').slice(0, maxChars).trim();
  const safe = limited
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/\.+$/g, '')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .trim();

  if (!safe) return String(id);
  return safe;
}

function extractYtDlpError(stderrText, stdoutText) {
  const lines = `${stderrText || ''}\n${stdoutText || ''}`
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line.startsWith('ERROR:')) {
      return line.replace(/^ERROR:\s*/i, '').trim() || 'Download failed. Check the URL or your connection.';
    }
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (/error|forbidden|unavailable|private|timed out/i.test(line)) {
      return line;
    }
  }

  const stderrLines = String(stderrText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (stderrLines.length > 0) {
    const msgs = stderrLines.slice(-2).join(' | ');
    return `Download failed: ${msgs}`;
  }

  return 'Download failed. Check the URL or your connection.';
}

function isWindowsPathArgumentError(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;
  return text.includes('[errno 22] invalid argument')
    || (text.includes('invalid argument') && text.includes('unable to download video'))
    || (text.includes('invalid argument') && text.includes('stdout'));
}

function isPostprocessingHeaderArgumentError(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;
  // Catches the error whether it surfaces in stderr OR stdout tail
  return (
    text.includes('could not write header for output file') ||
    (text.includes('postprocessing:') && text.includes('invalid argument')) ||
    (text.includes('error') && text.includes('incorrect codec parameters')) ||
    (text.includes('ffmpeg') && text.includes('invalid argument'))
  );
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

function resolveGeneratedDownloadFile(outputFolder, stem, format) {
  const resolvedFolder = validateFolder(outputFolder);
  const normalizedStem = normalizeName(stem);
  const preferredExt = format === 'mp3' ? '.mp3' : '.mp4';

  const entries = fs.readdirSync(resolvedFolder, { withFileTypes: true });
  const media = entries
    .filter((entry) => entry.isFile() && /\.(mp4|mp3|webm|mkv|m4a)$/i.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(resolvedFolder, entry.name);
      const stat = fs.statSync(fullPath);
      const ext = path.extname(entry.name).toLowerCase();
      const base = path.basename(entry.name, ext);
      const normalizedBase = normalizeName(base);
      const exactStemScore = normalizedStem && normalizedBase === normalizedStem ? 3 : 0;
      const prefixStemScore = !exactStemScore && normalizedStem && normalizedBase.startsWith(normalizedStem) ? 2 : 0;
      const containsStemScore = !exactStemScore && !prefixStemScore && normalizedStem && normalizedBase.includes(normalizedStem) ? 1 : 0;
      return {
        path: fullPath,
        mtime: stat.mtimeMs || 0,
        stemScore: exactStemScore || prefixStemScore || containsStemScore,
        extScore: ext === preferredExt ? 1 : 0,
      };
    })
    .filter((item) => item.stemScore > 0);

  media.sort((a, b) => {
    if (b.stemScore !== a.stemScore) return b.stemScore - a.stemScore;
    if (b.extScore !== a.extScore) return b.extScore - a.extScore;
    return b.mtime - a.mtime;
  });

  return media.length > 0 ? media[0].path : '';
}

function createWindow() {
  const initialThemePreference = normalizeThemePreference(readSettings().theme);

  mainWindow = new BrowserWindow({
    width: 850,
    height: 990,
    minWidth: 850,
    minHeight: 990,
    icon: path.join(__dirname, 'assets', 'icon.ico'), // ← add this line
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--theme-preference=${initialThemePreference}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    frame: false,
    backgroundColor: '#09090b',
    show: false
  });

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    try {
      void shell.openExternal(sanitizeHttpUrl(targetUrl));
    } catch {
      // Ignore unsafe navigation attempts.
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith('file://')) {
      event.preventDefault();
      try {
        void shell.openExternal(sanitizeHttpUrl(targetUrl));
      } catch {
        // Ignore unsafe navigation attempts.
      }
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] render-process-gone', details);
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[electron] did-fail-load', { errorCode, errorDescription });
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error('[renderer console]', { message, line, sourceId });
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

function killProcessTreeSync(proc) {
  if (!proc || typeof proc.pid !== 'number' || proc.pid <= 0) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true });
  } else {
    try { proc.kill('SIGTERM'); } catch { }
  }
}

function spawnTracked(command, args, options) {
  const proc = spawn(command, args, options);
  activeProcesses.add(proc);
  proc.on('close', () => {
    activeProcesses.delete(proc);
  });
  return proc;
}

app.whenReady().then(() => {
  if (!ensureRequiredToolsPresent()) {
    app.quit();
    return;
  }
  createWindow();
});

ipcMain.handle('get-platform', () => process.platform);

function killAllProcesses() {
  for (const proc of activeProcesses) {
    killProcessTreeSync(proc);
  }
  for (const proc of runningDownloads.values()) {
    killProcessTreeSync(proc);
  }
  for (const proc of runningSpotifyDownloads.values()) {
    killProcessTreeSync(proc);
  }
}

app.on('window-all-closed', () => {
  killAllProcesses();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killAllProcesses();
});

// ── Select download folder ──
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  let folder;
  try {
    folder = validateFolder(result.filePaths[0]);
  } catch {
    return null;
  }
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
      url = validateFetchInput(url);
    } catch (error) {
      reject(error);
      return;
    }

    const ytdlp = getToolPath('yt-dlp.exe');

    const proc = spawnTracked(ytdlp, [
      '--dump-json',
      '--no-playlist',
      url
    ], {
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8'
      }
    });

    let output = '';
    let errorOutput = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      killProcessTreeSync(proc);
      reject(new Error('Fetch formats timed out after 60 seconds'));
    }, 60 * 1000);

    const checkBuffer = () => {
      if (output.length > 5 * 1024 * 1024) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        killProcessTreeSync(proc);
        reject(new Error('Output size exceeded 5MB limit. Please provide a single video URL.'));
      }
    };

    proc.stdout.on('data', (data) => {
      if (settled) return;
      output += data.toString();
      checkBuffer();
    });
    proc.stderr.on('data', (data) => {
      if (!settled) errorOutput += data.toString();
    });
    proc.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error('Failed to start yt-dlp process'));
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
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
  { url, outputFolder, format, resolution, mp3Bitrate, openFolderWhenFinished, downloadSubtitles, title, downloadId }
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
        title,
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
      title: safeTitle,
      downloadId: safeDownloadId
    } = safeInput;

    const buildArgs = (
      useIdOnlyTemplate,
      subtitlesEnabled = safeDownloadSubtitles,
      forceRecodeMp4 = false
    ) => {
      let outputStem = useIdOnlyTemplate
        ? String(safeDownloadId)
        : buildSafeTitleStem(safeTitle, safeDownloadId, 6, 40);
      const reservedTail = '.%(ext)s';
      const maxPathLen = 230;
      const availableStemChars = Math.max(12, maxPathLen - safeOutputFolder.length - 1 - reservedTail.length);
      if (outputStem.length > availableStemChars) {
        outputStem = outputStem.slice(0, availableStemChars).trim().replace(/[ .]+$/g, '');
      }
      if (!outputStem) outputStem = String(safeDownloadId);
      const outputTemplate = validateOutputPathWithinBase(
        path.join(safeOutputFolder, `${outputStem}${reservedTail}`),
        getTrustedDownloadRoot(),
        'Download output path'
      );

      let args = [
        '--ffmpeg-location', ffmpegDir,
        '--newline',
        '--no-playlist',
        '--retries', '5',
        '--fragment-retries', '5',
        '--extractor-retries', '3',
        '--file-access-retries', '3',
        '--restrict-filenames',
        '--trim-filenames', '40',
        '-o', outputTemplate,
      ];

      if (safeFormat === 'mp3') {
        args = args.concat([
          '-x',
          '--audio-format', 'mp3',
          '--audio-quality', `${safeMp3Bitrate}K`,
          '--no-embed-thumbnail',
        ]);
      } else {
        const h = safeResolution;
        if (forceRecodeMp4) {
          // SAFE FALLBACK: download a single pre-muxed stream (no merger step = no header crash)
          // then recode it to MP4. 'best' avoids any cross-container mux entirely.
          args = args.concat([
            '-f', `best[height<=${h}][ext=mp4]/best[height<=${h}]/best`,
            '--recode-video', 'mp4',
          ]);
        } else {
          // PRIMARY: explicitly request H.264 video + AAC audio in MP4/M4A containers.
          // yt-dlp will pick natively compatible streams before falling back.
          // bestvideo/bestaudio (full names) used for broad yt-dlp version compatibility.
          args = args.concat([
            '-f',
            `bestvideo[vcodec^=avc1][height<=${h}]+bestaudio[acodec^=mp4a]` +
            `/bestvideo[ext=mp4][height<=${h}]+bestaudio[ext=m4a]` +
            `/bestvideo[height<=${h}]+bestaudio[ext=m4a]` +
            `/bestvideo[height<=${h}]+bestaudio` +
            `/best[height<=${h}]/best`,
            '--merge-output-format', 'mp4',
          ]);
        }
      }
      if (subtitlesEnabled) {
        args = args.concat([
          '--write-subs',
          '--write-auto-subs',
          '--sub-langs', 'en.*'
        ]);
      }

      args.push(safeUrl);
      return args;
    };

    // Delete any leftover partial files from a previous failed attempt for this stem.
    function cleanPartialFiles(stem) {
      try {
        const entries = fs.readdirSync(safeOutputFolder, { withFileTypes: true });
        for (const e of entries) {
          if (
            e.isFile() &&
            (e.name.startsWith(stem) || e.name.includes('.part')) &&
            /\.(part|ytdl|temp)$/i.test(e.name)
          ) {
            try { fs.unlinkSync(path.join(safeOutputFolder, e.name)); } catch { }
          }
        }
      } catch { }
    }

    if (runningDownloads.has(safeDownloadId)) {
      reject(new Error('Download is already running.'));
      return;
    }
    let settled = false;
    let retriedWithMp4Recode = false;

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      runningDownloads.delete(safeDownloadId);
      fn(value);
    };
    const runAttempt = (
      useIdOnlyTemplate,
      subtitlesEnabled = safeDownloadSubtitles,
      forceRecodeMp4 = false
    ) => {
      if (settled) return;

      // Clean up any .part files before starting/retrying
      cleanPartialFiles(String(useIdOnlyTemplate ? safeDownloadId : buildSafeTitleStem(safeTitle, safeDownloadId, 6, 40)));

      const proc = spawnTracked(ytdlp, buildArgs(useIdOnlyTemplate, subtitlesEnabled, forceRecodeMp4), {
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8'
        }
      });
      proc.cancelRequested = false;
      runningDownloads.set(safeDownloadId, proc);

      let stderrOutput = '';
      let stdoutTail = '';
      const timeout = setTimeout(() => {
        void killProcessTree(proc);
        const message = 'Download timed out after 10 minutes';
        mainWindow.webContents.send('download-progress', {
          downloadId: safeDownloadId,
          percent: 0,
          fileSize: '',
          status: 'failed',
          error: message
        });
        settle(reject, new Error(message));
      }, 10 * 60 * 1000);

      proc.on('error', () => {
        clearTimeout(timeout);
        const message = 'Failed to start yt-dlp process';
        mainWindow.webContents.send('download-progress', {
          downloadId: safeDownloadId,
          percent: 0,
          fileSize: '',
          status: 'failed',
          error: message
        });
        settle(reject, new Error(message));
      });

      let lastIpcTime = 0;
      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdoutTail = `${stdoutTail}${chunk}`.slice(-12000);
        const lines = chunk.split('\n');
        lines.forEach(line => {
          const match = line.match(/(\d+\.?\d*)%\s+of\s+~?\s*([\d.]+\s*\w+)/);
          if (match) {
            const percent = parseFloat(match[1]);
            const isFinished = percent === 100;
            const now = Date.now();
            if (isFinished || now - lastIpcTime > 100) {
              lastIpcTime = now;
              mainWindow.webContents.send('download-progress', {
                downloadId: safeDownloadId,
                percent,
                fileSize: match[2],
                status: 'downloading'
              });
            }
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
        const chunk = data.toString();
        stderrOutput = `${stderrOutput}${chunk}`.slice(-16000);
        console.error('[yt-dlp stderr]', chunk.trim());
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (settled) return;

        if (code === 0) {
          let outputFilePath = '';
          try {
            const completedStem = useIdOnlyTemplate
              ? String(safeDownloadId)
              : buildSafeTitleStem(safeTitle, safeDownloadId, 6, 40);
            outputFilePath = resolveGeneratedDownloadFile(safeOutputFolder, completedStem, safeFormat);
          } catch (_) { }
          mainWindow.webContents.send('download-progress', {
            downloadId: safeDownloadId,
            percent: 100,
            fileSize: '',
            status: 'completed',
            outputFilePath: outputFilePath || undefined
          });
          settle(resolve, { success: true });
          return;
        }

        if (proc.cancelRequested) {
          mainWindow.webContents.send('download-progress', {
            downloadId: safeDownloadId,
            percent: 0,
            fileSize: '',
            status: 'canceled',
            error: 'Download canceled by user.'
          });
          settle(resolve, { success: false, canceled: true });
          return;
        }

        // Combine both stderr and stdout for error detection — yt-dlp sometimes
        // emits postprocessing errors via stdout (e.g. [Merger] lines).
        const combinedOutput = `${stderrOutput}\n${stdoutTail}`;
        const message = extractYtDlpError(stderrOutput, stdoutTail);

        // PATH-length error → retry with numeric-only filename
        if (isWindowsPathArgumentError(message)) {
          mainWindow.webContents.send('download-progress', {
            downloadId: safeDownloadId,
            percent: 0,
            fileSize: '',
            status: 'processing',
            error: 'Path error — retrying with a shorter filename...'
          });
          runAttempt(true);
          return;
        }

        // FFmpeg postprocessing / codec crash → force full recode on retry.
        // This is a SINGLE retry that covers all postprocessing error variants.
        if (!retriedWithMp4Recode && isPostprocessingHeaderArgumentError(combinedOutput)) {
          retriedWithMp4Recode = true;
          mainWindow.webContents.send('download-progress', {
            downloadId: safeDownloadId,
            percent: 0,
            fileSize: '',
            status: 'processing',
            error: 'Codec mismatch — retrying with forced MP4 re-encode...'
          });
          runAttempt(true, false, true);
          return;
        }

        mainWindow.webContents.send('download-progress', {
          downloadId: safeDownloadId,
          percent: 0,
          fileSize: '',
          status: 'failed',
          error: message
        });
        settle(reject, new Error(message));
      });
    };

    runAttempt(false);
  });
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  if (typeof folderPath !== 'string' || !folderPath) return { success: false };
  try {
    const safeFolderPath = validateFolder(folderPath);
    const errorMessage = await shell.openPath(safeFolderPath);
    return errorMessage ? { success: false, message: errorMessage } : { success: true };
  } catch (error) {
    return { success: false, message: error.message || 'Could not open folder.' };
  }
});

ipcMain.handle('play-file', async (event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return { success: false };
  try {
    const safeFilePath = path.resolve(filePath);
    if (!path.isAbsolute(safeFilePath)) {
      return { success: false, message: 'File path must be absolute.' };
    }
    if (!fs.existsSync(safeFilePath) || !fs.statSync(safeFilePath).isFile()) {
      return { success: false, message: 'File not found.' };
    }
    const errorMessage = await shell.openPath(safeFilePath);
    return errorMessage ? { success: false, message: errorMessage } : { success: true };
  } catch (error) {
    return { success: false, message: error.message || 'Could not open file.' };
  }
});

ipcMain.handle('open-external-url', async (event, rawUrl) => {
  try {
    const safeUrl = sanitizeHttpUrl(rawUrl);
    await shell.openExternal(safeUrl);
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message || 'Could not open external URL.' };
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
  try {
    if (!settings || typeof settings !== 'object') {
      return { success: false, message: 'Invalid settings payload.' };
    }
    const current = readSettings();
    if (settings.downloadFolder != null) current.downloadFolder = validateFolder(settings.downloadFolder);
    if (settings.defaultQuality != null) current.defaultQuality = settings.defaultQuality;
    if (settings.defaultFormat != null) current.defaultFormat = settings.defaultFormat;
    if (settings.theme === 'light' || settings.theme === 'dark' || settings.theme === 'system') {
      current.theme = settings.theme;
    }
    const ok = writeSettings(current);
    return ok ? { success: true } : { success: false, message: 'Could not save settings.' };
  } catch (error) {
    return { success: false, message: error.message || 'Could not save settings.' };
  }
});

function getYtDlpVersion() {
  return new Promise((resolve) => {
    const ytdlp = getToolPath('yt-dlp.exe');
    const proc = spawnTracked(ytdlp, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      killProcessTreeSync(proc);
      resolve({ success: false, message: 'yt-dlp version check timed out.' });
    }, 60 * 1000);

    proc.stdout.on('data', (d) => { if (!settled) stdout += d.toString(); });
    proc.stderr.on('data', (d) => { if (!settled) stderr += d.toString(); });
    proc.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ success: false, message: 'Failed to start yt-dlp.' });
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
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
    const proc = spawnTracked(ytdlp, ['-U'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      killProcessTreeSync(proc);
      resolve({ success: false, message: 'yt-dlp update timed out.' });
    }, 180 * 1000);

    proc.stdout.on('data', (d) => { if (!settled) stdout += d.toString(); });
    proc.stderr.on('data', (d) => { if (!settled) stderr += d.toString(); });
    proc.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ success: false, message: 'Failed to start yt-dlp.' });
    });
    proc.on('close', async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
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

ipcMain.handle('check-yt-dlp-update', async () => {
  try {
    const res = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
      headers: { 'User-Agent': 'MediaDl-AutoUpdater' }
    });
    if (!res.ok) {
      return { success: false, message: 'Failed to fetch latest release from GitHub.' };
    }
    const data = await res.json();
    const latestVersion = data.tag_name || '';

    if (!latestVersion) {
      return { success: false, message: 'Could not parse latest release version.' };
    }

    const currentResult = await getYtDlpVersion();
    let currentVersion = 'Unknown';
    if (currentResult.success) {
      currentVersion = currentResult.version;
    }

    const updateAvailable = latestVersion !== currentVersion;
    return { success: true, updateAvailable, latestVersion, currentVersion };
  } catch (error) {
    return { success: false, message: error.message || 'Error checking for updates.' };
  }
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
    const proc = spawnTracked(ffprobe, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      killProcessTreeSync(proc);
      resolve(null);
    }, 30 * 1000);

    proc.stdout.on('data', (d) => { if (!settled) out += d.toString(); });
    proc.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(null);
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
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
    const proc = spawnTracked(ffprobe, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=nw=1:nk=1',
      inputPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let out = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      killProcessTreeSync(proc);
      resolve(false);
    }, 30 * 1000);

    proc.stdout.on('data', (d) => { if (!settled) out += d.toString(); });
    proc.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(false);
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
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

function uniquePath(targetPath, baseFolder = null, label = 'Output path') {
  const initialTarget = baseFolder ? validateOutputPathWithinBase(targetPath, baseFolder, label) : targetPath;
  if (!fs.existsSync(initialTarget)) return initialTarget;
  const ext = path.extname(initialTarget);
  const name = initialTarget.slice(0, -ext.length);
  let i = 1;
  while (true) {
    const candidate = `${name}_${i}${ext}`;
    const safeCandidate = baseFolder ? validateOutputPathWithinBase(candidate, baseFolder, label) : candidate;
    if (!fs.existsSync(safeCandidate)) return safeCandidate;
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

    let safeOutputPath;
    try {
      safeOutputPath = validateOutputPathWithinBase(outputPath, getTrustedDownloadRoot(), 'Media tools output path');
    } catch (error) {
      reject(error);
      return;
    }

    const fullArgs = ['-y', '-i', inputPath, ...args, safeOutputPath];
    const proc = spawnTracked(ffmpeg, fullArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
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
        resolve({ outputPath: safeOutputPath });
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
  const downloadRoot = getTrustedDownloadRoot();
  for (let i = 0; i < resolvedInputs.length; i += 1) {
    const inputPath = resolvedInputs[i];
    const sourceName = path.basename(inputPath);
    const sourceBase = sanitizeBaseName(path.basename(inputPath, path.extname(inputPath)));
    const sourceDir = path.dirname(inputPath);
    const outputDir = outputFolderRaw
      ? validateFolderWithinBase(outputFolderRaw, downloadRoot, 'Tools output folder')
      : downloadRoot;
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
      const outputAudioPath = uniquePath(
        path.join(outputDir, `${sourceBase}_audio.${outputAudioFormat}`),
        downloadRoot,
        'Media tools output path'
      );
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
      const outputGifPath = uniquePath(
        path.join(outputDir, `${sourceBase}.gif`),
        downloadRoot,
        'Media tools output path'
      );
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
      const outputVideoPath = uniquePath(
        path.join(outputDir, `${sourceBase}_processed.${outputVideoFormat}`),
        downloadRoot,
        'Media tools output path'
      );
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
    outputFolder: outputFolderRaw
      ? validateFolderWithinBase(outputFolderRaw, downloadRoot, 'Tools output folder')
      : downloadRoot,
  };
});

ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return { success: false };
  try {
    const safeFilePath = path.resolve(filePath);
    if (!path.isAbsolute(safeFilePath)) {
      return { success: false, message: 'File path must be absolute.' };
    }
    if (!fs.existsSync(safeFilePath) || !fs.statSync(safeFilePath).isFile()) {
      return { success: false, message: 'File not found.' };
    }
    shell.showItemInFolder(safeFilePath);
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message || 'Could not reveal file.' };
  }
});

function getSptScriptPath() {
  const devPath = path.join(__dirname, 'spt.py');
  if (fs.existsSync(devPath)) return devPath;
  const prodPath = path.join(process.resourcesPath, 'spt.py');
  if (fs.existsSync(prodPath)) return prodPath;
  const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'spt.py');
  return unpackedPath;
}

ipcMain.handle('start-spotify-download', async (event, { url, outputFolder, downloadId }) => {
  return new Promise((resolve, reject) => {
    try {
      if (!url || typeof url !== 'string' || !url.trim()) {
        throw new Error('URL is required.');
      }
      if (!outputFolder || typeof outputFolder !== 'string' || !outputFolder.trim()) {
        throw new Error('Output folder is required.');
      }
      if (!Number.isInteger(downloadId) || downloadId < 1) {
        throw new Error('Invalid download ID.');
      }

      const safeUrl = sanitizeHttpUrl(url);
      const safeOutputFolder = validateFolderWithinBase(outputFolder, getTrustedDownloadRoot());
      const sptScript = getSptScriptPath();

      if (!fs.existsSync(sptScript)) {
        throw new Error(`Spotify downloader script not found at ${sptScript}`);
      }

      if (runningSpotifyDownloads.has(downloadId)) {
        throw new Error('Download is already running.');
      }

      const proc = spawnTracked('uv', ['run', sptScript, safeUrl, safeOutputFolder], {
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8'
        },
        windowsHide: true
      });

      proc.cancelRequested = false;
      runningSpotifyDownloads.set(downloadId, proc);

      let stderrOutput = '';
      let stdoutTail = '';
      let trackTitle = '';

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdoutTail = `${stdoutTail}${chunk}`.slice(-12000);
        
        const titleMatch = chunk.match(/🎵 TRACK IDENTIFIED:\s*(.+)/);
        if (titleMatch) {
          trackTitle = titleMatch[1].trim();
          mainWindow.webContents.send('spotify-download-progress', {
            downloadId,
            title: trackTitle,
            status: 'downloading',
            percent: 0
          });
        }

        const percentMatch = chunk.match(/Progress:\s*([\d.]+)%/);
        if (percentMatch) {
          const percent = parseFloat(percentMatch[1]);
          mainWindow.webContents.send('spotify-download-progress', {
            downloadId,
            percent,
            status: 'downloading'
          });
        }
      });

      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderrOutput = `${stderrOutput}${chunk}`.slice(-16000);
        console.error('[spt.py stderr]', chunk.trim());
      });

      proc.on('error', (err) => {
        runningSpotifyDownloads.delete(downloadId);
        reject(new Error(err.message || 'Failed to start Python process'));
      });

      proc.on('close', (code) => {
        runningSpotifyDownloads.delete(downloadId);
        
        if (code === 0) {
          let outputFilePath = '';
          try {
            if (trackTitle) {
              const stem = trackTitle.replace(/[\\/*?:"<>|]/g, "").replace(/ /g, "_");
              const expectedPath = path.join(safeOutputFolder, `${stem}.mp3`);
              if (fs.existsSync(expectedPath)) {
                outputFilePath = expectedPath;
              } else {
                outputFilePath = resolveGeneratedDownloadFile(safeOutputFolder, stem, 'mp3');
              }
            }
          } catch (_) {}

          mainWindow.webContents.send('spotify-download-progress', {
            downloadId,
            percent: 100,
            status: 'completed',
            outputFilePath: outputFilePath || undefined
          });
          resolve({ success: true });
        } else {
          if (proc.cancelRequested) {
            mainWindow.webContents.send('spotify-download-progress', {
              downloadId,
              status: 'canceled',
              error: 'Download canceled by user.'
            });
            resolve({ success: false, canceled: true });
          } else {
            let errMsg = 'Download failed.';
            if (stderrOutput.includes('Security structure changed')) {
              errMsg = 'Security structure changed on site (spotidown.app).';
            } else if (stderrOutput.includes('Validation backend rejected')) {
              errMsg = 'Validation backend rejected handshake inputs.';
            } else if (stderrOutput.includes('Data stream execution failed')) {
              const match = stderrOutput.match(/Data stream execution failed:\s*(.+)/);
              errMsg = match ? match[1] : 'Data stream execution failed.';
            } else if (stdoutTail.includes('[-]')) {
              const lines = stdoutTail.split('\n');
              const lastErr = lines.reverse().find(l => l.includes('[-]'));
              if (lastErr) errMsg = lastErr.replace(/^-\s*/, '').trim();
            } else if (stderrOutput.trim()) {
              errMsg = stderrOutput.trim().split('\n').pop();
            }
            mainWindow.webContents.send('spotify-download-progress', {
              downloadId,
              status: 'failed',
              error: errMsg
            });
            reject(new Error(errMsg));
          }
        }
      });

    } catch (err) {
      reject(err);
    }
  });
});

ipcMain.handle('cancel-spotify-download', async (event, downloadId) => {
  const proc = runningSpotifyDownloads.get(downloadId);
  if (!proc) return { success: false, message: 'Download is not running.' };
  proc.cancelRequested = true;
  const killed = await killProcessTree(proc);
  return killed ? { success: true } : { success: false };
});

// ── Window controls ──
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());
