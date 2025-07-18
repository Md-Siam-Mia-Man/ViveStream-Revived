// downloader.js
const downloadQueueArea = document.getElementById("download-queue-area");

downloadForm.addEventListener("submit", (e) => {
  e.preventDefault();
  downloadQueueArea.innerHTML = "";
  const selectedQuality =
    qualitySelectContainer.querySelector(".selected-option").dataset.value;
  const options = {
    url: urlInput.value,
    quality: selectedQuality,
    type: "video",
  };
  if (options.url) {
    window.electronAPI.downloadVideo(options);
  }
});

window.electronAPI.onDownloadQueueStart((videos) => {
  videos.forEach((video) => {
    const itemHTML = `
            <div class="download-item" data-id="${video.id}">
                <img src="${
                  video.thumbnail
                }" class="download-item-thumb" alt="thumbnail">
                <div class="download-item-info">
                    <p class="download-item-title">${video.title}</p>
                    <p class="download-item-uploader">${
                      video.uploader || "Unknown Uploader"
                    }</p>
                    <div class="download-item-progress-bar-container">
                        <div class="download-item-progress-bar"></div>
                    </div>
                    <div class="download-item-stats">
                        <span class="download-item-status">
                            <i class="fas fa-clock"></i> Queued
                        </span>
                        <span class="download-item-speed"></span>
                        <span class="download-item-eta"></span>
                    </div>
                </div>
            </div>`;
    downloadQueueArea.insertAdjacentHTML("beforeend", itemHTML);
  });
});

window.electronAPI.onDownloadProgress((data) => {
  const item = downloadQueueArea.querySelector(
    `.download-item[data-id="${data.id}"]`
  );
  if (!item) return;

  const progressBar = item.querySelector(".download-item-progress-bar");
  const status = item.querySelector(".download-item-status");
  const speed = item.querySelector(".download-item-speed");
  const eta = item.querySelector(".download-item-eta");

  progressBar.style.width = `${data.percent}%`;
  status.innerHTML = `<i class="fas fa-download"></i> Downloading (${data.percent.toFixed(
    1
  )}%)`;
  speed.textContent = data.currentSpeed;
  eta.textContent = data.eta ? `ETA: ${data.eta}` : "";
});

window.electronAPI.onDownloadComplete((data) => {
  const item = downloadQueueArea.querySelector(
    `.download-item[data-id="${data.id}"]`
  );
  if (item) {
    item.classList.add("completed");
    const status = item.querySelector(".download-item-status");
    status.innerHTML = `<i class="fas fa-check-circle"></i> Completed`;
    showNotification(`'${data.videoData.title}' downloaded successfully.`);
  }
  loadLibrary();
});

window.electronAPI.onDownloadError((data) => {
  const item = downloadQueueArea.querySelector(
    `.download-item[data-id="${data.id}"]`
  );
  if (item) {
    item.classList.add("error");
    const status = item.querySelector(".download-item-status");
    status.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error`;
    const eta = item.querySelector(".download-item-eta");
    eta.textContent = data.error.substring(0, 50) + "...";
    showNotification(`Download failed for item ID: ${data.id}`, "error");
  }
});

const selectedOption = qualitySelectContainer.querySelector(".selected-option");
const optionsList = qualitySelectContainer.querySelector(".options-list");

selectedOption.addEventListener("click", () => {
  qualitySelectContainer.classList.toggle("open");
});

optionsList.addEventListener("click", (e) => {
  if (e.target.classList.contains("option-item")) {
    selectedOption.querySelector("span").textContent = e.target.textContent;
    selectedOption.dataset.value = e.target.dataset.value;
    optionsList
      .querySelectorAll(".option-item")
      .forEach((item) => item.classList.remove("selected"));
    e.target.classList.add("selected");
    qualitySelectContainer.classList.remove("open");
  }
});

document.addEventListener("click", (e) => {
  if (!qualitySelectContainer.contains(e.target)) {
    qualitySelectContainer.classList.remove("open");
  }
});
