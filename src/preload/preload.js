const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getAssetsPath: () => ipcRenderer.invoke("get-assets-path"),
  getPlatform: () => process.platform,

  downloadVideo: (options, jobId) =>
    ipcRenderer.send("download-video", { downloadOptions: options, jobId }),
  cancelDownload: (videoId) => ipcRenderer.send("cancel-download", videoId),
  retryDownload: (job) => ipcRenderer.send("retry-download", job),
  onDownloadQueueStart: (cb) =>
    ipcRenderer.on("download-queue-start", (e, v) => cb(v)),
  onDownloadProgress: (cb) =>
    ipcRenderer.on("download-progress", (e, v) => cb(v)),
  onDownloadComplete: (cb) =>
    ipcRenderer.on("download-complete", (e, v) => cb(v)),
  onDownloadError: (cb) => ipcRenderer.on("download-error", (e, v) => cb(v)),
  onDownloadInfoError: (cb) =>
    ipcRenderer.on("download-info-error", (e, v) => cb(v)),

  getLibrary: () => ipcRenderer.invoke("get-library"),
  deleteVideo: (id) => ipcRenderer.invoke("delete-video", id),
  toggleFavorite: (id) => ipcRenderer.invoke("toggle-favorite", id),
  videoUpdateMetadata: (videoId, metadata) =>
    ipcRenderer.invoke("video:update-metadata", videoId, metadata),
  videosTouch: (videoIds) => ipcRenderer.invoke("videos:touch", videoIds),

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

  checkYtDlpUpdate: () => ipcRenderer.invoke("updater:check-yt-dlp"),
  onYtDlpUpdateProgress: (cb) =>
    ipcRenderer.on("updater:yt-dlp-progress", (e, v) => cb(v)),

  mediaImportFiles: () => ipcRenderer.invoke("media:import-files"),
  onImportError: (cb) => ipcRenderer.on("import-error", (e, v) => cb(v)),
  mediaExportFile: (videoId) =>
    ipcRenderer.invoke("media:export-file", videoId),
  mediaExportAll: () => ipcRenderer.invoke("media:export-all"),
  onFileOperationProgress: (cb) =>
    ipcRenderer.on("file-operation-progress", (e, v) => cb(v)),
  appReinitialize: () => ipcRenderer.invoke("app:reinitialize"),

  playlistCreate: (name) => ipcRenderer.invoke("playlist:create", name),
  playlistGetAll: () => ipcRenderer.invoke("playlist:get-all"),
  playlistGetDetails: (id) => ipcRenderer.invoke("playlist:get-details", id),
  playlistRename: (id, newName) =>
    ipcRenderer.invoke("playlist:rename", id, newName),
  playlistDelete: (id) => ipcRenderer.invoke("playlist:delete", id),
  playlistAddVideo: (playlistId, videoId) =>
    ipcRenderer.invoke("playlist:add-video", playlistId, videoId),
  playlistRemoveVideo: (playlistId, videoId) =>
    ipcRenderer.invoke("playlist:remove-video", playlistId, videoId),
  playlistUpdateOrder: (playlistId, videoIds) =>
    ipcRenderer.invoke("playlist:update-order", playlistId, videoIds),
  playlistGetForVideo: (videoId) =>
    ipcRenderer.invoke("playlist:get-for-video", videoId),
  playlistUpdateCover: (playlistId) =>
    ipcRenderer.invoke("playlist:update-cover", playlistId),

  artistGetAll: () => ipcRenderer.invoke("artist:get-all"),
  artistGetDetails: (id) => ipcRenderer.invoke("artist:get-details", id),
  artistUpdateThumbnail: (artistId) =>
    ipcRenderer.invoke("artist:update-thumbnail", artistId),

  onMediaKeyPlayPause: (cb) => ipcRenderer.on("media-key-play-pause", cb),
  onMediaKeyNextTrack: (cb) => ipcRenderer.on("media-key-next-track", cb),
  onMediaKeyPrevTrack: (cb) => ipcRenderer.on("media-key-prev-track", cb),
});