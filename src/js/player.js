// src/js/player.js
import { AppState, setCurrentlyPlaying } from "./state.js";
import { showPage } from "./renderer.js";
import { activateMiniplayer } from "./miniplayer.js";
import { openAddToPlaylistModal } from "./playlists.js";
import { toggleFavoriteStatus, updateFavoriteStatusInUI } from "./ui.js";
import { showNotification } from "./notifications.js";

// --- DOM Element Selectors ---
const playerPage = document.getElementById("player-page");
const playerSection = document.getElementById("player-section");
const videoPlayer = document.getElementById("video-player");
const subtitleTrack = document.getElementById("subtitle-track");
const audioArtworkContainer = document.querySelector(
  ".audio-artwork-container"
);
const audioArtworkImg = document.getElementById("audio-artwork-img");
const videoDescriptionBox = document.getElementById("video-description-box");
const descriptionContent = document.getElementById("description-content");
const showMoreDescBtn = document.getElementById("show-more-desc-btn");
const videoInfoTitle = document.getElementById("video-info-title");
const channelThumb = document.getElementById("channel-thumb");
const videoInfoUploader = document.getElementById("video-info-uploader");
const videoInfoDate = document.getElementById("video-info-date");
const upNextList = document.getElementById("up-next-list");
const favoriteBtn = document.getElementById("favorite-btn");
const saveToPlaylistBtn = document.getElementById("save-to-playlist-btn");
const theaterBtn = document.getElementById("theater-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const playPauseBtn = document.querySelector(".play-pause-btn");
const nextBtn = document.querySelector(".next-btn");
const prevBtn = document.querySelector(".prev-btn");
const muteBtn = document.querySelector(".mute-btn");
const volumeSlider = document.querySelector(".volume-slider");
const currentTimeEl = document.querySelector(".current-time");
const totalTimeEl = document.querySelector(".total-time");
const timelineContainer = document.querySelector(".timeline-container");
const timelineProgress = document.querySelector(".timeline-progress");
const autoplayToggle = document.getElementById("autoplay-toggle");
const settingsBtn = document.getElementById("settings-btn");
const settingsMenu = document.getElementById("settings-menu");
const speedSubmenu = document.getElementById("speed-submenu");
const sleepSubmenu = document.getElementById("sleep-submenu");
const controlsContainer = document.querySelector(".video-controls-container");
const videoMenuBtn = document.getElementById("video-menu-btn");
const miniplayerBtn = document.getElementById("miniplayer-btn");
const videoContextMenu = document.getElementById("video-item-context-menu");
const miniplayer = document.getElementById("miniplayer");
const miniplayerProgressBar = document.querySelector(
  ".miniplayer-progress-bar"
);

let sleepTimerId = null;
let hideControlsTimeout;

/**
 * Starts playback of a media item from a given library.
 * @param {number} index - The index of the item to play.
 * @param {Array} sourceLibrary - The array of media items to use as the playback queue.
 * @param {object} [options={}] - Playback options.
 */
export function playLibraryItem(index, sourceLibrary, options = {}) {
  if (!sourceLibrary || index < 0 || index >= sourceLibrary.length) return;

  // Update the central state with the new queue and index
  setCurrentlyPlaying(index, sourceLibrary);
  const item = AppState.playbackQueue[AppState.currentlyPlayingIndex];

  subtitleTrack.src = ""; // Clear previous subtitle track

  // Configure UI for audio vs. video
  if (item.type === "audio") {
    playerSection.classList.add("audio-mode");
    audioArtworkImg.src = item.coverPath
      ? decodeURIComponent(item.coverPath)
      : "../assets/logo.png";
    theaterBtn.disabled = true;
    fullscreenBtn.disabled = true;
  } else {
    playerSection.classList.remove("audio-mode");
    audioArtworkImg.src = "";
    theaterBtn.disabled = false;
    fullscreenBtn.disabled = false;
  }

  // Set the video source and handle playback
  const videoSrc = decodeURIComponent(item.filePath);
  videoPlayer.src = videoSrc;

  videoPlayer.addEventListener(
    "loadedmetadata",
    () => {
      const subtitlesEnabled =
        localStorage.getItem("subtitlesEnabled") === "true";
      if (item.hasEmbeddedSubs && videoPlayer.textTracks.length > 0) {
        const track = videoPlayer.textTracks[0];
        if (track) track.mode = subtitlesEnabled ? "showing" : "hidden";
      } else if (item.subtitlePath) {
        subtitleTrack.src = decodeURIComponent(item.subtitlePath);
        subtitleTrack.track.mode = subtitlesEnabled ? "showing" : "hidden";
      } else if (subtitleTrack.track) {
        subtitleTrack.track.mode = "disabled";
      }
    },
    { once: true }
  );

  const playPromise = videoPlayer.play();
  if (playPromise !== undefined) {
    playPromise.catch((error) => {
      if (error.name !== "AbortError") {
        console.error("Playback error:", error);
        showNotification("Error playing media", "error", error.message);
      }
    });
  }

  // Update UI elements
  updateVideoDetails(item);
  renderUpNextList();

  // Handle page navigation/miniplayer state
  if (options.stayInMiniplayer) {
    activateMiniplayer();
  } else {
    if (playerPage.classList.contains("hidden")) {
      showPage("player");
    }
  }
}

/**
 * Updates the player's detailed information section.
 * @param {object | null} item - The media item to display, or null to clear.
 */
export async function updateVideoDetails(item) {
  // <-- FIXED: Added 'async' keyword
  if (!item) {
    videoInfoTitle.textContent = "No media selected";
    videoInfoUploader.textContent = "";
    videoInfoDate.textContent = "";
    channelThumb.src = "";
    videoDescriptionBox.style.display = "none";
    descriptionContent.textContent = "";
    favoriteBtn.classList.remove("is-favorite");
    return;
  }

  videoInfoTitle.textContent = item.title;
  videoInfoUploader.textContent = item.creator || item.uploader;
  channelThumb.src = item.coverPath
    ? decodeURIComponent(item.coverPath)
    : "../assets/logo.png";
  channelThumb.onerror = () => {
    channelThumb.src = "../assets/logo.png";
  };

  videoInfoDate.textContent = item.upload_date
    ? ` • ${new Date(
        item.upload_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
      ).toLocaleDateString()}`
    : "";

  // Dynamically import to avoid circular dependency issues
  const { updateFavoriteStatusInUI } = await import("./ui.js");
  updateFavoriteStatusInUI(item.id, !!item.isFavorite);

  if (item.description && item.description.trim()) {
    videoDescriptionBox.style.display = "block";
    descriptionContent.textContent = item.description;
    // Defer overflow check slightly to ensure correct rendering
    setTimeout(() => {
      const isOverflowing =
        descriptionContent.scrollHeight > descriptionContent.clientHeight;
      showMoreDescBtn.style.display = isOverflowing ? "block" : "none";
    }, 100);
    videoDescriptionBox.classList.remove("expanded");
    showMoreDescBtn.textContent = "Show more";
  } else {
    videoDescriptionBox.style.display = "none";
    descriptionContent.textContent = "";
  }
}

/**
 * Renders the "Up Next" playlist based on the current playback state.
 */
export function renderUpNextList() {
  upNextList.innerHTML = "";
  if (AppState.currentlyPlayingIndex < 0 || AppState.playbackQueue.length <= 1)
    return;

  const fragment = document.createDocumentFragment();
  for (let i = 1; i < AppState.playbackQueue.length; i++) {
    const itemIndex =
      (AppState.currentlyPlayingIndex + i) % AppState.playbackQueue.length;
    const video = AppState.playbackQueue[itemIndex];
    const li = document.createElement("li");
    li.className = "up-next-item";
    li.dataset.id = video.id;
    const uploaderText = video.creator || video.uploader || "Unknown";
    li.innerHTML = `<img src="${
      video.coverPath
        ? decodeURIComponent(video.coverPath)
        : "../assets/logo.png"
    }" class="thumbnail" alt="thumbnail" onerror="this.onerror=null;this.src='../assets/logo.png';"><div class="item-info"><p class="item-title">${
      video.title
    }</p><p class="item-uploader">${uploaderText}</p></div>`;
    fragment.appendChild(li);
  }
  upNextList.appendChild(fragment);
}

/**
 * Toggles the playback state of the video player.
 */
export function togglePlay() {
  if (!videoPlayer.src || videoPlayer.src === window.location.href) return;
  videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
}

/**
 * Formats seconds into a MM:SS or HH:MM:SS string.
 * @param {number} seconds - The time in seconds.
 * @returns {string} The formatted time string.
 */
export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const result = new Date(seconds * 1000).toISOString().slice(11, 19);
  return seconds < 3600 ? result.substring(3) : result;
}

