import { AppState, setCurrentlyPlaying } from "./state.js";
import { showPage } from "./renderer.js";
import { activateMiniplayer } from "./miniplayer.js";
import { openAddToPlaylistModal } from "./playlists.js";
import { toggleFavoriteStatus, applyFilters } from "./ui.js";
import { showNotification } from "./notifications.js";
import { eventBus } from "./event-bus.js";
import { formatTime, fuzzySearch } from "./utils.js";

// ... (Constants omitted for brevity, they remain same as original file) ...
// Ensure you keep the DOM Element selections at the top when you merge

const playerPage = document.getElementById("player-page");
const playerSection = document.getElementById("player-section");
const videoPlayer = document.getElementById("video-player");
const videoPlayerPreload = document.getElementById("video-player-preload");
const audioArtworkImg = document.getElementById("audio-artwork-img");
const videoDescriptionBox = document.getElementById("video-description-box");
const descriptionContent = document.getElementById("description-content");
const showMoreDescBtn = document.getElementById("show-more-desc-btn");
const videoInfoTitle = document.getElementById("video-info-title");
const channelThumb = document.getElementById("channel-thumb");
const videoInfoUploader = document.getElementById("video-info-uploader");
const videoInfoDate = document.getElementById("video-info-date");
const upNextContainer = document.getElementById("up-next-container");
const upNextList = document.getElementById("up-next-list");
const upNextHeaderText = document.getElementById("up-next-header-text");
const favoriteBtn = document.getElementById("favorite-btn");
const addToPlaylistBtn = document.getElementById("add-to-playlist-btn");
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
const subtitleSubmenu = document.getElementById("subtitle-submenu");
const subtitleStyleSubmenu = document.getElementById("subtitle-style-submenu");
const subtitleSyncSubmenu = document.getElementById("subtitle-sync-submenu");
const controlsContainer = document.querySelector(".video-controls-container");
const videoMenuBtn = document.getElementById("video-menu-btn");
const miniplayerBtn = document.getElementById("miniplayer-btn");
const videoContextMenu = document.getElementById("video-item-context-menu");
const miniplayer = document.getElementById("miniplayer");
const editableTitleInput = document.getElementById("editable-title-input");
const editableCreatorInput = document.getElementById("editable-creator-input");
const editableDescriptionTextarea = document.getElementById(
  "editable-description-textarea"
);
const saveEditBtn = document.getElementById("save-edit-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const mainContent = playerPage.querySelector(".main-content");
const playerFeedback = document.getElementById("player-feedback");

let hideControlsTimeout;
let feedbackTimeout;

const playerState = {
  subtitleMode: "off",
  subtitleOffset: 0,
  subtitleStyles: {
    font: 'Poppins',
    size: '1.25rem',
    color: '#ffffff',
    bg: 'rgba(0,0,0,0.7)',
    pos: '0%'
  }
};

// ... (SleepTimerManager class remains same) ...
class SleepTimerManager {
  constructor() {
    this.id = null;
    this.type = null;
    this.value = 0;
    this.remaining = 0;
    this.statusEl = document.getElementById("sleep-timer-status");
    this.statusTextEl = document.getElementById("sleep-timer-status-text");
    this.onTrackChange = this.onTrackChange.bind(this);
  }

  start(type, value) {
    this.stop();
    this.type = type;
    this.value = parseInt(value, 10);
    this.remaining = this.value;

    if (this.type === "minutes") {
      this.remaining *= 60;
      this.id = setInterval(() => this.update(), 1000);
    } else if (this.type === "tracks") {
      eventBus.on("playback:trackchange", this.onTrackChange);
    } else if (this.type === "time") {
      const [hours, minutes] = value.split(":").map(Number);
      const now = new Date();
      const endTime = new Date();
      endTime.setHours(hours, minutes, 0, 0);
      if (endTime < now) endTime.setDate(endTime.getDate() + 1);
      this.remaining = Math.round((endTime - now) / 1000);
      this.id = setInterval(() => this.update(), 1000);
    }
    this.updateDisplay();
    this.statusEl.classList.remove("hidden");
    showNotification(`Sleep timer set.`, "info");
  }

  stop() {
    clearInterval(this.id);
    eventBus.off("playback:trackchange", this.onTrackChange);
    this.id = null;
    this.type = null;
    this.statusEl.classList.add("hidden");
  }

  onTrackChange() {
    this.remaining--;
    this.updateDisplay();
    if (this.remaining <= 0) this.trigger();
  }

  update() {
    this.remaining--;
    this.updateDisplay();
    if (this.remaining <= 0) this.trigger();
  }

  trigger() {
    videoPlayer.pause();
    showNotification(`Sleep timer ended. Playback paused.`, "info");
    this.stop();
  }

  updateDisplay() {
    if (this.type === "tracks") {
      this.statusTextEl.textContent = `${this.remaining} track${this.remaining > 1 ? "s" : ""
        } left`;
    } else {
      this.statusTextEl.textContent = formatTime(this.remaining);
    }
  }

  clear() {
    if (this.id || this.type) {
      this.stop();
      showNotification(`Sleep timer cleared.`, "info");
    }
  }
}

const sleepTimer = new SleepTimerManager();

const lazyLoadObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        observer.unobserve(img);
      }
    });
  },
  { root: mainContent, rootMargin: "0px 0px 200px 0px" }
);

