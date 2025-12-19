const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Tray,
  Menu,
  dialog,
  globalShortcut,
  nativeImage,
} = require("electron");
const path = require("path");
const fs = require("fs");
const fse = require("fs-extra");
const crypto = require("crypto");
const url = require("url");
const db = require("./database");
const { parseYtDlpError } = require("./utils");
const { getPythonDetails, spawnPython } = require("./python-core");
const Downloader = require("./downloader");
const BrowserDiscovery = require("./browser-discovery");

app.commandLine.appendSwitch("enable-begin-frame-scheduling");
app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-oop-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

app.setName("ViveStream");

const isDev = !app.isPackaged;

if (isDev) {
  app.commandLine.appendSwitch("disable-features", "Autofill,ComponentUpdateServices");
}

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

let resolvedFfmpegPath = null;
let ffmpegResolutionPromise = null;

const getAssetPath = (fileName) => path.join(__dirname, "..", "..", "assets", fileName);

const iconFileName = process.platform === "win32" ? "icon.ico" : "icon.png";
const iconPathStr = getAssetPath(iconFileName);
const appIconImage = nativeImage.createFromPath(iconPathStr);

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

function startFfmpegResolution() {
  const resolveTask = new Promise(async (resolve) => {
    const { pythonPath, binDir } = getPythonDetails();
    console.log(`[FFmpeg] Resolution start. Python Bin: ${binDir}`);

    const targetName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

    // 1. Primary Check: bin/Scripts folder (Where update-binaries.js puts it)
    if (binDir) {
      const candidate = path.join(binDir, targetName);
      if (fs.existsSync(candidate)) {
        console.log("[FFmpeg] Found in Python bin/Scripts:", candidate);
        if (process.platform !== 'win32') {
          try { fs.chmodSync(candidate, 0o755); } catch (e) { }
        }
        resolvedFfmpegPath = candidate;
        resolve(candidate);
        return;
      }
    }

    // 2. Secondary Check: Python Import (static_ffmpeg module)
    try {
      const script = "import static_ffmpeg.run; print(static_ffmpeg.run.get_or_fetch_platform_executables_else_raise()[0])";
      let output = "";
      await new Promise(r => {
        const p = spawnPython(["-c", script]);
        p.stdout.on("data", d => output += d);
        p.on("close", r);
        p.on("error", r);
      });
      const p = output.trim();
      if (p && fs.existsSync(p)) {
        console.log("[FFmpeg] Found via module:", p);
        if (process.platform !== 'win32') try { fs.chmodSync(p, 0o755); } catch (e) { }
        resolvedFfmpegPath = p;
        resolve(p);
        return;
      }
    } catch (e) { }

    // 3. Fallback: Deep Search in Python Root
    const searchRoot = path.dirname(path.dirname(binDir)); // Up 2 levels from Scripts/bin

    const findFfmpegDeep = (dir, depth = 0) => {
      if (depth > 6) return null;
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fp = path.join(dir, file);
          let stat;
          try { stat = fs.statSync(fp); } catch (e) { continue; }

          if (stat.isDirectory()) {
            if (!['__pycache__', 'doc', 'test', 'tests', 'tcl', 'share', 'include', 'libs'].includes(file)) {
              const res = findFfmpegDeep(fp, depth + 1);
              if (res) return res;
            }
          } else if (file.toLowerCase() === targetName) {
            return fp;
          }
        }
      } catch (e) { }
      return null;
    };

    if (fs.existsSync(searchRoot)) {
      const found = findFfmpegDeep(searchRoot);
      if (found) {
        console.log("[FFmpeg] Found via deep scan:", found);
        if (process.platform !== 'win32') try { fs.chmodSync(found, 0o755); } catch (e) { }
        resolvedFfmpegPath = found;
        resolve(found);
        return;
      }
    }

    console.warn("[FFmpeg] FATAL: Could not find ffmpeg binary.");
    resolve(null);
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      const file = getFileFromArgs(commandLine);
      if (file) win.webContents.send("app:play-external-file", file);
    }
  });

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

const downloader = new Downloader({
  getSettings,
  videoPath,
  coverPath,
  subtitlePath,
  db,
  BrowserDiscovery,
  win,
  resolveFfmpegPath: async () => {
    if (!resolvedFfmpegPath && ffmpegResolutionPromise) {
      resolvedFfmpegPath = await ffmpegResolutionPromise;
    }
    return resolvedFfmpegPath;
  }
});

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
    icon: appIconImage,
    title: "ViveStream",
    show: false
  });

  downloader.setWindow(win);

  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  win.once('ready-to-show', () => {
    if (process.platform === 'linux' && !appIconImage.isEmpty()) {
      win.setIcon(appIconImage);
    }
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
  tray = new Tray(appIconImage);
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
ipcMain.handle("video:get-details", (e, id) => db.getVideoById(id));
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

  const browserArg = BrowserDiscovery.resolveBrowser(s.cookieBrowser);
  if (browserArg) {
    args.push("--cookies-from-browser", browserArg);
  }

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
    const proc = spawnPython(["-m", "pip", "install", "-U", "yt-dlp", "static-ffmpeg"]);
    proc.stdout.on("data", (d) => win.webContents.send("updater:yt-dlp-progress", d.toString()));
    proc.stderr.on("data", (d) => win.webContents.send("updater:yt-dlp-progress", d.toString()));

    proc.on("close", (c) => {
      if (c === 0) {
        const hydrate = spawnPython(["-c", "import static_ffmpeg; static_ffmpeg.add_paths()"]);
        hydrate.on("close", () => resolve({ success: true }));
      } else {
        resolve({ success: false });
      }
    });
  });
});

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