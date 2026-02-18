const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getDownloadFolder: () => ipcRenderer.invoke('get-download-folder'),
  setDownloadFolder: (folderPath) => ipcRenderer.invoke('set-download-folder', folderPath),
  fetchFormats: (url) => ipcRenderer.invoke('fetch-formats', url),
  startDownload: (options) => ipcRenderer.invoke('start-download', options),
  cancelDownload: (downloadId) => ipcRenderer.invoke('cancel-download', downloadId),
  onDownloadProgress: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  playFile: (filePath) => ipcRenderer.invoke('play-file', filePath),
  resolveOutputFile: (payload) => ipcRenderer.invoke('resolve-output-file', payload),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),
  getYtDlpVersion: () => ipcRenderer.invoke('get-yt-dlp-version'),
  updateYtDlp: () => ipcRenderer.invoke('update-yt-dlp'),
  selectMediaFiles: () => ipcRenderer.invoke('select-media-files'),
  mediaToolsRunPipeline: (opts) => ipcRenderer.invoke('media-tools-run-pipeline', opts),
  onMediaToolsProgress: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('media-tools-progress', listener);
    return () => ipcRenderer.removeListener('media-tools-progress', listener);
  },
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
});
