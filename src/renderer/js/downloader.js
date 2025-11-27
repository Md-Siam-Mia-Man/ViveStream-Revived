import { loadLibrary } from "./renderer.js";
import { showNotification } from "./notifications.js";
import { AppState } from "./state.js";

const downloadForm = document.getElementById("download-form");
const urlInput = document.getElementById("url-input");
const downloadQueueArea = document.getElementById("download-queue-area");

const downloadTypeRadios = document.querySelectorAll(
  'input[name="download-type"]'
);
const videoOptionsContainer = document.getElementById(
  "video-options-container"
);
const videoSubsContainer = document.getElementById("video-subs-container");
const audioOptionsContainer = document.getElementById(
  "audio-options-container"
);
const audioQualityContainer = document.getElementById(
  "audio-quality-container"
);
const audioThumbContainer = document.getElementById("audio-thumb-container");
const playlistOptionsContainer = document.getElementById(
  "playlist-options-container"
);

const downloadJobs = new Map();
const pendingInfoJobs = new Map();

const lazyLoadObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const src = img.dataset.src;
        if (src) {
          img.src = src;
        }
        img.classList.remove("lazy");
        observer.unobserve(img);
      }
    });
  },
  { rootMargin: "0px 0px 100px 0px" }
);

function updateQueuePlaceholder() {
  const placeholder = document.getElementById("empty-queue-placeholder");
  const hasItems = downloadQueueArea.children.length > 0;
  placeholder.classList.toggle("hidden", hasItems);
}

function createFetchingPlaceholder(url, jobId) {
  const itemHTML = `
        <div class="download-item" data-job-id="${jobId}" data-status="fetching">
            <div class="download-item-thumb">
                <div class="thumb-overlay">
                    <div class="spinner"></div>
                </div>
            </div>
            <div class="download-item-info">
                <p class="download-item-title">${url}</p>
                <p class="download-item-uploader">Requesting from YouTube...</p>
                <div class="download-item-progress-bar-container" style="display:none;"></div>
                <div class="download-item-stats">
                    <span class="download-item-status"><span class="material-symbols-outlined spin">progress_activity</span> Fetching details...</span>
                </div>
            </div>
            <div class="download-item-actions"></div>
        </div>`;
  downloadQueueArea.insertAdjacentHTML("beforeend", itemHTML);
  updateQueuePlaceholder();
}

function updateDownloadOptionsUI() {
  const downloadType = document.querySelector(
    'input[name="download-type"]:checked'
  ).value;
  const isVideo = downloadType === "video";

  videoOptionsContainer.classList.toggle("hidden", !isVideo);
  videoSubsContainer.classList.toggle("hidden", !isVideo);
  audioOptionsContainer.classList.toggle("hidden", isVideo);
  audioQualityContainer.classList.toggle("hidden", isVideo);
  audioThumbContainer.classList.toggle("hidden", isVideo);

  const url = urlInput.value;
  const isPlaylist = url.includes("playlist?list=");
  playlistOptionsContainer.classList.toggle("hidden", !isPlaylist);
}

urlInput.addEventListener("input", updateDownloadOptionsUI);
downloadTypeRadios.forEach((radio) => {
  radio.addEventListener("change", updateDownloadOptionsUI);
});

downloadForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  const downloadType = document.querySelector(
    'input[name="download-type"]:checked'
  ).value;

  const downloadOptions = {
    url,
    downloadType,
    playlistItems: document
      .getElementById("playlist-items-input")
      .value.trim(),
    liveFromStart: document.getElementById("live-from-start-toggle").checked,
  };

  if (downloadType === "video") {
    Object.assign(downloadOptions, {
      quality: document.getElementById("video-quality-select-container")
        .querySelector(".selected-option")
        .dataset.value,
      downloadSubs: document.getElementById("download-subs-toggle").checked,
    });
  } else {
    Object.assign(downloadOptions, {
      audioFormat: document.getElementById("audio-format-select-container")
        .querySelector(".selected-option")
        .dataset.value,
      audioQuality:
        10 -
        parseInt(document.getElementById("audio-quality-slider").value, 10),
      embedThumbnail: document.getElementById("embed-thumbnail-toggle")
        .checked,
    });
  }

  const jobId = Date.now().toString();
  pendingInfoJobs.set(jobId, downloadOptions);
  createFetchingPlaceholder(url, jobId);
  window.electronAPI.downloadVideo(downloadOptions, jobId);

  urlInput.value = "";
  updateDownloadOptionsUI();
});

