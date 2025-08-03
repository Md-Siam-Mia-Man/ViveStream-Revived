// src/js/player.js
let playbackQueue = [];
const audioArtworkContainer = document.querySelector(
  ".audio-artwork-container"
);
const audioArtworkImg = document.getElementById("audio-artwork-img");
// NEW: Add selectors for description box elements
const videoDescriptionBox = document.getElementById("video-description-box");
const descriptionContent = document.getElementById("description-content");
const showMoreDescBtn = document.getElementById("show-more-desc-btn");

function playLibraryItem(index, sourceLibrary = currentLibrary, options = {}) {
  if (!sourceLibrary || index < 0 || index >= sourceLibrary.length) return;

  playbackQueue = sourceLibrary;
  const item = playbackQueue[index];
  currentlyPlayingIndex = index;

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
      } else {
        if (subtitleTrack.track) {
          subtitleTrack.track.mode = "disabled";
        }
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

  updateVideoDetails(item);
  renderUpNextList();

  if (options.stayInMiniplayer) {
    activateMiniplayer();
  } else {
    if (playerPage.classList.contains("hidden")) {
      showPage("player");
    }
  }
}

function updateVideoDetails(item) {
  // Clear details if no item is provided
  if (!item) {
    videoInfoTitle.textContent = "No media selected";
    videoInfoUploader.textContent = "";
    videoInfoDate.textContent = "";
    channelThumb.src = "";
    videoDescriptionBox.style.display = "none"; // Hide description box
    descriptionContent.textContent = "";
    updateFavoriteStatusInUI(null, false);
    return;
  }

  videoInfoTitle.textContent = item.title;
  videoInfoUploader.textContent = item.creator || item.uploader;

  if (item.coverPath) {
    channelThumb.src = decodeURIComponent(item.coverPath);
    channelThumb.onerror = () => {
      channelThumb.src = "../assets/logo.png";
    };
  } else {
    channelThumb.src = "../assets/logo.png";
  }

  videoInfoDate.textContent = item.upload_date
    ? ` • ${new Date(
        item.upload_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
      ).toLocaleDateString()}`
    : "";
  updateFavoriteStatusInUI(item.id, !!item.isFavorite);

  // --- NEW: Handle description box visibility and content ---
  if (item.description && item.description.trim()) {
    videoDescriptionBox.style.display = "block";
    descriptionContent.textContent = item.description;
    // Check if the content is long enough to need a "Show more" button
    const isOverflowing =
      descriptionContent.scrollHeight > descriptionContent.clientHeight;
    showMoreDescBtn.style.display = isOverflowing ? "block" : "none";
    // Reset state to collapsed
    videoDescriptionBox.classList.remove("expanded");
    showMoreDescBtn.textContent = "Show more";
  } else {
    videoDescriptionBox.style.display = "none";
    descriptionContent.textContent = "";
  }
}

// --- NEW: Event listener for expanding/collapsing the description box ---
videoDescriptionBox.addEventListener("click", () => {
  videoDescriptionBox.classList.toggle("expanded");
  const isExpanded = videoDescriptionBox.classList.contains("expanded");
  showMoreDescBtn.textContent = isExpanded ? "Show less" : "Show more";
});

function renderUpNextList() {
  upNextList.innerHTML = "";
  if (currentlyPlayingIndex < 0 || playbackQueue.length === 0) return;

  const upNextItems = [];
  for (let i = 1; i < playbackQueue.length; i++) {
    const itemIndex = (currentlyPlayingIndex + i) % playbackQueue.length;
    upNextItems.push(playbackQueue[itemIndex]);
  }

  upNextItems.forEach((video) => {
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
    upNextList.appendChild(li);
  });
}

upNextList.addEventListener("click", (e) => {
  const itemEl = e.target.closest(".up-next-item");
  if (itemEl)
    playLibraryItem(
      playbackQueue.findIndex((v) => v.id === itemEl.dataset.id),
      playbackQueue
    );
});

favoriteBtn.addEventListener("click", (e) => {
  if (currentlyPlayingIndex === -1) return;
  const videoId = playbackQueue[currentlyPlayingIndex].id;
  toggleFavoriteStatus(videoId);
});

saveToPlaylistBtn.addEventListener("click", () => {
  if (currentlyPlayingIndex === -1) return;
  const videoId = playbackQueue[currentlyPlayingIndex].id;
  openAddToPlaylistModal(videoId);
});

