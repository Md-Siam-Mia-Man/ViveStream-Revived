// src/js/downloader.js
const downloadJobs = new Map();
const videoQualitySelectContainer = document.getElementById(
  "video-quality-select-container"
);
const audioQualitySelectContainer = document.getElementById(
  "audio-quality-select-container"
);
const videoOptionsContainer = document.getElementById(
  "video-options-container"
);
const audioOptionsContainer = document.getElementById(
  "audio-options-container"
);
const downloadTypeRadios = document.querySelectorAll(
  'input[name="download-type"]'
);
const advancedOptionsToggle = document.getElementById(
  "advanced-options-toggle"
);
const advancedOptionsPanel = document.getElementById("advanced-options-panel");
const startTimeInput = document.getElementById("start-time-input");
const endTimeInput = document.getElementById("end-time-input");
const splitChaptersToggle = document.getElementById("split-chapters-toggle");

function updateQueuePlaceholder() {
  const placeholder = document.getElementById("empty-queue-placeholder");
  const hasItems = downloadQueueArea.children.length > 0;
  placeholder.classList.toggle("hidden", hasItems);
}

downloadForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const downloadType = document.querySelector(
    'input[name="download-type"]:checked'
  ).value;
  let quality;

  if (downloadType === "video") {
    quality =
      videoQualitySelectContainer.querySelector(".selected-option").dataset
        .value;
  } else {
    quality =
      audioQualitySelectContainer.querySelector(".selected-option").dataset
        .value;
  }

  if (urlInput.value) {
    window.electronAPI.downloadVideo({
      url: urlInput.value,
      type: downloadType,
      quality: quality,
      startTime: startTimeInput.value.trim(),
      endTime: endTimeInput.value.trim(),
      splitChapters: splitChaptersToggle.checked,
    });
    urlInput.value = "";
    startTimeInput.value = "";
    endTimeInput.value = "";
    splitChaptersToggle.checked = false;
    handleAdvancedOptionsInteraction(); // Reset disabled states
    advancedOptionsPanel.classList.add("hidden");
  }
});

downloadTypeRadios.forEach((radio) => {
  radio.addEventListener("change", (e) => {
    const isVideo = e.target.value === "video";
    videoOptionsContainer.classList.toggle("hidden", !isVideo);
    audioOptionsContainer.classList.toggle("hidden", isVideo);
  });
});

advancedOptionsToggle.addEventListener("click", () => {
  advancedOptionsPanel.classList.toggle("hidden");
});

function handleAdvancedOptionsInteraction() {
  const hasTimeInput = startTimeInput.value.trim() || endTimeInput.value.trim();
  if (hasTimeInput) {
    splitChaptersToggle.disabled = true;
  } else {
    splitChaptersToggle.disabled = false;
  }

  if (splitChaptersToggle.checked) {
    startTimeInput.disabled = true;
    endTimeInput.disabled = true;
  } else {
    startTimeInput.disabled = false;
    endTimeInput.disabled = false;
  }
}
startTimeInput.addEventListener("input", handleAdvancedOptionsInteraction);
endTimeInput.addEventListener("input", handleAdvancedOptionsInteraction);
splitChaptersToggle.addEventListener(
  "change",
  handleAdvancedOptionsInteraction
);

