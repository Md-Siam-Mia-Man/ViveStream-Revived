const { app, BrowserWindow, ipcMain, shell, Tray, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const https = require("https");

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
const audioPath = path.join(viveStreamPath, "audio");
const coverPath = path.join(viveStreamPath, "covers");
const channelThumbPath = path.join(viveStreamPath, "channels");
const subtitlePath = path.join(viveStreamPath, "subtitles");
const libraryDBPath = path.join(viveStreamPath, "library.json");

[
  viveStreamPath,
  videoPath,
  audioPath,
  coverPath,
  channelThumbPath,
  subtitlePath,
].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!fs.existsSync(libraryDBPath)) {
  fs.writeFileSync(libraryDBPath, JSON.stringify([], null, 2));
}

function getLibrary() {
  try {
    const data = fs.readFileSync(libraryDBPath, "utf-8");
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading library:", error);
    return [];
  }
}

function saveLibrary(library) {
  fs.writeFileSync(libraryDBPath, JSON.stringify(library, null, 2));
}

function saveToLibrary(videoData) {
  const library = getLibrary();
  const existingIndex = library.findIndex((v) => v.id === videoData.id);
  if (existingIndex > -1) {
    library[existingIndex] = { ...library[existingIndex], ...videoData };
  } else {
    library.unshift(videoData);
  }
  saveLibrary(library);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close(resolve);
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

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

  win.on("maximize", () => {
    win.webContents.send("window-maximized", true);
  });
  win.on("unmaximize", () => {
    win.webContents.send("window-maximized", false);
  });
  win.on("closed", () => {
    win = null;
  });

  if (isDev) {
    win.webContents.openDevTools();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "..", "assets", "icon.ico");
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show App",
      click: () => {
        win.show();
      },
    },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip("ViveStream");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    win.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on("minimize-window", () => win.minimize());
ipcMain.on("maximize-window", () => {
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});
ipcMain.on("close-window", () => win.close());
ipcMain.on("tray-window", () => {
  win.hide();
});

