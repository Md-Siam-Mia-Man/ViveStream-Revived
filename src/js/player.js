// player.js
function playLibraryItem(index, options = {}) {
  if (index < 0 || index >= currentLibrary.length) return;
  const item = currentLibrary[index];
  currentlyPlayingIndex = index;

  if (item.type === "video" || item.type === "audio") {
    videoPlayer.src = item.filePath;
    const subtitlesEnabled =
      localStorage.getItem("subtitlesEnabled") === "true";
    subtitleTrack.src = item.subtitlePath || "";
    subtitleTrack.track.mode =
      item.subtitlePath && subtitlesEnabled ? "showing" : "hidden";
    if (!item.subtitlePath) subtitleTrack.track.mode = "disabled";
    videoPlayer.play();
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
  if (!item) return;
  videoInfoTitle.textContent = item.title;
  videoInfoUploader.textContent = item.uploader;

  if (item.channelThumbPath) {
    channelThumbContainer.style.display = "block";
    uploaderInfo.classList.remove("no-thumb");
    channelThumb.src = item.channelThumbPath;
    channelThumb.onerror = () => {
      channelThumb.src = "../assets/logo.png";
    };
  } else {
    channelThumbContainer.style.display = "none";
    uploaderInfo.classList.add("no-thumb");
  }

  videoInfoDate.textContent = item.upload_date
    ? ` • ${new Date(
        item.upload_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
      ).toLocaleDateString()}`
    : "";
  favoriteBtn.classList.toggle("is-favorite", !!item.isFavorite);
}

function renderUpNextList() {
  upNextList.innerHTML = "";
  const upNextItems = [];
  for (let i = 1; i < currentLibrary.length; i++) {
    const itemIndex = (currentlyPlayingIndex + i) % currentLibrary.length;
    upNextItems.push(currentLibrary[itemIndex]);
  }

  upNextItems.forEach((video) => {
    const li = document.createElement("li");
    li.className = "up-next-item";
    li.dataset.id = video.id;
    li.innerHTML = `<img src="${
      video.coverPath
    }" class="thumbnail" alt="thumbnail"><div class="item-info"><p class="item-title">${
      video.title
    }</p><p class="item-uploader">${video.uploader || "Unknown"}</p></div>`;
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

favoriteBtn.addEventListener("click", (e) => {
  if (currentlyPlayingIndex === -1) return;
  const videoId = currentLibrary[currentlyPlayingIndex].id;
  toggleFavoriteStatus(videoId, e.currentTarget);
});

function togglePlay() {
  videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
}
function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const result = new Date(seconds * 1000).toISOString().slice(11, 19);
  return seconds < 3600 ? result.substring(3) : result;
}
function playNext() {
  if (currentLibrary.length > 1)
    playLibraryItem((currentlyPlayingIndex + 1) % currentLibrary.length);
}
function playPrevious() {
  if (currentLibrary.length > 1)
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
  muteBtn.textContent = muted || volume === 0 ? "🔇" : "🔊";
}

playerSection.addEventListener("click", (e) => {
  if (e.target === playerSection || e.target === videoPlayer) togglePlay();
});
videoPlayer.addEventListener("play", () => {
  playerSection.classList.remove("paused");
  playPauseBtn.textContent = "⏸";
});
videoPlayer.addEventListener("pause", () => {
  playerSection.classList.add("paused");
  playPauseBtn.textContent = "▶";
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
  playerPage.classList.toggle("fullscreen-mode", !!document.fullscreenElement);
  fullscreenBtn.textContent = document.fullscreenElement ? "✕" : "⛶";
});

videoMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const currentVideo = currentLibrary[currentlyPlayingIndex];
  if (!currentVideo) return;
  const rect = videoMenuBtn.getBoundingClientRect();
  contextMenu.style.left = `${
    rect.left - contextMenu.offsetWidth + rect.width
  }px`;
  contextMenu.style.top = `${rect.bottom + 5}px`;
  contextMenu.dataset.videoId = currentVideo.id;
  contextMenu.classList.add("visible");
});

let sleepTimerId = null;

function buildSettingsMenu() {
  settingsMenu.innerHTML = `
        <div class="settings-item" data-setting="subtitles"><span>🔤</span><span>Subtitles</span><span class="setting-value" id="subtitles-value">Off</span><span class="chevron">></span></div>
        <div class="settings-item" data-setting="speed"><span> speedometer </span><span>Playback Speed</span><span class="setting-value" id="speed-value">Normal</span><span class="chevron">></span></div>
        <div class="settings-item" data-setting="sleep"><span>🌙</span><span>Sleep Timer</span><span class="setting-value" id="sleep-value">Off</span><span class="chevron">></span></div>`;
  document
    .querySelector('[data-setting="subtitles"]')
    .addEventListener("click", () => {
      if (subtitleTrack.src) {
        subtitleTrack.track.mode =
          subtitleTrack.track.mode === "showing" ? "hidden" : "showing";
        document.getElementById("subtitles-value").textContent =
          subtitleTrack.track.mode === "showing" ? "On" : "Off";
        localStorage.setItem(
          "subtitlesEnabled",
          subtitleTrack.track.mode === "showing"
        );
      }
    });
  document.getElementById("subtitles-value").textContent =
    subtitleTrack.track.mode === "showing" ? "On" : "Off";
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
    settingsMenu.classList.remove("active");
    const currentVal = type === "speed" ? videoPlayer.playbackRate : 0; // Simplified for this example
    subMenuEl.innerHTML =
      `<div class="submenu-item" data-action="back"><span class="chevron"><</span><span>${
        mainItem.querySelector("span:nth-child(2)").textContent
      }</span></div>` +
      values
        .map(
          (v) =>
            `<div class="submenu-item ${
              v == currentVal ? "active" : ""
            }" data-${type}="${v}"><span class="check">✔</span><span>${labelFormatter(
              v
            )}</span></div>`
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
    mainItem.querySelector(".setting-value").textContent =
      labelFormatter(value);
    if (type === "speed") videoPlayer.playbackRate = value;
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
let hideControlsTimeout;
playerSection.addEventListener("mousemove", () => {
  controlsContainer.style.opacity = 1;
  playerSection.style.cursor = "default";
  clearTimeout(hideControlsTimeout);
  if (!videoPlayer.paused)
    hideControlsTimeout = setTimeout(() => {
      controlsContainer.style.opacity = 0;
      playerSection.style.cursor = "none";
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
    !isPlayerActive ||
    document.activeElement.tagName.toLowerCase() === "input"
  )
    return;
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
      if (!miniplayer.classList.contains("hidden")) return;
      fullscreenBtn.click();
      break;
    case "t":
      if (!miniplayer.classList.contains("hidden")) return;
      theaterBtn.click();
      break;
    case "i":
      if (videoPlayer.src)
        miniplayer.classList.contains("hidden")
          ? (activateMiniplayer(), showPage("home"))
          : showPage("player");
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