function showPlayerFeedback(iconName, text) {
  if (!playerFeedback) return;
  clearTimeout(feedbackTimeout);
  playerFeedback.classList.remove("visible");
  void playerFeedback.offsetWidth;
  const iconEl = playerFeedback.querySelector(".material-symbols-outlined");
  const textEl = playerFeedback.querySelector(".feedback-text");
  iconEl.textContent = iconName;
  textEl.textContent = text;
  playerFeedback.classList.add("visible");
  feedbackTimeout = setTimeout(() => {
    playerFeedback.classList.remove("visible");
  }, 1000);
}

function applySubtitleStyles() {
  const s = playerState.subtitleStyles;
  videoPlayer.style.setProperty('--subtitle-font', s.font);
  videoPlayer.style.setProperty('--subtitle-size', s.size);
  videoPlayer.style.setProperty('--subtitle-color', s.color);
  videoPlayer.style.setProperty('--subtitle-bg', s.bg);
  videoPlayer.style.setProperty('--subtitle-pos', s.pos);
  localStorage.setItem("subtitleStyles", JSON.stringify(s));
}

function syncSubtitleOffset(offsetDelta) {
  playerState.subtitleOffset += offsetDelta;
  const track = Array.from(videoPlayer.textTracks).find(t => t.mode !== 'disabled');
  if (track && track.cues) {
    Array.from(track.cues).forEach(cue => {
      cue.startTime += offsetDelta;
      cue.endTime += offsetDelta;
    });
    showPlayerFeedback("timer", `Sync: ${playerState.subtitleOffset.toFixed(1)}s`);
  }
}

function loadSubtitleTrack(filePath, mode = 'hidden') {
  const oldTracks = videoPlayer.querySelectorAll('track');
  oldTracks.forEach(t => t.remove());
  if (filePath) {
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = 'English';
    track.srclang = 'en';
    track.src = filePath;
    track.default = mode === 'showing';
    videoPlayer.appendChild(track);
    track.onload = () => {
      const textTrack = track.track;
      textTrack.mode = mode;
    };
  }
}

function toggleSubtitleMode(forceState = null) {
  if (forceState) {
    playerState.subtitleMode = forceState;
  } else {
    playerState.subtitleMode = playerState.subtitleMode === "on" ? "off" : "on";
  }
  const track = Array.from(videoPlayer.textTracks).find(t => t.kind === 'subtitles');
  if (track) {
    track.mode = playerState.subtitleMode === "on" ? "showing" : "hidden";
  }
  localStorage.setItem("subtitleMode", playerState.subtitleMode);
}

function preloadNextItem() {
  const queue = AppState.playbackQueue;
  if (
    queue.length > 1 &&
    autoplayToggle.checked &&
    AppState.currentlyPlayingIndex > -1
  ) {
    const nextIndex = (AppState.currentlyPlayingIndex + 1) % queue.length;
    const nextItem = queue[nextIndex];
    videoPlayerPreload.src = decodeURIComponent(nextItem.filePath);
  }
}

function handleTrackEnd() {
  if (autoplayToggle.checked) {
    playNext();
  } else {
    playPauseBtn.querySelector("span").textContent = "play_arrow";
    eventBus.emit("playback:pause");
  }
}

