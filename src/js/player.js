// player.js

// --- Player Core Functions ---
function playLibraryItem(index, options = {}) {
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

  if (options.stayInMiniplayer) {
    activateMiniplayer(); // This will just update the miniplayer content
  } else {
    showPage("player"); // This will open the main player view
  }
}

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

// --- Up Next List ---
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

upNextList.addEventListener("click", (e) => {
  const itemEl = e.target.closest(".up-next-item");
  if (itemEl)
    playLibraryItem(
      currentLibrary.findIndex((v) => v.id === itemEl.dataset.id)
    );
});

// --- Player Controls & Listeners ---
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
  if (autoplayToggle.checked) {
    playNext();
  } else {
    // If video ends, close miniplayer if it's active
    if (!miniplayer.classList.contains("hidden")) {
      closeMiniplayer();
    }
  }
});
videoPlayer.addEventListener("timeupdate", () => {
  currentTimeEl.textContent = formatTime(videoPlayer.currentTime);
  const progress = (videoPlayer.currentTime / videoPlayer.duration) * 100;
  timelineProgress.style.width = `${progress}%`;
  // Also update miniplayer progress bar if it's active
  if (!miniplayer.classList.contains("hidden")) {
    miniplayerProgressBar.style.width = `${progress}%`;
  }
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

// Re-purposed miniplayer button to activate our custom miniplayer
miniplayerBtn.addEventListener("click", () => {
  if (videoPlayer.src) {
    activateMiniplayer();
    // Navigate to home page after activating
    showPage("home");
  }
});

autoplayToggle.addEventListener("change", (e) => {
  localStorage.setItem("autoplayEnabled", e.target.checked);
});
document.addEventListener("fullscreenchange", () => {
  fullscreenBtn.innerHTML = `<i class="fas ${
    document.fullscreenElement ? "fa-compress" : "fa-expand"
  }"></i>`;
  playerPage.classList.toggle("fullscreen-mode", !!document.fullscreenElement);
});

// --- Player Settings Menus ---
function buildSettingsMenu() {
  settingsMenu.innerHTML = `
        <div class="settings-item" data-setting="subtitles"><i class="fas fa-closed-captioning"></i><span>Subtitles</span><span class="setting-value" id="subtitles-value">Off</span><i class="fas fa-chevron-right"></i></div>
        <div class="settings-item" data-setting="speed"><i class="fas fa-gauge-high"></i><span>Playback Speed</span><span class="setting-value" id="speed-value">Normal</span><i class="fas fa-chevron-right"></i></div>
        <div class="settings-item" data-setting="sleep"><i class="fas fa-moon"></i><span>Sleep Timer</span><span class="setting-value" id="sleep-value">Off</span><i class="fas fa-chevron-right"></i></div>`;

  const subtitlesItem = document.querySelector('[data-setting="subtitles"]');
  const subtitlesValue = document.getElementById("subtitles-value");

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

// --- Keyboard Shortcuts ---
document.addEventListener("keydown", (e) => {
  const isMiniplayerActive = !miniplayer.classList.contains("hidden");
  if (
    document.getElementById("player-page").classList.contains("hidden") &&
    !isMiniplayerActive
  )
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
      if (!isMiniplayerActive) fullscreenBtn.click();
      break;
    case "t":
      if (!isMiniplayerActive) theaterBtn.click();
      break;
    case "i":
      // Toggle miniplayer
      if (isMiniplayerActive) {
        showPage("player"); // This will also call deactivateMiniplayer
      } else if (videoPlayer.src) {
        activateMiniplayer();
        showPage("home");
      }
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
      if (e.shiftKey) playNext();
      break;
    case "p":
      if (e.shiftKey) playPrevious();
      break;
  }
});
