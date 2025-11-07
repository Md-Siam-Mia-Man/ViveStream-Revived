import { AppState, setCurrentlyPlaying } from "./state.js";
import { showPage } from "./renderer.js";
import { activateMiniplayer } from "./miniplayer.js";
import { openAddToPlaylistModal } from "./playlists.js";
import { toggleFavoriteStatus } from "./ui.js";
import { showNotification } from "./notifications.js";
import { eventBus } from "./event-bus.js";
import { formatTime } from "./utils.js";

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
const persistentQueueList = document.getElementById("persistent-queue-list");
const recommendationsList = document.getElementById("recommendations-list");
const upNextRecommendations = document.getElementById(
  "up-next-recommendations"
);
const upNextContextHeader = document.getElementById(
  "up-next-context-header-text"
);
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
const recommendationItemTemplate = document.getElementById(
  "recommendation-item-template"
);

let hideControlsTimeout;

const SleepTimer = {
  id: null,
  type: null,
  value: 0,
  remaining: 0,
  statusEl: document.getElementById("sleep-timer-status"),
  statusTextEl: document.getElementById("sleep-timer-status-text"),

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
  },
  stop() {
    clearInterval(this.id);
    this.id = null;
    this.type = null;
    eventBus.off("playback:trackchange", this.onTrackChange);
    this.statusEl.classList.add("hidden");
  },
  onTrackChange() {
    SleepTimer.remaining--;
    SleepTimer.updateDisplay();
    if (SleepTimer.remaining <= 0) SleepTimer.trigger();
  },
  update() {
    this.remaining--;
    this.updateDisplay();
    if (this.remaining <= 0) this.trigger();
  },
  trigger() {
    videoPlayer.pause();
    showNotification(`Sleep timer ended. Playback paused.`, "info");
    this.stop();
  },
  updateDisplay() {
    if (this.type === "tracks") {
      this.statusTextEl.textContent = `${this.remaining} track${
        this.remaining > 1 ? "s" : ""
      } left`;
    } else {
      this.statusTextEl.textContent = formatTime(this.remaining);
    }
  },
  clear() {
    if (this.id || this.type) {
      this.stop();
      showNotification(`Sleep timer cleared.`, "info");
    }
  },
};

SleepTimer.onTrackChange = SleepTimer.onTrackChange.bind(SleepTimer);

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
  { root: persistentQueueList }
);

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
  subtitleTrack.src = "";
  if (item.subtitlePath) {
    subtitleTrack.src = decodeURIComponent(item.subtitlePath);
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
  li.innerHTML = `
      <img data-src="${actualSrc}" src="${placeholderSrc}" class="thumbnail lazy" alt="thumbnail" onerror="this.onerror=null;this.src='${placeholderSrc}';">
      <div class="item-info">
        <p class="item-title">${video.title}</p>
        <p class="item-uploader">${video.creator || video.uploader}</p>
      </div>`;
  return li;
}

function createRecommendationItem(video) {
  const placeholderSrc = `${AppState.assetsPath}/logo.png`;
  const clone = recommendationItemTemplate.content.cloneNode(true);
  const li = clone.querySelector(".recommendation-item");
  li.dataset.id = video.id;

  const thumbnail = li.querySelector(".thumbnail");
  const actualSrc = video.coverPath
    ? decodeURIComponent(video.coverPath)
    : placeholderSrc;
  thumbnail.dataset.src = actualSrc;
  thumbnail.src = placeholderSrc;
  thumbnail.onerror = () => {
    thumbnail.onerror = null;
    thumbnail.src = placeholderSrc;
  };

  li.querySelector(".item-title").textContent = video.title;
  li.querySelector(".item-uploader").textContent =
    video.creator || video.uploader;
  return li;
}

