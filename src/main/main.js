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
const { parseArtistNames } = require("./utils");

// * --------------------------------------------------------------------------
// * PERFORMANCE TUNING
// * --------------------------------------------------------------------------
// ! These flags force Chrome to use GPU acceleration where possible to reduce UI lag.
app.commandLine.appendSwitch("enable-begin-frame-scheduling");
app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-oop-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

const isDev = !app.isPackaged;

// ? Disable annoying autofill popups in dev mode
if (isDev) {
  app.commandLine.appendSwitch("disable-features", "Autofill,ComponentUpdateServices");
}

// * --------------------------------------------------------------------------
// * FILE SYSTEM CONFIGURATION
// * --------------------------------------------------------------------------
const userHomePath = app.getPath("home");
const viveStreamPath = path.join(userHomePath, "ViveStream");
const videoPath = path.join(viveStreamPath, "videos");
const coverPath = path.join(viveStreamPath, "covers");
const playlistCoverPath = path.join(coverPath, "playlists");
const artistCoverPath = path.join(coverPath, "artists");
const subtitlePath = path.join(viveStreamPath, "subtitles");
const settingsPath = path.join(app.getPath("userData"), "settings.json");
const mediaPaths = [videoPath, coverPath, playlistCoverPath, artistCoverPath, subtitlePath];

let tray = null;
let win = null;
let externalFilePath = null;

// ? State tracking for external binaries
let resolvedFfmpegPath = null;
let pythonDetails = null;
let ffmpegResolutionPromise = null;

const getAssetPath = (fileName) => path.join(__dirname, "..", "..", "assets", fileName);
// * Use correct icon format per OS
const iconFileName = process.platform === "win32" ? "icon.ico" : "icon.png";
const iconPath = getAssetPath(iconFileName);

// * Ensure critical directories exist on startup
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

// * --------------------------------------------------------------------------
// * HELPER FUNCTIONS
// * --------------------------------------------------------------------------

function getSettings() {
  if (fs.existsSync(settingsPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      return { ...defaultSettings, ...saved };
    } catch (e) {
      return defaultSettings;
    }
  }
  return defaultSettings;
}

function saveSettings(settings) {
  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({ ...getSettings(), ...settings }, null, 2));
}
if (!fs.existsSync(settingsPath)) saveSettings(defaultSettings);

/**
 * * Locates the bundled Python environment.
 * ! Critical: This app relies on a portable Python environment to run yt-dlp reliably across platforms.
 * @returns {{ pythonPath: string, binDir: string }}
 */
function getPythonDetails() {
  if (pythonDetails) return pythonDetails; // Cache hit

  const root = isDev
    ? path.join(__dirname, "..", "..", "python-portable")
    : path.join(process.resourcesPath, "python-portable");

  let pythonPath = null;
  let binDir = null;

  if (process.platform === "win32") {
    const winDir = path.join(root, "python-win-x64");
    if (fs.existsSync(winDir)) {
      pythonPath = path.join(winDir, "python.exe");
      binDir = path.join(winDir, "Scripts");
    } else {
      pythonPath = "python"; // Fallback to system PATH
    }
  } else if (process.platform === "darwin") {
    const macDir = path.join(root, "python-mac-darwin");
    if (fs.existsSync(path.join(macDir, "bin", "python3"))) {
      pythonPath = path.join(macDir, "bin", "python3");
      binDir = path.join(macDir, "bin");
    } else {
      pythonPath = "python3";
    }
  } else {
    // Linux
    const linuxGnu = path.join(root, "python-linux-gnu");
    const linuxMusl = path.join(root, "python-linux-musl");
    let targetDir = null;

    if (fs.existsSync(linuxGnu)) targetDir = linuxGnu;
    else if (fs.existsSync(linuxMusl)) targetDir = linuxMusl;

    if (targetDir) {
      pythonPath = path.join(targetDir, "bin", "python3");
      binDir = path.join(targetDir, "bin");
    } else {
      pythonPath = "python3";
    }
  }

  pythonDetails = { pythonPath, binDir };
  return pythonDetails;
}

