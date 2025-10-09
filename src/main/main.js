// src/main/main.js
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Tray,
  Menu,
  dialog,
  globalShortcut,
} = require("electron");
const path = require("path");
const fs = require("fs");
const fse = require("fs-extra");
const { spawn, execFile } = require("child_process");
const crypto = require("crypto");
const db = require("./database");

const isDev = !app.isPackaged;
const platform = process.platform;
const exeSuffix = platform === "win32" ? ".exe" : "";

const getResourcePath = (subfolder, fileName) => {
  const basePath = isDev
    ? path.join(__dirname, "..", "..", subfolder)
    : path.join(process.resourcesPath, subfolder);
  return path.join(basePath, fileName);
};

const ytDlpPath = getResourcePath("vendor", `yt-dlp${exeSuffix}`);
const ffmpegPath = getResourcePath("vendor", `ffmpeg${exeSuffix}`);
const ffprobePath = getResourcePath("vendor", `ffprobe${exeSuffix}`);
const iconPath = getResourcePath("assets", "icon.ico");

const userHomePath = app.getPath("home");
const viveStreamPath = path.join(userHomePath, "ViveStream");
const videoPath = path.join(viveStreamPath, "videos");
const coverPath = path.join(viveStreamPath, "covers");
const subtitlePath = path.join(viveStreamPath, "subtitles");
const settingsPath = path.join(app.getPath("userData"), "settings.json");
const mediaPaths = [videoPath, coverPath, subtitlePath];

let tray = null;
let win = null;

mediaPaths.forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const defaultSettings = {
  concurrentDownloads: 3,
  cookieBrowser: "none",
  downloadSubs: false,
  downloadAutoSubs: false,
  removeSponsors: false,
  concurrentFragments: 1,
  outputTemplate: "%(id)s.%(ext)s",
  speedLimit: "",
};

function getSettings() {
  if (fs.existsSync(settingsPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      return { ...defaultSettings, ...saved };
    } catch (e) {
      console.error("Error reading settings.json, using defaults.", e);
      return defaultSettings;
    }
  }
  return defaultSettings;
}

function saveSettings(settings) {
  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({ ...getSettings(), ...settings }, null, 2)
  );
}
if (!fs.existsSync(settingsPath)) saveSettings(defaultSettings);

function parseYtDlpError(stderr) {
  if (stderr.includes("Private video"))
    return "This video is private and cannot be downloaded.";
  if (stderr.includes("Video unavailable")) return "This video is unavailable.";
  if (stderr.includes("is not available in your country"))
    return "This video is geo-restricted and not available in your country.";
  if (stderr.includes("Premiere will begin in"))
    return "This video is a premiere and has not been released yet.";
  if (stderr.includes("Invalid URL"))
    return "The URL provided is invalid. Please check and try again.";
  if (stderr.includes("429"))
    return "Too many requests. YouTube may be temporarily limiting your connection.";
  if (stderr.includes("HTTP Error 403: Forbidden"))
    return "Download failed (403 Forbidden). YouTube may be blocking the request.";
  return "An unknown download error occurred. Check the console for details.";
}

class Downloader {
  constructor() {
    this.queue = [];
    this.activeDownloads = new Map();
    this.settings = getSettings();
  }
  updateSettings(s) {
    this.settings = s;
    this.processQueue();
  }
  addToQueue(jobs) {
    this.queue.push(...jobs);
    this.processQueue();
  }
  retryDownload(job) {
    this.queue.unshift(job);
    this.processQueue();
  }
  processQueue() {
    while (
      this.activeDownloads.size < this.settings.concurrentDownloads &&
      this.queue.length > 0
    ) {
      this.startDownload(this.queue.shift());
    }
  }
  cancelDownload(videoId) {
    const p = this.activeDownloads.get(videoId);
    if (p) p.kill();
  }
  shutdown() {
    this.queue = [];
    for (const process of this.activeDownloads.values()) {
      process.kill();
    }
    this.activeDownloads.clear();
  }

