// src/renderer/js/downloader.js
import { loadLibrary } from "./renderer.js";
import { showNotification } from "./notifications.js";
import { AppState } from "./state.js";

const downloadForm = document.getElementById("download-form");
const urlInput = document.getElementById("url-input");
const downloadQueueArea = document.getElementById("download-queue-area");
const videoQualitySelect = document.getElementById(
  "video-quality-select-container"
);
const audioQualitySelect = document.getElementById(
  "audio-quality-select-container"
);
const downloadTypeVideo = document.getElementById("download-type-video");
const downloadTypeAudio = document.getElementById("download-type-audio");
const videoOptionsContainer = document.getElementById(
  "video-options-container"
);
const audioOptionsContainer = document.getElementById(
  "audio-options-container"
);
const advancedOptionsToggle = document.getElementById(
  "advanced-options-toggle"
);
const advancedOptionsPanel = document.getElementById("advanced-options-panel");

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
                    <span class="download-item-status"><i class="fa-solid fa-sync-alt fa-spin"></i> Fetching details...</span>
                </div>
            </div>
            <div class="download-item-actions"></div>
        </div>`;
  downloadQueueArea.insertAdjacentHTML("beforeend", itemHTML);
  updateQueuePlaceholder();
}

downloadForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  const isVideo = downloadTypeVideo.checked;
  const qualityContainer = isVideo ? videoQualitySelect : audioQualitySelect;

  const downloadOptions = {
    url,
    quality: qualityContainer.querySelector(".selected-option").dataset.value,
    type: document.querySelector('input[name="download-type"]:checked').value,
    startTime: document.getElementById("start-time-input").value.trim(),
    endTime: document.getElementById("end-time-input").value.trim(),
    splitChapters: document.getElementById("split-chapters-toggle").checked,
  };

  const jobId = Date.now().toString();
  pendingInfoJobs.set(jobId, downloadOptions);
  createFetchingPlaceholder(url, jobId);
  window.electronAPI.downloadVideo(downloadOptions, jobId);

  urlInput.value = "";
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
    item.querySelector(".download-item-status").innerHTML =
      `<i class="fa-solid fa-clock"></i> Queued for retry...`;
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

advancedOptionsToggle.addEventListener("click", () => {
  advancedOptionsPanel.classList.toggle("hidden");
});

downloadTypeVideo.addEventListener("change", () => {
  if (downloadTypeVideo.checked) {
    videoOptionsContainer.classList.remove("hidden");
    audioOptionsContainer.classList.add("hidden");
  }
});

downloadTypeAudio.addEventListener("change", () => {
  if (downloadTypeAudio.checked) {
    videoOptionsContainer.classList.add("hidden");
    audioOptionsContainer.classList.remove("hidden");
  }
});

function updateItemActions(item, status) {
  if (!item) return;
  const actionsContainer = item.querySelector(".download-item-actions");
  let actionsHTML = "";

  if (status === "downloading" || status === "queued") {
    actionsHTML = `<button class="download-action-btn cancel-btn" title="Cancel"><i class="fa-solid fa-times"></i></button>`;
  } else if (status === "error") {
    actionsHTML = `<button class="download-action-btn retry-btn" title="Retry"><i class="fa-solid fa-sync-alt"></i></button>`;
  } else if (status === "info-error") {
    actionsHTML = `<button class="download-action-btn info-retry-btn" title="Retry Fetch"><i class="fa-solid fa-sync-alt"></i></button>`;
  }
  actionsHTML += `<button class="download-action-btn remove-btn" title="Remove from list"><i class="fa-solid fa-trash-can"></i></button>`;
  actionsContainer.innerHTML = actionsHTML;
}

window.electronAPI.onDownloadQueueStart(({ infos, jobId }) => {
  const placeholder = downloadQueueArea.querySelector(
    `.download-item[data-job-id="${jobId}"]`
  );
  if (!placeholder) return;

  const fragment = document.createDocumentFragment();

  infos.forEach((video) => {
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
                <div class="thumb-overlay-icon complete"><i class="fa-solid fa-check-circle"></i></div>
                <div class="thumb-overlay-icon error"><i class="fa-solid fa-triangle-exclamation"></i></div>
            </div>
        </div>
        <div class="download-item-info">
            <p class="download-item-title">${video.title}</p>
            <p class="download-item-uploader">${video.uploader || "Unknown"}</p>
            <div class="download-item-progress-bar-container"><div class="download-item-progress-bar"></div></div>
            <div class="download-item-stats">
                <span class="download-item-status"><i class="fa-solid fa-clock"></i> Queued</span>
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

  item.querySelector(".download-item-progress-bar").style.width =
    `${data.percent}%`;
  item.querySelector(".download-item-status").innerHTML =
    `<i class="fa-solid fa-download"></i> Downloading (${data.percent.toFixed(
      1
    )}%)`;
  item.querySelector(".download-item-speed").textContent = data.currentSpeed;
  item.querySelector(".download-item-eta").textContent = `ETA: ${
    data.eta || "N/A"
  }`;
});

window.electronAPI.onDownloadComplete((data) => {
  const item = downloadQueueArea.querySelector(
    `.download-item[data-id="${data.id}"]`
  );
  if (item) {
    item.dataset.status = "completed";
    item.querySelector(".download-item-status").innerHTML =
      `<i class="fa-solid fa-check-circle"></i> Completed`;
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
    item.querySelector(".download-item-status").innerHTML =
      `<i class="fa-solid fa-triangle-exclamation"></i> Error`;
    item.querySelector(".download-item-eta").textContent =
      (data.error || "Unknown").substring(0, 50) + "...";
    showNotification(`Download failed: ${data.error || "Unknown"}`, "error");
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
    placeholder.querySelector(".spinner").style.display = "none";
    placeholder.querySelector(".download-item-title").textContent = error;
    placeholder.querySelector(".download-item-uploader").textContent =
      "Failed to fetch details";
    placeholder.querySelector(".download-item-status").innerHTML =
      `<i class="fa-solid fa-triangle-exclamation"></i> Error`;
    updateItemActions(placeholder, "info-error");
  }
});

updateQueuePlaceholder();
