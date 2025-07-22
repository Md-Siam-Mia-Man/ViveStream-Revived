// downloader.js
const downloadJobs = new Map();

function updateQueuePlaceholder() {
  const placeholder = document.getElementById("empty-queue-placeholder");
  const hasItems = downloadQueueArea.children.length > 0;
  placeholder.classList.toggle("hidden", hasItems);
}

downloadForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const selectedQuality =
    qualitySelectContainer.querySelector(".selected-option").dataset.value;
  if (urlInput.value) {
    window.electronAPI.downloadVideo({
      url: urlInput.value,
      quality: selectedQuality,
    });
    urlInput.value = "";
  }
});

window.electronAPI.onDownloadQueueStart((videos) => {
  videos.forEach((video) => {
    if (downloadJobs.has(video.id)) return;
    const job = {
      videoInfo: video,
      quality: downloadForm.querySelector(".selected-option").dataset.value,
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

const selectedOption = qualitySelectContainer.querySelector(".selected-option");
const optionsList = qualitySelectContainer.querySelector(".options-list");
selectedOption.addEventListener("click", () =>
  qualitySelectContainer.classList.toggle("open")
);
optionsList.addEventListener("click", (e) => {
  if (e.target.classList.contains("option-item")) {
    selectedOption.querySelector("span").textContent = e.target.textContent;
    selectedOption.dataset.value = e.target.dataset.value;
    optionsList
      .querySelectorAll(".option-item")
      .forEach((i) => i.classList.remove("selected"));
    e.target.classList.add("selected");
    qualitySelectContainer.classList.remove("open");
  }
});
document.addEventListener("click", (e) => {
  if (!qualitySelectContainer.contains(e.target)) {
    qualitySelectContainer.classList.remove("open");
  }
});
updateQueuePlaceholder();
