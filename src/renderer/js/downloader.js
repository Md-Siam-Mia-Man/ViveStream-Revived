import { loadLibrary } from "./renderer.js";
import { showNotification } from "./notifications.js";
import { AppState } from "./state.js";
import { eventBus } from "./event-bus.js";

// DOM Elements
const urlInput = document.getElementById("url-input");
const startDownloadBtn = document.getElementById("start-download-btn");
const typeOptions = document.querySelectorAll(".dl-type-option");
const tabBtns = document.querySelectorAll(".dl-tab-btn");
const tabContents = document.querySelectorAll(".dl-tab-content");
const queueClearBtn = document.getElementById("queue-clear-btn");

// Config Elements
const qualityConfig = document.getElementById("quality-config");
const formatConfig = document.getElementById("format-config");
const subsConfig = document.getElementById("subs-config");
const thumbConfig = document.getElementById("thumb-config");
const audioQualityConfig = document.getElementById("audio-quality-config");
const playlistConfig = document.getElementById("playlist-range-config");

const subsToggle = document.getElementById("download-subs-toggle");
const thumbToggle = document.getElementById("embed-thumbnail-toggle");
const liveToggle = document.getElementById("live-from-start-toggle");
const playlistInput = document.getElementById("playlist-items-input");
const audioQualitySlider = document.getElementById("audio-quality-slider");

// Dropdowns
const qualityDropdown = document.getElementById("quality-dropdown");
const formatDropdown = document.getElementById("format-dropdown");

// Lists
const downloadQueueArea = document.getElementById("download-queue-area");
const historyListContainer = document.getElementById("history-list-container");
const queueEmptyState = document.getElementById("empty-queue-placeholder");
const historyEmptyState = document.getElementById("empty-history-placeholder");

// State
let currentType = "video";
const downloadJobs = new Map();
const pendingInfoJobs = new Map();
const errorLogs = new Map();

// --- Helper for Empty States ---
function updateEmptyStates() {
  const hasQueueItems = downloadQueueArea.children.length > 0;
  queueEmptyState.classList.toggle("hidden", hasQueueItems);

  const hasHistoryItems = historyListContainer.children.length > 0;
  historyEmptyState.classList.toggle("hidden", hasHistoryItems);
}

// --- UI Logic ---

function updateUIState() {
  const isVideo = currentType === "video";

  typeOptions.forEach(opt => opt.classList.toggle("active", opt.dataset.type === currentType));

  qualityConfig.classList.toggle("hidden", !isVideo);
  subsConfig.classList.toggle("hidden", !isVideo);

  formatConfig.classList.toggle("hidden", isVideo);
  thumbConfig.classList.toggle("hidden", isVideo);
  audioQualityConfig.classList.toggle("hidden", isVideo);

  const isPlaylist = urlInput.value.includes("list=");
  playlistConfig.classList.toggle("hidden", !isPlaylist);
}

function setupDropdowns() {
  [qualityDropdown, formatDropdown].forEach(dd => {
    if (!dd) return;
    const selected = dd.querySelector(".dropdown-selected");
    const options = dd.querySelectorAll(".dropdown-option");

    dd.addEventListener("click", (e) => {
      e.stopPropagation();
      // Close others
      [qualityDropdown, formatDropdown].forEach(other => {
        if (other !== dd) other.classList.remove("open");
      });
      dd.classList.toggle("open");
    });

    options.forEach(opt => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        selected.textContent = opt.textContent;
        selected.dataset.value = opt.dataset.value;
        dd.classList.remove("open");

        // Update selected visual state
        dd.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    });
  });

  document.addEventListener("click", () => {
    qualityDropdown.classList.remove("open");
    formatDropdown.classList.remove("open");
  });
}

function setupTabs() {
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

      // Change clear button action based on tab
      if (btn.dataset.tab === 'history') {
        queueClearBtn.title = "Clear History";
      } else {
        queueClearBtn.title = "Clear Queue";
      }
    });
  });
}

// --- History Logic ---