function spawnPython(args, options = {}) {
  const { pythonPath, binDir } = getPythonDetails();
  const env = { ...process.env, ...options.env };
  if (binDir) {
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    env[pathKey] = `${binDir}${path.delimiter}${env[pathKey] || ''}`;
  }
  // ! Force unbuffered output so we get real-time progress updates from yt-dlp
  env['PYTHONUNBUFFERED'] = '1';
  return spawn(pythonPath, args, { ...options, env });
}

/**
 * * Robust FFmpeg resolver.
 * 1. Tries `static_ffmpeg` python module (preferred).
 * 2. Scans python `bin` or `Scripts` folder.
 * 3. Scans `site-packages` as a last resort.
 */
function startFfmpegResolution() {
  return new Promise(async (resolve) => {
    const { pythonPath, binDir } = getPythonDetails();
    console.log("Resolving FFmpeg...");

    // 1. Try Python Script (Most reliable for static-ffmpeg)
    const script = `
import sys, os
try:
    import static_ffmpeg.run
    ffmpeg, _ = static_ffmpeg.run.get_or_fetch_platform_executables_else_raise()
    print(ffmpeg)
except Exception as e:
    print("ERR:" + str(e))
`;
    let pythonOutput = "";
    try {
      await new Promise((res) => {
        const proc = spawnPython(["-c", script]);
        proc.stdout.on("data", (d) => (pythonOutput += d.toString()));
        proc.on("close", () => res());
        proc.on("error", () => res());
      });

      const p = pythonOutput.trim();
      if (p && !p.startsWith("ERR:") && fs.existsSync(p)) {
        console.log("FFmpeg found via static_ffmpeg:", p);

        // ! Ensure execution permissions on Unix
        if (process.platform !== 'win32') {
          try { fs.chmodSync(p, 0o755); } catch (e) { console.error("Could not chmod ffmpeg:", e); }
        }

        resolvedFfmpegPath = p;
        resolve(p);
        return;
      }
    } catch (e) { }

    // 2. Fallback: Check binDir (Scripts on Windows, bin on Unix)
    if (binDir) {
      const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
      const candidate = path.join(binDir, exe);
      if (fs.existsSync(candidate)) {
        console.log("FFmpeg found in bin dir:", candidate);
        if (process.platform !== 'win32') {
          try { fs.chmodSync(candidate, 0o755); } catch (e) { }
        }
        resolvedFfmpegPath = candidate;
        resolve(candidate);
        return;
      }
    }

    // 3. Fallback: Deep scan in site-packages
    if (process.platform === "win32") {
      const baseDir = path.dirname(path.dirname(binDir)); // Up from Scripts to python root
      const possible = path.join(baseDir, "Lib", "site-packages", "static_ffmpeg", "bin", "win32", "ffmpeg.exe");
      if (fs.existsSync(possible)) {
        console.log("FFmpeg found in site-packages:", possible);
        resolvedFfmpegPath = possible;
        resolve(possible);
        return;
      }
    }

    console.warn("FFmpeg NOT found. Video merging may fail.");
    resolve(null);
  });
}

// * --------------------------------------------------------------------------
// * APP LIFECYCLE
// * --------------------------------------------------------------------------

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // ! Handle second instance (someone clicks app icon while it's already running)
  app.on("second-instance", (event, commandLine) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      const file = getFileFromArgs(commandLine);
      if (file) win.webContents.send("app:play-external-file", file);
    }
  });

  // ! Handle "Open With..." on macOS
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
      // ! Start FFmpeg resolution in background (NON-BLOCKING) to speed up launch
      ffmpegResolutionPromise = startFfmpegResolution();

      const { pythonPath } = getPythonDetails();
      console.log("App Ready. Python:", pythonPath);

      await db.initialize(app);

      if (!externalFilePath) {
        externalFilePath = getFileFromArgs(process.argv);
      }

      createWindow();
      createTray();

      globalShortcut.register("MediaPlayPause", () => win?.webContents.send("media-key-play-pause"));
      globalShortcut.register("MediaNextTrack", () => win?.webContents.send("media-key-next-track"));
      globalShortcut.register("MediaPreviousTrack", () => win?.webContents.send("media-key-prev-track"));

    } catch (error) {
      console.error("Startup Error:", error);
      dialog.showErrorBox("Startup Error", error.message);
      app.quit();
    }
  });
}

