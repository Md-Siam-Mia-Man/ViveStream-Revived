// renderer.js
const sidebar = document.querySelector(".sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const logoHomeButton = document.getElementById("logo-home-button");
let currentLibrary = [];
let currentlyPlayingIndex = -1;
let sleepTimerId = null;

const sidebarNav = document.querySelector(".sidebar-nav");
const pages = document.querySelectorAll(".page");
const downloadForm = document.getElementById("download-form");
const urlInput = document.getElementById("url-input");
const statusText = document.getElementById("status-text");
const progressBar = document.getElementById("progress-bar");
const homeSearchInput = document.getElementById("home-search-input");
const videoGrid = document.getElementById("video-grid");
const upNextList = document.getElementById("up-next-list");
const qualitySelectContainer = document.getElementById(
  "quality-select-container"
);
const playerPage = document.getElementById("player-page");
const playerSection = document.getElementById("player-section");
const videoPlayer = document.getElementById("video-player");
const subtitleTrack = document.getElementById("subtitle-track");
const playPauseBtn = document.querySelector(".play-pause-btn");
const prevBtn = document.querySelector(".prev-btn");
const nextBtn = document.querySelector(".next-btn");
const muteBtn = document.querySelector(".mute-btn");
const volumeSlider = document.querySelector(".volume-slider");
const currentTimeEl = document.querySelector(".current-time");
const totalTimeEl = document.querySelector(".total-time");
const timelineContainer = document.querySelector(".timeline-container");
const timelineProgress = document.querySelector(".timeline-progress");
const theaterBtn = document.getElementById("theater-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const miniplayerBtn = document.getElementById("miniplayer-btn");
const autoplayToggle = document.getElementById("autoplay-toggle");
const settingsBtn = document.getElementById("settings-btn");
const settingsMenu = document.getElementById("settings-menu");
const speedSubmenu = document.getElementById("speed-submenu");
const sleepSubmenu = document.getElementById("sleep-submenu");
const controlsContainer = document.querySelector(".video-controls-container");
const videoInfoTitle = document.getElementById("video-info-title");
const channelThumb = document.getElementById("channel-thumb");
const channelThumbFallback = document.getElementById("channel-thumb-fallback");
const videoInfoUploader = document.getElementById("video-info-uploader");
const videoInfoDate = document.getElementById("video-info-date");

function showPage(pageId) {
  pages.forEach((page) =>
    page.classList.toggle("hidden", page.id !== `${pageId}-page`)
  );
  document
    .querySelectorAll(".nav-item")
    .forEach((item) =>
      item.classList.toggle("active", item.dataset.page === pageId)
    );
  if (pageId !== "player") {
    videoPlayer.pause();
  }
}

sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
  localStorage.setItem(
    "sidebarCollapsed",
    sidebar.classList.contains("collapsed")
  );
});

logoHomeButton.addEventListener("click", (e) => {
  e.preventDefault();
  showPage("home");
});
sidebarNav.addEventListener("click", (e) => {
  const navItem = e.target.closest(".nav-item");
  if (navItem) showPage(navItem.dataset.page);
});
downloadForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const selectedQuality =
    qualitySelectContainer.querySelector(".selected-option").dataset.value;
  const options = {
    url: urlInput.value,
    type: document.querySelector('input[name="download-type"]:checked').value,
    quality: selectedQuality,
  };
  if (options.url) {
    window.electronAPI.downloadVideo(options);
    statusText.innerText = "Requesting video info...";
    progressBar.style.width = "0%";
  }
});
window.electronAPI.onDownloadProgress((progress) => {
  const p =
    progress.playlistCount > 1
      ? `(${progress.playlistIndex}/${progress.playlistCount}) `
      : "";
  statusText.innerText = `Downloading: ${p}${progress.percent.toFixed(1)}%`;
  progressBar.style.width = `${progress.percent}%`;
});
window.electronAPI.onDownloadComplete((newData) => {
  statusText.innerText = `Download Complete: ${newData.title}`;
  progressBar.style.width = "100%";
  if (!newData.isPlaylist) {
    urlInput.value = "";
  }
  loadLibrary();
});
window.electronAPI.onDownloadError((error) => {
  statusText.innerText = `Error: ${error}`;
  progressBar.style.width = "0%";
});

