// preload.js
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
  openPath: (filePath) => ipcRenderer.send("open-path", filePath),
});