function getFileFromArgs(argv) {
  const relevantArgs = isDev ? argv.slice(2) : argv.slice(1);
  for (const arg of relevantArgs) {
    if (arg && !arg.startsWith("-") && fs.existsSync(arg)) {
      const stat = fs.statSync(arg);
      if (stat.isFile()) return arg;
    }
  }
  return null;
}

function sanitizeFilename(filename) {
  return filename.replace(/[\\/:"*?<>|]/g, "_");
}

function parseYtDlpError(stderr) {
  if (stderr.includes("ffmpeg not found")) return "FFmpeg binary missing. Please re-run the app or check internet connection.";
  if (stderr.includes("Private video")) return "This video is private.";
  if (stderr.includes("Video unavailable")) return "This video is unavailable.";
  const match = stderr.match(/ERROR: (.*)/);
  return match ? match[1].trim() : (stderr.split("\n").pop() || "Unknown error");
}

// * --------------------------------------------------------------------------
// * DOWNLOADER CLASS
// * --------------------------------------------------------------------------

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
    while (this.activeDownloads.size < this.settings.concurrentDownloads && this.queue.length > 0) {
      this.startDownload(this.queue.shift());
    }
  }
  cancelDownload(videoId) {
    const p = this.activeDownloads.get(videoId);
    if (p) p.kill();
  }
  shutdown() {
    this.queue = [];
    for (const process of this.activeDownloads.values()) process.kill();
    this.activeDownloads.clear();
  }

  async startDownload(job) {
    // ! Ensure FFmpeg is resolved before starting actual download
    if (!resolvedFfmpegPath) {
      console.log("Waiting for FFmpeg resolution...");
      await ffmpegResolutionPromise;
    }

    const { videoInfo } = job;
    const requestUrl = videoInfo.webpage_url || `https://www.youtube.com/watch?v=${videoInfo.id}`;

    // ! Arguments for yt-dlp
    let args = [
      "-m", "yt_dlp",
      requestUrl,
      "-o", path.join(videoPath, "%(id)s.%(ext)s"),
      "--progress",
      "--newline", // Crucial for parsing stdout
      "--retries", "10",
      "--write-info-json",
      "--write-thumbnail",
      "--convert-thumbnails", "jpg",
      "--write-description",
      "--embed-metadata",
      "--embed-chapters",
      "--no-mtime"
    ];

    if (resolvedFfmpegPath) {
      args.push("--ffmpeg-location", path.dirname(resolvedFfmpegPath));
    } else {
      console.warn("Starting download WITHOUT FFmpeg. Merging will fail.");
    }

    if (job.downloadType === "video") {
      const qualityFilter = job.quality === "best" ? "" : `[height<=${job.quality}]`;
      // ! Select best video and best audio, then merge
      const formatString = `bestvideo[ext=mp4]${qualityFilter}+bestaudio[ext=m4a]/bestvideo[vcodec^=avc]${qualityFilter}+bestaudio/best[ext=mp4]/best`;
      args.push("-f", formatString, "--merge-output-format", "mp4");

      if (job.downloadSubs) {
        args.push("--write-subs", "--sub-langs", "en.*,-live_chat");
        if (this.settings.downloadAutoSubs) args.push("--write-auto-subs");
      }
    } else {
      // Audio only
      args.push("-x", "--audio-format", job.audioFormat, "--audio-quality", job.audioQuality.toString());
      if (job.embedThumbnail) args.push("--embed-thumbnail");
    }

    if (job.playlistItems) args.push("--playlist-items", job.playlistItems);
    if (job.liveFromStart) args.push("--live-from-start");
    if (this.settings.removeSponsors) args.push("--sponsorblock-remove", "all");
    if (this.settings.concurrentFragments > 1) args.push("--concurrent-fragments", this.settings.concurrentFragments.toString());
    if (this.settings.cookieBrowser && this.settings.cookieBrowser !== "none") args.push("--cookies-from-browser", this.settings.cookieBrowser);
    if (this.settings.speedLimit) args.push("-r", this.settings.speedLimit);

    const { pythonPath } = getPythonDetails();
    console.log(`[Downloader] Starting: ${videoInfo.id}`);

    const proc = spawnPython(args);
    this.activeDownloads.set(videoInfo.id, proc);

    let stderrOutput = "";
    let stallTimeout;

    // ? Watchdog timer: kill download if it hangs for 90s
    const resetStallTimer = () => {
      clearTimeout(stallTimeout);
      stallTimeout = setTimeout(() => {
        stderrOutput += "\n[System]: Download stalled (90s timeout).";
        proc.kill();
      }, 90000);
    };
    resetStallTimer();

    proc.stdout.on("data", (data) => {
      resetStallTimer();
      const str = data.toString();
      // ! Regex to parse yt-dlp's standard progress output
      const m = str.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s*([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/);
      if (m && win) {
        win.webContents.send("download-progress", {
          id: videoInfo.id,
          percent: parseFloat(m[1]),
          totalSize: m[2],
          currentSpeed: m[3],
          eta: m[4],
        });
      }
    });

    proc.stderr.on("data", (data) => {
      resetStallTimer();
      stderrOutput += data.toString();
    });

    proc.on("close", async (code) => {
      clearTimeout(stallTimeout);
      this.activeDownloads.delete(videoInfo.id);

      if (code === 0) {
        await this.postProcess(videoInfo, job, `CMD: ${args.join(" ")}\n\nLOG:\n${stderrOutput}`);
      } else if (code !== null) {
        const errorMsg = parseYtDlpError(stderrOutput);
        await db.addToHistory({
          url: videoInfo.webpage_url,
          title: videoInfo.title,
          type: job.downloadType,
          thumbnail: videoInfo.thumbnail,
          status: "failed"
        });
        if (win) {
          win.webContents.send("download-error", {
            id: videoInfo.id,
            error: errorMsg,
            fullLog: stderrOutput,
            job
          });
        }
      }
      this.processQueue();
    });
  }

  async postProcess(videoInfo, job, fullLog) {
    try {
      // * 1. Find info json
      const files = fs.readdirSync(videoPath);
      const infoFile = files.find(f => f.startsWith(videoInfo.id) && f.endsWith('.info.json'));

      if (!infoFile) throw new Error("Could not find metadata file.");

      const infoJsonPath = path.join(videoPath, infoFile);
      const info = JSON.parse(fs.readFileSync(infoJsonPath, "utf-8"));
      fs.unlinkSync(infoJsonPath); // Clean up JSON

      // * 2. Find actual media file
      const mediaFile = files.find(f => f.startsWith(videoInfo.id) && !f.endsWith('.json') && !f.endsWith('.description') && !f.endsWith('.jpg') && !f.endsWith('.webp') && !f.endsWith('.vtt'));

      if (!mediaFile) throw new Error("Media file not found after download.");
      const mediaFilePath = path.join(videoPath, mediaFile);

      // * 3. Handle Cover (Convert/Move)
      let finalCoverPath = null;
      const thumbFile = files.find(f => f.startsWith(videoInfo.id) && (f.endsWith('.jpg') || f.endsWith('.webp')));
      if (thumbFile) {
        finalCoverPath = path.join(coverPath, `${info.id}.jpg`);
        await fse.move(path.join(videoPath, thumbFile), finalCoverPath, { overwrite: true });
      }
      const finalCoverUri = finalCoverPath ? url.pathToFileURL(finalCoverPath).href : null;

      // * 4. Handle Subs
      let subFileUri = null;
      const subFile = files.find(f => f.startsWith(videoInfo.id) && f.endsWith('.vtt'));
      if (subFile) {
        const destSub = path.join(subtitlePath, `${info.id}.vtt`);
        await fse.move(path.join(videoPath, subFile), destSub, { overwrite: true });
        subFileUri = url.pathToFileURL(destSub).href;
      }

      // Cleanup description file if it exists
      const descFile = files.find(f => f.startsWith(videoInfo.id) && f.endsWith('.description'));
      if (descFile) fs.unlinkSync(path.join(videoPath, descFile));

      // * 5. Database Logic
      const artistString = info.artist || info.creator || info.uploader;
      const artistNames = parseArtistNames(artistString);

      for (const name of artistNames) {
        const artist = await db.findOrCreateArtist(name, finalCoverUri);
        if (artist) await db.linkVideoToArtist(info.id, artist.id);
      }

      const videoData = {
        id: info.id,
        title: info.title,
        uploader: info.uploader,
        creator: artistString,
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
        source: "youtube"
      };

      await db.addOrUpdateVideo(videoData);
      if (job.playlistId) await db.addVideoToPlaylist(job.playlistId, videoData.id);

      await db.addToHistory({
        url: info.webpage_url,
        title: info.title,
        type: job.downloadType,
        thumbnail: finalCoverUri,
        status: "success"
      });

      if (win) win.webContents.send("download-complete", { id: videoInfo.id, videoData, fullLog });

    } catch (e) {
      console.error(`Post-Process Error (${videoInfo.id}):`, e);
      if (win) win.webContents.send("download-error", { id: videoInfo.id, error: "Processing failed: " + e.message, fullLog, job });
    }
  }
}
const downloader = new Downloader();

// * --------------------------------------------------------------------------
// * WINDOW MANAGEMENT
// * --------------------------------------------------------------------------

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#0F0F0F",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true, // ! Security: Prevent Renderer from accessing Node directly
      nodeIntegration: false,
      hardwareAcceleration: true,
    },
    frame: false, // Custom title bar
    icon: iconPath,
    title: "ViveStream",
    show: false
  });

  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  win.once('ready-to-show', () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: "detach" });
  });

  win.on("maximize", () => win.webContents.send("window-maximized", true));
  win.on("unmaximize", () => win.webContents.send("window-maximized", false));
  win.on("closed", () => (win = null));

  win.webContents.on("did-finish-load", () => {
    if (externalFilePath) {
      win.webContents.send("app:play-external-file", externalFilePath);
      externalFilePath = null;
    }
  });
}

