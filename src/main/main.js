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
const { spawn } = require("child_process");
const crypto = require("crypto");
const url = require("url");
const db = require("./database");

app.commandLine.appendSwitch("enable-begin-frame-scheduling");
app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-oop-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

const isDev = !app.isPackaged;

if (isDev) {
  app.commandLine.appendSwitch(
    "disable-features",
    "Autofill,ComponentUpdateServices"
  );
}

const platform = process.platform;
const exeSuffix = platform === "win32" ? ".exe" : "";
const platformDir = platform === "win32" ? "win" : platform === "darwin" ? "mac" : "linux";

// Helper: Get path for External Resources (Binaries)
const getVendorPath = (fileName) => {
  const basePath = isDev
    ? path.join(__dirname, "..", "..", "vendor", platformDir)
    : path.join(process.resourcesPath, "vendor", platformDir);
  return path.join(basePath, fileName);
};

// Helper: Get path for Internal Assets (Icons, Fonts)
const getAssetPath = (fileName) => {
  return path.join(__dirname, "..", "..", "assets", fileName);
};

// Vendor Binaries (External)
const bundledYtDlpPath = getVendorPath(`yt-dlp${exeSuffix}`);
const ffmpegPath = getVendorPath(`ffmpeg${exeSuffix}`);
const ffprobePath = getVendorPath(`ffprobe${exeSuffix}`);

// User Data Binary Copy
const userYtDlpPath = path.join(app.getPath("userData"), `yt-dlp${exeSuffix}`);
let ytDlpPath = userYtDlpPath;

// Assets (Internal)
const iconPath = getAssetPath("icon.ico");

const userHomePath = app.getPath("home");
const viveStreamPath = path.join(userHomePath, "ViveStream");
const videoPath = path.join(viveStreamPath, "videos");
const coverPath = path.join(viveStreamPath, "covers");
const playlistCoverPath = path.join(coverPath, "playlists");
const artistCoverPath = path.join(coverPath, "artists");
const subtitlePath = path.join(viveStreamPath, "subtitles");
const settingsPath = path.join(app.getPath("userData"), "settings.json");
const mediaPaths = [
  videoPath,
  coverPath,
  playlistCoverPath,
  artistCoverPath,
  subtitlePath,
];

let tray = null;
let win = null;
// Store the file path if app was opened via file association before window ready
let externalFilePath = null;

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
  speedLimit: "",
};

// --- Single Instance Lock & File Association Logic ---

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();

      const file = getFileFromArgs(commandLine);
      if (file) {
        win.webContents.send("app:play-external-file", file);
      }
    }
  });

  // Handle file association startup on macOS
  app.on("open-file", (event, path) => {
    event.preventDefault();
    if (win && win.webContents) {
      win.webContents.send("app:play-external-file", path);
    } else {
      externalFilePath = path;
    }
  });

  app.whenReady().then(async () => {
    try {
      await initializeYtDlp();
      await db.initialize(app);

      // Check for file in args (Windows/Linux)
      if (!externalFilePath) {
        externalFilePath = getFileFromArgs(process.argv);
      }

      createWindow();
      createTray();

      globalShortcut.register("MediaPlayPause", () =>
        win?.webContents.send("media-key-play-pause")
      );
      globalShortcut.register("MediaNextTrack", () =>
        win?.webContents.send("media-key-next-track")
      );
      globalShortcut.register("MediaPreviousTrack", () =>
        win?.webContents.send("media-key-prev-track")
      );
    } catch (error) {
      console.error("Failed during app startup:", error);
      dialog.showErrorBox(
        "Fatal Error",
        `A critical error occurred during startup: ${error.message}`
      );
      app.quit();
    }
  }).catch((err) => {
    console.error("Failed in app.whenReady promise chain:", err);
    app.quit();
  });
}

function getFileFromArgs(argv) {
  // In dev, args might be: electron . "path/to/file"
  // In prod, args might be: Vivestream.exe "path/to/file"
  const relevantArgs = isDev ? argv.slice(2) : argv.slice(1);
  for (const arg of relevantArgs) {
    if (arg && !arg.startsWith("-") && fs.existsSync(arg)) {
      const stat = fs.statSync(arg);
      if (stat.isFile()) return arg;
    }
  }
  return null;
}

// ... [Downloader Class Omitted - Unchanged] ...
// Assuming the Downloader class is exactly as provided previously.
// To keep the file valid, I will insert the minimal necessary parts or verify imports.
// Since I must provide the COMPLETE file content, I will paste the Downloader class back in.