window.electronAPI.onDownloadQueueStart((videos) => {
  videos.forEach((video) => {
    if (downloadJobs.has(video.id)) return;
    const downloadType = document.querySelector(
      'input[name="download-type"]:checked'
    ).value;
    const quality =
      downloadType === "video"
        ? videoQualitySelectContainer.querySelector(".selected-option").dataset
            .value
        : audioQualitySelectContainer.querySelector(".selected-option").dataset
            .value;
    const startTime = startTimeInput.value.trim();
    const endTime = endTimeInput.value.trim();
    const splitChapters = splitChaptersToggle.checked;

    const job = {
      videoInfo: video,
      type: downloadType,
      quality: quality,
      startTime: startTime,
      endTime: endTime,
      splitChapters: splitChapters,
    };
    downloadJobs.set(video.id, job);

    const thumb = video.thumbnail || "../assets/logo.png";
    const itemHTML = `
        <div class="download-item" data-id="${video.id}" data-status="queued">
            <img src="${thumb}" class="download-item-thumb" alt="thumbnail" onerror="this.onerror=null;this.src='../assets/logo.png';">
            <div class="download-item-info">
                <p class="download-item-title">${video.title}</p>
                <p class="download-item-uploader">${
                  video.uploader || "Unknown"
                }</p>
                <div class="download-item-progress-bar-container">
                    <div class="download-item-progress-bar"></div>
                </div>
                <div class="download-item-stats">
                    <span class="download-item-status"><i class="fa-solid fa-clock"></i> Queued</span>
                    <span class="download-item-speed"></span>
                    <span class="download-item-eta"></span>
                </div>
            </div>
            <div class="download-item-actions"></div>
        </div>`;
    downloadQueueArea.insertAdjacentHTML("beforeend", itemHTML);
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
  item.classList.add("downloading");
  item.classList.remove("completed", "error");
  item.querySelector(
    ".download-item-progress-bar"
  ).style.width = `${data.percent}%`;
  item.querySelector(
    ".download-item-status"
  ).innerHTML = `<i class="fa-solid fa-download"></i> Downloading (${data.percent.toFixed(
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
    item.classList.add("completed");
    item.classList.remove("downloading", "error");
    item.querySelector(
      ".download-item-status"
    ).innerHTML = `<i class="fa-solid fa-check-circle"></i> Completed`;
    const thumb = item.querySelector(".download-item-thumb");
    if (thumb && data.videoData.coverPath) {
      thumb.src = data.videoData.coverPath;
    }
    item.querySelector(".download-item-speed").textContent = "";
    item.querySelector(".download-item-eta").textContent = "";

    // --- NEW: Show a special notification for chapter splits ---
    if (data.videoData.isChapterSplit) {
      showNotification(
        `'${data.videoData.title}' downloaded successfully.`,
        "info",
        "Chapter files are saved directly to your library folder."
      );
    } else {
      showNotification(
        `'${data.videoData.title}' downloaded successfully.`,
        "success"
      );
      // Only reload the library for items that are actually added to it.
      loadLibrary();
    }

    updateItemActions(data.id, "completed");
  }
});

window.electronAPI.onDownloadError((data) => {
  const item = downloadQueueArea.querySelector(
    `.download-item[data-id="${data.id}"]`
  );
  if (item) {
    item.dataset.status = "error";
    item.classList.add("error");
    item.classList.remove("downloading", "completed");
    item.querySelector(
      ".download-item-status"
    ).innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Error`;
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
  actionsHTML += `<button class="download-action-btn remove-btn" title="Remove from list"><i class="fa-solid fa-trash-alt"></i></button>`;
  actionsContainer.innerHTML = actionsHTML;
}

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
    item.querySelector(
      ".download-item-status"
    ).innerHTML = `<i class="fa-solid fa-clock"></i> Queued for retry...`;
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

function initializeCustomSelect(container) {
  const selectedOption = container.querySelector(".selected-option");
  const optionsList = container.querySelector(".options-list");

  selectedOption.addEventListener("click", () =>
    container.classList.toggle("open")
  );

  optionsList.addEventListener("click", (e) => {
    if (e.target.classList.contains("option-item")) {
      selectedOption.querySelector("span").textContent = e.target.textContent;
      selectedOption.dataset.value = e.target.dataset.value;
      optionsList
        .querySelectorAll(".option-item")
        .forEach((i) => i.classList.remove("selected"));
      e.target.classList.add("selected");
      container.classList.remove("open");
    }
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) {
      container.classList.remove("open");
    }
  });
}

initializeCustomSelect(videoQualitySelectContainer);
initializeCustomSelect(audioQualitySelectContainer);

updateQueuePlaceholder();
