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
const videoPlayerPreload = document.getElementById("video-player-preload");
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

// --- Player State ---
let activePlayer = videoPlayer;
let preloadPlayer = videoPlayerPreload;
let sleepTimerId = null;
let hideControlsTimeout;

// --- Preloading Logic ---
/**
 * Silently loads the next item in the playback queue into the hidden video element.
 */
function preloadNextItem() {
  const queue = AppState.playbackQueue;
  if (
    queue.length > 1 &&
    autoplayToggle.checked &&
    AppState.currentlyPlayingIndex > -1
  ) {
    const nextIndex = (AppState.currentlyPlayingIndex + 1) % queue.length;
    const nextItem = queue[nextIndex];
    preloadPlayer.src = decodeURIComponent(nextItem.filePath);
  }
}

/**
 * Handles the transition when a track ends.
 */
function handleTrackEnd() {
  if (autoplayToggle.checked) {
    playNext();
  } else {
    // If autoplay is off, simply update the UI to a paused state.
    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
  }
}

// --- Core Player Functions ---

/**
 * Starts playback of a media item from a given library.
 * @param {number} index - The index of the item to play.
 * @param {Array} sourceLibrary - The array of media items to use as the playback queue.
 * @param {object} [options={}] - Playback options like { stayInMiniplayer: true }.
 */
export function playLibraryItem(index, sourceLibrary, options = {}) {
  if (!sourceLibrary || index < 0 || index >= sourceLibrary.length) return;

  setCurrentlyPlaying(index, sourceLibrary);
  const item = AppState.playbackQueue[AppState.currentlyPlayingIndex];

  // Determine which player is active and which is for preloading
  // This logic simplifies the swap: we always load into the main player.
  // The browser cache and preloading `src` makes this fast.
  activePlayer = videoPlayer;
  preloadPlayer = videoPlayerPreload;

  activePlayer.src = decodeURIComponent(item.filePath);
  subtitleTrack.src = "";

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

  const playPromise = activePlayer.play();
  if (playPromise) {
    playPromise.catch((e) => {
      if (e.name !== "AbortError") console.error("Playback error:", e);
    });
  }

  updateVideoDetails(item);
  renderUpNextList();
  preloadNextItem();

  if (options.stayInMiniplayer) {
    activateMiniplayer();
  } else if (playerPage.classList.contains("hidden")) {
    showPage("player");
  }
}

/**
 * Updates the player's detailed information section based on the current media item.
 * @param {object | null} item - The media item to display, or null to clear the UI.
 */