// --- Custom Dropdown Logic ---
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

// --- Player Logic ---

function togglePlay() {
  videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
}
function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const result = new Date(seconds * 1000).toISOString().slice(11, 19);
  return seconds < 3600 ? result.substring(3) : result;
}
function playNext() {
  if (currentLibrary.length > 0)
    playLibraryItem((currentlyPlayingIndex + 1) % currentLibrary.length);
}
function playPrevious() {
  if (currentLibrary.length > 0)
    playLibraryItem(
      (currentlyPlayingIndex - 1 + currentLibrary.length) %
        currentLibrary.length
    );
}
function updateVolume(newVolume) {
  videoPlayer.volume = Math.max(0, Math.min(1, newVolume));
  videoPlayer.muted = videoPlayer.volume === 0;
}
function updateVolumeUI(
  volume = videoPlayer.volume,
  muted = videoPlayer.muted
) {
  volumeSlider.value = muted ? 0 : volume;
  volumeSlider.style.setProperty(
    "--volume-progress",
    `${(muted ? 0 : volume) * 100}%`
  );
  muteBtn.innerHTML = `<i class="fas ${
    muted || volume === 0 ? "fa-volume-xmark" : "fa-volume-high"
  }"></i>`;
}

// --- Event Listeners ---

playerSection.addEventListener("click", (e) => {
  if (e.target === playerSection || e.target === videoPlayer) {
    togglePlay();
  }
});

videoPlayer.addEventListener("play", () => {
  playerSection.classList.remove("paused");
  playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
});
videoPlayer.addEventListener("pause", () => {
  playerSection.classList.add("paused");
  playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
});
videoPlayer.addEventListener("ended", () => {
  if (autoplayToggle.checked) playNext();
});
videoPlayer.addEventListener("timeupdate", () => {
  currentTimeEl.textContent = formatTime(videoPlayer.currentTime);
  timelineProgress.style.width = `${
    (videoPlayer.currentTime / videoPlayer.duration) * 100
  }%`;
});
videoPlayer.addEventListener(
  "loadeddata",
  () => (totalTimeEl.textContent = formatTime(videoPlayer.duration))
);
videoPlayer.addEventListener("volumechange", () => {
  updateVolumeUI();
  localStorage.setItem("playerVolume", videoPlayer.volume);
  localStorage.setItem("playerMuted", videoPlayer.muted);
});

playPauseBtn.addEventListener("click", togglePlay);
nextBtn.addEventListener("click", playNext);
prevBtn.addEventListener("click", playPrevious);
muteBtn.addEventListener("click", () => {
  videoPlayer.muted = !videoPlayer.muted;
});
volumeSlider.addEventListener("input", (e) => {
  updateVolume(parseFloat(e.target.value));
});
timelineContainer.addEventListener("click", (e) => {
  const rect = timelineContainer.getBoundingClientRect();
  videoPlayer.currentTime =
    ((e.x - rect.x) / rect.width) * videoPlayer.duration;
});
theaterBtn.addEventListener("click", () => {
  playerPage.classList.toggle("theater-mode");
  localStorage.setItem(
    "theaterMode",
    playerPage.classList.contains("theater-mode")
  );
});
fullscreenBtn.addEventListener("click", () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    playerSection.requestFullscreen();
  }
});
miniplayerBtn.addEventListener("click", () =>
  videoPlayer.requestPictureInPicture().catch((e) => console.error(e))
);
autoplayToggle.addEventListener("change", (e) => {
  localStorage.setItem("autoplayEnabled", e.target.checked);
});
document.addEventListener("fullscreenchange", () => {
  fullscreenBtn.innerHTML = `<i class="fas ${
    document.fullscreenElement ? "fa-compress" : "fa-expand"
  }"></i>`;
  playerPage.classList.toggle("fullscreen-mode", !!document.fullscreenElement);
});