async function loadHistory() {
  const history = await window.electronAPI.historyGet();
  historyListContainer.innerHTML = "";

  history.forEach(item => {
    const card = document.createElement("div");
    card.className = "download-card";

    // Reuse Card UI Logic for consistency
    const thumb = item.thumbnail || `${AppState.assetsPath}/logo.png`;
    const icon = item.type === 'audio' ? 'music_note' : 'play_arrow';

    card.innerHTML = `
        <div class="dl-card-thumb-container">
             <img src="${thumb}" class="dl-card-thumb" onerror="this.src='${AppState.assetsPath}/logo.png'">
             <div class="dl-card-thumb-overlay">
                  <span class="material-symbols-outlined dl-card-play-icon">${icon}</span>
             </div>
        </div>
        <div class="dl-card-content">
             <div class="dl-card-title">${item.title || 'Unknown'}</div>
             <div class="dl-card-uploader">${item.url}</div>
             <div class="dl-card-actions">
                  <button class="dl-action-btn copy-btn" title="Copy URL"><span class="material-symbols-outlined">content_copy</span></button>
                  <button class="dl-action-btn reuse-btn" title="Reuse"><span class="material-symbols-outlined">arrow_upward</span></button>
             </div>
        </div>
    `;

    card.querySelector(".dl-card-thumb-container").addEventListener("click", () => {
      const libItem = AppState.library.find(v => v.originalUrl === item.url);
      if (libItem) {
        const idx = AppState.library.indexOf(libItem);
        eventBus.emit("player:play_request", {
          index: idx,
          queue: AppState.library,
          context: { type: 'home', id: null, name: 'Library' }
        });
      } else {
        showNotification("Video not found in library (might be deleted)", "info");
      }
    });

    card.querySelector(".copy-btn").addEventListener("click", () => {
      navigator.clipboard.writeText(item.url);
      showNotification("URL copied", "info");
    });

    card.querySelector(".reuse-btn").addEventListener("click", () => {
      urlInput.value = item.url;
      updateUIState();
      urlInput.focus();
    });

    historyListContainer.appendChild(card);
  });
  updateEmptyStates();
}

// --- Search Filter Logic ---
eventBus.on("search:downloads", (searchTerm) => {
  const term = searchTerm.toLowerCase();

  // Filter active queue
  const queueCards = downloadQueueArea.querySelectorAll(".download-card");
  queueCards.forEach(card => {
    const title = card.querySelector(".dl-card-title").textContent.toLowerCase();
    const url = card.querySelector(".dl-card-uploader").textContent.toLowerCase();
    const matches = title.includes(term) || url.includes(term);
    card.classList.toggle("hidden", !matches);
  });

  // Filter history
  const historyCards = historyListContainer.querySelectorAll(".download-card");
  historyCards.forEach(card => {
    const title = card.querySelector(".dl-card-title").textContent.toLowerCase();
    const url = card.querySelector(".dl-card-uploader").textContent.toLowerCase();
    const matches = title.includes(term) || url.includes(term);
    card.classList.toggle("hidden", !matches);
  });
});

// --- Download Logic ---

startDownloadBtn.addEventListener("click", (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) {
    showNotification("Please enter a URL", "error");
    return;
  }

  document.querySelector('[data-tab="queue"]').click();

  const downloadOptions = {
    url,
    downloadType: currentType,
    playlistItems: playlistInput.value.trim(),
    liveFromStart: liveToggle.checked
  };

  if (currentType === "video") {
    const qVal = qualityDropdown.querySelector(".dropdown-selected").dataset.value;
    downloadOptions.quality = qVal || "1440";
    downloadOptions.downloadSubs = subsToggle.checked;
  } else {
    const fVal = formatDropdown.querySelector(".dropdown-selected").dataset.value;
    downloadOptions.audioFormat = fVal || "best";
    downloadOptions.audioQuality = 10 - parseInt(audioQualitySlider.value, 10);
    downloadOptions.embedThumbnail = thumbToggle.checked;
  }

  const jobId = Date.now().toString();
  pendingInfoJobs.set(jobId, downloadOptions);
  createFetchingPlaceholder(url, jobId);
  window.electronAPI.downloadVideo(downloadOptions, jobId);

  urlInput.value = "";
  updateUIState();
});

function createFetchingPlaceholder(url, jobId) {
  const card = document.createElement("div");
  card.className = "download-card";
  card.dataset.jobId = jobId;
  card.dataset.status = "fetching";

  card.innerHTML = `
        <div class="dl-card-thumb-container">
             <img src="${AppState.assetsPath}/logo.png" class="dl-card-thumb">
             <div class="dl-card-thumb-overlay" style="opacity:1; background:rgba(0,0,0,0.7)">
                  <div class="spinner"></div>
             </div>
        </div>
        <div class="dl-card-content">
             <div class="dl-card-title">${url}</div>
             <div class="dl-card-uploader">Fetching info...</div>
             
             <div class="dl-progress-wrapper">
                 <div class="dl-progress-bar-container"><div class="dl-progress-bar" style="width:100%"></div></div>
                 <div class="dl-card-stats"><span>Connecting...</span></div>
             </div>

             <div class="dl-card-actions">
                  <button class="dl-action-btn log-btn hidden" title="View Log"><span class="material-symbols-outlined">description</span> Log</button>
                  <button class="dl-action-btn cancel-btn" title="Cancel"><span class="material-symbols-outlined">close</span></button>
             </div>
        </div>
  `;

  downloadQueueArea.insertAdjacentElement("afterbegin", card);
  updateEmptyStates();
}