ipcMain.handle("delete-video", (event, videoId) => {
  let library = getLibrary();
  const videoToDelete = library.find((v) => v.id === videoId);

  if (!videoToDelete) {
    console.error("Video not found in library for deletion:", videoId);
    return { success: false, error: "Video not found" };
  }

  try {
    const filesToDelete = [
      videoToDelete.filePath,
      videoToDelete.coverPath,
      videoToDelete.subtitlePath,
    ].filter(Boolean);

    filesToDelete.forEach((fileUri) => {
      const filePath = path.normalize(fileUri.replace("file://", ""));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    if (videoToDelete.channelThumbPath) {
      const isThumbInUse = library.some(
        (v) =>
          v.id !== videoId &&
          v.channelThumbPath === videoToDelete.channelThumbPath
      );
      if (!isThumbInUse) {
        const thumbPath = path.normalize(
          videoToDelete.channelThumbPath.replace("file://", "")
        );
        if (fs.existsSync(thumbPath)) {
          fs.unlinkSync(thumbPath);
        }
      }
    }

    const updatedLibrary = library.filter((v) => v.id !== videoId);
    saveLibrary(updatedLibrary);
    return { success: true };
  } catch (error) {
    console.error("Error deleting video files:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.on("download-video", async (event, options) => {
  const { url, type, quality } = options;
  const infoProcess = spawn(ytDlpPath, [
    url,
    "--dump-json",
    "--no-warnings",
    "--flat-playlist",
  ]);
  let allJsonData = "";
  infoProcess.stdout.on("data", (data) => {
    allJsonData += data.toString();
  });
  infoProcess.stderr.on("data", (data) => {
    console.error(`yt-dlp (info) stderr: ${data}`);
  });
  infoProcess.on("close", (code) => {
    if (code !== 0 || allJsonData.trim() === "") {
      event.sender.send(
        "download-error",
        `Failed to get video info. Exit code: ${code}`
      );
      return;
    }
    const videoInfos = allJsonData
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const isPlaylist = videoInfos.length > 1;
    (async function processQueue(index) {
      if (index >= videoInfos.length) return;
      const videoInfo = videoInfos[index];
      const videoUrl =
        videoInfo.webpage_url ||
        `https://www.youtube.com/watch?v=${videoInfo.id}`;
      const downloadArgs = [
        videoUrl,
        "--ffmpeg-location",
        ffmpegPath,
        "--progress",
        "--no-warnings",
      ];
      let finalExtension, finalPath, metadataType;
      if (type === "audio") {
        finalExtension = "mp3";
        finalPath = audioPath;
        metadataType = "audio";
        downloadArgs.push(
          "-x",
          "--audio-format",
          "mp3",
          "--audio-quality",
          "0",
          "--output",
          path.join(finalPath, "%(id)s.%(ext)s")
        );
      } else {
        finalExtension = "mp4";
        finalPath = videoPath;
        metadataType = "video";
        const qualityFilter = quality === "best" ? "" : `[height<=${quality}]`;
        downloadArgs.push(
          "-f",
          `bestvideo${qualityFilter}+bestaudio/best${qualityFilter}`,
          "--merge-output-format",
          "mp4",
          "--output",
          path.join(finalPath, "%(id)s.%(ext)s")
        );
      }
      downloadArgs.push("--write-info-json");
      downloadArgs.push("--write-thumbnail", "--convert-thumbnails", "jpg");
      downloadArgs.push("--write-subs", "--sub-langs", "en.*,-live_chat");
      const downloadProcess = spawn(ytDlpPath, downloadArgs);
      const progressRegex =
        /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s*([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/;
      downloadProcess.stdout.on("data", (data) => {
        const match = data.toString().match(progressRegex);
        if (match) {
          event.sender.send("download-progress", {
            percent: parseFloat(match[1]),
            totalSize: match[2],
            currentSpeed: match[3],
            eta: match[4],
            playlistIndex: index + 1,
            playlistCount: videoInfos.length,
          });
        }
      });
      downloadProcess.stderr.on("data", (data) =>
        console.error(`yt-dlp (download) stderr: ${data}`)
      );
      downloadProcess.on("close", async (downloadCode) => {
        if (downloadCode !== 0) {
          event.sender.send(
            "download-error",
            `Download failed for ${videoInfo.title}. Exit code: ${downloadCode}`
          );
          processQueue(index + 1);
          return;
        }
        const infoJsonPath = path.join(finalPath, `${videoInfo.id}.info.json`);
        if (!fs.existsSync(infoJsonPath)) {
          event.sender.send(
            "download-error",
            `Metadata file not found for ${videoInfo.title}.`
          );
          processQueue(index + 1);
          return;
        }
        const fullInfo = JSON.parse(fs.readFileSync(infoJsonPath, "utf-8"));
        fs.unlinkSync(infoJsonPath);
        let channelThumbPathFinal = null;
        if (fullInfo.channel_thumbnail_url && fullInfo.channel_id) {
          const channelThumbUrl = fullInfo.channel_thumbnail_url;
          const channelId = fullInfo.channel_id;
          channelThumbPathFinal = path.join(
            channelThumbPath,
            `${channelId}.jpg`
          );
          if (!fs.existsSync(channelThumbPathFinal)) {
            try {
              await downloadFile(channelThumbUrl, channelThumbPathFinal);
            } catch (err) {
              console.error(
                "Failed to download channel thumbnail:",
                err.message
              );
              channelThumbPathFinal = null;
            }
          }
        }
        const tempCoverPath = path.join(finalPath, `${fullInfo.id}.jpg`);
        const finalCoverPath = path.join(coverPath, `${fullInfo.id}.jpg`);
        if (fs.existsSync(tempCoverPath))
          fs.renameSync(tempCoverPath, finalCoverPath);
        const tempSubPath = path.join(finalPath, `${fullInfo.id}.en.vtt`);
        const finalSubPath = path.join(subtitlePath, `${fullInfo.id}.vtt`);
        let subtitleFile = null;
        if (fs.existsSync(tempSubPath)) {
          fs.renameSync(tempSubPath, finalSubPath);
          subtitleFile = `file://${finalSubPath}`.replace(/\\/g, "/");
        }
        const videoData = {
          id: fullInfo.id,
          title: fullInfo.title,
          uploader: fullInfo.uploader,
          uploader_id: fullInfo.channel_id,
          duration: fullInfo.duration,
          view_count: fullInfo.view_count,
          upload_date: fullInfo.upload_date,
          originalUrl: fullInfo.webpage_url,
          filePath: `file://${path.join(
            finalPath,
            `${fullInfo.id}.${finalExtension}`
          )}`.replace(/\\/g, "/"),
          coverPath: `file://${finalCoverPath}`.replace(/\\/g, "/"),
          channelThumbPath: channelThumbPathFinal
            ? `file://${channelThumbPathFinal}`.replace(/\\/g, "/")
            : null,
          subtitlePath: subtitleFile,
          type: metadataType,
          downloadedAt: new Date().toISOString(),
          isPlaylist: isPlaylist,
        };
        saveToLibrary(videoData);
        event.sender.send("download-complete", videoData);
        processQueue(index + 1);
      });
    })(0);
  });
});

ipcMain.handle("get-library", () => getLibrary());

ipcMain.on("open-path", (event, filePath) => {
  shell.showItemInFolder(path.normalize(filePath.replace("file://", "")));
});
