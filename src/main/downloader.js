const fs = require("fs");
const path = require("path");
const fse = require("fs-extra");
const url = require("url");
const { parseArtistNames, parseYtDlpError } = require("./utils");
const { spawnPython, getPythonDetails } = require("./python-core");

class Downloader {
  constructor({
    getSettings,
    videoPath,
    coverPath,
    subtitlePath,
    db,
    BrowserDiscovery,
    win,
    resolveFfmpegPath,
  }) {
    this.queue = [];
    this.activeDownloads = new Map();
    this.getSettings = getSettings;
    this.settings = getSettings();
    this.videoPath = videoPath;
    this.coverPath = coverPath;
    this.subtitlePath = subtitlePath;
    this.db = db;
    this.BrowserDiscovery = BrowserDiscovery;
    this.win = win;
    this.resolveFfmpegPath = resolveFfmpegPath;
  }

  setWindow(win) {
    this.win = win;
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
      const job = this.queue.shift();
      this.activeDownloads.set(job.videoInfo.id, { kill: () => { } });
      this.startDownload(job).catch(err => {
        console.error("Start download error:", err);
        this.activeDownloads.delete(job.videoInfo.id);
        this.processQueue();
      });
    }
  }

  cancelDownload(videoId) {
    const p = this.activeDownloads.get(videoId);
    if (p) {
      if (typeof p.kill === 'function') p.kill();
      this.activeDownloads.delete(videoId);
    }
  }

  shutdown() {
    this.queue = [];
    for (const process of this.activeDownloads.values()) {
      if (process && typeof process.kill === 'function') process.kill();
    }
    this.activeDownloads.clear();
  }

  emitLog(id, text) {
    if (this.win) {
      if (text.includes("No supported JavaScript runtime")) return;
      this.win.webContents.send("download-log", { id, text: text + "\n" });
    }
  }

  async startDownload(job) {
    const { videoInfo } = job;
    const { id } = videoInfo;

    this.emitLog(id, `[System]: Initializing download for: ${videoInfo.title}`);

    if (!this.activeDownloads.has(id)) return;

    this.emitLog(id, `[System]: Resolving FFmpeg...`);
    let resolvedFfmpegPath;
    try {
      resolvedFfmpegPath = await this.resolveFfmpegPath();
      if (resolvedFfmpegPath) {
        this.emitLog(id, `[System]: FFmpeg found at: ${resolvedFfmpegPath}`);
      } else {
        this.emitLog(id, `[System]: WARNING: FFmpeg NOT found. Fallback mode enabled.`);
      }
    } catch (e) {
      this.emitLog(id, `[System]: Error resolving FFmpeg: ${e.message}`);
    }

    if (!this.activeDownloads.has(id)) return;

    const requestUrl = videoInfo.webpage_url || `https://www.youtube.com/watch?v=${id}`;

    let args = [
      "-m", "yt_dlp",
      requestUrl,
      "-o", path.join(this.videoPath, "%(id)s.%(ext)s"),
      "--progress",
      "--newline",
      "--retries", "10",
      "--write-info-json",
      "--write-thumbnail",
      "--convert-thumbnails", "jpg",
      "--write-description",
      "--embed-metadata",
      "--embed-chapters",
      "--no-mtime",
      "--compat-options", "no-youtube-unavailable-videos"
    ];

    if (resolvedFfmpegPath) {
      args.push("--ffmpeg-location", path.dirname(resolvedFfmpegPath));
    }

    if (job.downloadType === "video") {
      if (resolvedFfmpegPath) {
        // High quality merge mode (Requires FFmpeg)
        const qualityFilter = job.quality === "best" ? "" : `[height<=${job.quality}]`;
        const formatString = `bestvideo[ext=mp4]${qualityFilter}+bestaudio[ext=m4a]/bestvideo[vcodec^=avc]${qualityFilter}+bestaudio/best[ext=mp4]/best`;
        args.push("-f", formatString, "--merge-output-format", "mp4");
      } else {
        // Fallback mode (No merging, single file only)
        this.emitLog(id, `[System]: Using single-file format (best[ext=mp4]) to bypass missing FFmpeg.`);
        args.push("-f", "best[ext=mp4]");
      }

      if (job.downloadSubs) {
        args.push("--write-subs", "--sub-langs", "en.*,-live_chat");
        if (this.settings.downloadAutoSubs) args.push("--write-auto-subs");
      }
    } else {
      // Audio extraction requires FFmpeg for conversion (e.g. webm -> mp3)
      // If ffmpeg missing, we must download best audio as-is
      if (resolvedFfmpegPath) {
        args.push("-x", "--audio-format", job.audioFormat, "--audio-quality", job.audioQuality.toString());
        if (job.embedThumbnail) args.push("--embed-thumbnail");
      } else {
        this.emitLog(id, `[System]: FFmpeg missing. Downloading best available audio without conversion.`);
        args.push("-f", "bestaudio");
      }
    }

    if (job.playlistItems) args.push("--playlist-items", job.playlistItems);
    if (job.liveFromStart) args.push("--live-from-start");
    if (this.settings.removeSponsors && resolvedFfmpegPath) args.push("--sponsorblock-remove", "all");
    if (this.settings.concurrentFragments > 1) args.push("--concurrent-fragments", this.settings.concurrentFragments.toString());

    const browserArg = this.BrowserDiscovery.resolveBrowser(this.settings.cookieBrowser);
    if (browserArg) {
      args.push("--cookies-from-browser", browserArg);
    }

    if (this.settings.speedLimit) args.push("-r", this.settings.speedLimit);

    const proc = spawnPython(args);
    this.activeDownloads.set(id, proc);

    let stderrOutput = "";
    let stdoutOutput = "";

    // Safer timeout mechanism
    let stallTimeout;
    const STALL_LIMIT = 120000; // 2 minutes

    const resetStallTimer = () => {
      clearTimeout(stallTimeout);
      stallTimeout = setTimeout(() => {
        const stallMsg = `\n[System]: Download stalled for ${STALL_LIMIT / 1000}s. Killing process to prevent zombie.`;
        stderrOutput += stallMsg;
        this.emitLog(id, stallMsg);
        try { proc.kill("SIGKILL"); } catch (e) { } // Force kill
      }, STALL_LIMIT);
    };
    resetStallTimer();

    // Handle spawn-time errors specifically
    proc.on("error", (err) => {
      clearTimeout(stallTimeout);
      console.error(`[Downloader] Spawn Error (${id}):`, err);
      const errorMsg = `Process failed to start: ${err.message}`;
      if (err.code === "ENOENT") {
        stderrOutput += "\n[System]: Python or yt-dlp executable not found. Please checks settings or logs.";
      }
      stderrOutput += `\n${errorMsg}`;
      this.emitLog(id, errorMsg);

      if (this.activeDownloads.get(id) === proc) {
        this.activeDownloads.delete(id);
      }
      // Ensure we clean up this job from queue logic
      if (this.win) {
        this.win.webContents.send("download-error", {
          id: id,
          error: "System Error: Failed to launch downloader.",
          fullLog: stderrOutput,
          job
        });
      }
      this.processQueue();
    });

    proc.stdout.on("data", (data) => {
      resetStallTimer();
      const str = data.toString();
      stdoutOutput += str;

      // Only emit lines to UI to save IPC bandwidth, but keep full log internally if needed
      if (str.trim()) this.emitLog(id, str);

      const m = str.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s*([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/);
      if (m && this.win) {
        this.win.webContents.send("download-progress", {
          id: id,
          percent: parseFloat(m[1]),
          totalSize: m[2],
          currentSpeed: m[3],
          eta: m[4],
        });
      }
    });

    proc.stderr.on("data", (data) => {
      resetStallTimer();
      const str = data.toString();
      stderrOutput += str;
      this.emitLog(id, str);
    });

    proc.on("close", async (code) => {
      clearTimeout(stallTimeout);
      if (this.activeDownloads.get(id) === proc) {
        this.activeDownloads.delete(id);
      }

      const fullLog = `CMD: ${args.join(" ")}\n\nSTDOUT:\n${stdoutOutput}\n\nSTDERR:\n${stderrOutput}`;

      if (code === 0) {
        await this.postProcess(videoInfo, job, fullLog);
      } else {
        // Non-null exit code generic handler
        const errorMsg = parseYtDlpError(stderrOutput) || `Process exited with code ${code}`;
        console.warn(`[Downloader] Job ${id} failed. Code: ${code}. Msg: ${errorMsg}`);

        await this.db.addToHistory({
          url: videoInfo.webpage_url,
          title: videoInfo.title,
          type: job.downloadType,
          thumbnail: videoInfo.thumbnail,
          status: "failed"
        });

        if (this.win) {
          this.win.webContents.send("download-error", {
            id: id,
            error: errorMsg,
            fullLog: fullLog,
            job
          });
        }
      }
      this.processQueue();
    });
  }

  async postProcess(videoInfo, job, fullLog) {
    try {
      const files = fs.readdirSync(this.videoPath);
      const infoFile = files.find(f => f.startsWith(videoInfo.id) && f.endsWith('.info.json'));

      if (!infoFile) throw new Error("Could not find metadata file.");

      const infoJsonPath = path.join(this.videoPath, infoFile);
      const info = JSON.parse(fs.readFileSync(infoJsonPath, "utf-8"));
      fs.unlinkSync(infoJsonPath);

      // Find any file starting with ID that isn't metadata/thumb
      const mediaFile = files.find(f => f.startsWith(videoInfo.id) && !f.endsWith('.json') && !f.endsWith('.description') && !f.endsWith('.jpg') && !f.endsWith('.webp') && !f.endsWith('.vtt'));

      if (!mediaFile) throw new Error("Media file not found after download.");
      const mediaFilePath = path.join(this.videoPath, mediaFile);

      let finalCoverPath = null;
      const thumbFile = files.find(f => f.startsWith(videoInfo.id) && (f.endsWith('.jpg') || f.endsWith('.webp')));
      if (thumbFile) {
        finalCoverPath = path.join(this.coverPath, `${info.id}.jpg`);
        await fse.move(path.join(this.videoPath, thumbFile), finalCoverPath, { overwrite: true });
      }
      const finalCoverUri = finalCoverPath ? url.pathToFileURL(finalCoverPath).href : null;

      let subFileUri = null;
      const subFile = files.find(f => f.startsWith(videoInfo.id) && f.endsWith('.vtt'));
      if (subFile) {
        const destSub = path.join(this.subtitlePath, `${info.id}.vtt`);
        await fse.move(path.join(this.videoPath, subFile), destSub, { overwrite: true });
        subFileUri = url.pathToFileURL(destSub).href;
      }

      const descFile = files.find(f => f.startsWith(videoInfo.id) && f.endsWith('.description'));
      if (descFile) fs.unlinkSync(path.join(this.videoPath, descFile));

      const artistString = info.artist || info.creator || info.uploader;
      const artistNames = parseArtistNames(artistString);

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

      await this.db.addOrUpdateVideo(videoData);

      for (const name of artistNames) {
        const artist = await this.db.findOrCreateArtist(name, finalCoverUri);
        if (artist) await this.db.linkVideoToArtist(info.id, artist.id);
      }

      if (job.playlistId) await this.db.addVideoToPlaylist(job.playlistId, videoData.id);

      await this.db.addToHistory({
        url: info.webpage_url,
        title: info.title,
        type: job.downloadType,
        thumbnail: finalCoverUri,
        status: "success"
      });

      if (this.win) this.win.webContents.send("download-complete", { id: videoInfo.id, videoData, fullLog });

    } catch (e) {
      console.error(`Post-Process Error (${videoInfo.id}):`, e);
      if (this.win) this.win.webContents.send("download-error", { id: videoInfo.id, error: "Processing failed: " + e.message, fullLog, job });
    }
  }
}

module.exports = Downloader;