/**
 * Plays the next item in the playback queue.
 */
export function playNext() {
  if (AppState.playbackQueue.length > 1) {
    const nextIndex =
      (AppState.currentlyPlayingIndex + 1) % AppState.playbackQueue.length;
    playLibraryItem(nextIndex, AppState.playbackQueue);
  }
}

/**
 * Plays the previous item in the playback queue.
 */
export function playPrevious() {
  if (AppState.playbackQueue.length > 1) {
    const prevIndex =
      (AppState.currentlyPlayingIndex - 1 + AppState.playbackQueue.length) %
      AppState.playbackQueue.length;
    playLibraryItem(prevIndex, AppState.playbackQueue);
  }
}

/**
 * Updates the volume of the video player.
 * @param {number} newVolume - The new volume level (0.0 to 1.0).
 */
function updateVolume(newVolume) {
  videoPlayer.volume = Math.max(0, Math.min(1, newVolume));
  videoPlayer.muted = videoPlayer.volume === 0;
}

/**
 * Updates the volume slider and mute button icon.
 * @param {number} [volume=videoPlayer.volume] - The current volume.
 * @param {boolean} [muted=videoPlayer.muted] - The current muted state.
 */
export function updateVolumeUI(
  volume = videoPlayer.volume,
  muted = videoPlayer.muted
) {
  volumeSlider.value = muted ? 0 : volume;
  volumeSlider.style.setProperty(
    "--volume-progress",
    `${(muted ? 0 : volume) * 100}%`
  );
  const icon = muteBtn.querySelector("i");
  if (muted || volume === 0) {
    icon.className = "fa-solid fa-volume-xmark";
  } else if (volume < 0.5) {
    icon.className = "fa-solid fa-volume-low";
  } else {
    icon.className = "fa-solid fa-volume-high";
  }
}