function createTray() {
  tray = new Tray(iconPath);
  tray.setToolTip("ViveStream");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show App", click: () => win.show() },
    { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on("click", () => win.show());
}

app.on("before-quit", async () => {
  globalShortcut.unregisterAll();
  downloader.shutdown();
  await db.shutdown();
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
app.on("activate", () => !win && createWindow());

// * --------------------------------------------------------------------------
// * IPC HANDLERS (Events from Renderer)
// * --------------------------------------------------------------------------

ipcMain.handle("get-assets-path", () => getAssetPath("").replace(/\\/g, "/"));
ipcMain.on("minimize-window", () => win.minimize());
ipcMain.on("maximize-window", () => win.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on("close-window", () => win.close());
ipcMain.on("tray-window", () => win.hide());
ipcMain.on("open-external", (e, u) => shell.openExternal(u));
ipcMain.handle("open-media-folder", () => shell.openPath(viveStreamPath));
ipcMain.handle("open-database-folder", () => shell.openPath(app.getPath("userData")));
ipcMain.handle("open-vendor-folder", () => {
  const { binDir } = getPythonDetails();
  if (binDir) shell.openPath(binDir);
});

ipcMain.handle("get-settings", getSettings);
ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.on("save-settings", (e, s) => { saveSettings(s); downloader.updateSettings(getSettings()); });
ipcMain.handle("reset-app", () => {
  saveSettings(defaultSettings);
  if (win) win.webContents.send("clear-local-storage");
  return getSettings();
});

ipcMain.handle("get-library", () => db.getLibrary());
ipcMain.handle("toggle-favorite", (e, id) => db.toggleFavorite(id));
ipcMain.handle("clear-all-media", async () => {
  for (const dir of mediaPaths) await fse.emptyDir(dir);
  return await db.clearAllMedia();
});
ipcMain.handle("db:delete", async () => {
  await db.shutdown();
  const p = path.join(app.getPath("userData"), "ViveStream.db");
  if (fs.existsSync(p)) fs.unlinkSync(p);
  app.relaunch();
  app.exit(0);
});
ipcMain.handle("delete-video", async (e, id) => {
  const v = await db.getVideoById(id);
  if (!v) return { success: false };
  [v.filePath, v.coverPath, v.subtitlePath].forEach(uri => {
    if (uri) {
      try {
        const p = url.fileURLToPath(uri);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) { }
    }
  });
  return await db.deleteVideo(id);
});
ipcMain.handle("video:update-metadata", (e, id, meta) => db.updateVideoMetadata(id, meta));
ipcMain.handle("videos:touch", (e, ids) => db.db("videos").whereIn("id", ids).update({ downloadedAt: new Date().toISOString() }));

ipcMain.on("download-video", (e, { downloadOptions, jobId }) => {
  const args = ["-m", "yt_dlp", downloadOptions.url, "--dump-json", "--flat-playlist", "--no-warnings"];
  const s = getSettings();
  if (s.cookieBrowser && s.cookieBrowser !== "none") args.push("--cookies-from-browser", s.cookieBrowser);

  const proc = spawnPython(args);
  let json = "";
  let err = "";

  proc.stdout.on("data", (d) => (json += d));
  proc.stderr.on("data", (d) => (err += d));

  proc.on("close", async (code) => {
    if (code === 0 && json.trim()) {
      try {
        const infos = json.trim().split("\n").map(l => JSON.parse(l));
        let playlistId = null;
        if (infos.length > 0 && infos[0].playlist_title) {
          const pl = await db.findOrCreatePlaylistByName(infos[0].playlist_title);
          if (pl) playlistId = pl.id;
        }
        if (win) win.webContents.send("download-queue-start", { infos, jobId });
        downloader.addToQueue(infos.map(i => ({ ...downloadOptions, videoInfo: i, playlistId })));
      } catch (e) {
        if (win) win.webContents.send("download-info-error", { jobId, error: "Failed to parse info." });
      }
    } else {
      if (win) win.webContents.send("download-info-error", { jobId, error: parseYtDlpError(err), fullLog: err });
    }
  });
});

ipcMain.on("cancel-download", (e, id) => downloader.cancelDownload(id));
ipcMain.on("retry-download", (e, job) => downloader.retryDownload(job));

ipcMain.handle("updater:check-yt-dlp", () => {
  return new Promise((resolve) => {
    // Update yt-dlp AND static-ffmpeg
    const proc = spawnPython(["-m", "pip", "install", "-U", "yt-dlp", "static-ffmpeg"]);
    proc.stdout.on("data", (d) => win.webContents.send("updater:yt-dlp-progress", d.toString()));
    proc.stderr.on("data", (d) => win.webContents.send("updater:yt-dlp-progress", d.toString()));

    proc.on("close", (c) => {
      if (c === 0) {
        // Re-hydrate ffmpeg paths if needed
        const hydrate = spawnPython(["-c", "import static_ffmpeg; static_ffmpeg.add_paths()"]);
        hydrate.on("close", () => resolve({ success: true }));
      } else {
        resolve({ success: false });
      }
    });
  });
});

// * --------------------------------------------------------------------------
// * FILE IMPORT/EXPORT
// * --------------------------------------------------------------------------

ipcMain.handle("media:import-files", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ["openFile", "multiSelections"] });
  if (canceled || filePaths.length === 0) return { success: true, count: 0 };

  let count = 0;
  for (let i = 0; i < filePaths.length; i++) {
    const fp = filePaths[i];
    try {
      const { stdout } = await new Promise((res) => {
        const p = spawnPython(["-m", "yt_dlp", "--dump-json", `file:${fp}`, "--no-warnings"]);
        let o = ""; p.stdout.on("data", d => o += d); p.on("close", () => res({ stdout: o }));
      });

      const meta = JSON.parse(stdout || "{}");
      const id = crypto.randomUUID();
      const ext = path.extname(fp);
      const newPath = path.join(videoPath, `${id}${ext}`);

      if (win) win.webContents.send("file-operation-progress", { type: "import", fileName: path.basename(fp), currentFile: i + 1, totalFiles: filePaths.length, progress: 50 });

      await fse.copy(fp, newPath);

      let coverUri = null;
      if (resolvedFfmpegPath) {
        const thumbPath = path.join(coverPath, `${id}.jpg`);
        await new Promise(r => {
          const args = ["-i", newPath, "-ss", "00:00:05", "-vframes", "1", thumbPath];
          const p = spawn(resolvedFfmpegPath, args);
          p.on("close", r);
          p.on("error", r);
        });
        if (fs.existsSync(thumbPath)) coverUri = url.pathToFileURL(thumbPath).href;
      }

      const vData = {
        id,
        title: meta.title || path.parse(fp).name,
        creator: meta.artist || meta.uploader || "Unknown",
        filePath: url.pathToFileURL(newPath).href,
        coverPath: coverUri,
        duration: meta.duration,
        downloadedAt: new Date().toISOString(),
        source: "local",
        type: (meta.vcodec && meta.vcodec !== "none") ? "video" : "audio"
      };
      await db.addOrUpdateVideo(vData);

      const artist = await db.findOrCreateArtist(vData.creator, coverUri);
      if (artist) await db.linkVideoToArtist(id, artist.id);

      count++;
    } catch (e) { console.error(e); }
  }
  return { success: true, count };
});

ipcMain.handle("media:export-file", async (e, id) => {
  const v = await db.getVideoById(id);
  if (!v) return { success: false };
  const src = url.fileURLToPath(v.filePath);
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `${sanitizeFilename(v.title)}${path.extname(src)}` });
  if (canceled) return { success: false };
  await fse.copy(src, filePath);
  return { success: true };
});

