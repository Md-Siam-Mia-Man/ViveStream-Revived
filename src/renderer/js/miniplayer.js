import { showPage } from "./renderer.js";
import { eventBus } from "./event-bus.js";
import { AppState } from "./state.js";

const miniplayer = document.getElementById("miniplayer");
const miniplayerArtworkImg = document.getElementById("miniplayer-artwork-img");
const miniplayerVideoContainer = document.getElementById(
  "miniplayer-video-container"
);
const miniplayerTitle = document.querySelector(".miniplayer-title");
const miniplayerUploader = document.querySelector(".miniplayer-uploader");
const miniplayerPlayPauseBtn = document.getElementById(
  "miniplayer-play-pause-btn"
);
const miniplayerNextBtn = document.getElementById("miniplayer-next-btn");
const miniplayerPrevBtn = document.getElementById("miniplayer-prev-btn");
const miniplayerExpandBtn = document.getElementById("miniplayer-expand-btn");
const miniplayerCloseBtn = document.getElementById("miniplayer-close-btn");
const videoPlayer = document.getElementById("video-player");
const playerSection = document.getElementById("player-section");
const miniplayerProgressBar = document.querySelector(
  ".miniplayer-progress-bar"
);

export function activateMiniplayer() {
  if (!videoPlayer.src) return;

  const wasHidden = miniplayer.classList.contains("hidden");
  const isAudioMode = playerSection.classList.contains("audio-mode");
  miniplayer.classList.toggle("audio-mode", isAudioMode);

  if (isAudioMode) {
    miniplayerArtworkImg.src = document.getElementById("audio-artwork-img").src;
    miniplayerArtworkImg.classList.remove("hidden");
  } else {
    miniplayerArtworkImg.classList.add("hidden");
    if (videoPlayer.parentElement !== miniplayerVideoContainer) {
      miniplayerVideoContainer.appendChild(videoPlayer);
    }
  }

  if (wasHidden) {
    miniplayer.classList.remove("hidden");
  }
}

export function deactivateMiniplayer() {
  if (miniplayer.classList.contains("hidden")) return;

  miniplayer.classList.remove("audio-mode");
  miniplayerArtworkImg.classList.add("hidden");

  playerSection.insertBefore(videoPlayer, playerSection.firstChild);
  miniplayer.classList.add("hidden");
}

export function closeMiniplayer() {
  deactivateMiniplayer();
  eventBus.emit("controls:close_player");
}

export function initializeMiniplayer() {
  miniplayerPlayPauseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    eventBus.emit("controls:toggle_play");
  });

  miniplayerNextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    eventBus.emit("controls:next");
  });

  miniplayerPrevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    eventBus.emit("controls:prev");
  });

  miniplayerExpandBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showPage("player");
  });

  miniplayerCloseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeMiniplayer();
  });

  miniplayer.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    showPage("player");
  });

  eventBus.on("playback:play", () => {
    miniplayerPlayPauseBtn.querySelector("span").textContent = "pause";
  });

  eventBus.on("playback:pause", () => {
    miniplayerPlayPauseBtn.querySelector("span").textContent = "play_arrow";
  });

  eventBus.on("playback:trackchange", (item) => {
    miniplayerTitle.textContent = item.title;
    miniplayerUploader.textContent = item.creator || item.uploader;
    if (item.type === "audio") {
      miniplayerArtworkImg.src = item.coverPath
        ? decodeURIComponent(item.coverPath)
        : `${AppState.assetsPath}/logo.png`;
    }
  });

  eventBus.on("playback:timeupdate", (progress) => {
    if (!miniplayer.classList.contains("hidden")) {
      miniplayerProgressBar.style.width = `${progress}%`;
    }
  });
}