function buildSettingsMenu() {
  settingsMenu.innerHTML = `
        <div class="settings-item" data-setting="subtitles"><i class="fas fa-closed-captioning"></i><span>Subtitles</span><span class="setting-value" id="subtitles-value">Off</span><i class="fas fa-chevron-right"></i></div>
        <div class="settings-item" data-setting="speed"><i class="fas fa-gauge-high"></i><span>Playback Speed</span><span class="setting-value" id="speed-value">Normal</span><i class="fas fa-chevron-right"></i></div>
        <div class="settings-item" data-setting="sleep"><i class="fas fa-moon"></i><span>Sleep Timer</span><span class="setting-value" id="sleep-value">Off</span><i class="fas fa-chevron-right"></i></div>`;

  const subtitlesItem = document.querySelector('[data-setting="subtitles"]');
  const subtitlesValue = document.getElementById("subtitles-value");

  // Update subtitles display based on current state
  if (subtitleTrack.track.mode === "showing") {
    subtitlesValue.textContent = "On";
  } else {
    subtitlesValue.textContent = "Off";
  }

  subtitlesItem.addEventListener("click", () => {
    if (subtitleTrack.src) {
      const isShowing = subtitleTrack.track.mode === "showing";
      subtitleTrack.track.mode = isShowing ? "hidden" : "showing";
      subtitlesValue.textContent = isShowing ? "Off" : "On";
      localStorage.setItem("subtitlesEnabled", !isShowing);
    }
  });

  handleSubmenu(
    '[data-setting="speed"]',
    speedSubmenu,
    [0.5, 0.75, 1, 1.5, 2],
    "speed",
    (val) => `${val === 1 ? "Normal" : val + "x"}`
  );
  handleSubmenu(
    '[data-setting="sleep"]',
    sleepSubmenu,
    [0, 15, 30, 60, 120],
    "minutes",
    (val) => (val === 0 ? "Off" : `${val} minutes`)
  );
}
function handleSubmenu(mainSel, subMenuEl, values, type, labelFormatter) {
  const mainItem = document.querySelector(mainSel);
  if (!mainItem) return;

  mainItem.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsMenu.classList.remove("active");

    const currentVal = type === "speed" ? videoPlayer.playbackRate : 0;
    const itemsHTML = values
      .map(
        (val) =>
          `<div class="submenu-item ${
            val === currentVal ? "active" : ""
          }" data-${type}="${val}"><i class="fas fa-check"></i><span>${labelFormatter(
            val
          )}</span></div>`
      )
      .join("");

    subMenuEl.innerHTML =
      `<div class="submenu-item" data-action="back"><i class="fas fa-chevron-left"></i><span>${
        mainItem.querySelector("span").textContent
      }</span></div>` + itemsHTML;
    subMenuEl.classList.add("active");
  });

  subMenuEl.addEventListener("click", (e) => {
    e.stopPropagation();
    const target = e.target.closest(".submenu-item");
    if (!target) return;

    if (target.dataset.action === "back") {
      subMenuEl.classList.remove("active");
      settingsMenu.classList.add("active");
      return;
    }

    subMenuEl
      .querySelectorAll(".active")
      .forEach((el) => el.classList.remove("active"));
    target.classList.add("active");

    subMenuEl.classList.remove("active");
    settingsMenu.classList.remove("active");

    const value = target.dataset[type];
    mainItem.querySelector(".setting-value").textContent = labelFormatter(
      parseFloat(value)
    );

    if (type === "speed") {
      videoPlayer.playbackRate = parseFloat(value);
    }
    if (type === "minutes") {
      clearTimeout(sleepTimerId);
      if (value > 0)
        sleepTimerId = setTimeout(() => videoPlayer.pause(), value * 60 * 1000);
    }
  });
}

settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isActive = settingsMenu.classList.contains("active");
  // Close all menus first
  settingsMenu.classList.remove("active");
  speedSubmenu.classList.remove("active");
  sleepSubmenu.classList.remove("active");

  if (!isActive) {
    buildSettingsMenu();
    settingsMenu.classList.add("active");
  }
});

document.addEventListener("click", (e) => {
  if (!settingsBtn.contains(e.target) && !settingsMenu.contains(e.target)) {
    settingsMenu.classList.remove("active");
    speedSubmenu.classList.remove("active");
    sleepSubmenu.classList.remove("active");
  }
});
settingsMenu.addEventListener("click", (e) => e.stopPropagation());
speedSubmenu.addEventListener("click", (e) => e.stopPropagation());
sleepSubmenu.addEventListener("click", (e) => e.stopPropagation());

let hideControlsTimeout;
playerSection.addEventListener("mousemove", () => {
  controlsContainer.style.opacity = 1;
  clearTimeout(hideControlsTimeout);
  if (!videoPlayer.paused)
    hideControlsTimeout = setTimeout(() => {
      controlsContainer.style.opacity = 0;
    }, 3000);
});
playerSection.addEventListener("mouseleave", () => {
  if (!videoPlayer.paused)
    hideControlsTimeout = setTimeout(() => {
      controlsContainer.style.opacity = 0;
    }, 500);
});
document.addEventListener("keydown", (e) => {
  if (document.getElementById("player-page").classList.contains("hidden"))
    return;
  const tagName = document.activeElement.tagName.toLowerCase();
  if (tagName === "input") return;
  switch (e.key.toLowerCase()) {
    case " ":
    case "k":
      e.preventDefault();
      togglePlay();
      break;
    case "m":
      videoPlayer.muted = !videoPlayer.muted;
      break;
    case "f":
      fullscreenBtn.click();
      break;
    case "t":
      theaterBtn.click();
      break;
    case "i":
      miniplayerBtn.click();
      break;
    case "arrowleft":
      videoPlayer.currentTime -= 5;
      break;
    case "arrowright":
      videoPlayer.currentTime += 5;
      break;
    case "arrowup":
      updateVolume(videoPlayer.volume + 0.1);
      break;
    case "arrowdown":
      updateVolume(videoPlayer.volume - 0.1);
      break;
    case "n":
      playNext();
      break;
    case "p":
      playPrevious();
      break;
  }
});

// --- Library and Page Rendering ---

function updateVideoDetails(item) {
  if (!item) return;
  videoInfoTitle.textContent = item.title;
  videoInfoUploader.textContent = item.uploader;

  if (item.channelThumbPath) {
    channelThumb.src = item.channelThumbPath;
    channelThumb.style.display = "block";
    channelThumbFallback.style.display = "none";
  } else {
    channelThumb.style.display = "none";
    channelThumbFallback.style.display = "flex";
    channelThumbFallback.textContent = (item.uploader || "U")
      .charAt(0)
      .toUpperCase();
  }

  videoInfoDate.textContent = item.upload_date
    ? ` • ${new Date(
        item.upload_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
      ).toLocaleDateString()}`
    : "";
}

function playLibraryItem(index) {
  if (index < 0 || index >= currentLibrary.length) return;
  const item = currentLibrary[index];
  currentlyPlayingIndex = index;

  if (item.type === "video" || item.type === "audio") {
    videoPlayer.src = item.filePath;

    const subtitlesEnabled =
      localStorage.getItem("subtitlesEnabled") === "true";
    subtitleTrack.src = item.subtitlePath || "";
    if (item.subtitlePath && subtitlesEnabled) {
      setTimeout(() => {
        subtitleTrack.track.mode = "showing";
      }, 100);
    } else {
      setTimeout(() => {
        subtitleTrack.track.mode = item.subtitlePath ? "hidden" : "disabled";
      }, 100);
    }

    videoPlayer.play();
  }
  updateVideoDetails(item);
  renderUpNextList();
  showPage("player");
}

