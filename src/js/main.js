// main.js - Production Ready

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const https = require("https");

const isDev = !app.isPackaged;

// --- PATHS: PRODUCTION-READY ---

// CRITICAL CHANGE: Use app.getPath('userData') for all user data.
// This is a safe, persistent, and writable location.
const localDataPath = app.getPath("userData");

// Path to vendor files (yt-dlp, ffmpeg). This is correct for packaged apps.
const resourcesPath = isDev
  ? path.join(__dirname, "..", "..", "vendor")
  : path.join(process.resourcesPath, "vendor");

// Define all paths based on the safe localDataPath
const ytDlpPath = path.join(resourcesPath, "yt-dlp.exe");
const ffmpegPath = path.join(resourcesPath, "ffmpeg.exe");
const videoPath = path.join(localDataPath, "videos");
const audioPath = path.join(localDataPath, "audio");
const coverPath = path.join(localDataPath, "covers");
const channelThumbPath = path.join(localDataPath, "channels");
const subtitlePath = path.join(localDataPath, "subtitles");
const libraryDBPath = path.join(localDataPath, "library.json"); // Simplified path

// Create all necessary directories at startup
[videoPath, audioPath, coverPath, channelThumbPath, subtitlePath].forEach(
  (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
);

// Initialize library database if it doesn't exist
if (!fs.existsSync(libraryDBPath)) {
  fs.writeFileSync(libraryDBPath, JSON.stringify([], null, 2));
}

// --- LIBRARY FUNCTIONS (Unchanged) ---
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

function saveToLibrary(videoData) {
  const library = getLibrary();
  const existingIndex = library.findIndex((v) => v.id === videoData.id);
  if (existingIndex > -1) {
    library[existingIndex] = { ...library[existingIndex], ...videoData };
  } else {
    library.unshift(videoData);
  }
  fs.writeFileSync(libraryDBPath, JSON.stringify(library, null, 2));
}

// --- HELPER FUNCTIONS (Unchanged) ---
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

// --- ELECTRON APP SETUP ---
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0F0F0F",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0F0F0F",
      symbolColor: "#F1F1F1",
      height: 40,
    },
    // BEST PRACTICE: Simplified icon path for packaged app
    icon: path.join(__dirname, "..", "..", "build", "icon.ico"),
  });

  win.loadFile("src/index.html");

  if (isDev) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC HANDLERS (Mostly unchanged, small improvements) ---

// Your main downloader logic (unmodified, it's solid)
ipcMain.on("download-video", async (event, options) => {
  // ... (Your entire download logic remains here, no changes needed)
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
              console.log(
                `Downloading channel thumbnail for ${channelId} from ${channelThumbUrl}`
              );
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
  // Use path.normalize to handle file URI correctly on Windows
  shell.showItemInFolder(path.normalize(filePath.replace("file://", "")));
});
