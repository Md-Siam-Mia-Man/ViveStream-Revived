const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
  downloadVideo: (options) => ipcRenderer.send("download-video", options),
  onDownloadProgress: (callback) =>
    ipcRenderer.on("download-progress", (_event, value) => callback(value)),
  onDownloadComplete: (callback) =>
    ipcRenderer.on("download-complete", (_event, value) => callback(value)),
  onDownloadError: (callback) =>
    ipcRenderer.on("download-error", (_event, value) => callback(value)),
  getLibrary: () => ipcRenderer.invoke("get-library"),
  deleteVideo: (videoId) => ipcRenderer.invoke("delete-video", videoId),
  openPath: (filePath) => ipcRenderer.send("open-path", filePath),

  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  maximizeWindow: () => ipcRenderer.send("maximize-window"),
  closeWindow: () => ipcRenderer.send("close-window"),
  trayWindow: () => ipcRenderer.send("tray-window"),
  onWindowMaximized: (callback) =>
    ipcRenderer.on("window-maximized", (_event, value) => callback(value)),
});