/**
 * Handles building the main settings menu.
 */
function buildSettingsMenu() {
  const hasSubtitles =
    (videoPlayer.textTracks.length > 0 && videoPlayer.textTracks[0].cues) ||
    (subtitleTrack.track.src && subtitleTrack.track.src.startsWith("file"));
  let isSubtitlesOn = false;
  if (hasSubtitles) {
    isSubtitlesOn =
      (videoPlayer.textTracks.length > 0 &&
        videoPlayer.textTracks[0].mode === "showing") ||
      subtitleTrack.track.mode === "showing";
  }

  settingsMenu.innerHTML = `
        <div class="settings-item ${
          !hasSubtitles ? "disabled" : ""
        }" data-setting="subtitles">
            <i class="fa-solid fa-closed-captioning"></i>
            <span>Subtitles</span>
            <span class="setting-value" id="subtitles-value">${
              isSubtitlesOn ? "On" : "Off"
            }</span>
        </div>
        <div class="settings-item" data-setting="speed">
            <i class="fa-solid fa-gauge-high"></i>
            <span>Playback Speed</span>
            <span class="setting-value" id="speed-value">${
              videoPlayer.playbackRate === 1
                ? "Normal"
                : videoPlayer.playbackRate + "x"
            }</span>
            <span class="chevron"><i class="fa-solid fa-chevron-right"></i></span>
        </div>
        <div class="settings-item" data-setting="sleep">
            <i class="fa-solid fa-moon"></i>
            <span>Sleep Timer</span>
            <span class="setting-value" id="sleep-value">Off</span>
            <span class="chevron"><i class="fa-solid fa-chevron-right"></i></span>
        </div>`;
}