ipcMain.handle("media:export-all", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  if (canceled) return { success: false };
  const dest = filePaths[0];
  const lib = await db.getLibrary();
  let c = 0;
  for (const v of lib) {
    try {
      const src = url.fileURLToPath(v.filePath);
      const name = `${sanitizeFilename(v.title)}${path.extname(src)}`;
      await fse.copy(src, path.join(dest, name));
      c++;
      if (win) win.webContents.send("file-operation-progress", { type: "export", fileName: name, currentFile: c, totalFiles: lib.length, progress: 100 });
    } catch (e) { }
  }
  return { success: true, count: c };
});

ipcMain.handle("app:reinitialize", async () => {
  await win.webContents.session.clearCache();
  const lib = await db.getLibrary();
  const files = new Set(fs.readdirSync(videoPath));
  let del = 0;
  for (const v of lib) {
    const fname = path.basename(url.fileURLToPath(v.filePath));
    if (!files.has(fname)) { await db.deleteVideo(v.id); del++; }
  }
  const orphans = await db.cleanupOrphanArtists();
  return { success: true, deletedVideos: del, deletedArtists: orphans.count };
});

ipcMain.handle("playlist:create", (e, n) => db.createPlaylist(n));
ipcMain.handle("playlist:get-all", () => db.getAllPlaylistsWithStats());
ipcMain.handle("playlist:get-details", (e, id) => db.getPlaylistDetails(id));
ipcMain.handle("playlist:rename", (e, id, n) => db.renamePlaylist(id, n));
ipcMain.handle("playlist:delete", (e, id) => db.deletePlaylist(id));
ipcMain.handle("playlist:add-video", (e, pid, vid) => db.addVideoToPlaylist(pid, vid));
ipcMain.handle("playlist:remove-video", (e, pid, vid) => db.removeVideoFromPlaylist(pid, vid));
ipcMain.handle("playlist:update-order", (e, pid, vids) => db.updateVideoOrderInPlaylist(pid, vids));
ipcMain.handle("playlist:get-for-video", (e, vid) => db.getPlaylistsForVideo(vid));
ipcMain.handle("playlist:update-cover", async (e, pid) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "Images", extensions: ["jpg", "png"] }] });
  if (canceled) return { success: false };
  const dest = path.join(playlistCoverPath, `${pid}${path.extname(filePaths[0])}`);
  await fse.copy(filePaths[0], dest, { overwrite: true });
  return await db.updatePlaylistCover(pid, url.pathToFileURL(dest).href);
});

ipcMain.handle("artist:get-all", () => db.getAllArtistsWithStats());
ipcMain.handle("artist:get-details", (e, id) => db.getArtistDetails(id));
ipcMain.handle("artist:rename", (e, id, n) => db.updateArtistName(id, n));
ipcMain.handle("artist:delete", (e, id) => db.deleteArtist(id));
ipcMain.handle("artist:update-thumbnail", async (e, aid) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "Images", extensions: ["jpg", "png"] }] });
  if (canceled) return { success: false };
  const dest = path.join(artistCoverPath, `${aid}${path.extname(filePaths[0])}`);
  await fse.copy(filePaths[0], dest, { overwrite: true });
  return await db.updateArtistThumbnail(aid, url.pathToFileURL(dest).href);
});

ipcMain.handle("history:get", () => db.getHistory());
ipcMain.handle("history:clear", () => db.clearHistory());