  startDownload(job) {
    const {
      videoInfo,
      quality,
      startTime,
      endTime,
      splitChapters,
      downloadSubs,
    } = job;
    const url =
      videoInfo.webpage_url ||
      `https://www.youtube.com/watch?v=${videoInfo.id}`;

    let args = [
      url,
      "--ffmpeg-location",
      ffmpegPath,
      "--progress",
      "--no-warnings",
      "--retries",
      "5",
      "--impersonate",
      "chrome",
      "--write-info-json",
      "--write-thumbnail",
      "--convert-thumbnails",
      "jpg",
      "--write-description",
      "--embed-metadata",
      "--embed-chapters",
    ];

    const outputTemplate =
      this.settings.outputTemplate || defaultSettings.outputTemplate;
    if (splitChapters) {
      const chapterTemplate = path.join(
        videoPath,
        "%(playlist_title,title)s",
        "%(chapter_number)s - %(chapter)s.%(ext)s"
      );
      args.push("-o", chapterTemplate, "--split-chapters");
    } else {
      args.push("-o", path.join(videoPath, outputTemplate));
    }

    const qualityFilter = quality === "best" ? "" : `[height<=${quality}]`;
    const formatString = `bestvideo[ext=mp4]${qualityFilter}+bestaudio[ext=m4a]/bestvideo[vcodec^=avc]${qualityFilter}+bestaudio/best[ext=mp4]/best`;
    args.push("-f", formatString, "--merge-output-format", "mp4");

    if (downloadSubs) {
      args.push(
        "--write-subs",
        "--sub-langs",
        "en.*,-live_chat",
        "--embed-subs"
      );
      if (this.settings.downloadAutoSubs) args.push("--write-auto-subs");
    }

    if (this.settings.removeSponsors) args.push("--sponsorblock-remove", "all");
    if (!splitChapters && (startTime || endTime)) {
      const timeRange = `${startTime || "0:00"}-${endTime || "inf"}`;
      args.push(
        "--download-sections",
        `*${timeRange}`,
        "--force-keyframes-at-cuts"
      );
    }
    if (this.settings.concurrentFragments > 1)
      args.push(
        "--concurrent-fragments",
        this.settings.concurrentFragments.toString()
      );
    if (this.settings.cookieBrowser && this.settings.cookieBrowser !== "none")
      args.push("--cookies-from-browser", this.settings.cookieBrowser);
    if (this.settings.speedLimit) args.push("-r", this.settings.speedLimit);

    const proc = spawn(ytDlpPath, args);
    this.activeDownloads.set(videoInfo.id, proc);

    let stderrOutput = "";
    let stallTimeout;

    const resetStallTimer = () => {
      clearTimeout(stallTimeout);
      stallTimeout = setTimeout(() => {
        stderrOutput =
          "Download stalled for over 90 seconds and was cancelled.";
        proc.kill();
      }, 90000);
    };

    resetStallTimer();

    proc.stdout.on("data", (data) => {
      resetStallTimer();
      const m = data
        .toString()
        .match(
          /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s*([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/
        );
      if (m && win)
        win.webContents.send("download-progress", {
          id: videoInfo.id,
          percent: parseFloat(m[1]),
          totalSize: m[2],
          currentSpeed: m[3],
          eta: m[4],
        });
    });

    proc.stderr.on("data", (data) => {
      stderrOutput += data.toString();
      console.error(`Download Stderr (${videoInfo.id}): ${data}`);
    });

    proc.on("close", async (code) => {
      clearTimeout(stallTimeout);
      this.activeDownloads.delete(videoInfo.id);
      if (code === 0) {
        await this.postProcess(videoInfo, job);
      } else if (code !== null) {
        if (win)
          win.webContents.send("download-error", {
            id: videoInfo.id,
            error: parseYtDlpError(stderrOutput),
            job,
          });
      }
      this.processQueue();
    });
  }

  async postProcess(videoInfo, job) {
    if (job.splitChapters) {
      if (win)
        win.webContents.send("download-complete", {
          id: videoInfo.id,
          videoData: {
            title: `${videoInfo.title} (Chapters)`,
            isChapterSplit: true,
          },
        });
      return;
    }
    try {
      const files = fs.readdirSync(videoPath);
      const infoJsonFile = files.find((file) => {
        if (!file.endsWith(".info.json")) return false;
        try {
          const content = JSON.parse(
            fs.readFileSync(path.join(videoPath, file))
          );
          return content.id === videoInfo.id;
        } catch {
          return false;
        }
      });

      if (!infoJsonFile)
        throw new Error(
          `Post-processing failed: Could not find .info.json for video ID ${videoInfo.id}`
        );

      const infoJsonPath = path.join(videoPath, infoJsonFile);
      const info = JSON.parse(fs.readFileSync(infoJsonPath, "utf-8"));
      const baseNameWithInfoExt = path.parse(infoJsonFile).name;
      const baseName = path.parse(baseNameWithInfoExt).name;

      const mediaFile = files.find(
        (f) =>
          path.parse(f).name === baseName &&
          [
            ".mp4",
            ".mkv",
            ".webm",
            ".mp3",
            ".m4a",
            ".flac",
            ".opus",
            ".wav",
          ].some((ext) => f.endsWith(ext))
      );

      if (!mediaFile)
        throw new Error(
          `Post-processing failed: Could not find media file for basename ${baseName}`
        );

      const mediaFilePath = path.join(videoPath, mediaFile);
      fs.unlinkSync(infoJsonPath);

      let finalCoverPath = null;
      const tempCoverPath = path.join(videoPath, `${baseName}.jpg`);
      if (fs.existsSync(tempCoverPath)) {
        finalCoverPath = path.join(coverPath, `${info.id}.jpg`);
        fse.moveSync(tempCoverPath, finalCoverPath, { overwrite: true });
      }
      const finalCoverUri = finalCoverPath
        ? `file://${finalCoverPath.replace(/\\/g, "/")}`
        : null;

      let subFileUri = null;
      const tempSubFile = files.find(
        (f) => path.parse(f).name === baseName && f.endsWith(".vtt")
      );
      if (tempSubFile) {
        const tempSubPath = path.join(videoPath, tempSubFile);
        const finalSubPath = path.join(subtitlePath, `${info.id}.vtt`);
        fs.renameSync(tempSubPath, finalSubPath);
        subFileUri = `file://${finalSubPath.replace(/\\/g, "/")}`;
      }

      const descriptionPath = path.join(videoPath, `${baseName}.description`);
      if (fs.existsSync(descriptionPath)) fs.unlinkSync(descriptionPath);

      const artistString = info.artist || info.creator || info.uploader;
      const artistNames = artistString
        ? artistString.split(/[,;&]/).map((name) => name.trim())
        : [];

      if (artistNames.length > 0) {
        for (const name of artistNames) {
          if (!name) continue;
          const artist = await db.findOrCreateArtist(name, finalCoverUri);
          if (artist) await db.linkVideoToArtist(info.id, artist.id);
        }
      }

      const videoData = {
        id: info.id,
        title: info.title,
        uploader: info.uploader,
        creator: artistString || null,
        description: info.description,
        duration: info.duration,
        upload_date: info.upload_date,
        originalUrl: info.webpage_url,
        filePath: `file://${mediaFilePath.replace(/\\/g, "/")}`,
        coverPath: finalCoverUri,
        subtitlePath: subFileUri,
        hasEmbeddedSubs: !!subFileUri,
        type:
          info.acodec !== "none" && info.vcodec === "none" ? "audio" : "video",
        downloadedAt: new Date().toISOString(),
        isFavorite: false,
        source: "youtube",
      };
      await db.addOrUpdateVideo(videoData);
      if (win)
        win.webContents.send("download-complete", {
          id: videoInfo.id,
          videoData,
        });
    } catch (e) {
      console.error(`Post-processing failed for ${videoInfo.id}:`, e);
      if (win)
        win.webContents.send("download-error", {
          id: videoInfo.id,
          error: e.message || "Post-processing failed.",
          job,
        });
    }
  }
}
const downloader = new Downloader();

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#0F0F0F",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      hardwareAcceleration: true,
    },
    frame: false,
    icon: iconPath,
  });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.on("maximize", () => win.webContents.send("window-maximized", true));
  win.on("unmaximize", () => win.webContents.send("window-maximized", false));
  win.on("closed", () => (win = null));
  if (isDev) win.webContents.openDevTools({ mode: "detach" });
}