export async function updateVideoDetails(item) {
  if (!item) {
    videoInfoTitle.textContent = "No media selected";
    videoInfoUploader.textContent = "";
    videoInfoDate.textContent = "";
    channelThumb.src = "";
    videoDescriptionBox.style.display = "none";
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

  const { updateFavoriteStatusInUI } = await import("./ui.js");
  updateFavoriteStatusInUI(item.id, !!item.isFavorite);

  if (item.description && item.description.trim()) {
    videoDescriptionBox.style.display = "block";
    descriptionContent.textContent = item.description;
    setTimeout(() => {
      const isOverflowing =
        descriptionContent.scrollHeight > descriptionContent.clientHeight;
      showMoreDescBtn.style.display = isOverflowing ? "block" : "none";
    }, 100);
    videoDescriptionBox.classList.remove("expanded");
    showMoreDescBtn.textContent = "Show more";
  } else {
    videoDescriptionBox.style.display = "none";
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
    li.innerHTML = `<img src="${
      video.coverPath
        ? decodeURIComponent(video.coverPath)
        : "../assets/logo.png"
    }" class="thumbnail" alt="thumbnail" onerror="this.onerror=null;this.src='../assets/logo.png';"><div class="item-info"><p class="item-title">${
      video.title
    }</p><p class="item-uploader">${
      video.creator || video.uploader || "Unknown"
    }</p></div>`;
    fragment.appendChild(li);
  }
  upNextList.appendChild(fragment);
}

// --- Player Controls & Utilities ---
export function togglePlay() {
  if (activePlayer.src)
    activePlayer.paused ? activePlayer.play() : activePlayer.pause();
}
export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const result = new Date(seconds * 1000).toISOString().slice(11, 19);
  return seconds < 3600 ? result.substring(3) : result;
}
export function playNext() {
  if (AppState.playbackQueue.length > 0) {
    const nextIndex =
      (AppState.currentlyPlayingIndex + 1) % AppState.playbackQueue.length;
    playLibraryItem(nextIndex, AppState.playbackQueue);
  }
}
export function playPrevious() {
  if (AppState.playbackQueue.length > 0) {
    const prevIndex =
      (AppState.currentlyPlayingIndex - 1 + AppState.playbackQueue.length) %
      AppState.playbackQueue.length;
    playLibraryItem(prevIndex, AppState.playbackQueue);
  }
}
function updateVolume(newVolume) {
  const vol = Math.max(0, Math.min(1, newVolume));
  activePlayer.volume = vol;
  preloadPlayer.volume = vol;
  activePlayer.muted = vol === 0;
  preloadPlayer.muted = vol === 0;
}
export function updateVolumeUI() {
  const vol = activePlayer.volume;
  const muted = activePlayer.muted;
  volumeSlider.value = muted ? 0 : vol;
  volumeSlider.style.setProperty(
    "--volume-progress",
    `${(muted ? 0 : vol) * 100}%`
  );
  const icon = muteBtn.querySelector("i");
  if (muted || vol === 0) icon.className = "fa-solid fa-volume-xmark";
  else if (vol < 0.5) icon.className = "fa-solid fa-volume-low";
  else icon.className = "fa-solid fa-volume-high";
}

export function loadSettings() {
  const savedVolume = localStorage.getItem("playerVolume");
  const savedMuted = localStorage.getItem("playerMuted") === "true";
  const savedTheater = localStorage.getItem("theaterMode") === "true";
  const savedAutoplay = localStorage.getItem("autoplayEnabled");

  activePlayer.muted = savedMuted;
  preloadPlayer.muted = savedMuted;
  if (savedVolume !== null && !savedMuted) {
    const vol = parseFloat(savedVolume);
    activePlayer.volume = vol;
    preloadPlayer.volume = vol;
  }
  updateVolumeUI();

  if (savedTheater) playerPage.classList.add("theater-mode");
  autoplayToggle.checked = savedAutoplay !== "false";
  activePlayer.disablePictureInPicture = true;
  preloadPlayer.disablePictureInPicture = true;
}