function sanitizeFilename(filename) {
  return filename.replace(/[\\/:"*?<>|]/g, "_");
}

function parseYtDlpError(stderr) {
  if (stderr.includes("Could not copy") && stderr.includes("cookie database"))
    return "Failed to access browser cookies. Please close your browser completely and retry.";
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

  const errorMatch = stderr.match(/ERROR: (.*)/);
  if (errorMatch && errorMatch[1]) {
    return errorMatch[1].trim();
  }

  if (stderr.trim()) {
    return stderr.trim().split("\n").pop();
  }

  return "An unknown error occurred. Try updating the downloader in Settings.";
}

async function initializeYtDlp() {
  try {
    const userPathExists = await fse.pathExists(userYtDlpPath);
    if (!userPathExists) {
      if (await fse.pathExists(bundledYtDlpPath)) {
        await fse.copy(bundledYtDlpPath, userYtDlpPath);
      } else {
        console.warn("Bundled yt-dlp not found at:", bundledYtDlpPath);
      }
    }
    ytDlpPath = userYtDlpPath;
  } catch (error) {
    console.error(
      "Failed to initialize user yt-dlp, falling back to bundled version:",
      error
    );
    ytDlpPath = bundledYtDlpPath;
  }
}

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
    const { videoInfo } = job;
    const requestUrl =
      videoInfo.webpage_url ||
      `https://www.youtube.com/watch?v=${videoInfo.id}`;

    let args = [
      requestUrl,
      "-o",
      path.join(videoPath, "%(id)s.%(ext)s"),
      "--ffmpeg-location",
      path.dirname(ffmpegPath),
      "--progress",
      "-v",
      "--retries",
      "5",
      "--write-info-json",
      "--write-thumbnail",
      "--convert-thumbnails",
      "jpg",
      "--write-description",
      "--embed-metadata",
      "--embed-chapters",
    ];

    if (job.downloadType === "video") {
      const qualityFilter =
        job.quality === "best" ? "" : `[height<=${job.quality}]`;
      const formatString = `bestvideo[ext=mp4]${qualityFilter}+bestaudio[ext=m4a]/bestvideo[vcodec^=avc]${qualityFilter}+bestaudio/best[ext=mp4]/best`;
      args.push("-f", formatString, "--merge-output-format", "mp4");

      if (job.downloadSubs) {
        args.push("--write-subs", "--sub-langs", "en.*,-live_chat");
        if (this.settings.downloadAutoSubs) args.push("--write-auto-subs");
      }
    } else if (job.downloadType === "audio") {
      args.push(
        "-x",
        "--audio-format",
        job.audioFormat,
        "--audio-quality",
        job.audioQuality.toString()
      );
      if (job.embedThumbnail) {
        args.push("--embed-thumbnail");
      }
    }

    if (job.playlistItems) args.push("--playlist-items", job.playlistItems);
    if (job.liveFromStart) args.push("--live-from-start");
    if (this.settings.removeSponsors) args.push("--sponsorblock-remove", "all");
    if (this.settings.concurrentFragments > 1)
      args.push(
        "--concurrent-fragments",
        this.settings.concurrentFragments.toString()
      );
    if (this.settings.cookieBrowser && this.settings.cookieBrowser !== "none")
      args.push("--cookies-from-browser", this.settings.cookieBrowser);
    if (this.settings.speedLimit) args.push("-r", this.settings.speedLimit);

    console.log(`[Downloader] Executing: ${ytDlpPath} ${args.join(" ")}`);

    const proc = spawn(ytDlpPath, args);
    this.activeDownloads.set(videoInfo.id, proc);

    let stderrOutput = "";
    let stallTimeout;

    const resetStallTimer = () => {
      clearTimeout(stallTimeout);
      stallTimeout = setTimeout(() => {
        stderrOutput += "\n[System]: Download stalled for over 90 seconds and was cancelled.";
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
      resetStallTimer();
      stderrOutput += data.toString();
    });

    proc.on("error", (err) => {
      console.error(`Failed to start download process for ${videoInfo.id}:`, err);
      stderrOutput = `Failed to start yt-dlp process. Error: ${err.message}`;
    });

    proc.on("close", async (code) => {
      clearTimeout(stallTimeout);
      this.activeDownloads.delete(videoInfo.id);

      const fullLog = `COMMAND EXECUTED:\n${ytDlpPath} ${args.join(" ")}\n\nVERBOSE LOG:\n${stderrOutput}`;

      if (code === 0) {
        await this.postProcess(videoInfo, job, fullLog);
      } else if (code !== null) {
        const errorMsg = parseYtDlpError(stderrOutput);
        await db.addToHistory({
          url: videoInfo.webpage_url,
          title: videoInfo.title || videoInfo.url,
          type: job.downloadType,
          thumbnail: videoInfo.thumbnail,
          status: "failed"
        });

        if (win)
          win.webContents.send("download-error", {
            id: videoInfo.id,
            error: errorMsg,
            fullLog: fullLog,
            job,
          });
      }
      this.processQueue();
    });
  }

  async postProcess(videoInfo, job, fullLog) {
    try {
      const infoJsonPath = path.join(videoPath, `${videoInfo.id}.info.json`);
      if (!fs.existsSync(infoJsonPath)) {
        throw new Error(
          `Post-processing failed: Could not find .info.json for video ID ${videoInfo.id}`
        );
      }

      const info = JSON.parse(fs.readFileSync(infoJsonPath, "utf-8"));

      let mediaFilePath;
      if (job.downloadType === "audio") {
        const expectedExt =
          job.audioFormat === "best" ? info.aext : job.audioFormat;
        mediaFilePath = path.join(videoPath, `${info.id}.${expectedExt}`);
      } else {
        mediaFilePath = path.join(videoPath, `${info.id}.${info.ext}`);
      }

      if (!fs.existsSync(mediaFilePath)) {
        throw new Error(
          `Post-processing failed: Media file not found for video ID ${info.id}`
        );
      }

      fs.unlinkSync(infoJsonPath);

      let finalCoverPath = null;
      const tempCoverPath = path.join(videoPath, `${videoInfo.id}.jpg`);
      if (fs.existsSync(tempCoverPath)) {
        finalCoverPath = path.join(coverPath, `${info.id}.jpg`);
        await fse.move(tempCoverPath, finalCoverPath, { overwrite: true });
      }
      const finalCoverUri = finalCoverPath
        ? url.pathToFileURL(finalCoverPath).href
        : null;

      let subFileUri = null;
      if (job.downloadType === "video") {
        const potentialSubs = fs.readdirSync(videoPath).filter(f => f.startsWith(videoInfo.id) && f.endsWith('.vtt'));
        if (potentialSubs.length > 0) {
          const tempSubPath = path.join(videoPath, potentialSubs[0]);
          const finalSubPath = path.join(subtitlePath, `${info.id}.vtt`);
          fs.renameSync(tempSubPath, finalSubPath);
          subFileUri = url.pathToFileURL(finalSubPath).href;
        }
      }

      const descriptionPath = path.join(
        videoPath,
        `${videoInfo.id}.description`
      );
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
        filePath: url.pathToFileURL(mediaFilePath).href,
        coverPath: finalCoverUri,
        subtitlePath: subFileUri,
        hasEmbeddedSubs: !!subFileUri,
        type: job.downloadType === "audio" ? "audio" : "video",
        downloadedAt: new Date().toISOString(),
        isFavorite: false,
        source: "youtube",
      };

      await db.addOrUpdateVideo(videoData);
      if (job.playlistId) {
        await db.addVideoToPlaylist(job.playlistId, videoData.id);
      }

      await db.addToHistory({
        url: info.webpage_url,
        title: info.title,
        type: job.downloadType,
        thumbnail: finalCoverUri,
        status: "success"
      });

      if (win)
        win.webContents.send("download-complete", {
          id: videoInfo.id,
          videoData,
          fullLog
        });
    } catch (e) {
      console.error(`Post-processing failed for ${videoInfo.id}:`, e);
      if (win)
        win.webContents.send("download-error", {
          id: videoInfo.id,
          error: e.message || "Post-processing failed.",
          fullLog: fullLog + `\n\nPOST-PROCESSING ERROR:\n${e.stack}`,
          job,
        });
    }
  }
}
const downloader = new Downloader();

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
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
    title: "ViveStream",
  });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.on("maximize", () => win.webContents.send("window-maximized", true));
  win.on("unmaximize", () => win.webContents.send("window-maximized", false));
  win.on("closed", () => (win = null));
  if (isDev) win.webContents.openDevTools({ mode: "detach" });

  win.webContents.on("did-finish-load", () => {
    // If we have an external file pending, send it now
    if (externalFilePath) {
      win.webContents.send("app:play-external-file", externalFilePath);
      externalFilePath = null; // Clear it so we don't replay on reload
    }
  });
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
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
app.on(
  "activate",
  () => BrowserWindow.getAllWindows().length === 0 && createWindow()
);