export function renderUpNextList() {
  persistentQueueList.innerHTML = "";
  recommendationsList.innerHTML = "";

  if (AppState.currentlyPlayingIndex < 0) return;

  const context = AppState.playbackContext;
  const currentQueue = AppState.playbackQueue;
  const currentlyPlayingId = currentQueue[AppState.currentlyPlayingIndex].id;

  const icon = {
    playlist: "playlist_play",
    artist: "artist",
    favorites: "favorite",
    home: "smart_display",
  }[context.type];

  upNextContextHeader.innerHTML = `<span class="material-symbols-outlined">${
    icon || "list"
  }</span> ${context.name || "Up Next"}`;

  if (context.type === "home") {
    upNextRecommendations.classList.add("hidden");
    const nextInQueue = AppState.library.filter(
      (video) => video.id !== currentlyPlayingId
    );
    nextInQueue.forEach((video) => {
      const itemEl = createUpNextItem(video, false);
      persistentQueueList.appendChild(itemEl);
    });
  } else {
    upNextRecommendations.classList.remove("hidden");
    currentQueue.forEach((video, index) => {
      const isPlaying = index === AppState.currentlyPlayingIndex;
      const itemEl = createUpNextItem(video, isPlaying);
      persistentQueueList.appendChild(itemEl);
    });

    const queueIds = new Set(currentQueue.map((v) => v.id));
    const recommendations = AppState.library.filter(
      (video) => !queueIds.has(video.id)
    );
    recommendations.sort(() => 0.5 - Math.random());
    recommendations.forEach((video) => {
      const recEl = createRecommendationItem(video);
      recommendationsList.appendChild(recEl);
    });
  }

  const allLazyImages = playerPage.querySelectorAll(".thumbnail.lazy");
  allLazyImages.forEach((img) => lazyLoadObserver.observe(img));
}

function togglePlay() {
  if (videoPlayer.src) {
    videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
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
  videoPlayer.volume = vol;
  videoPlayerPreload.volume = vol;
  videoPlayer.muted = vol === 0;
  videoPlayerPreload.muted = vol === 0;
  localStorage.setItem("playerVolume", vol);
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
        <div class="settings-item" data-setting="speed"><span class="material-symbols-outlined">speed</span><span>Playback Speed</span><span class="setting-value" id="speed-value">${
          videoPlayer.playbackRate === 1
            ? "Normal"
            : videoPlayer.playbackRate + "x"
        }</span><span class="chevron material-symbols-outlined">arrow_forward_ios</span></div>
        <div class="settings-item" data-setting="sleep"><span class="material-symbols-outlined">bedtime</span><span>Sleep Timer</span><span class="setting-value" id="sleep-value">${
          SleepTimer.type ? "On" : "Off"
        }</span><span class="chevron material-symbols-outlined">arrow_forward_ios</span></div>`;
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
          <span>${
            mainItem.querySelector("span:nth-child(2)").textContent
          }</span>
      </div>
      ${values
        .map(
          (v) =>
            `<div class="submenu-item ${
              v == currentVal ? "active" : ""
            }" data-${type}="${v}"><span class="check material-symbols-outlined">done</span><span>${labelFormatter(
              v
            )}</span></div>`
        )
        .join("")}`;
    subMenuEl.classList.add("active");
  };
  mainItem.addEventListener("click", openSubmenu);
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
  updateVolume(
    videoPlayer.muted ? localStorage.getItem("playerVolume") || 1 : 0
  );
});
volumeSlider.addEventListener("input", (e) =>
  updateVolume(parseFloat(e.target.value))
);
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
  if (document.fullscreenElement) document.exitFullscreen();
  else playerSection.requestFullscreen();
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
persistentQueueList.addEventListener("click", (e) => {
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
recommendationsList.addEventListener("click", (e) => {
  const itemEl = e.target.closest(".recommendation-item");
  if (itemEl) {
    const videoId = itemEl.dataset.id;
    const videoIndex = AppState.library.findIndex((v) => v.id === videoId);
    if (videoIndex > -1) {
      eventBus.emit("player:play_request", {
        index: videoIndex,
        queue: AppState.library,
        context: { type: "home", id: null, name: "Library" },
      });
    }
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
    SleepTimer.clear();
    sleepSubmenu.classList.remove("active");
  } else if (target.id === "sleep-tracks-btn") {
    const val = document.getElementById("sleep-tracks-input").value;
    if (val) SleepTimer.start("tracks", val);
    sleepSubmenu.classList.remove("active");
  } else if (target.id === "sleep-minutes-btn") {
    const val = document.getElementById("sleep-minutes-input").value;
    if (val) SleepTimer.start("minutes", val);
    sleepSubmenu.classList.remove("active");
  } else if (target.id === "sleep-time-btn") {
    const val = document.getElementById("sleep-time-input").value;
    if (val) SleepTimer.start("time", val);
    sleepSubmenu.classList.remove("active");
  }
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
cancelEditBtn.addEventListener("click", exitEditMode);
saveEditBtn.addEventListener("click", saveMetadataChanges);

SleepTimer.statusEl.addEventListener("click", SleepTimer.clear);

eventBus.on("player:play_request", playLibraryItem);
eventBus.on("controls:toggle_play", togglePlay);
eventBus.on("controls:next", playNext);
eventBus.on("controls:prev", playPrevious);
eventBus.on("controls:pause", () => videoPlayer.pause());