function renderUpNextList() {
  upNextList.innerHTML = "";
  const displayList = currentLibrary.filter(
    (_, i) => i !== currentlyPlayingIndex
  );

  displayList.forEach((video) => {
    const li = document.createElement("li");
    li.className = "up-next-item";
    li.dataset.id = video.id;
    li.innerHTML = `<img src="${
      video.coverPath
    }" class="thumbnail" alt="thumbnail"><div class="item-info"><p class="item-title">${
      video.title
    }</p><p class="item-uploader">${
      video.uploader || "Unknown Uploader"
    }</p></div>`;
    upNextList.appendChild(li);
  });
}

function renderHomePageGrid(library = currentLibrary) {
  videoGrid.innerHTML = "";
  if (library.length === 0) {
    videoGrid.innerHTML = `<p class="empty-message">${
      currentLibrary.length === 0
        ? "Your library is empty. Go to the Downloads page to get started."
        : "No videos match your search."
    }</p>`;
    return;
  }
  library.forEach((item) => {
    const div = document.createElement("div");
    div.className = "video-grid-item";
    div.dataset.id = item.id;
    div.innerHTML = `
            <div class="grid-thumbnail-container">
                <img src="${
                  item.coverPath
                }" class="grid-thumbnail" alt="thumbnail">
                <span class="thumbnail-duration">${formatTime(
                  item.duration || 0
                )}</span>
            </div>
            <div class="grid-item-details">
                <div class="grid-item-info">
                    <p class="grid-item-title">${item.title}</p>
                    <p class="grid-item-meta">${item.uploader || "Unknown"}</p>
                    <p class="grid-item-meta">${
                      item.view_count
                        ? item.view_count.toLocaleString() + " views"
                        : ""
                    }</p>
                </div>
            </div>`;
    videoGrid.appendChild(div);
  });
}

videoGrid.addEventListener("click", (e) => {
  const itemEl = e.target.closest(".video-grid-item");
  if (itemEl)
    playLibraryItem(
      currentLibrary.findIndex((v) => v.id === itemEl.dataset.id)
    );
});
upNextList.addEventListener("click", (e) => {
  const itemEl = e.target.closest(".up-next-item");
  if (itemEl)
    playLibraryItem(
      currentLibrary.findIndex((v) => v.id === itemEl.dataset.id)
    );
});

homeSearchInput.addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const filteredLibrary = currentLibrary.filter(
    (video) =>
      video.title.toLowerCase().includes(searchTerm) ||
      (video.uploader && video.uploader.toLowerCase().includes(searchTerm))
  );
  renderHomePageGrid(filteredLibrary);
});

// --- App Initialization ---

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

async function loadLibrary() {
  currentLibrary = await window.electronAPI.getLibrary();
  shuffleArray(currentLibrary);
  renderHomePageGrid();
}

function loadSettings() {
  const savedVolume = localStorage.getItem("playerVolume");
  const savedMuted = localStorage.getItem("playerMuted") === "true";
  const savedTheater = localStorage.getItem("theaterMode") === "true";
  const savedAutoplay = localStorage.getItem("autoplayEnabled");
  const savedSidebar = localStorage.getItem("sidebarCollapsed") === "true";

  videoPlayer.muted = savedMuted;
  if (savedVolume !== null && !savedMuted) {
    videoPlayer.volume = parseFloat(savedVolume);
  }
  updateVolumeUI(videoPlayer.volume, videoPlayer.muted);

  if (savedTheater) {
    playerPage.classList.add("theater-mode");
  }

  if (savedAutoplay !== null) {
    autoplayToggle.checked = savedAutoplay === "true";
  } else {
    autoplayToggle.checked = true; // Default to on
  }

  if (savedSidebar) {
    sidebar.classList.add("collapsed");
  }
}

showPage("home");
loadLibrary();
loadSettings();