ipcMain.handle("get-assets-path", () => {
  const assetsPath = getAssetPath("");
  return assetsPath.replace(/\\/g, "/");
});

ipcMain.on("minimize-window", () => win.minimize());
ipcMain.on("maximize-window", () =>
  win.isMaximized() ? win.unmaximize() : win.maximize()
);
ipcMain.on("close-window", () => win.close());
ipcMain.on("tray-window", () => win.hide());
ipcMain.on("open-external", (e, url) => shell.openExternal(url));
ipcMain.handle("open-media-folder", () => shell.openPath(viveStreamPath));
ipcMain.handle("open-database-folder", () => shell.openPath(app.getPath("userData")));
ipcMain.handle("open-vendor-folder", () => {
  const p = isDev ? path.join(__dirname, "..", "..", "vendor") : path.join(process.resourcesPath, "vendor");
  return shell.openPath(p);
});

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

ipcMain.handle("db:delete", async () => {
  try {
    await db.shutdown();
    const dbPath = path.join(app.getPath("userData"), "ViveStream.db");
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    app.relaunch();
    app.exit(0);
    return { success: true };
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
        const p = url.fileURLToPath(uri);
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

ipcMain.handle("videos:touch", async (e, videoIds) => {
  try {
    await db
      .db("videos")
      .whereIn("id", videoIds)
      .update({ downloadedAt: new Date().toISOString() });
    return { success: true };
  } catch (error) {
    console.error("Error touching videos:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.on("download-video", (e, { downloadOptions, jobId }) => {
  const args = [
    downloadOptions.url,
    "--dump-json",
    "-v",
    "--flat-playlist",
  ];
  const settings = getSettings();
  if (settings.cookieBrowser && settings.cookieBrowser !== "none")
    args.push("--cookies-from-browser", settings.cookieBrowser);

  console.log(`[InfoFetch] Executing: ${ytDlpPath} ${args.join(" ")}`);

  const proc = spawn(ytDlpPath, args);
  let j = "";
  let errorOutput = "";

  const timeout = setTimeout(() => {
    proc.kill();
    errorOutput += "\n[System]: Network timeout: The request took too long to complete.";
  }, 30000);

  proc.stdout.on("data", (d) => (j += d));
  proc.stderr.on("data", (d) => (errorOutput += d));

  proc.on("error", (err) => {
    console.error("Failed to start info process:", err);
    errorOutput = `Failed to start yt-dlp process. Error: ${err.message}`;
  });

  proc.on("close", async (c) => {
    clearTimeout(timeout);
    if (c === 0 && j.trim()) {
      try {
        const infos = j
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l));
        let playlistId = null;
        if (infos.length > 0 && infos[0].playlist_title) {
          const playlist = await db.findOrCreatePlaylistByName(
            infos[0].playlist_title
          );
          if (playlist) playlistId = playlist.id;
        }

        if (win) win.webContents.send("download-queue-start", { infos, jobId });
        downloader.addToQueue(
          infos.map((i) => ({ ...downloadOptions, videoInfo: i, playlistId }))
        );
      } catch (parseError) {
        if (win)
          win.webContents.send("download-info-error", {
            jobId,
            error: "Failed to parse video information.",
          });
      }
    } else {
      const fullLog = `COMMAND EXECUTED:\n${ytDlpPath} ${args.join(" ")}\n\nVERBOSE LOG:\n${errorOutput}`;
      if (win)
        win.webContents.send("download-info-error", {
          jobId,
          error: parseYtDlpError(errorOutput),
          fullLog: fullLog
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

async function copyWithProgress(source, dest, eventPayload) {
  const totalSize = (await fs.promises.stat(source)).size;
  let copiedSize = 0;
  let lastUpdate = 0;

  const sourceStream = fs.createReadStream(source);
  const destStream = fs.createWriteStream(dest);

  sourceStream.on("data", (chunk) => {
    copiedSize += chunk.length;

    const now = Date.now();
    if (now - lastUpdate > 100 || copiedSize === totalSize) {
      lastUpdate = now;
      const progress = totalSize > 0 ? Math.round((copiedSize / totalSize) * 100) : 100;
      if (win) {
        win.webContents.send("file-operation-progress", {
          ...eventPayload,
          progress,
        });
      }
    }
  });

  sourceStream.pipe(destStream);

  return new Promise((resolve, reject) => {
    destStream.on("finish", resolve);
    destStream.on("error", reject);
    sourceStream.on("error", reject);
  });
}

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
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
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

      await copyWithProgress(filePath, newFilePath, {
        type: "import",
        fileName: path.basename(filePath),
        currentFile: i + 1,
        totalFiles: filePaths.length,
      });

      let coverUri = null;
      const finalCoverPath = path.join(coverPath, `${newId}.jpg`);
      const hasEmbeddedPic =
        videoStream &&
        videoStream.disposition &&
        videoStream.disposition.attached_pic;

      if (hasEmbeddedPic) {
        const ffmpegCoverArgs = [
          "-i",
          newFilePath,
          "-map",
          "0:v",
          "-map",
          "-0:V",
          "-c",
          "copy",
          finalCoverPath,
        ];
        await new Promise((resolve) => {
          spawn(ffmpegPath, ffmpegCoverArgs)
            .on("close", () => resolve())
            .on("error", () => resolve());
        });
      } else if (videoStream) {
        const ffmpegThumbArgs = [
          "-i",
          newFilePath,
          "-ss",
          "00:00:05",
          "-vframes",
          "1",
          finalCoverPath,
        ];
        await new Promise((resolve) => {
          spawn(ffmpegPath, ffmpegThumbArgs)
            .on("close", () => resolve())
            .on("error", () => resolve());
        });
      }

      if (fs.existsSync(finalCoverPath)) {
        coverUri = url.pathToFileURL(finalCoverPath).href;
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
        filePath: url.pathToFileURL(newFilePath).href,
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

  const sourcePath = url.fileURLToPath(video.filePath);
  const extension = path.extname(sourcePath);
  const defaultFilename = `${sanitizeFilename(video.title)}${extension}`;

  const { canceled, filePath: destPath } = await dialog.showSaveDialog(win, {
    defaultPath: defaultFilename,
    title: "Export Media File",
  });

  if (canceled || !destPath)
    return { success: false, error: "Export cancelled." };

  try {
    await copyWithProgress(sourcePath, destPath, {
      type: "export",
      fileName: path.basename(destPath),
      currentFile: 1,
      totalFiles: 1,
    });
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
  for (let i = 0; i < library.length; i++) {
    const video = library[i];
    try {
      const sourcePath = url.fileURLToPath(video.filePath);
      const extension = path.extname(sourcePath);
      const filename = `${sanitizeFilename(video.title)}${extension}`;
      const destPath = path.join(destFolder, filename);

      await copyWithProgress(sourcePath, destPath, {
        type: "export",
        fileName: filename,
        currentFile: i + 1,
        totalFiles: library.length,
      });

      exportedCount++;
    } catch (error) {
      console.error(`Failed to export ${video.title}:`, error);
    }
  }
  return { success: true, count: exportedCount };
});

ipcMain.handle("app:reinitialize", async () => {
  try {
    await win.webContents.session.clearCache();
    const dbVideos = await db.getLibrary();
    const diskFiles = new Set(fs.readdirSync(videoPath));
    const deadDbEntries = dbVideos.filter(
      (v) => !diskFiles.has(path.basename(url.fileURLToPath(v.filePath)))
    );
    for (const entry of deadDbEntries) {
      await db.deleteVideo(entry.id);
    }
    const orphanResult = await db.cleanupOrphanArtists();
    return {
      success: true,
      clearedCache: true,
      deletedVideos: deadDbEntries.length,
      deletedArtists: orphanResult.count,
    };
  } catch (error) {
    console.error("Reinitialization failed:", error);
    return { success: false, error: error.message };
  }
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
ipcMain.handle("playlist:update-cover", async (e, playlistId) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["jpg", "png", "gif"] }],
  });
  if (canceled || filePaths.length === 0)
    return { success: false, error: "File selection cancelled." };
  try {
    const sourcePath = filePaths[0];
    const newFileName = `${playlistId}${path.extname(sourcePath)}`;
    const destPath = path.join(playlistCoverPath, newFileName);
    await fse.copy(sourcePath, destPath, { overwrite: true });
    const fileUri = url.pathToFileURL(destPath).href;
    return await db.updatePlaylistCover(playlistId, fileUri);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("artist:get-all", () => db.getAllArtistsWithStats());
ipcMain.handle("artist:get-details", (e, id) => db.getArtistDetails(id));
ipcMain.handle("artist:update-thumbnail", async (e, artistId) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["jpg", "png", "gif"] }],
  });
  if (canceled || filePaths.length === 0)
    return { success: false, error: "File selection cancelled." };
  try {
    const sourcePath = filePaths[0];
    const newFileName = `${artistId}${path.extname(sourcePath)}`;
    const destPath = path.join(artistCoverPath, newFileName);
    await fse.copy(sourcePath, destPath, { overwrite: true });
    const fileUri = url.pathToFileURL(destPath).href;
    return await db.updateArtistThumbnail(artistId, fileUri);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("artist:rename", (e, id, name) => db.updateArtistName(id, name));
ipcMain.handle("artist:delete", (e, id) => db.deleteArtist(id));

ipcMain.handle("history:get", () => db.getHistory());
ipcMain.handle("history:clear", () => db.clearHistory());