function updateItemActions(item, status) {
  const actionsContainer = item.querySelector(".dl-card-actions");

  let logBtn = actionsContainer.querySelector(".log-btn");
  if (!logBtn) {
    logBtn = document.createElement("button");
    logBtn.className = "dl-action-btn log-btn";
    logBtn.title = "View Log";
    logBtn.innerHTML = `<span class="material-symbols-outlined">description</span> Log`;
    actionsContainer.prepend(logBtn);
  }

  actionsContainer.querySelectorAll(".dl-action-btn:not(.log-btn)").forEach(b => b.remove());

  let html = "";
  if (status === "downloading" || status === "queued") {
    html = `<button class="dl-action-btn cancel-btn" title="Cancel"><span class="material-symbols-outlined">close</span></button>`;
  } else if (status === "error" || status === "info-error") {
    html = `<button class="dl-action-btn retry-btn" title="Retry"><span class="material-symbols-outlined">refresh</span></button>
            <button class="dl-action-btn remove-btn" title="Remove"><span class="material-symbols-outlined">delete</span></button>`;
  } else {
    // Completed
    html = `<button class="dl-action-btn remove-btn" title="Remove"><span class="material-symbols-outlined">delete</span></button>`;
  }

  actionsContainer.insertAdjacentHTML("beforeend", html);
}

downloadQueueArea.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  const card = e.target.closest(".download-card");

  if (!card) return;

  if (e.target.closest(".dl-card-thumb-container")) {
    if (card.dataset.status === "completed") {
      const videoId = card.dataset.id;
      const libItem = AppState.library.find(v => v.id === videoId);
      if (libItem) {
        const idx = AppState.library.indexOf(libItem);
        eventBus.emit("player:play_request", {
          index: idx,
          queue: AppState.library,
          context: { type: 'home', id: null, name: 'Library' }
        });
      }
    }
    return;
  }

  if (!btn) return;

  const videoId = card.dataset.id;
  const jobId = card.dataset.jobId;

  if (btn.classList.contains("cancel-btn")) {
    if (videoId) {
      window.electronAPI.cancelDownload(videoId);
      downloadJobs.delete(videoId);
    }
    card.remove();
    if (jobId) pendingInfoJobs.delete(jobId);
  }
  else if (btn.classList.contains("retry-btn")) {
    const job = downloadJobs.get(videoId);
    if (job) {
      window.electronAPI.retryDownload(job);
      card.querySelector(".dl-card-stats span").textContent = `Queued for retry...`;
      card.dataset.status = "queued";
      card.querySelector(".log-btn").classList.remove("error");
    }
  }
  else if (btn.classList.contains("remove-btn")) {
    card.remove();
    if (videoId) downloadJobs.delete(videoId);
  }
  else if (btn.classList.contains("log-btn")) {
    const errorData = errorLogs.get(videoId || jobId);
    if (errorData) showErrorLog(errorData);
    else showNotification("No specific log available yet.", "info");
  }

  updateEmptyStates();
});

queueClearBtn.addEventListener("click", async () => {
  const activeTab = document.querySelector(".dl-tab-btn.active").dataset.tab;
  if (activeTab === 'history') {
    await window.electronAPI.historyClear();
    loadHistory();
  } else {
    downloadQueueArea.innerHTML = "";
    updateEmptyStates();
  }
});

