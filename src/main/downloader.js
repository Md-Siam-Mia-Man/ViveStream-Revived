const fs = require("fs");
const path = require("path");
const fse = require("fs-extra");
const url = require("url");
const { parseArtistNames, parseYtDlpError } = require("./utils");
const { spawnPython } = require("./python-core");

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
      // Reserve the slot immediately to prevent race conditions during async operations in startDownload
      this.activeDownloads.set(job.videoInfo.id, { kill: () => {} });
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

  async startDownload(job) {
    const { videoInfo } = job;

    let resolvedFfmpegPath;
    try {
        resolvedFfmpegPath = await this.resolveFfmpegPath();
    } catch(e) {
        console.warn("Failed to resolve ffmpeg path:", e);
    }

    // Check if download was cancelled while we were awaiting
    if (!this.activeDownloads.has(videoInfo.id)) {
        return;
    }

    if (!resolvedFfmpegPath) {
      console.log("Warning: FFmpeg not resolved.");
    }

    const requestUrl = videoInfo.webpage_url || `https://www.youtube.com/watch?v=${videoInfo.id}`;

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
      "--no-mtime"
    ];

    if (resolvedFfmpegPath) {
      // Pass the directory so yt-dlp can find both ffmpeg and ffprobe
      args.push("--ffmpeg-location", path.dirname(resolvedFfmpegPath));
    } else {
      console.warn("Starting download WITHOUT FFmpeg. Merging will fail.");
    }

    if (job.downloadType === "video") {
      const qualityFilter = job.quality === "best" ? "" : `[height<=${job.quality}]`;
      const formatString = `bestvideo[ext=mp4]${qualityFilter}+bestaudio[ext=m4a]/bestvideo[vcodec^=avc]${qualityFilter}+bestaudio/best[ext=mp4]/best`;
      args.push("-f", formatString, "--merge-output-format", "mp4");

      if (job.downloadSubs) {
        args.push("--write-subs", "--sub-langs", "en.*,-live_chat");
        if (this.settings.downloadAutoSubs) args.push("--write-auto-subs");
      }
    } else {
      args.push("-x", "--audio-format", job.audioFormat, "--audio-quality", job.audioQuality.toString());
      if (job.embedThumbnail) args.push("--embed-thumbnail");
    }

    if (job.playlistItems) args.push("--playlist-items", job.playlistItems);
    if (job.liveFromStart) args.push("--live-from-start");
    if (this.settings.removeSponsors) args.push("--sponsorblock-remove", "all");
    if (this.settings.concurrentFragments > 1) args.push("--concurrent-fragments", this.settings.concurrentFragments.toString());

    // INTELLIGENT BROWSER DISCOVERY
    const browserArg = this.BrowserDiscovery.resolveBrowser(this.settings.cookieBrowser);
    if (browserArg) {
      args.push("--cookies-from-browser", browserArg);
    }

    if (this.settings.speedLimit) args.push("-r", this.settings.speedLimit);

    const proc = spawnPython(args);
    this.activeDownloads.set(videoInfo.id, proc);

    let stderrOutput = "";
    let stallTimeout;

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
      const m = str.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s*([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/);
      if (m && this.win) {
        this.win.webContents.send("download-progress", {
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
        await this.db.addToHistory({
          url: videoInfo.webpage_url,
          title: videoInfo.title,
          type: job.downloadType,
          thumbnail: videoInfo.thumbnail,
          status: "failed"
        });
        if (this.win) {
          this.win.webContents.send("download-error", {
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
      const files = fs.readdirSync(this.videoPath);
      const infoFile = files.find(f => f.startsWith(videoInfo.id) && f.endsWith('.info.json'));

      if (!infoFile) throw new Error("Could not find metadata file.");

      const infoJsonPath = path.join(this.videoPath, infoFile);
      const info = JSON.parse(fs.readFileSync(infoJsonPath, "utf-8"));
      fs.unlinkSync(infoJsonPath);

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

      for (const name of artistNames) {
        const artist = await this.db.findOrCreateArtist(name, finalCoverUri);
        if (artist) await this.db.linkVideoToArtist(info.id, artist.id);
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

      await this.db.addOrUpdateVideo(videoData);
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