/**
 * Handles the logic for a settings submenu.
 * @param {string} mainSel - The selector for the main menu item.
 * @param {HTMLElement} subMenuEl - The submenu element.
 * @param {Array<number|string>} values - The possible values for the setting.
 * @param {string} type - The type of setting (e.g., 'speed', 'minutes').
 * @param {Function} labelFormatter - A function to format the value for display.
 */
function handleSubmenu(mainSel, subMenuEl, values, type, labelFormatter) {
  const mainItem = settingsMenu.querySelector(mainSel);
  if (!mainItem) return;

  mainItem.addEventListener("click", (e) => {
    e.stopPropagation();
    if (mainItem.classList.contains("disabled")) return;

    settingsMenu.classList.remove("active");
    const currentVal = type === "speed" ? videoPlayer.playbackRate : null;

    subMenuEl.innerHTML = `
            <div class="submenu-item" data-action="back">
                <span class="chevron"><i class="fa-solid fa-chevron-left"></i></span>
                <span>${
                  mainItem.querySelector("span:nth-child(2)").textContent
                }</span>
            </div>
            ${values
              .map(
                (v) => `
                <div class="submenu-item ${
                  v == currentVal ? "active" : ""
                }" data-${type}="${v}">
                    <span class="check"><i class="fa-solid fa-check"></i></span>
                    <span>${labelFormatter(v)}</span>
                </div>`
              )
              .join("")}`;
    subMenuEl.classList.add("active");
  });
}

// --- Event Listeners ---
videoPlayer.addEventListener("play", () => {
  playerSection.classList.remove("paused");
  playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
});

videoPlayer.addEventListener("pause", () => {
  playerSection.classList.add("paused");
  playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
});

videoPlayer.addEventListener("ended", async () => {
  if (autoplayToggle.checked) {
    playNext();
  } else if (!miniplayer.classList.contains("hidden")) {
    const { closeMiniplayer } = await import("./miniplayer.js");
    closeMiniplayer();
  }
});

videoPlayer.addEventListener("timeupdate", () => {
  currentTimeEl.textContent = formatTime(videoPlayer.currentTime);
  const progress = (videoPlayer.currentTime / videoPlayer.duration) * 100 || 0;
  timelineProgress.style.width = `${progress}%`;
  if (!miniplayer.classList.contains("hidden")) {
    miniplayerProgressBar.style.width = `${progress}%`;
  }
});

videoPlayer.addEventListener("loadedmetadata", () => {
  totalTimeEl.textContent = formatTime(videoPlayer.duration);
});

videoPlayer.addEventListener("volumechange", () => {
  updateVolumeUI();
  localStorage.setItem("playerVolume", videoPlayer.volume);
  localStorage.setItem("playerMuted", videoPlayer.muted);
});

playerSection.addEventListener("click", (e) => {
  if (
    e.target === playerSection ||
    e.target === videoPlayer ||
    e.target === audioArtworkContainer ||
    e.target === audioArtworkImg
  ) {
    togglePlay();
  }
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
  if (!videoPlayer.duration) return;
  const rect = timelineContainer.getBoundingClientRect();
  videoPlayer.currentTime =
    ((e.clientX - rect.left) / rect.width) * videoPlayer.duration;
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

miniplayerBtn.addEventListener("click", () => {
  if (videoPlayer.src) {
    activateMiniplayer();
    showPage("home");
  }
});

autoplayToggle.addEventListener("change", (e) => {
  localStorage.setItem("autoplayEnabled", e.target.checked);
});

document.addEventListener("fullscreenchange", () => {
  const isFullscreen = !!document.fullscreenElement;
  playerPage.classList.toggle("fullscreen-mode", isFullscreen);
  fullscreenBtn.innerHTML = `<i class="fa-solid ${
    isFullscreen ? "fa-compress" : "fa-expand"
  }"></i>`;
});

videoMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const currentVideo = AppState.playbackQueue[AppState.currentlyPlayingIndex];
  if (!currentVideo) return;
  const rect = videoMenuBtn.getBoundingClientRect();
  videoContextMenu.style.left = `${
    rect.left - videoContextMenu.offsetWidth + rect.width
  }px`;
  videoContextMenu.style.top = `${rect.bottom + 5}px`;
  videoContextMenu.dataset.videoId = currentVideo.id;
  videoContextMenu.classList.add("visible");
});

settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isActive = settingsMenu.classList.contains("active");
  settingsMenu.classList.remove("active");
  speedSubmenu.classList.remove("active");
  sleepSubmenu.classList.remove("active");
  if (!isActive) {
    buildSettingsMenu(); // Rebuild menu to get current state
    settingsMenu.classList.add("active");
  }
});

settingsMenu.addEventListener("click", (e) => {
  const item = e.target.closest(".settings-item");
  if (!item) return;

  if (
    item.dataset.setting === "subtitles" &&
    !item.classList.contains("disabled")
  ) {
    const isCurrentlyOn =
      (videoPlayer.textTracks.length > 0 &&
        videoPlayer.textTracks[0].mode === "showing") ||
      subtitleTrack.track.mode === "showing";
    const newMode = isCurrentlyOn ? "hidden" : "showing";

    if (videoPlayer.textTracks.length > 0) {
      for (const track of videoPlayer.textTracks) {
        track.mode = newMode;
      }
    }
    if (subtitleTrack.track.src) {
      subtitleTrack.track.mode = newMode;
    }

    settingsMenu.querySelector("#subtitles-value").textContent =
      newMode === "showing" ? "On" : "Off";
    localStorage.setItem("subtitlesEnabled", newMode === "showing");
    settingsMenu.classList.remove("active");
  } else if (
    item.dataset.setting === "speed" ||
    item.dataset.setting === "sleep"
  ) {
    handleSubmenu(
      `[data-setting="speed"]`,
      speedSubmenu,
      [0.5, 0.75, 1, 1.5, 2],
      "speed",
      (v) => (v === 1 ? "Normal" : v + "x")
    );
    handleSubmenu(
      `[data-setting="sleep"]`,
      sleepSubmenu,
      [0, 15, 30, 60, 120],
      "minutes",
      (v) => (v === 0 ? "Off" : `${v} minutes`)
    );
    // Trigger the click again to open the submenu
    item.click();
  }
});

speedSubmenu.addEventListener("click", (e) => {
  e.stopPropagation();
  const target = e.target.closest(".submenu-item");
  if (!target) return;
  if (target.dataset.action === "back") {
    speedSubmenu.classList.remove("active");
    settingsMenu.classList.add("active");
    return;
  }
  const value = parseFloat(target.dataset.speed);
  videoPlayer.playbackRate = value;
  settingsMenu.querySelector("#speed-value").textContent =
    value === 1 ? "Normal" : `${value}x`;
  speedSubmenu.classList.remove("active");
});

sleepSubmenu.addEventListener("click", (e) => {
  e.stopPropagation();
  const target = e.target.closest(".submenu-item");
  if (!target) return;
  if (target.dataset.action === "back") {
    sleepSubmenu.classList.remove("active");
    settingsMenu.classList.add("active");
    return;
  }
  const value = parseFloat(target.dataset.minutes);
  clearTimeout(sleepTimerId);
  if (value > 0) {
    sleepTimerId = setTimeout(() => {
      videoPlayer.pause();
      showNotification(`Sleep timer ended. Playback paused.`, "info");
      settingsMenu.querySelector("#sleep-value").textContent = "Off";
    }, value * 60 * 1000);
    showNotification(`Sleep timer set for ${value} minutes.`, "info");
  } else {
    showNotification(`Sleep timer cleared.`, "info");
  }
  settingsMenu.querySelector("#sleep-value").textContent =
    value === 0 ? "Off" : `${value} min`;
  sleepSubmenu.classList.remove("active");
});