downloadQueueArea.addEventListener("click", (e) => {
  const btn = e.target.closest(".download-action-btn");
  if (!btn) return;

  const item = e.target.closest(".download-item");
  const videoId = item.dataset.id;
  const jobId = item.dataset.jobId;

  if (btn.classList.contains("cancel-btn")) {
    window.electronAPI.cancelDownload(videoId);
    item.remove();
    downloadJobs.delete(videoId);
  } else if (btn.classList.contains("retry-btn")) {
    const job = downloadJobs.get(videoId);
    if (job) window.electronAPI.retryDownload(job);
    item.querySelector(
      ".download-item-status"
    ).innerHTML = `<span class="material-symbols-outlined">schedule</span> Queued for retry...`;
    item.dataset.status = "queued";
  } else if (btn.classList.contains("remove-btn")) {
    item.remove();
    if (videoId) downloadJobs.delete(videoId);
    if (jobId) pendingInfoJobs.delete(jobId);
  } else if (btn.classList.contains("info-retry-btn")) {
    const originalOptions = pendingInfoJobs.get(jobId);
    if (originalOptions) {
      item.remove();
      createFetchingPlaceholder(originalOptions.url, jobId);
      window.electronAPI.downloadVideo(originalOptions, jobId);
    }
  }

  updateQueuePlaceholder();
});

document.getElementById("clear-completed-btn").addEventListener("click", () => {
  downloadQueueArea
    .querySelectorAll('.download-item[data-status="completed"]')
    .forEach((item) => {
      downloadJobs.delete(item.dataset.id);
      item.remove();
    });
  updateQueuePlaceholder();
});

document.getElementById("clear-all-btn").addEventListener("click", () => {
  downloadQueueArea.querySelectorAll(".download-item").forEach((item) => {
    if (item.dataset.status === "downloading") {
      window.electronAPI.cancelDownload(item.dataset.id);
    }
    downloadJobs.delete(item.dataset.id);
    item.remove();
  });
  updateQueuePlaceholder();
});

function updateItemActions(item, status) {
  if (!item) return;
  const actionsContainer = item.querySelector(".download-item-actions");
  let actionsHTML = "";

  if (status === "downloading" || status === "queued") {
    actionsHTML = `<button class="download-action-btn cancel-btn" title="Cancel"><span class="material-symbols-outlined">close</span></button>`;
  } else if (status === "error") {
    actionsHTML = `<button class="download-action-btn retry-btn" title="Retry"><span class="material-symbols-outlined">refresh</span></button>`;
  } else if (status === "info-error") {
    actionsHTML = `<button class="download-action-btn info-retry-btn" title="Retry Fetch"><span class="material-symbols-outlined">refresh</span></button>`;
  }
  actionsHTML += `<button class="download-action-btn remove-btn" title="Remove from list"><span class="material-symbols-outlined">delete</span></button>`;
  actionsContainer.innerHTML = actionsHTML;
}

window.electronAPI.onDownloadQueueStart(({ infos, jobId }) => {
  const placeholder = downloadQueueArea.querySelector(
    `.download-item[data-job-id="${jobId}"]`
  );
  if (!placeholder) return;

  const existingLibraryIds = new Set(AppState.library.map((v) => v.id));
  const videosToTouch = [];
  const videosToDownload = [];

  infos.forEach((info) => {
    if (existingLibraryIds.has(info.id)) {
      videosToTouch.push(info.id);
    } else {
      videosToDownload.push(info);
    }
  });

  if (videosToTouch.length > 0) {
    window.electronAPI.videosTouch(videosToTouch);
    showNotification(
      `${videosToTouch.length} video(s) already in library.`,
      "info",
      "Their 'date added' has been updated."
    );
  }

  if (videosToDownload.length === 0) {
    placeholder.remove();
    pendingInfoJobs.delete(jobId);
    updateQueuePlaceholder();
    return;
  }

  const fragment = document.createDocumentFragment();

  videosToDownload.forEach((video) => {
    if (downloadJobs.has(video.id)) return;

    const originalOptions = pendingInfoJobs.get(jobId);
    const job = { ...originalOptions, videoInfo: video };
    downloadJobs.set(video.id, job);

    const placeholderSrc = `${AppState.assetsPath}/logo.png`;
    const thumb = video.thumbnail || placeholderSrc;
    const itemEl = document.createElement("div");
    itemEl.className = "download-item";
    itemEl.dataset.id = video.id;
    itemEl.dataset.status = "queued";
    itemEl.innerHTML = `
        <div class="download-item-thumb">
            <img data-src="${thumb}" src="${placeholderSrc}" class="lazy" alt="thumbnail" onerror="this.onerror=null;this.src='${placeholderSrc}';">
            <div class="thumb-overlay">
                <div class="spinner"></div>
                <div class="thumb-overlay-icon complete"><span class="material-symbols-outlined">check_circle</span></div>
                <div class="thumb-overlay-icon error"><span class="material-symbols-outlined">warning</span></div>
            </div>
        </div>
        <div class="download-item-info">
            <p class="download-item-title">${video.title}</p>
            <p class="download-item-uploader">${video.uploader || "Unknown"
      }</p>
            <div class="download-item-progress-bar-container"><div class="download-item-progress-bar"></div></div>
            <div class="download-item-stats">
                <span class="download-item-status"><span class="material-symbols-outlined">schedule</span> Queued</span>
                <span class="download-item-speed"></span>
                <span class="download-item-eta"></span>
            </div>
        </div>
        <div class="download-item-actions"></div>`;
    fragment.appendChild(itemEl);
    const newImg = itemEl.querySelector("img.lazy");
    if (newImg) lazyLoadObserver.observe(newImg);
    updateItemActions(itemEl, "queued");
  });

  placeholder.replaceWith(fragment);
  pendingInfoJobs.delete(jobId);
});