function playLibraryItem({ index, queue, context = null, options = {} }) {
  if (!queue || index < 0 || index >= queue.length) return;

  setCurrentlyPlaying(index, queue, context);
  const item = AppState.playbackQueue[AppState.currentlyPlayingIndex];

  videoPlayer.src = decodeURIComponent(item.filePath);

  playerState.subtitleOffset = 0;
  if (item.subtitlePath) {
    const savedMode = localStorage.getItem("subtitleMode") || "off";
    playerState.subtitleMode = savedMode;
    loadSubtitleTrack(decodeURIComponent(item.subtitlePath), savedMode === 'on' ? 'showing' : 'hidden');
  } else {
    loadSubtitleTrack(null);
  }

  if (item.type === "audio") {
    playerSection.classList.add("audio-mode");
    audioArtworkImg.src = item.coverPath
      ? decodeURIComponent(item.coverPath)
      : `${AppState.assetsPath}/logo.png`;
    theaterBtn.disabled = true;
    fullscreenBtn.disabled = true;
  } else {
    playerSection.classList.remove("audio-mode");
    audioArtworkImg.src = "";
    theaterBtn.disabled = false;
    fullscreenBtn.disabled = false;
  }

  const playPromise = videoPlayer.play();
  if (playPromise) {
    playPromise.catch((e) => {
      if (e.name !== "AbortError") console.error("Playback error:", e);
    });
  }

  updateVideoDetails(item);
  renderUpNextList();
  preloadNextItem();
  eventBus.emit("playback:trackchange", item);

  if (options.stayInMiniplayer) {
    activateMiniplayer();
  } else if (playerPage.classList.contains("hidden")) {
    showPage("player");
  }

  if (options.startInEditMode) {
    enterEditMode();
  }
}

export function updateVideoDetails(item) {
  const placeholderSrc = `${AppState.assetsPath}/logo.png`;

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
    : placeholderSrc;
  channelThumb.onerror = () => {
    channelThumb.src = placeholderSrc;
  };
  videoInfoDate.textContent = item.upload_date
    ? ` • ${new Date(
      item.upload_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
    ).toLocaleDateString()}`
    : "";

  eventBus.emit("ui:favorite_toggled", item.id, !!item.isFavorite);

  if (item.description?.trim()) {
    videoDescriptionBox.style.display = "block";
    descriptionContent.textContent = item.description;
    setTimeout(() => {
      showMoreDescBtn.style.display =
        descriptionContent.scrollHeight > descriptionContent.clientHeight &&
          !playerPage.classList.contains("edit-mode")
          ? "block"
          : "none";
    }, 100);
    videoDescriptionBox.classList.remove("expanded");
    showMoreDescBtn.textContent = "Show more";
  } else {
    videoDescriptionBox.style.display = "none";
  }
}

function createUpNextItem(video, isPlaying) {
  const placeholderSrc = `${AppState.assetsPath}/logo.png`;
  const li = document.createElement("li");
  li.className = "up-next-item";
  li.classList.toggle("is-playing", isPlaying);
  li.dataset.id = video.id;
  const actualSrc = video.coverPath
    ? decodeURIComponent(video.coverPath)
    : placeholderSrc;

  // ADDED decoding="async"
  li.innerHTML = `
      <img data-src="${actualSrc}" src="${placeholderSrc}" class="thumbnail lazy" alt="thumbnail" decoding="async" onerror="this.onerror=null;this.src='${placeholderSrc}';">
      <div class="item-info">
        <p class="item-title">${video.title}</p>
        <p class="item-uploader">${video.creator || video.uploader}</p>
      </div>`;
  return li;
}