document.addEventListener("click", (e) => {
  if (
    !settingsBtn.contains(e.target) &&
    !settingsMenu.contains(e.target) &&
    !speedSubmenu.contains(e.target) &&
    !sleepSubmenu.contains(e.target)
  ) {
    settingsMenu.classList.remove("active");
    speedSubmenu.classList.remove("active");
    sleepSubmenu.classList.remove("active");
  }
});

playerSection.addEventListener("mousemove", () => {
  controlsContainer.style.opacity = 1;
  playerSection.style.cursor = "default";
  clearTimeout(hideControlsTimeout);
  if (!videoPlayer.paused)
    hideControlsTimeout = setTimeout(() => {
      if (
        !settingsMenu.classList.contains("active") &&
        !speedSubmenu.classList.contains("active") &&
        !sleepSubmenu.classList.contains("active")
      ) {
        controlsContainer.style.opacity = 0;
        playerSection.style.cursor = "none";
      }
    }, 3000);
});

playerSection.addEventListener("mouseleave", () => {
  if (!videoPlayer.paused) {
    clearTimeout(hideControlsTimeout);
    hideControlsTimeout = setTimeout(() => {
      controlsContainer.style.opacity = 0;
      playerSection.style.cursor = "none";
    }, 500);
  }
});

document.addEventListener("keydown", (e) => {
  const isPlayerActive =
    !playerPage.classList.contains("hidden") ||
    !miniplayer.classList.contains("hidden");
  if (
    document.activeElement.tagName.toLowerCase() === "input" ||
    document.querySelector(".modal-overlay:not(.hidden)")
  ) {
    return;
  }
  if (!isPlayerActive) return;

  e.preventDefault();
  switch (e.key.toLowerCase()) {
    case "k":
    case " ":
      togglePlay();
      break;
    case "m":
      videoPlayer.muted = !videoPlayer.muted;
      break;
    case "f":
      if (
        miniplayer.classList.contains("hidden") &&
        !playerSection.classList.contains("audio-mode")
      ) {
        fullscreenBtn.click();
      }
      break;
    case "t":
      if (
        miniplayer.classList.contains("hidden") &&
        !playerSection.classList.contains("audio-mode")
      ) {
        theaterBtn.click();
      }
      break;
    case "i":
      if (videoPlayer.src && videoPlayer.src !== window.location.href) {
        if (miniplayer.classList.contains("hidden")) {
          activateMiniplayer();
          showPage("home");
        } else {
          showPage("player");
        }
      }
      break;
    case "arrowleft":
      if (videoPlayer.duration) videoPlayer.currentTime -= 5;
      break;
    case "arrowright":
      if (videoPlayer.duration) videoPlayer.currentTime += 5;
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

// Event listener for expanding the description box
videoDescriptionBox.addEventListener("click", () => {
  videoDescriptionBox.classList.toggle("expanded");
  const isExpanded = videoDescriptionBox.classList.contains("expanded");
  showMoreDescBtn.textContent = isExpanded ? "Show less" : "Show more";
});

// Event listener for clicks on the up next list
upNextList.addEventListener("click", (e) => {
  const itemEl = e.target.closest(".up-next-item");
  if (itemEl) {
    playLibraryItem(
      AppState.playbackQueue.findIndex((v) => v.id === itemEl.dataset.id),
      AppState.playbackQueue
    );
  }
});

// Event listener for the favorite button in the main player
favoriteBtn.addEventListener("click", () => {
  if (AppState.currentlyPlayingIndex === -1) return;
  const videoId = AppState.playbackQueue[AppState.currentlyPlayingIndex].id;
  toggleFavoriteStatus(videoId);
});

// Event listener for the save to playlist button in the main player
saveToPlaylistBtn.addEventListener("click", () => {
  if (AppState.currentlyPlayingIndex === -1) return;
  const videoId = AppState.playbackQueue[AppState.currentlyPlayingIndex].id;
  openAddToPlaylistModal(videoId);
});