window.electronAPI.onDownloadProgress((data) => {
  const item = downloadQueueArea.querySelector(
    `.download-item[data-id="${data.id}"]`
  );
  if (!item) return;

  if (item.dataset.status !== "downloading") {
    item.dataset.status = "downloading";
    updateItemActions(item, "downloading");
  }

  item.querySelector(
    ".download-item-progress-bar"
  ).style.width = `${data.percent}%`;
  item.querySelector(
    ".download-item-status"
  ).innerHTML = `<span class="material-symbols-outlined">download</span> Downloading (${data.percent.toFixed(
    1
  )}%)`;
  item.querySelector(".download-item-speed").textContent = data.currentSpeed;
  item.querySelector(".download-item-eta").textContent = `ETA: ${data.eta || "N/A"
    }`;
});

window.electronAPI.onDownloadComplete((data) => {
  const item = downloadQueueArea.querySelector(
    `.download-item[data-id="${data.id}"]`
  );
  if (item) {
    item.dataset.status = "completed";
    item.querySelector(
      ".download-item-status"
    ).innerHTML = `<span class="material-symbols-outlined">check_circle</span> Completed`;
    const thumbImg = item.querySelector(".download-item-thumb img");
    if (thumbImg && data.videoData.coverPath) {
      thumbImg.src = decodeURIComponent(data.videoData.coverPath);
    }
    item.querySelector(".download-item-speed").textContent = "";
    item.querySelector(".download-item-eta").textContent = "";
    showNotification("Download Complete", "success", data.videoData.title);
    updateItemActions(item, "completed");
  }
  loadLibrary();
});

window.electronAPI.onDownloadError((data) => {
  const item = downloadQueueArea.querySelector(
    `.download-item[data-id="${data.id}"]`
  );
  if (item) {
    item.dataset.status = "error";
    item.querySelector(
      ".download-item-status"
    ).innerHTML = `<span class="material-symbols-outlined">warning</span> Error`;
    const etaEl = item.querySelector(".download-item-eta");
    const errorText = data.error || "Unknown";
    etaEl.textContent = errorText;
    etaEl.title = errorText;
    item.querySelector(".download-item-speed").textContent = "";

    showNotification("Download failed", "error", errorText);
    if (data.job) downloadJobs.set(data.id, data.job);
    updateItemActions(item, "error");
  }
});

window.electronAPI.onDownloadInfoError(({ jobId, error }) => {
  const placeholder = downloadQueueArea.querySelector(
    `.download-item[data-job-id="${jobId}"]`
  );
  if (placeholder) {
    placeholder.dataset.status = "info-error";
    const titleEl = placeholder.querySelector(".download-item-title");
    titleEl.textContent = error;
    titleEl.title = error;
    placeholder.querySelector(".spinner").style.display = "none";
    placeholder.querySelector(".download-item-uploader").textContent =
      "Failed to fetch details";
    placeholder.querySelector(
      ".download-item-status"
    ).innerHTML = `<span class="material-symbols-outlined">warning</span> Error`;
    updateItemActions(placeholder, "info-error");
  }
});

updateQueuePlaceholder();
updateDownloadOptionsUI();