function sortQueueForDisplay(queue, sortKey) {
  if (!sortKey) return queue;
  const [key, direction] = sortKey.split("-");
  return [...queue].sort((a, b) => {
    let valA = a[key];
    let valB = b[key];
    if (valA === undefined || valA === null) valA = "";
    if (valB === undefined || valB === null) valB = "";
    if (key === "title") {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }
    if (valA < valB) return direction === "asc" ? -1 : 1;
    if (valA > valB) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

export function renderUpNextList({ searchTerm = "", sortKey = "" } = {}) {
  upNextList.innerHTML = "";

  if (
    AppState.currentlyPlayingIndex < 0 ||
    AppState.playbackQueue.length === 0
  ) {
    upNextContainer.classList.add("hidden");
    return;
  }

  upNextContainer.classList.remove("hidden");

  const context = AppState.playbackContext;
  let displayQueue = [...AppState.playbackQueue];
  const currentlyPlayingId = displayQueue[AppState.currentlyPlayingIndex]?.id;

  displayQueue = applyFilters(displayQueue);

  if (searchTerm.trim()) {
    displayQueue = fuzzySearch(searchTerm, displayQueue, ["title", "creator"]);
  }

  if (sortKey) {
    displayQueue = sortQueueForDisplay(displayQueue, sortKey);
  }

  if (context && context.name) {
    const icon = {
      playlist: "playlist_play",
      artist: "artist",
      favorites: "favorite",
    }[context.type];
    upNextHeaderText.innerHTML = `<span class="material-symbols-outlined">${icon || "list"
      }</span> ${context.name}`;
  } else {
    upNextHeaderText.innerHTML = "Up Next";
  }

  if (displayQueue.length === 0) {
    upNextList.innerHTML = `<li style="padding:15px;text-align:center;color:var(--secondary-text)">No tracks match filters</li>`;
  }

  displayQueue.forEach((video) => {
    const isPlaying = video.id === currentlyPlayingId;
    const itemEl = createUpNextItem(video, isPlaying);
    upNextList.appendChild(itemEl);
  });

  const allLazyImages = upNextList.querySelectorAll(".thumbnail.lazy");
  allLazyImages.forEach((img) => lazyLoadObserver.observe(img));
}

// ... (Rest of logic: togglePlay, playNext, playPrevious, updateVolume, listeners) ...
// Preserved exactly from before, no changes needed for this task.

function togglePlay() {
  if (videoPlayer.src) {
    if (videoPlayer.paused) {
      videoPlayer.play();
      showPlayerFeedback("play_arrow", "Play");
    } else {
      videoPlayer.pause();
      showPlayerFeedback("pause", "Pause");
    }
  }
}

function playNext() {
  if (AppState.playbackQueue.length > 0) {
    const nextIndex =
      (AppState.currentlyPlayingIndex + 1) % AppState.playbackQueue.length;
    playLibraryItem({
      index: nextIndex,
      queue: AppState.playbackQueue,
      context: AppState.playbackContext,
    });
  }
}

function playPrevious() {
  if (AppState.playbackQueue.length > 0) {
    const prevIndex =
      (AppState.currentlyPlayingIndex - 1 + AppState.playbackQueue.length) %
      AppState.playbackQueue.length;
    playLibraryItem({
      index: prevIndex,
      queue: AppState.playbackQueue,
      context: AppState.playbackContext,
    });
  }
}

function updateVolume(newVolume) {
  const vol = Math.max(0, Math.min(1, newVolume));
  if (vol > 0) {
    localStorage.setItem("playerVolume", vol);
  }
  videoPlayer.volume = vol;
  videoPlayerPreload.volume = vol;
  videoPlayer.muted = vol === 0;
  videoPlayerPreload.muted = vol === 0;
  localStorage.setItem("playerMuted", vol === 0);
}

export function updateVolumeUI() {
  const vol = videoPlayer.volume;
  const muted = videoPlayer.muted;
  volumeSlider.value = muted ? 0 : vol;
  volumeSlider.style.setProperty(
    "--volume-progress",
    `${(muted ? 0 : vol) * 100}%`
  );
  const icon = muteBtn.querySelector("span");
  if (muted || vol === 0) icon.textContent = "volume_off";
  else if (vol < 0.5) icon.textContent = "volume_down";
  else icon.textContent = "volume_up";
}

export function loadSettings() {
  const savedVolume = localStorage.getItem("playerVolume");
  const savedMuted = localStorage.getItem("playerMuted") === "true";
  const savedTheater = localStorage.getItem("theaterMode") === "true";
  const savedAutoplay = localStorage.getItem("autoplayEnabled");
  const savedSubs = localStorage.getItem("subtitleStyles");

  if (savedSubs) {
    try {
      const styles = JSON.parse(savedSubs);
      playerState.subtitleStyles = { ...playerState.subtitleStyles, ...styles };
      applySubtitleStyles();
    } catch (e) { }
  }

  videoPlayer.muted = savedMuted;
  videoPlayerPreload.muted = savedMuted;
  if (savedVolume !== null && !savedMuted) {
    const vol = parseFloat(savedVolume);
    videoPlayer.volume = vol;
    videoPlayerPreload.volume = vol;
  }
  updateVolumeUI();

  if (savedTheater) playerPage.classList.add("theater-mode");
  autoplayToggle.checked = savedAutoplay !== "false";
  videoPlayer.disablePictureInPicture = true;
  videoPlayerPreload.disablePictureInPicture = true;
}

function buildSettingsMenu() {
  settingsMenu.innerHTML = `
        <div class="settings-item" data-setting="speed"><span class="material-symbols-outlined">speed</span><span>Playback Speed</span><span class="setting-value" id="speed-value">${videoPlayer.playbackRate === 1 ? "Normal" : videoPlayer.playbackRate + "x"}</span><span class="chevron material-symbols-outlined">arrow_forward_ios</span></div>
        <div class="settings-item" data-setting="subtitles"><span class="material-symbols-outlined">subtitles</span><span>Subtitles</span><span class="setting-value">${playerState.subtitleMode === 'on' ? 'On' : 'Off'}</span><span class="chevron material-symbols-outlined">arrow_forward_ios</span></div>
        <div class="settings-item" data-setting="sleep"><span class="material-symbols-outlined">bedtime</span><span>Sleep Timer</span><span class="setting-value" id="sleep-value">${sleepTimer.type ? "On" : "Off"}</span><span class="chevron material-symbols-outlined">arrow_forward_ios</span></div>`;
}

function handleSubmenu(mainSel, subMenuEl, values, type, labelFormatter) {
  const mainItem = settingsMenu.querySelector(mainSel);
  if (!mainItem || mainItem.classList.contains("disabled")) return;

  const openSubmenu = () => {
    settingsMenu.classList.remove("active");
    const currentVal = type === "speed" ? videoPlayer.playbackRate : null;
    subMenuEl.innerHTML = `
      <div class="submenu-item" data-action="back">
          <span class="chevron material-symbols-outlined">arrow_back_ios</span>
          <span>${mainItem.querySelector("span:nth-child(2)").textContent
      }</span>
      </div>
      ${values
        .map(
          (v) =>
            `<div class="submenu-item ${v == currentVal ? "active" : ""
            }" data-${type}="${v}"><span class="check material-symbols-outlined">done</span><span>${labelFormatter(
              v
            )}</span></div>`
        )
        .join("")}`;
    subMenuEl.classList.add("active");
  };
  mainItem.addEventListener("click", openSubmenu);
}