function createTray() {
  tray = new Tray(iconPath);
  tray.setToolTip("ViveStream");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show App", click: () => win.show() },
      {
        label: "Quit",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", () => win.show());
}

app.on("before-quit", async () => {
  globalShortcut.unregisterAll();
  downloader.shutdown();
  await db.shutdown();
});

app.on("will-quit", () => globalShortcut.unregisterAll());

app
  .whenReady()
  .then(() => {
    try {
      db.initialize(app)
        .then(createWindow)
        .then(createTray)
        .then(() => {
          globalShortcut.register("MediaPlayPause", () =>
            win?.webContents.send("media-key-play-pause")
          );
          globalShortcut.register("MediaNextTrack", () =>
            win?.webContents.send("media-key-next-track")
          );
          globalShortcut.register("MediaPreviousTrack", () =>
            win?.webContents.send("media-key-prev-track")
          );
        });
    } catch (error) {
      console.error("Failed during app startup:", error);
      dialog.showErrorBox(
        "Fatal Error",
        `A critical error occurred during startup: ${error.message}`
      );
      app.quit();
    }
  })
  .catch((err) => {
    console.error("Failed in app.whenReady promise chain:", err);
    dialog.showErrorBox(
      "Fatal Error",
      `A critical error occurred in the promise chain: ${err.message}`
    );
    app.quit();
  });

app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
app.on(
  "activate",
  () => BrowserWindow.getAllWindows().length === 0 && createWindow()
);

ipcMain.handle("get-assets-path", () => {
  const assetsPath = getResourcePath("assets", "");
  return assetsPath.replace(/\\/g, "/");
});

ipcMain.on("minimize-window", () => win.minimize());
ipcMain.on("maximize-window", () =>
  win.isMaximized() ? win.unmaximize() : win.maximize()
);
ipcMain.on("close-window", () => win.close());
ipcMain.on("tray-window", () => win.hide());
ipcMain.on("open-external", (e, url) => shell.openExternal(url));

ipcMain.handle("get-settings", getSettings);
ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.on("save-settings", (e, s) => {
  saveSettings(s);
  downloader.updateSettings(getSettings());
});
ipcMain.handle("reset-app", () => {
  saveSettings(defaultSettings);
  if (win) win.webContents.send("clear-local-storage");
  mediaPaths.forEach((dir) => {
    fs.readdirSync(dir).forEach((file) => {
      if (file.endsWith(".part")) fs.unlinkSync(path.join(dir, file));
    });
  });
  return getSettings();
});
ipcMain.handle("get-library", () => db.getLibrary());
ipcMain.handle("toggle-favorite", (e, id) => db.toggleFavorite(id));
ipcMain.handle("clear-all-media", async () => {
  try {
    for (const dir of mediaPaths) await fse.emptyDir(dir);
    const result = await db.clearAllMedia();
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("delete-video", async (e, id) => {
  const video = await db.getVideoById(id);
  if (!video) return { success: false, message: "Video not found in DB." };
  [video.filePath, video.coverPath, video.subtitlePath]
    .filter(Boolean)
    .forEach((uri) => {
      try {
        const p = path.normalize(
          decodeURIComponent(uri.replace("file://", ""))
        );
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (err) {
        console.error(`Failed to delete file ${uri}:`, err);
      }
    });
  return await db.deleteVideo(id);
});

ipcMain.handle("video:update-metadata", (e, videoId, metadata) =>
  db.updateVideoMetadata(videoId, metadata)
);

ipcMain.on("download-video", (e, { downloadOptions, jobId }) => {
  const args = [
    downloadOptions.url,
    "--dump-json",
    "--no-warnings",
    "--flat-playlist",
    "--impersonate",
    "chrome",
  ];
  const settings = getSettings();
  if (settings.cookieBrowser && settings.cookieBrowser !== "none")
    args.push("--cookies-from-browser", settings.cookieBrowser);

  const proc = spawn(ytDlpPath, args);
  let j = "";
  let errorOutput = "";

  const timeout = setTimeout(() => {
    proc.kill();
    errorOutput = "Network timeout: The request took too long to complete.";
  }, 30000);

  proc.stdout.on("data", (d) => (j += d));
  proc.stderr.on("data", (d) => (errorOutput += d));

  proc.on("close", (c) => {
    clearTimeout(timeout);
    if (c === 0 && j.trim()) {
      try {
        const infos = j
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l));
        if (win) win.webContents.send("download-queue-start", { infos, jobId });
        downloader.addToQueue(
          infos.map((i) => ({ ...downloadOptions, videoInfo: i }))
        );
      } catch (parseError) {
        if (win)
          win.webContents.send("download-info-error", {
            jobId,
            error: "Failed to parse video information.",
          });
      }
    } else {
      if (win)
        win.webContents.send("download-info-error", {
          jobId,
          error: parseYtDlpError(errorOutput),
        });
    }
  });
});
ipcMain.on("cancel-download", (e, id) => downloader.cancelDownload(id));
ipcMain.on("retry-download", (e, job) => downloader.retryDownload(job));
ipcMain.handle("updater:check-yt-dlp", () => {
  return new Promise((resolve) => {
    const proc = spawn(ytDlpPath, ["-U"]);
    proc.stdout.on("data", (data) =>
      win.webContents.send("updater:yt-dlp-progress", data.toString())
    );
    proc.stderr.on("data", (data) =>
      win.webContents.send("updater:yt-dlp-progress", `ERROR: ${data}`)
    );
    proc.on("close", (code) => resolve({ success: code === 0 }));
  });
});

ipcMain.handle("media:import-files", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Media Files",
        extensions: ["mp4", "mkv", "webm", "mp3", "m4a", "flac", "opus", "wav"],
      },
    ],
  });
  if (canceled || filePaths.length === 0) return { success: true, count: 0 };
  let importedCount = 0;
  for (const filePath of filePaths) {
    try {
      const ffprobeArgs = [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ];
      const { stdout: metaJson } = await new Promise((resolve, reject) => {
        const ffprobeProc = spawn(ffprobePath, ffprobeArgs);
        let stdout = "";
        let stderr = "";
        ffprobeProc.stdout.on("data", (data) => (stdout += data));
        ffprobeProc.stderr.on("data", (data) => (stderr += data));
        ffprobeProc.on("close", (code) =>
          code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr))
        );
        ffprobeProc.on("error", (err) => reject(err));
      });

      const meta = JSON.parse(metaJson);
      const format = meta.format.tags || {};
      const videoStream = meta.streams.find((s) => s.codec_type === "video");

      const newId = crypto.randomUUID();
      const newFileName = `${newId}${path.extname(filePath)}`;
      const newFilePath = path.join(videoPath, newFileName);
      await fse.copy(filePath, newFilePath);

      let coverUri = null;
      if (
        videoStream &&
        videoStream.disposition &&
        videoStream.disposition.attached_pic
      ) {
        const finalCoverPath = path.join(coverPath, `${newId}.jpg`);
        const ffmpegCoverArgs = [
          "-i",
          newFilePath,
          "-an",
          "-vcodec",
          "copy",
          finalCoverPath,
        ];
        await new Promise((resolve) => {
          const ffmpegProc = spawn(ffmpegPath, ffmpegCoverArgs);
          ffmpegProc.on("close", (code) => {
            if (code === 0)
              coverUri = `file://${finalCoverPath.replace(/\\/g, "/")}`;
            else console.error("Cover extraction failed for", newFileName);
            resolve();
          });
          ffmpegProc.on("error", () => resolve());
        });
      }

      const artistString =
        format.artist || format.ARTIST || format.composer || "Unknown Artist";
      const title = format.title || format.TITLE || path.parse(filePath).name;

      const videoData = {
        id: newId,
        title: title,
        creator: artistString,
        description: format.comment || format.COMMENT || "",
        duration: parseFloat(meta.format.duration),
        filePath: `file://${newFilePath.replace(/\\/g, "/")}`,
        coverPath: coverUri,
        type: videoStream ? "video" : "audio",
        downloadedAt: new Date().toISOString(),
        source: "local",
      };

      await db.addOrUpdateVideo(videoData);
      const artist = await db.findOrCreateArtist(artistString, coverUri);
      if (artist) await db.linkVideoToArtist(newId, artist.id);

      importedCount++;
    } catch (error) {
      console.error(`Failed to import ${filePath}:`, error);
      win.webContents.send("import-error", {
        fileName: path.basename(filePath),
        error: error.message,
      });
    }
  }
  return { success: true, count: importedCount };
});

