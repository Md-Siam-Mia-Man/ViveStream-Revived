// main.js
const { app, BrowserWindow, ipcMain, shell, Tray, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const fse = require("fs-extra");
const { spawn } = require("child_process");

const isDev = !app.isPackaged;
let tray = null;
let win = null;

const userHomePath = app.getPath("home");
const viveStreamPath = path.join(userHomePath, "ViveStream");

const resourcesPath = isDev
  ? path.join(__dirname, "..", "..", "vendor")
  : path.join(process.resourcesPath, "vendor");
const ytDlpPath = path.join(resourcesPath, "yt-dlp.exe");
const ffmpegPath = path.join(resourcesPath, "ffmpeg.exe");

const videoPath = path.join(viveStreamPath, "videos");
const coverPath = path.join(viveStreamPath, "covers");
const subtitlePath = path.join(viveStreamPath, "subtitles");
const libraryDBPath = path.join(viveStreamPath, "library.json");
const settingsPath = path.join(viveStreamPath, "settings.json");
const mediaPaths = [videoPath, coverPath, subtitlePath];

mediaPaths.forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(libraryDBPath))
  fs.writeFileSync(libraryDBPath, JSON.stringify([], null, 2));

const defaultSettings = { concurrentDownloads: 3 };

function getSettings() {
  if (fs.existsSync(settingsPath)) {
    try {
      return {
        ...defaultSettings,
        ...JSON.parse(fs.readFileSync(settingsPath, "utf-8")),
      };
    } catch (e) {
      return defaultSettings;
    }
  }
  return defaultSettings;
}

function saveSettings(settings) {
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({ ...getSettings(), ...settings }, null, 2)
  );
}

if (!fs.existsSync(settingsPath)) saveSettings(defaultSettings);

function getLibrary() {
  try {
    return JSON.parse(fs.readFileSync(libraryDBPath, "utf-8"));
  } catch {
    return [];
  }
}
function saveLibrary(lib) {
  fs.writeFileSync(libraryDBPath, JSON.stringify(lib, null, 2));
}
function saveToLibrary(videoData) {
  const lib = getLibrary();
  const i = lib.findIndex((v) => v.id === videoData.id);
  if (i > -1) lib[i] = { ...lib[i], ...videoData };
  else lib.unshift(videoData);
  saveLibrary(lib);
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
    )
      this.startDownload(this.queue.shift());
  }
  cancelDownload(videoId) {
    const p = this.activeDownloads.get(videoId);
    if (p) {
      p.kill();
      this.activeDownloads.delete(videoId);
      this.processQueue();
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
      if (m)
        win.webContents.send("download-progress", {
          id: videoInfo.id,
          percent: parseFloat(m[1]),
          totalSize: m[2],
          currentSpeed: m[3],
          eta: m[4],
        });
    });
    proc.stderr.on("data", (data) =>
      console.error(`E: ${videoInfo.id}: ${data}`)
    );
    proc.on("close", async (code) => {
      this.activeDownloads.delete(videoInfo.id);
      this.processQueue();
      if (code === 0) await this.postProcess(videoInfo);
      else if (code !== null)
        win.webContents.send("download-error", {
          id: videoInfo.id,
          error: `Code: ${code}`,
          job,
        });
    });
  }

  async postProcess(videoInfo) {
    try {
      const infoPath = path.join(videoPath, `${videoInfo.id}.info.json`);
      const fullInfo = JSON.parse(fs.readFileSync(infoPath, "utf-8"));
      fs.unlinkSync(infoPath);
      const cover = path.join(coverPath, `${fullInfo.id}.jpg`);
      fs.renameSync(path.join(videoPath, `${fullInfo.id}.jpg`), cover);
      const sub = path.join(subtitlePath, `${fullInfo.id}.vtt`);
      const tempSub = path.join(videoPath, `${fullInfo.id}.en.vtt`);
      const subFile = fs.existsSync(tempSub)
        ? (fs.renameSync(tempSub, sub), `file://${sub}`.replace(/\\/g, "/"))
        : null;
      const videoData = {
        id: fullInfo.id,
        title: fullInfo.title,
        uploader: fullInfo.uploader,
        duration: fullInfo.duration,
        upload_date: fullInfo.upload_date,
        originalUrl: fullInfo.webpage_url,
        filePath: `file://${path.join(
          videoPath,
          `${fullInfo.id}.mp4`
        )}`.replace(/\\/g, "/"),
        coverPath: `file://${cover}`.replace(/\\/g, "/"),
        subtitlePath: subFile,
        type: "video",
        downloadedAt: new Date().toISOString(),
        isFavorite: false,
      };
      saveToLibrary(videoData);
      win.webContents.send("download-complete", {
        id: videoInfo.id,
        videoData,
      });
    } catch (e) {
      win.webContents.send("download-error", {
        id: videoInfo.id,
        error: e.message || "Post-processing failed.",
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
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    icon: path.join(__dirname, "..", "..", "assets", "icon.ico"),
  });
  win.loadFile("src/index.html");
  win.on("maximize", () => win.webContents.send("window-maximized", true));
  win.on("unmaximize", () => win.webContents.send("window-maximized", false));
  win.on("closed", () => (win = null));

  if (isDev) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}
function createTray() {
  tray = new Tray(path.join(__dirname, "..", "..", "assets", "icon.ico"));
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

app.on("before-quit", () => {
  downloader.shutdown();
});

app.whenReady().then(createWindow).then(createTray);
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
app.on(
  "activate",
  () => BrowserWindow.getAllWindows().length === 0 && createWindow()
);

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
  win.webContents.send("clear-local-storage");
  mediaPaths.forEach((dir) => {
    fs.readdirSync(dir).forEach((file) => {
      if (file.endsWith(".part")) fs.unlinkSync(path.join(dir, file));
    });
  });
  return getSettings();
});
ipcMain.handle("clear-all-media", async () => {
  try {
    for (const dir of mediaPaths) await fse.emptyDir(dir);
    saveLibrary([]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
ipcMain.handle("toggle-favorite", (e, id) => {
  const lib = getLibrary();
  const i = lib.findIndex((v) => v.id === id);
  if (i > -1) {
    lib[i].isFavorite = !lib[i].isFavorite;
    saveLibrary(lib);
    return { success: true, isFavorite: lib[i].isFavorite };
  }
  return { success: false };
});
ipcMain.handle("delete-video", (e, id) => {
  const lib = getLibrary();
  const v = lib.find((i) => i.id === id);
  if (!v) return { success: false };
  [v.filePath, v.coverPath, v.subtitlePath].filter(Boolean).forEach((uri) => {
    const p = path.normalize(uri.replace("file://", ""));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  saveLibrary(lib.filter((i) => i.id !== id));
  return { success: true };
});
ipcMain.on("download-video", (e, o) => {
  const proc = spawn(ytDlpPath, [
    o.url,
    "--dump-json",
    "--no-warnings",
    "--flat-playlist",
  ]);
  let j = "";
  proc.stdout.on("data", (d) => (j += d));
  proc.on("close", (c) => {
    if (c === 0 && j.trim()) {
      const infos = j
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      win.webContents.send("download-queue-start", infos);
      downloader.addToQueue(
        infos.map((i) => ({ videoInfo: i, quality: o.quality }))
      );
    }
  });
});
ipcMain.on("cancel-download", (e, id) => downloader.cancelDownload(id));
ipcMain.on("retry-download", (e, job) => downloader.retryDownload(job));
ipcMain.handle("get-library", getLibrary);
