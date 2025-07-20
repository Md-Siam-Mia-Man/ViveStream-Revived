// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  downloadVideo: (options) => ipcRenderer.send("download-video", options),
  cancelDownload: (videoId) => ipcRenderer.send("cancel-download", videoId),
  retryDownload: (job) => ipcRenderer.send("retry-download", job),
  onDownloadQueueStart: (cb) =>
    ipcRenderer.on("download-queue-start", (e, v) => cb(v)),
  onDownloadProgress: (cb) =>
    ipcRenderer.on("download-progress", (e, v) => cb(v)),
  onDownloadComplete: (cb) =>
    ipcRenderer.on("download-complete", (e, v) => cb(v)),
  onDownloadError: (cb) => ipcRenderer.on("download-error", (e, v) => cb(v)),

  getLibrary: () => ipcRenderer.invoke("get-library"),
  deleteVideo: (id) => ipcRenderer.invoke("delete-video", id),
  toggleFavorite: (id) => ipcRenderer.invoke("toggle-favorite", id),
  openPath: (path) => ipcRenderer.send("open-path", path),
  openExternal: (url) => ipcRenderer.send("open-external", url),

  getSettings: () => ipcRenderer.invoke("get-settings"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  saveSettings: (s) => ipcRenderer.send("save-settings", s),
  resetApp: () => ipcRenderer.invoke("reset-app"),
  clearAllMedia: () => ipcRenderer.invoke("clear-all-media"),
  onClearLocalStorage: (cb) => ipcRenderer.on("clear-local-storage", cb),

  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  maximizeWindow: () => ipcRenderer.send("maximize-window"),
  closeWindow: () => ipcRenderer.send("close-window"),
  trayWindow: () => ipcRenderer.send("tray-window"),
  onWindowMaximized: (cb) =>
    ipcRenderer.on("window-maximized", (e, v) => cb(v)),
});