ipcMain.handle("media:export-file", async (e, videoId) => {
  const video = await db.getVideoById(videoId);
  if (!video) return { success: false, error: "Video not found." };

  const sourcePath = path.normalize(
    decodeURIComponent(video.filePath.replace("file://", ""))
  );
  const { canceled, filePath: destPath } = await dialog.showSaveDialog(win, {
    defaultPath: path.basename(sourcePath),
    title: "Export Media File",
  });

  if (canceled || !destPath)
    return { success: false, error: "Export cancelled." };

  try {
    await fse.copy(sourcePath, destPath, { overwrite: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("media:export-all", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    title: "Select Export Folder",
  });
  if (canceled || filePaths.length === 0)
    return { success: false, error: "Export cancelled." };
  const destFolder = filePaths[0];
  const library = await db.getLibrary();
  let exportedCount = 0;
  for (const video of library) {
    try {
      const sourcePath = path.normalize(
        decodeURIComponent(video.filePath.replace("file://", ""))
      );
      const destPath = path.join(destFolder, path.basename(sourcePath));
      await fse.copy(sourcePath, destPath);
      exportedCount++;
    } catch (error) {
      console.error(`Failed to export ${video.title}:`, error);
    }
  }
  return { success: true, count: exportedCount };
});

ipcMain.handle("db:cleanup-orphans", () => db.cleanupOrphanArtists());

ipcMain.handle("playlist:create", (e, name) => db.createPlaylist(name));
ipcMain.handle("playlist:get-all", () => db.getAllPlaylistsWithStats());
ipcMain.handle("playlist:get-details", (e, id) => db.getPlaylistDetails(id));
ipcMain.handle("playlist:rename", (e, id, newName) =>
  db.renamePlaylist(id, newName)
);
ipcMain.handle("playlist:delete", (e, id) => db.deletePlaylist(id));
ipcMain.handle("playlist:add-video", (e, playlistId, videoId) =>
  db.addVideoToPlaylist(playlistId, videoId)
);
ipcMain.handle("playlist:remove-video", (e, playlistId, videoId) =>
  db.removeVideoFromPlaylist(playlistId, videoId)
);
ipcMain.handle("playlist:update-order", (e, playlistId, videoIds) =>
  db.updateVideoOrderInPlaylist(playlistId, videoIds)
);
ipcMain.handle("playlist:get-for-video", (e, videoId) =>
  db.getPlaylistsForVideo(videoId)
);

ipcMain.handle("artist:get-all", () => db.getAllArtistsWithStats());
ipcMain.handle("artist:get-details", (e, id) => db.getArtistDetails(id));
