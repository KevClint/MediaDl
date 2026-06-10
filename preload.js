const { contextBridge, ipcRenderer } = require('electron');

const themePreferenceArg = process.argv.find((arg) => arg.startsWith('--theme-preference='));
const initialThemePreference = themePreferenceArg
  ? themePreferenceArg.slice('--theme-preference='.length)
  : 'system';
const INVOKE_CHANNELS = new Set([
  'get-platform',
  'select-folder',
  'get-download-folder',
  'set-download-folder',
  'fetch-formats',
  'start-download',
  'cancel-download',
  'open-folder',
  'play-file',
  'resolve-output-file',
  'get-app-version',
  'get-settings',
  'set-settings',
  'get-yt-dlp-version',
  'update-yt-dlp',
  'check-yt-dlp-update',
  'select-media-files',
  'media-tools-run-pipeline',
  'show-item-in-folder',
  'open-external-url',
  'start-spotify-download',
  'cancel-spotify-download',
]);
const SEND_CHANNELS = new Set([
  'window-minimize',
  'window-maximize',
  'window-close',
]);
const SUBSCRIBE_CHANNELS = new Set([
  'download-progress',
  'media-tools-progress',
  'spotify-download-progress',
]);

function expectCallback(callback, label) {
  if (typeof callback !== 'function') {
    throw new TypeError(`${label} must be a function.`);
  }
}

function expectAllowedChannel(channel, allowedChannels, label) {
  if (!allowedChannels.has(channel)) {
    throw new Error(`${label} is not allowed.`);
  }
}

function invoke(channel, ...args) {
  expectAllowedChannel(channel, INVOKE_CHANNELS, 'IPC invoke channel');
  return ipcRenderer.invoke(channel, ...args);
}

function send(channel, ...args) {
  expectAllowedChannel(channel, SEND_CHANNELS, 'IPC send channel');
  ipcRenderer.send(channel, ...args);
}

function subscribe(channel, callback) {
  expectAllowedChannel(channel, SUBSCRIBE_CHANNELS, 'IPC subscribe channel');
  expectCallback(callback, 'Listener');
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('bootstrapData', Object.freeze({
  themePreference: initialThemePreference,
}));

contextBridge.exposeInMainWorld('electronAPI', Object.freeze({
  getPlatform: () => invoke('get-platform'),
  selectFolder: () => invoke('select-folder'),
  getDownloadFolder: () => invoke('get-download-folder'),
  setDownloadFolder: (folderPath) => invoke('set-download-folder', folderPath),
  fetchFormats: (url) => invoke('fetch-formats', url),
  startDownload: (options) => invoke('start-download', options),

  cancelDownload: (downloadId) => invoke('cancel-download', downloadId),
  onDownloadProgress: (cb) => subscribe('download-progress', cb),
  openFolder: (folderPath) => invoke('open-folder', folderPath),
  playFile: (filePath) => invoke('play-file', filePath),
  resolveOutputFile: (payload) => invoke('resolve-output-file', payload),
  getAppVersion: () => invoke('get-app-version'),
  getSettings: () => invoke('get-settings'),
  setSettings: (settings) => invoke('set-settings', settings),
  getYtDlpVersion: () => invoke('get-yt-dlp-version'),
  updateYtDlp: () => invoke('update-yt-dlp'),
  checkYtDlpUpdate: () => invoke('check-yt-dlp-update'),
  selectMediaFiles: () => invoke('select-media-files'),
  mediaToolsRunPipeline: (opts) => invoke('media-tools-run-pipeline', opts),
  onMediaToolsProgress: (cb) => subscribe('media-tools-progress', cb),
  showItemInFolder: (filePath) => invoke('show-item-in-folder', filePath),
  openExternalUrl: (url) => invoke('open-external-url', url),
  startSpotifyDownload: (options) => invoke('start-spotify-download', options),
  cancelSpotifyDownload: (downloadId) => invoke('cancel-spotify-download', downloadId),
  onSpotifyDownloadProgress: (cb) => subscribe('spotify-download-progress', cb),
  minimizeWindow: () => send('window-minimize'),
  maximizeWindow: () => send('window-maximize'),
  closeWindow: () => send('window-close'),
}));