function createCustomDropdownHTML(id, options, currentValue) {
  const selectedOption = options.find(o => o.value === currentValue) || options[0];
  const optionsHTML = options.map(opt => `
        <div class="player-dropdown-item ${opt.value === currentValue ? 'selected' : ''}" 
             data-value="${opt.value}">
             ${opt.label}
        </div>
    `).join('');

  return `
        <div class="player-dropdown" id="${id}">
            <span class="selected-text">${selectedOption.label}</span>
            <span class="material-symbols-outlined">expand_more</span>
            <div class="player-dropdown-list">${optionsHTML}</div>
        </div>
    `;
}

export function enterEditMode() {
  const item = AppState.playbackQueue[AppState.currentlyPlayingIndex];
  if (!item) return;

  playerPage.classList.add("edit-mode");
  videoDescriptionBox.classList.add("expanded");
  showMoreDescBtn.style.display = "none";
  editableTitleInput.value = item.title;
  editableCreatorInput.value = item.creator || item.uploader || "";
  editableDescriptionTextarea.value = item.description || "";
  editableTitleInput.focus();
}

function exitEditMode() {
  playerPage.classList.remove("edit-mode");
  const item = AppState.playbackQueue[AppState.currentlyPlayingIndex];
  if (item) {
    updateVideoDetails(item);
  }
}

async function saveMetadataChanges() {
  const item = AppState.playbackQueue[AppState.currentlyPlayingIndex];
  if (!item) return;

  const updatedData = {
    title: editableTitleInput.value.trim(),
    creator: editableCreatorInput.value.trim(),
    description: editableDescriptionTextarea.value.trim(),
  };

  const result = await window.electronAPI.videoUpdateMetadata(
    item.id,
    updatedData
  );

  if (result.success) {
    showNotification("Metadata updated successfully.", "success");
    Object.assign(item, updatedData);
    const libraryItem = AppState.library.find((v) => v.id === item.id);
    if (libraryItem) Object.assign(libraryItem, updatedData);

    updateVideoDetails(item);
    exitEditMode();
  } else {
    showNotification(`Error: ${result.error}`, "error");
  }
}

