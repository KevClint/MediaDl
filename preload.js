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
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),
  updateYtDlp: () => ipcRenderer.invoke('update-yt-dlp'),
  selectMediaFile: () => ipcRenderer.invoke('select-media-file'),
  mediaToolsConvert: (opts) => ipcRenderer.invoke('media-tools-convert', opts),
  mediaToolsCompress: (opts) => ipcRenderer.invoke('media-tools-compress', opts),
  mediaToolsExtractAudio: (opts) => ipcRenderer.invoke('media-tools-extract-audio', opts),
  onMediaToolsProgress: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('media-tools-progress', listener);
    return () => ipcRenderer.removeListener('media-tools-progress', listener);
  },
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
});