function togglePlay() {
  if (!videoPlayer.src || videoPlayer.src === window.location.href) return;
  videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
}
function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const result = new Date(seconds * 1000).toISOString().slice(11, 19);
  return seconds < 3600 ? result.substring(3) : result;
}
function playNext() {
  if (playbackQueue.length > 1)
    playLibraryItem(
      (currentlyPlayingIndex + 1) % playbackQueue.length,
      playbackQueue
    );
}
function playPrevious() {
  if (playbackQueue.length > 1)
    playLibraryItem(
      (currentlyPlayingIndex - 1 + playbackQueue.length) % playbackQueue.length,
      playbackQueue
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
  const icon = muteBtn.querySelector("i");
  if (muted || volume === 0) {
    icon.className = "fa-solid fa-volume-xmark";
  } else if (volume < 0.5) {
    icon.className = "fa-solid fa-volume-low";
  } else {
    icon.className = "fa-solid fa-volume-high";
  }
}

playerSection.addEventListener("click", (e) => {
  if (
    e.target === playerSection ||
    e.target === videoPlayer ||
    e.target === audioArtworkContainer ||
    e.target === audioArtworkImg
  )
    togglePlay();
});
videoPlayer.addEventListener("play", () => {
  playerSection.classList.remove("paused");
  playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
});
videoPlayer.addEventListener("pause", () => {
  playerSection.classList.add("paused");
  playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
});
videoPlayer.addEventListener("ended", () => {
  if (autoplayToggle.checked) playNext();
  else if (!miniplayer.classList.contains("hidden")) closeMiniplayer();
});
videoPlayer.addEventListener("timeupdate", () => {
  currentTimeEl.textContent = formatTime(videoPlayer.currentTime);
  const progress = (videoPlayer.currentTime / videoPlayer.duration) * 100 || 0;
  timelineProgress.style.width = `${progress}%`;
  if (!miniplayer.classList.contains("hidden"))
    miniplayerProgressBar.style.width = `${progress}%`;
});
videoPlayer.addEventListener(
  "loadedmetadata",
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
  const currentVideo = playbackQueue[currentlyPlayingIndex];
  if (!currentVideo) return;
  const rect = videoMenuBtn.getBoundingClientRect();
  videoContextMenu.style.left = `${
    rect.left - videoContextMenu.offsetWidth + rect.width
  }px`;
  videoContextMenu.style.top = `${rect.bottom + 5}px`;
  videoContextMenu.dataset.videoId = currentVideo.id;
  videoContextMenu.classList.add("visible");
});

let sleepTimerId = null;

function buildSettingsMenu() {
  const hasSubtitles =
    videoPlayer.textTracks.length > 0 ||
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
            <span class="chevron"><i class="fa-solid fa-chevron-right"></i></span>
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

  const subtitlesItem = settingsMenu.querySelector(
    '[data-setting="subtitles"]'
  );
  if (subtitlesItem) {
    subtitlesItem.addEventListener("click", (e) => {
      e.stopPropagation();
      if (hasSubtitles) {
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

        document.getElementById("subtitles-value").textContent =
          newMode === "showing" ? "On" : "Off";
        localStorage.setItem("subtitlesEnabled", newMode === "showing");
        settingsMenu.classList.remove("active");
      }
    });
  }

  handleSubmenu(
    '[data-setting="speed"]',
    speedSubmenu,
    [0.5, 0.75, 1, 1.5, 2],
    "speed",
    (v) => (v === 1 ? "Normal" : v + "x")
  );
  handleSubmenu(
    '[data-setting="sleep"]',
    sleepSubmenu,
    [0, 15, 30, 60, 120],
    "minutes",
    (v) => (v === 0 ? "Off" : `${v} minutes`)
  );
}

function handleSubmenu(mainSel, subMenuEl, values, type, labelFormatter) {
  const mainItem = document.querySelector(mainSel);
  if (!mainItem) return;

  mainItem.addEventListener("click", (e) => {
    e.stopPropagation();
    if (mainItem.classList.contains("disabled")) return;

    settingsMenu.classList.remove("active");

    let currentVal;
    if (type === "speed") {
      currentVal = videoPlayer.playbackRate;
    } else {
      currentVal = null;
    }

    subMenuEl.innerHTML =
      `
        <div class="submenu-item" data-action="back">
            <span class="chevron"><i class="fa-solid fa-chevron-left"></i></span>
            <span>${
              mainItem.querySelector("span:nth-child(2)").textContent
            }</span>
        </div>` +
      values
        .map(
          (v) => `
            <div class="submenu-item ${
              v == currentVal ? "active" : ""
            }" data-${type}="${v}">
                <span class="check"><i class="fa-solid fa-check"></i></span>
                <span>${labelFormatter(v)}</span>
            </div>`
        )
        .join("");
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

    const value = parseFloat(target.dataset[type]);
    subMenuEl
      .querySelectorAll(".active")
      .forEach((el) => el.classList.remove("active"));
    target.classList.add("active");
    subMenuEl.classList.remove("active");
    settingsMenu.classList.remove("active");

    const valueLabel = labelFormatter(value);
    mainItem.querySelector(".setting-value").textContent = valueLabel;

    if (type === "speed") {
      videoPlayer.playbackRate = value;
    } else if (type === "minutes") {
      clearTimeout(sleepTimerId);
      if (value > 0) {
        sleepTimerId = setTimeout(() => {
          videoPlayer.pause();
          showNotification(`Sleep timer ended. Playback paused.`, "info");
          mainItem.querySelector(".setting-value").textContent = "Off";
        }, value * 60 * 1000);
        showNotification(`Sleep timer set for ${valueLabel}.`, "info");
      } else {
        showNotification(`Sleep timer cleared.`, "info");
      }
    }
  });
}

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

let hideControlsTimeout;
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
  if (!videoPlayer.paused)
    hideControlsTimeout = setTimeout(() => {
      controlsContainer.style.opacity = 0;
      playerSection.style.cursor = "none";
    }, 500);
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