[videoPlayer, videoPlayerPreload].forEach((player) => {
  player.addEventListener("play", () => {
    playerSection.classList.remove("paused");
    playPauseBtn.querySelector("span").textContent = "pause";
    if (player === videoPlayer) eventBus.emit("playback:play");
  });
  player.addEventListener("pause", () => {
    playerSection.classList.add("paused");
    playPauseBtn.querySelector("span").textContent = "play_arrow";
    if (player === videoPlayer) eventBus.emit("playback:pause");
  });
  player.addEventListener("ended", handleTrackEnd);
  player.addEventListener("timeupdate", () => {
    if (player === videoPlayer) {
      const { currentTime, duration } = videoPlayer;
      currentTimeEl.textContent = formatTime(currentTime);
      const progress = (currentTime / duration) * 100 || 0;
      timelineProgress.style.width = `${progress}%`;
      eventBus.emit("playback:timeupdate", progress);
    }
  });
  player.addEventListener("loadedmetadata", () => {
    if (player === videoPlayer)
      totalTimeEl.textContent = formatTime(videoPlayer.duration);
  });
  player.addEventListener("volumechange", () => {
    if (player === videoPlayer) updateVolumeUI();
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
  const lastVolume = parseFloat(localStorage.getItem("playerVolume")) || 1;
  const isCurrentlyMuted = videoPlayer.muted || videoPlayer.volume === 0;

  if (isCurrentlyMuted) {
    updateVolume(lastVolume);
    showPlayerFeedback("volume_up", Math.round(lastVolume * 100) + "%");
  } else {
    updateVolume(0);
    showPlayerFeedback("volume_off", "Muted");
  }
});
volumeSlider.addEventListener("input", (e) =>
  updateVolume(parseFloat(e.target.value))
);
timelineContainer.addEventListener("click", (e) => {
  if (!videoPlayer.duration) return;
  const rect = timelineContainer.getBoundingClientRect();
  const time = ((e.clientX - rect.left) / rect.width) * videoPlayer.duration;
  videoPlayer.currentTime = time;
  showPlayerFeedback("schedule", formatTime(time));
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
    showPlayerFeedback("fullscreen_exit", "Exit Fullscreen");
  } else {
    playerSection.requestFullscreen();
    showPlayerFeedback("fullscreen", "Fullscreen");
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
  if (e.target.checked) preloadNextItem();
});
document.addEventListener("fullscreenchange", () => {
  const isFullscreen = !!document.fullscreenElement;
  playerPage.classList.toggle("fullscreen-mode", isFullscreen);
  fullscreenBtn.querySelector("span").textContent = isFullscreen
    ? "fullscreen_exit"
    : "fullscreen";
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
  if (itemEl) {
    const queue = AppState.playbackQueue;
    playLibraryItem({
      index: queue.findIndex((v) => v.id === itemEl.dataset.id),
      queue: queue,
      context: AppState.playbackContext,
    });
  }
});
favoriteBtn.addEventListener("click", () => {
  if (AppState.currentlyPlayingIndex > -1)
    toggleFavoriteStatus(
      AppState.playbackQueue[AppState.currentlyPlayingIndex].id
    );
});
addToPlaylistBtn.addEventListener("click", () => {
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
  videoContextMenu.style.left = `${rect.left - videoContextMenu.offsetWidth + rect.width
    }px`;
  videoContextMenu.style.top = `${rect.bottom + 5}px`;
  videoContextMenu.dataset.videoId = currentVideo.id;
  videoContextMenu.classList.add("visible");
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
        !sleepSubmenu.classList.contains("active") &&
        !subtitleSubmenu.classList.contains("active") &&
        !subtitleStyleSubmenu.classList.contains("active") &&
        !subtitleSyncSubmenu.classList.contains("active")
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
  if (
    document.activeElement.tagName.toLowerCase() === "input" ||
    document.activeElement.tagName.toLowerCase() === "textarea" ||
    document.querySelector(".modal-overlay:not(.hidden)")
  )
    return;
  const isPlayerActive =
    !playerPage.classList.contains("hidden") ||
    !miniplayer.classList.contains("hidden");
  if (!isPlayerActive) return;

  e.preventDefault();
  switch (e.key.toLowerCase()) {
    case "k":
    case " ":
      togglePlay();
      break;
    case "m":
      muteBtn.click();
      break;
    case "f":
      if (miniplayer.classList.contains("hidden")) fullscreenBtn.click();
      break;
    case "t":
      if (miniplayer.classList.contains("hidden")) theaterBtn.click();
      break;
    case "i":
      if (videoPlayer.src) {
        if (miniplayer.classList.contains("hidden")) {
          activateMiniplayer();
          showPage("home");
        } else {
          showPage("player");
        }
      }
      break;
    case "arrowleft":
      if (videoPlayer.duration) {
        videoPlayer.currentTime -= 5;
        showPlayerFeedback("rewind", "-5s");
      }
      break;
    case "arrowright":
      if (videoPlayer.duration) {
        videoPlayer.currentTime += 5;
        showPlayerFeedback("fast_forward", "+5s");
      }
      break;
    case "arrowup":
      {
        const v = Math.min(1, videoPlayer.volume + 0.1);
        updateVolume(v);
        showPlayerFeedback("volume_up", Math.round(v * 100) + "%");
      }
      break;
    case "arrowdown":
      {
        const v = Math.max(0, videoPlayer.volume - 0.1);
        updateVolume(v);
        showPlayerFeedback(v === 0 ? "volume_off" : "volume_down", Math.round(v * 100) + "%");
      }
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
  [settingsMenu, speedSubmenu, sleepSubmenu, subtitleSubmenu, subtitleStyleSubmenu, subtitleSyncSubmenu]
    .forEach(el => el.classList.remove("active"));

  if (!isActive) {
    buildSettingsMenu();
    settingsMenu.classList.add("active");
  }
});
settingsMenu.addEventListener("click", (e) => {
  const item = e.target.closest(".settings-item");
  if (!item) return;
  const setting = item.dataset.setting;
  if (setting === "speed") {
    handleSubmenu(
      `[data-setting="speed"]`,
      speedSubmenu,
      [0.5, 0.75, 1, 1.5, 2],
      "speed",
      (v) => (v === 1 ? "Normal" : v + "x")
    );
    item.click();
  } else if (setting === "sleep") {
    settingsMenu.classList.remove("active");
    sleepSubmenu.innerHTML = `
            <div class="submenu-item" data-action="back"><span class="chevron material-symbols-outlined">arrow_back_ios</span><span>Sleep Timer</span></div>
            <div class="submenu-item" data-minutes="0"><span class="check material-symbols-outlined">done</span><span>Off</span></div>
            <div class="submenu-item"><div class="sleep-timer-input-group"><input type="number" min="1" id="sleep-tracks-input" placeholder="Tracks"><button id="sleep-tracks-btn">Set</button></div></div>
            <div class="submenu-item"><div class="sleep-timer-input-group"><input type="number" min="1" id="sleep-minutes-input" placeholder="Minutes"><button id="sleep-minutes-btn">Set</button></div></div>
            <div class="submenu-item"><div class="sleep-timer-input-group"><input type="time" id="sleep-time-input"><button id="sleep-time-btn">Set</button></div></div>`;
    sleepSubmenu.classList.add("active");
  } else if (setting === "subtitles") {
    settingsMenu.classList.remove("active");
    subtitleSubmenu.innerHTML = `
        <div class="submenu-item" data-action="back"><span class="chevron material-symbols-outlined">arrow_back_ios</span><span>Subtitles</span></div>
        <div class="submenu-item" data-sub-action="toggle"><span>Show/Hide</span><span class="setting-value">${playerState.subtitleMode === 'on' ? 'On' : 'Off'}</span></div>
        <div class="submenu-item" data-sub-action="style"><span>Customize Style</span><span class="chevron material-symbols-outlined">arrow_forward_ios</span></div>
        <div class="submenu-item" data-sub-action="sync"><span>Sync Offset</span><span class="chevron material-symbols-outlined">arrow_forward_ios</span></div>
    `;
    subtitleSubmenu.classList.add("active");
  }
});

subtitleSubmenu.addEventListener("click", (e) => {
  e.stopPropagation();
  const item = e.target.closest(".submenu-item");
  if (!item) return;

  if (item.dataset.action === "back") {
    subtitleSubmenu.classList.remove("active");
    buildSettingsMenu();
    settingsMenu.classList.add("active");
    return;
  }

  const action = item.dataset.subAction;
  if (action === "toggle") {
    toggleSubtitleMode();
    item.querySelector(".setting-value").textContent = playerState.subtitleMode === 'on' ? 'On' : 'Off';
  } else if (action === "style") {
    subtitleSubmenu.classList.remove("active");

    const sizeOptions = [
      { value: '1rem', label: 'Small' },
      { value: '1.25rem', label: 'Normal' },
      { value: '1.5rem', label: 'Large' },
      { value: '2rem', label: 'Huge' }
    ];

    const bgOptions = [
      { value: 'rgba(0,0,0,0)', label: 'None' },
      { value: 'rgba(0,0,0,0.7)', label: 'Black (70%)' },
      { value: 'rgba(0,0,0,1)', label: 'Black (100%)' }
    ];

    subtitleStyleSubmenu.innerHTML = `
            <div class="submenu-item" data-action="back"><span class="chevron material-symbols-outlined">arrow_back_ios</span><span>Style</span></div>
            <div class="submenu-item submenu-control-row">
                <span class="submenu-label">Size</span>
                ${createCustomDropdownHTML('sub-size-dd', sizeOptions, playerState.subtitleStyles.size)}
            </div>
            <div class="submenu-item submenu-control-row">
                <span class="submenu-label">Color</span>
                <input type="color" id="sub-color-input" value="${playerState.subtitleStyles.color}" style="background:none;border:none;width:30px;height:30px;cursor:pointer;">
            </div>
            <div class="submenu-item submenu-control-row">
                <span class="submenu-label">BG Color</span>
                ${createCustomDropdownHTML('sub-bg-dd', bgOptions, playerState.subtitleStyles.bg)}
            </div>
            <div class="submenu-item submenu-input-group">
                <span class="submenu-label">Vertical Pos</span>
                <input type="range" id="sub-pos-range" min="-45" max="0" value="${parseInt(playerState.subtitleStyles.pos)}" style="width:100%;">
            </div>
        `;
    subtitleStyleSubmenu.classList.add("active");
  } else if (action === "sync") {
    subtitleSubmenu.classList.remove("active");
    subtitleSyncSubmenu.innerHTML = `
            <div class="submenu-item" data-action="back"><span class="chevron material-symbols-outlined">arrow_back_ios</span><span>Sync</span></div>
            <div class="submenu-item" data-sync="-0.5"><span class="material-symbols-outlined">remove</span> -0.5s</div>
            <div class="submenu-item" data-sync="0.5"><span class="material-symbols-outlined">add</span> +0.5s</div>
            <div class="submenu-item" data-sync="reset" style="justify-content:center;color:var(--secondary-text);">Reset Sync</div>
        `;
    subtitleSyncSubmenu.classList.add("active");
  }
});

subtitleStyleSubmenu.addEventListener('click', (e) => {
  e.stopPropagation();

  if (e.target.closest('[data-action="back"]')) {
    subtitleStyleSubmenu.classList.remove("active");
    subtitleSubmenu.classList.add("active");
    return;
  }

  const dd = e.target.closest('.player-dropdown');
  if (dd) {
    subtitleStyleSubmenu.querySelectorAll('.player-dropdown.open').forEach(el => {
      if (el !== dd) el.classList.remove('open');
    });

    if (e.target.closest('.player-dropdown-item')) {
      const item = e.target.closest('.player-dropdown-item');
      const val = item.dataset.value;
      const label = item.innerText;

      dd.querySelector('.selected-text').textContent = label;
      dd.querySelectorAll('.player-dropdown-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      dd.classList.remove('open');

      if (dd.id === 'sub-size-dd') playerState.subtitleStyles.size = val;
      if (dd.id === 'sub-bg-dd') playerState.subtitleStyles.bg = val;
      applySubtitleStyles();
    } else {
      dd.classList.toggle('open');
    }
    return;
  }

  subtitleStyleSubmenu.querySelectorAll('.player-dropdown.open').forEach(el => el.classList.remove('open'));
});

subtitleStyleSubmenu.addEventListener("input", (e) => {
  if (e.target.id === "sub-color-input") {
    playerState.subtitleStyles.color = e.target.value;
    applySubtitleStyles();
  }
  if (e.target.id === "sub-pos-range") {
    playerState.subtitleStyles.pos = e.target.value + "%";
    applySubtitleStyles();
  }
});

subtitleSyncSubmenu.addEventListener("click", (e) => {
  e.stopPropagation();
  const item = e.target.closest(".submenu-item");
  if (item) {
    if (item.dataset.action === "back") {
      subtitleSyncSubmenu.classList.remove("active");
      subtitleSubmenu.classList.add("active");
    } else if (item.dataset.sync) {
      if (item.dataset.sync === "reset") {
        syncSubtitleOffset(-playerState.subtitleOffset);
      } else {
        syncSubtitleOffset(parseFloat(item.dataset.sync));
      }
    }
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
  videoPlayerPreload.playbackRate = value;
  settingsMenu.querySelector("#speed-value").textContent =
    value === 1 ? "Normal" : `${value}x`;
  speedSubmenu.classList.remove("active");
});
sleepSubmenu.addEventListener("click", (e) => {
  e.stopPropagation();
  const target = e.target.closest(".submenu-item, button");
  if (!target) return;
  if (target.dataset.action === "back") {
    sleepSubmenu.classList.remove("active");
    settingsMenu.classList.add("active");
  } else if (target.dataset.minutes === "0") {
    sleepTimer.clear();
    sleepSubmenu.classList.remove("active");
  } else if (target.id === "sleep-tracks-btn") {
    const val = document.getElementById("sleep-tracks-input").value;
    if (val) sleepTimer.start("tracks", val);
    sleepSubmenu.classList.remove("active");
  } else if (target.id === "sleep-minutes-btn") {
    const val = document.getElementById("sleep-minutes-input").value;
    if (val) sleepTimer.start("minutes", val);
    sleepSubmenu.classList.remove("active");
  } else if (target.id === "sleep-time-btn") {
    const val = document.getElementById("sleep-time-input").value;
    if (val) sleepTimer.start("time", val);
    sleepSubmenu.classList.remove("active");
  }
});
document.addEventListener("click", (e) => {
  if (
    !settingsBtn.contains(e.target) &&
    ![settingsMenu, speedSubmenu, sleepSubmenu, subtitleSubmenu, subtitleStyleSubmenu, subtitleSyncSubmenu].some(el => el.contains(e.target))
  ) {
    [settingsMenu, speedSubmenu, sleepSubmenu, subtitleSubmenu, subtitleStyleSubmenu, subtitleSyncSubmenu].forEach(el => el.classList.remove("active"));
  }
});
cancelEditBtn.addEventListener("click", exitEditMode);
saveEditBtn.addEventListener("click", saveMetadataChanges);

sleepTimer.statusEl.addEventListener("click", () => sleepTimer.clear());

eventBus.on("player:play_request", playLibraryItem);
eventBus.on("controls:toggle_play", togglePlay);
eventBus.on("controls:next", playNext);
eventBus.on("controls:prev", playPrevious);
eventBus.on("controls:pause", () => videoPlayer.pause());
