// src/renderer/js/miniplayer.js
import { showPage } from "./renderer.js";
import { eventBus } from "./event-bus.js";

// --- DOM Element Selectors ---
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
const videoPlayer = document.getElementById("video-player"); // Shared from main player
const playerSection = document.getElementById("player-section"); // Main player container
const miniplayerProgressBar = document.querySelector(
  ".miniplayer-progress-bar"
);

/**
 * Activates and shows the miniplayer, moving the video element into it.
 */
export function activateMiniplayer() {
  if (!videoPlayer.src) return;

  const wasHidden = miniplayer.classList.contains("hidden");
  const isAudioMode = playerSection.classList.contains("audio-mode");

  if (isAudioMode) {
    miniplayerArtworkImg.src = document.getElementById("audio-artwork-img").src;
    miniplayerArtworkImg.classList.remove("hidden");
    miniplayerVideoContainer.style.display = "none";
  } else {
    miniplayerArtworkImg.classList.add("hidden");
    miniplayerVideoContainer.style.display = "block";
    if (videoPlayer.parentElement !== miniplayerVideoContainer) {
      miniplayerVideoContainer.appendChild(videoPlayer);
    }
  }

  if (wasHidden) {
    miniplayer.classList.remove("hidden");
  }
}

/**
 * Deactivates the miniplayer, hiding it and returning the video element to the main player.
 */
export function deactivateMiniplayer() {
  if (miniplayer.classList.contains("hidden")) return;

  miniplayerArtworkImg.classList.add("hidden");
  miniplayerVideoContainer.style.display = "block";

  playerSection.insertBefore(videoPlayer, playerSection.firstChild);
  miniplayer.classList.add("hidden");
}

/**
 * Fully closes the miniplayer and stops playback.
 */
export function closeMiniplayer() {
  deactivateMiniplayer();
  eventBus.emit("controls:close_player");
}

/**
 * Initializes all event listeners for the miniplayer controls.
 */
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

  // Listen to events from the event bus to update UI
  eventBus.on("playback:play", () => {
    miniplayerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
  });

  eventBus.on("playback:pause", () => {
    miniplayerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
  });

  eventBus.on("playback:trackchange", (item) => {
    miniplayerTitle.textContent = item.title;
    miniplayerUploader.textContent = item.creator || item.uploader;
    if (item.type === "audio") {
      miniplayerArtworkImg.src = item.coverPath
        ? decodeURIComponent(item.coverPath)
        : "../assets/logo.png";
    }
  });

  eventBus.on("playback:timeupdate", (progress) => {
    if (!miniplayer.classList.contains("hidden")) {
      miniplayerProgressBar.style.width = `${progress}%`;
    }
  });
}
