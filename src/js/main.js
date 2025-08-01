// src/js/main.js
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Tray,
  Menu,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");
const fse = require("fs-extra");
const { spawn } = require("child_process");
const db = require("./database");

// --- Constants and Paths ---
const isDev = !app.isPackaged;
const assetsPath = isDev
  ? path.join(__dirname, "..", "..", "assets")
  : path.join(process.resourcesPath, "assets");
const resourcesPath = isDev
  ? path.join(__dirname, "..", "..", "vendor")
  : path.join(process.resourcesPath, "vendor");
const ytDlpPath = path.join(resourcesPath, "yt-dlp.exe");
const ffmpegPath = path.join(resourcesPath, "ffmpeg.exe");
const userHomePath = app.getPath("home");
const viveStreamPath = path.join(userHomePath, "ViveStream");
const videoPath = path.join(viveStreamPath, "videos");
const coverPath = path.join(viveStreamPath, "covers");
const subtitlePath = path.join(viveStreamPath, "subtitles");
const settingsPath = path.join(app.getPath("userData"), "settings.json");
const mediaPaths = [videoPath, coverPath, subtitlePath];

let tray = null;
let win = null;

// Ensure media directories exist
mediaPaths.forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- Settings Management ---
const defaultSettings = { concurrentDownloads: 3 };
function getSettings() {
  if (fs.existsSync(settingsPath)) {
    try {
      return {
        ...defaultSettings,
        ...JSON.parse(fs.readFileSync(settingsPath, "utf-8")),
      };
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
// Initialize settings file if it doesn't exist
if (!fs.existsSync(settingsPath)) saveSettings(defaultSettings);

// --- Downloader Class ---
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
    if (p) {
      p.kill();
    }
  }
  shutdown() {
    this.queue = [];
    for (const process of this.activeDownloads.values()) {
      process.kill();
    }
    this.activeDownloads.clear();
  }
  startDownload(job) {
    const { videoInfo, quality } = job;
    const args = [
      videoInfo.webpage_url ||
        `https://www.youtube.com/watch?v=${videoInfo.id}`,
      "--ffmpeg-location",
      ffmpegPath,
      "--progress",
      "--no-warnings",
      "--retries",
      "5",
      "-f",
      `bestvideo${
        quality === "best" ? "" : `[height<=${quality}]`
      }+bestaudio/best`,
      "--merge-output-format",
      "mp4",
      "--output",
      path.join(videoPath, "%(id)s.%(ext)s"),
      "--write-info-json",
      "--write-thumbnail",
      "--convert-thumbnails",
      "jpg",
      "--write-subs",
      "--sub-langs",
      "en.*,-live_chat",
    ];
    const proc = spawn(ytDlpPath, args);
    this.activeDownloads.set(videoInfo.id, proc);
    proc.stdout.on("data", (data) => {
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
    proc.stderr.on("data", (data) =>
      console.error(`Download Error (${videoInfo.id}): ${data}`)
    );
    proc.on("close", async (code) => {
      this.activeDownloads.delete(videoInfo.id);
      if (code === 0) {
        await this.postProcess(videoInfo, job);
      } else if (code !== null) {
        if (win)
          win.webContents.send("download-error", {
            id: videoInfo.id,
            error: `Downloader exited with code: ${code}`,
            job,
          });
      }
      this.processQueue();
    });
  }
  async postProcess(videoInfo, job) {
    try {
      const infoJsonPath = path.join(videoPath, `${videoInfo.id}.info.json`);
      if (!fs.existsSync(infoJsonPath)) {
        throw new Error(".info.json file not found after download.");
      }
      const fullInfo = JSON.parse(fs.readFileSync(infoJsonPath, "utf-8"));
      fs.unlinkSync(infoJsonPath);

      let finalCoverPath = null;
      const tempCoverPath = path.join(videoPath, `${fullInfo.id}.jpg`);
      if (fs.existsSync(tempCoverPath)) {
        finalCoverPath = path.join(coverPath, `${fullInfo.id}.jpg`);
        fs.renameSync(tempCoverPath, finalCoverPath);
      }
      const finalCoverUri = finalCoverPath
        ? `file://${finalCoverPath.replace(/\\/g, "/")}`
        : null;

      const tempSubPath = path.join(videoPath, `${fullInfo.id}.en.vtt`);
      const finalSubPath = path.join(subtitlePath, `${fullInfo.id}.vtt`);
      const subFileUri = fs.existsSync(tempSubPath)
        ? (fs.renameSync(tempSubPath, finalSubPath),
          `file://${finalSubPath.replace(/\\/g, "/")}`)
        : null;

      // --- CORRECTED LOGIC: Use 'artist', 'creator', or 'uploader' as the source for the artist name ---
      const artistString =
        fullInfo.artist || fullInfo.creator || fullInfo.uploader;
      const artistNames = artistString
        ? artistString.split(/[,;&]/).map((name) => name.trim())
        : [];

      // Find/create artists and link them to the video
      if (artistNames.length > 0) {
        for (const name of artistNames) {
          if (!name) continue;
          // Use the video cover as the artist thumbnail if it's the first time
          const artist = await db.findOrCreateArtist(name, finalCoverUri);
          if (artist) {
            await db.linkVideoToArtist(fullInfo.id, artist.id);
          }
        }
      }

      const videoData = {
        id: fullInfo.id,
        title: fullInfo.title,
        uploader: fullInfo.uploader,
        creator: artistString || null, // Store the primary artist/creator string
        duration: fullInfo.duration,
        upload_date: fullInfo.upload_date,
        originalUrl: fullInfo.webpage_url,
        filePath: `file://${path
          .join(videoPath, `${fullInfo.id}.mp4`)
          .replace(/\\/g, "/")}`,
        coverPath: finalCoverUri,
        subtitlePath: subFileUri,
        type: "video",
        downloadedAt: new Date().toISOString(),
        isFavorite: false,
      };
      await db.addOrUpdateVideo(videoData);
      if (win)
        win.webContents.send("download-complete", {
          id: videoInfo.id,
          videoData,
        });
    } catch (e) {
      if (win)
        win.webContents.send("download-error", {
          id: videoInfo.id,
          error: e.message || "Post-processing failed.",
          job: job,
        });
    }
  }
}
const downloader = new Downloader();

// --- Window Management ---
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#0F0F0F",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    icon: path.join(assetsPath, "icon.ico"),
  });

  win.loadFile(path.join(__dirname, "..", "index.html"));

  win.on("maximize", () => win.webContents.send("window-maximized", true));
  win.on("unmaximize", () => win.webContents.send("window-maximized", false));
  win.on("closed", () => (win = null));

  if (isDev) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

function createTray() {
  tray = new Tray(path.join(assetsPath, "icon.ico"));
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

// --- App Lifecycle ---
app.on("before-quit", async () => {
  downloader.shutdown();
  await db.shutdown();
});

app
  .whenReady()
  .then(() => {
    try {
      db.initialize(app).then(createWindow).then(createTray);
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

// --- IPC Handlers ---

// Window controls
ipcMain.on("minimize-window", () => win.minimize());
ipcMain.on("maximize-window", () =>
  win.isMaximized() ? win.unmaximize() : win.maximize()
);
ipcMain.on("close-window", () => win.close());
ipcMain.on("tray-window", () => win.hide());
ipcMain.on("open-external", (e, url) => shell.openExternal(url));

// Settings
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

// Library management
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

// Downloader
ipcMain.on("download-video", (e, o) => {
  const proc = spawn(ytDlpPath, [
    o.url,
    "--dump-json",
    "--no-warnings",
    "--flat-playlist",
  ]);
  let j = "";
  let errorOutput = "";
  proc.stdout.on("data", (d) => (j += d));
  proc.stderr.on("data", (d) => (errorOutput += d));
  proc.on("close", (c) => {
    if (c === 0 && j.trim()) {
      try {
        const infos = j
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l));
        if (win) win.webContents.send("download-queue-start", infos);
        downloader.addToQueue(
          infos.map((i) => ({ videoInfo: i, quality: o.quality }))
        );
      } catch (parseError) {
        console.error(
          `Failed to parse JSON for ${o.url}. Stderr: ${errorOutput}, Output: ${j}`
        );
        if (win) win.webContents.send("download-info-error", { url: o.url });
      }
    } else {
      console.error(
        `Failed to get video info for ${o.url}. Stderr: ${errorOutput}`
      );
      if (win) win.webContents.send("download-info-error", { url: o.url });
    }
  });
});
ipcMain.on("cancel-download", (e, id) => downloader.cancelDownload(id));
ipcMain.on("retry-download", (e, job) => downloader.retryDownload(job));

// Playlists
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

// Artist IPC Handlers
ipcMain.handle("artist:get-all", () => db.getAllArtistsWithStats());
ipcMain.handle("artist:get-details", (e, id) => db.getArtistDetails(id));
