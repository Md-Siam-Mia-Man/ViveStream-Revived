// src/renderer/js/downloader.js
import { loadLibrary } from "./renderer.js";
import { showNotification } from "./notifications.js";

// --- DOM Element Selectors ---
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

// --- State ---
const downloadJobs = new Map();

// --- Lazy Loading ---
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

/**
 * Updates the visibility of the "queue is empty" placeholder.
 */
function updateQueuePlaceholder() {
  const placeholder = document.getElementById("empty-queue-placeholder");
  const hasItems = downloadQueueArea.children.length > 0;
  placeholder.classList.toggle("hidden", hasItems);
}

// --- Event Listeners ---
downloadForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const isVideo = downloadTypeVideo.checked;
  const qualityContainer = isVideo ? videoQualitySelect : audioQualitySelect;
  const selectedQuality =
    qualityContainer.querySelector(".selected-option").dataset.value;

  const type = document.querySelector(
    'input[name="download-type"]:checked'
  ).value;
  const startTime = document.getElementById("start-time-input").value.trim();
  const endTime = document.getElementById("end-time-input").value.trim();
  const splitChapters = document.getElementById(
    "split-chapters-toggle"
  ).checked;

  if (urlInput.value) {
    window.electronAPI.downloadVideo({
      url: urlInput.value,
      quality: selectedQuality,
      type,
      startTime,
      endTime,
      splitChapters,
    });
    urlInput.value = "";
  }
});

downloadQueueArea.addEventListener("click", (e) => {
  const btn = e.target.closest(".download-action-btn");
  if (!btn) return;
  const item = e.target.closest(".download-item");
  const videoId = item.dataset.id;

  if (btn.classList.contains("cancel-btn")) {
    window.electronAPI.cancelDownload(videoId);
    item.remove();
    downloadJobs.delete(videoId);
  } else if (btn.classList.contains("retry-btn")) {
    const job = downloadJobs.get(videoId);
    if (job) window.electronAPI.retryDownload(job);
    item.querySelector(".download-item-status").innerHTML =
      `<i class="fa-solid fa-clock"></i> Queued for retry...`;
    item.classList.remove("error");
  } else if (btn.classList.contains("remove-btn")) {
    item.remove();
    downloadJobs.delete(videoId);
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

/**
 * Updates the action buttons available for a download item based on its status.
 * @param {string} videoId - The ID of the video item.
 * @param {string} status - The new status ('queued', 'downloading', 'completed', 'error').
 */
function updateItemActions(videoId, status) {
  const item = downloadQueueArea.querySelector(
    `.download-item[data-id="${videoId}"]`
  );
  if (!item) return;
  const actionsContainer = item.querySelector(".download-item-actions");
  let actionsHTML = "";
  if (status === "downloading" || status === "queued") {
    actionsHTML = `<button class="download-action-btn cancel-btn" title="Cancel"><i class="fa-solid fa-times"></i></button>`;
  } else if (status === "error") {
    actionsHTML = `<button class="download-action-btn retry-btn" title="Retry"><i class="fa-solid fa-sync-alt"></i></button>`;
  }
  actionsHTML += `<button class="download-action-btn remove-btn" title="Remove from list"><i class="fa-solid fa-trash-can"></i></button>`;
  actionsContainer.innerHTML = actionsHTML;
}

// --- IPC Event Handlers ---
window.electronAPI.onDownloadQueueStart((videos) => {
  videos.forEach((video) => {
    if (downloadJobs.has(video.id)) return;

    const type = document.querySelector(
      'input[name="download-type"]:checked'
    ).value;
    const qualityContainer =
      type === "video" ? videoQualitySelect : audioQualitySelect;
    const job = {
      videoInfo: video,
      quality: qualityContainer.querySelector(".selected-option").dataset.value,
      type: type,
      startTime: document.getElementById("start-time-input").value.trim(),
      endTime: document.getElementById("end-time-input").value.trim(),
      splitChapters: document.getElementById("split-chapters-toggle").checked,
    };
    downloadJobs.set(video.id, job);

    const placeholderSrc = "../renderer/assets/logo.png";
    const thumb = video.thumbnail || placeholderSrc;
    const itemHTML = `
        <div class="download-item" data-id="${video.id}" data-status="queued">
            <img data-src="${thumb}" src="${placeholderSrc}" class="download-item-thumb lazy" alt="thumbnail" onerror="this.onerror=null;this.src='${placeholderSrc}';">
            <div class="download-item-info">
                <p class="download-item-title">${video.title}</p>
                <p class="download-item-uploader">${
                  video.uploader || "Unknown"
                }</p>
                <div class="download-item-progress-bar-container"><div class="download-item-progress-bar"></div></div>
                <div class="download-item-stats">
                    <span class="download-item-status"><i class="fa-solid fa-clock"></i> Queued</span>
                    <span class="download-item-speed"></span>
                    <span class="download-item-eta"></span>
                </div>
            </div>
            <div class="download-item-actions"></div>
        </div>`;
    downloadQueueArea.insertAdjacentHTML("beforeend", itemHTML);
    const newItem = downloadQueueArea.querySelector(
      `.download-item[data-id="${video.id}"]`
    );
    const newImg = newItem.querySelector("img.lazy");
    if (newImg) lazyLoadObserver.observe(newImg);
    updateItemActions(video.id, "queued");
  });
  updateQueuePlaceholder();
});

window.electronAPI.onDownloadProgress((data) => {
  const item = downloadQueueArea.querySelector(
    `.download-item[data-id="${data.id}"]`
  );
  if (!item) return;
  item.dataset.status = "downloading";
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
  updateItemActions(data.id, "downloading");
});

window.electronAPI.onDownloadComplete((data) => {
  const item = downloadQueueArea.querySelector(
    `.download-item[data-id="${data.id}"]`
  );
  if (item) {
    item.dataset.status = "completed";
    item.querySelector(".download-item-status").innerHTML =
      `<i class="fa-solid fa-check-circle"></i> Completed`;
    const thumb = item.querySelector(".download-item-thumb");
    if (thumb && data.videoData.coverPath) {
      thumb.src = decodeURIComponent(data.videoData.coverPath);
    }
    item.querySelector(".download-item-speed").textContent = "";
    item.querySelector(".download-item-eta").textContent = "";
    showNotification(
      `'${data.videoData.title}' downloaded successfully.`,
      "success"
    );
    updateItemActions(data.id, "completed");
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
    updateItemActions(data.id, "error");
  }
});

window.electronAPI.onDownloadInfoError((data) => {
  showNotification(
    `Could not get info for URL: ${data.url}`,
    "error",
    "Please check the URL and your connection."
  );
});

// --- Initial State ---
updateQueuePlaceholder();