// --- Settings Menu Logic ---
function buildSettingsMenu() {
  const hasSubtitles =
    (activePlayer.textTracks.length > 0 && activePlayer.textTracks[0].cues) ||
    (subtitleTrack.track.src && subtitleTrack.track.src.startsWith("file"));
  let isSubtitlesOn =
    hasSubtitles &&
    ((activePlayer.textTracks.length > 0 &&
      activePlayer.textTracks[0].mode === "showing") ||
      subtitleTrack.track.mode === "showing");

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
        <div class="settings-item" data-setting="speed"><i class="fa-solid fa-gauge-high"></i><span>Playback Speed</span><span class="setting-value" id="speed-value">${
          activePlayer.playbackRate === 1
            ? "Normal"
            : activePlayer.playbackRate + "x"
        }</span><span class="chevron"><i class="fa-solid fa-chevron-right"></i></span></div>
        <div class="settings-item" data-setting="sleep"><i class="fa-solid fa-moon"></i><span>Sleep Timer</span><span class="setting-value" id="sleep-value">${
          sleepTimerId
            ? settingsMenu.querySelector("#sleep-value")?.textContent || "On"
            : "Off"
        }</span><span class="chevron"><i class="fa-solid fa-chevron-right"></i></span></div>`;
}

function handleSubmenu(mainSel, subMenuEl, values, type, labelFormatter) {
  const mainItem = settingsMenu.querySelector(mainSel);
  if (!mainItem) return;

  const openSubmenu = () => {
    if (mainItem.classList.contains("disabled")) return;
    settingsMenu.classList.remove("active");
    const currentVal = type === "speed" ? activePlayer.playbackRate : null;
    subMenuEl.innerHTML = `
            <div class="submenu-item" data-action="back">
                <span class="chevron"><i class="fa-solid fa-chevron-left"></i></span>
                <span>${
                  mainItem.querySelector("span:nth-child(2)").textContent
                }</span>
            </div>
            ${values
              .map(
                (v) =>
                  `<div class="submenu-item ${
                    v == currentVal ? "active" : ""
                  }" data-${type}="${v}"><span class="check"><i class="fa-solid fa-check"></i></span><span>${labelFormatter(
                    v
                  )}</span></div>`
              )
              .join("")}`;
    subMenuEl.classList.add("active");
  };

  mainItem.addEventListener("click", (e) => {
    e.stopPropagation();
    openSubmenu();
  });
}

// --- Event Listeners ---
[videoPlayer, videoPlayerPreload].forEach((player) => {
  player.addEventListener("play", () => {
    playerSection.classList.remove("paused");
    playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
  });
  player.addEventListener("pause", () => {
    playerSection.classList.add("paused");
    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
  });
  player.addEventListener("ended", handleTrackEnd);
  player.addEventListener("timeupdate", () => {
    if (player === activePlayer) {
      currentTimeEl.textContent = formatTime(activePlayer.currentTime);
      const progress =
        (activePlayer.currentTime / activePlayer.duration) * 100 || 0;
      timelineProgress.style.width = `${progress}%`;
      if (!miniplayer.classList.contains("hidden"))
        miniplayerProgressBar.style.width = `${progress}%`;
    }
  });
  player.addEventListener("loadedmetadata", () => {
    if (player === activePlayer)
      totalTimeEl.textContent = formatTime(activePlayer.duration);
  });
  player.addEventListener("volumechange", () => {
    if (player === activePlayer) updateVolumeUI();
  });
});

playerSection.addEventListener("click", (e) => {
  if (
    e.target.matches(
      ".player-section, #video-player, .audio-artwork-container, #audio-artwork-img"
    )
  )
    togglePlay();
});
playPauseBtn.addEventListener("click", togglePlay);
nextBtn.addEventListener("click", playNext);
prevBtn.addEventListener("click", playPrevious);
muteBtn.addEventListener("click", () => {
  const muted = !activePlayer.muted;
  activePlayer.muted = muted;
  preloadPlayer.muted = muted;
});
volumeSlider.addEventListener("input", (e) => {
  updateVolume(parseFloat(e.target.value));
});
timelineContainer.addEventListener("click", (e) => {
  if (!activePlayer.duration) return;
  const rect = timelineContainer.getBoundingClientRect();
  activePlayer.currentTime =
    ((e.clientX - rect.left) / rect.width) * activePlayer.duration;
});
theaterBtn.addEventListener("click", () => {
  playerPage.classList.toggle("theater-mode");
  localStorage.setItem(
    "theaterMode",
    playerPage.classList.contains("theater-mode")
  );
});
fullscreenBtn.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else playerSection.requestFullscreen();
});
miniplayerBtn.addEventListener("click", () => {
  if (activePlayer.src) {
    activateMiniplayer();
    showPage("home");
  }
});
autoplayToggle.addEventListener("change", (e) => {
  localStorage.setItem("autoplayEnabled", e.target.checked);
  if (e.target.checked) preloadNextItem();
});
document.addEventListener("fullscreenchange", () => {
  const isFullscreen = !!document.fullscreenElement;
  playerPage.classList.toggle("fullscreen-mode", isFullscreen);
  fullscreenBtn.innerHTML = `<i class="fa-solid ${
    isFullscreen ? "fa-compress" : "fa-expand"
  }"></i>`;
});
videoDescriptionBox.addEventListener("click", () => {
  videoDescriptionBox.classList.toggle("expanded");
  showMoreDescBtn.textContent = videoDescriptionBox.classList.contains(
    "expanded"
  )
    ? "Show less"
    : "Show more";
});
upNextList.addEventListener("click", (e) => {
  const itemEl = e.target.closest(".up-next-item");
  if (itemEl)
    playLibraryItem(
      AppState.playbackQueue.findIndex((v) => v.id === itemEl.dataset.id),
      AppState.playbackQueue
    );
});
favoriteBtn.addEventListener("click", () => {
  if (AppState.currentlyPlayingIndex > -1)
    toggleFavoriteStatus(
      AppState.playbackQueue[AppState.currentlyPlayingIndex].id
    );
});
saveToPlaylistBtn.addEventListener("click", () => {
  if (AppState.currentlyPlayingIndex > -1)
    openAddToPlaylistModal(
      AppState.playbackQueue[AppState.currentlyPlayingIndex].id
    );
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
playerSection.addEventListener("mousemove", () => {
  controlsContainer.style.opacity = 1;
  playerSection.style.cursor = "default";
  clearTimeout(hideControlsTimeout);
  if (!activePlayer.paused)
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
  if (!activePlayer.paused) {
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
  )
    return;
  if (!isPlayerActive) return;
  e.preventDefault();
  switch (e.key.toLowerCase()) {
    case "k":
    case " ":
      togglePlay();
      break;
    case "m":
      activePlayer.muted = !activePlayer.muted;
      preloadPlayer.muted = activePlayer.muted;
      break;
    case "f":
      if (
        miniplayer.classList.contains("hidden") &&
        !playerSection.classList.contains("audio-mode")
      )
        fullscreenBtn.click();
      break;
    case "t":
      if (
        miniplayer.classList.contains("hidden") &&
        !playerSection.classList.contains("audio-mode")
      )
        theaterBtn.click();
      break;
    case "i":
      if (activePlayer.src) {
        if (miniplayer.classList.contains("hidden")) {
          activateMiniplayer();
          showPage("home");
        } else {
          showPage("player");
        }
      }
      break;
    case "arrowleft":
      if (activePlayer.duration) activePlayer.currentTime -= 5;
      break;
    case "arrowright":
      if (activePlayer.duration) activePlayer.currentTime += 5;
      break;
    case "arrowup":
      updateVolume(activePlayer.volume + 0.1);
      break;
    case "arrowdown":
      updateVolume(activePlayer.volume - 0.1);
      break;
    case "n":
      playNext();
      break;
    case "p":
      playPrevious();
      break;
  }
});
settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isActive = settingsMenu.classList.contains("active");
  settingsMenu.classList.remove("active");
  speedSubmenu.classList.remove("active");
  sleepSubmenu.classList.remove("active");
  if (!isActive) {
    buildSettingsMenu();
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
      (activePlayer.textTracks.length > 0 &&
        activePlayer.textTracks[0].mode === "showing") ||
      subtitleTrack.track.mode === "showing";
    const newMode = isCurrentlyOn ? "hidden" : "showing";
    if (activePlayer.textTracks.length > 0) {
      for (const track of activePlayer.textTracks) track.mode = newMode;
    }
    if (subtitleTrack.track.src) subtitleTrack.track.mode = newMode;
    settingsMenu.querySelector("#subtitles-value").textContent =
      newMode === "showing" ? "On" : "Off";
    localStorage.setItem("subtitlesEnabled", newMode === "showing");
    settingsMenu.classList.remove("active");
  } else if (item.dataset.setting === "speed") {
    handleSubmenu(
      `[data-setting="speed"]`,
      speedSubmenu,
      [0.5, 0.75, 1, 1.5, 2],
      "speed",
      (v) => (v === 1 ? "Normal" : v + "x")
    );
    item.click();
  } else if (item.dataset.setting === "sleep") {
    handleSubmenu(
      `[data-setting="sleep"]`,
      sleepSubmenu,
      [0, 15, 30, 60, 120],
      "minutes",
      (v) => (v === 0 ? "Off" : `${v} minutes`)
    );
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
  activePlayer.playbackRate = value;
  preloadPlayer.playbackRate = value;
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
      activePlayer.pause();
      showNotification(`Sleep timer ended. Playback paused.`, "info");
      settingsMenu.querySelector("#sleep-value").textContent = "Off";
      sleepTimerId = null;
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