function showErrorLog(errorData) {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-content" style="max-width: 650px;">
            <h3 style="display:flex;align-items:center;gap:10px;"><span class="material-symbols-outlined" style="color:var(--negative-accent);">bug_report</span> Download Log</h3>
            <p style="font-weight:bold;">${errorData.error || "Log Details"}</p>
            <div class="log-content">${errorData.fullLog || "No detailed log."}</div>
            <div class="modal-actions">
                <button id="copy-log-btn" class="modal-btn">Copy Log</button>
                <button id="close-log-btn" class="modal-btn">Close</button>
            </div>
        </div>
    `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.remove("hidden"));

  modal.querySelector("#close-log-btn").addEventListener("click", () => {
    modal.classList.add("hidden");
    setTimeout(() => modal.remove(), 300);
  });
  modal.querySelector("#copy-log-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(errorData.fullLog || errorData.error);
    showNotification("Log copied", "info");
  });
}

// IPC Listeners
window.electronAPI.onDownloadQueueStart(({ infos, jobId }) => {
  const placeholder = downloadQueueArea.querySelector(`.download-card[data-job-id="${jobId}"]`);
  if (placeholder) placeholder.remove();
  pendingInfoJobs.delete(jobId);

  infos.forEach(info => {
    if (downloadJobs.has(info.id)) return;

    const card = document.createElement("div");
    card.className = "download-card";
    card.dataset.id = info.id;
    card.dataset.status = "queued";

    const thumb = info.thumbnail || `${AppState.assetsPath}/logo.png`;

    card.innerHTML = `
        <div class="dl-card-thumb-container">
             <img src="${thumb}" class="dl-card-thumb" onerror="this.src='${AppState.assetsPath}/logo.png'">
             <div class="dl-card-thumb-overlay">
                  <div class="spinner"></div>
             </div>
        </div>
        <div class="dl-card-content">
             <div class="dl-card-title">${info.title}</div>
             <div class="dl-card-uploader">${info.uploader || 'Unknown'}</div>
             
             <div class="dl-progress-wrapper">
                 <div class="dl-progress-bar-container"><div class="dl-progress-bar" style="width:0%"></div></div>
                 <div class="dl-card-stats">
                    <span class="status-text">Queued</span>
                    <span class="speed-text"></span>
                 </div>
             </div>

             <div class="dl-card-actions">
                  <button class="dl-action-btn log-btn" title="View Log"><span class="material-symbols-outlined">description</span> Log</button>
             </div>
        </div>
    `;

    downloadQueueArea.prepend(card);
    updateItemActions(card, "queued");

    errorLogs.set(info.id, { error: "Download in progress...", fullLog: "Waiting for output..." });
    downloadJobs.set(info.id, { ...info });
  });
  updateEmptyStates();
});

window.electronAPI.onDownloadProgress((data) => {
  const card = downloadQueueArea.querySelector(`.download-card[data-id="${data.id}"]`);
  if (!card) return;

  if (card.dataset.status !== 'downloading') {
    card.dataset.status = 'downloading';
    updateItemActions(card, 'downloading');
    card.querySelector(".dl-card-thumb-overlay").innerHTML = "";
  }

  card.querySelector(".dl-progress-bar").style.width = `${data.percent}%`;
  const statusSpan = card.querySelector(".status-text");
  statusSpan.textContent = `${data.percent.toFixed(1)}% • ${data.eta || '--:--'}`;
  card.querySelector(".speed-text").textContent = data.currentSpeed;

  if (data.percent >= 100) {
    card.dataset.status = "processing";
    statusSpan.textContent = "Processing...";
    card.querySelector(".speed-text").textContent = "";
  }
});

window.electronAPI.onDownloadComplete((data) => {
  const card = downloadQueueArea.querySelector(`.download-card[data-id="${data.id}"]`);
  if (card) {
    card.dataset.status = "completed";
    card.querySelector(".status-text").textContent = "Completed";
    card.querySelector(".dl-progress-bar").style.width = "100%";
    card.querySelector(".speed-text").textContent = "";

    // Save success log
    errorLogs.set(data.id, { error: "Download successful", fullLog: data.fullLog });

    card.querySelector(".dl-card-thumb-overlay").innerHTML = `<span class="material-symbols-outlined dl-card-play-icon">play_arrow</span>`;
    updateItemActions(card, "completed");
    showNotification("Download Complete", "success", data.videoData.title);
  }
  loadLibrary();
  loadHistory();
});

window.electronAPI.onDownloadError((data) => {
  const card = downloadQueueArea.querySelector(`.download-card[data-id="${data.id}"]`);
  if (card) {
    card.dataset.status = "error";
    card.querySelector(".status-text").textContent = "Error";
    errorLogs.set(data.id, { error: data.error, fullLog: data.fullLog });
    updateItemActions(card, "error");
  }
});

window.electronAPI.onDownloadInfoError(({ jobId, error, fullLog }) => {
  const card = downloadQueueArea.querySelector(`.download-card[data-job-id="${jobId}"]`);
  if (card) {
    card.dataset.status = "error";
    card.querySelector(".dl-card-title").textContent = "Fetch Failed";
    card.querySelector(".dl-card-uploader").textContent = "Check URL";
    card.querySelector(".dl-card-thumb-overlay").innerHTML = `<span class="material-symbols-outlined dl-card-play-icon" style="color:var(--negative-accent)">error</span>`;

    errorLogs.set(jobId, { error, fullLog });
    updateItemActions(card, "info-error");
  }
});

typeOptions.forEach(opt => {
  opt.addEventListener("click", () => {
    currentType = opt.dataset.type;
    updateUIState();
  });
});

urlInput.addEventListener("input", updateUIState);

setupDropdowns();
setupTabs();
loadHistory();
updateUIState();