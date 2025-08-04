// src/js/miniplayer.js
import { showPage } from "./renderer.js";

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

/**
 * Activates and shows the miniplayer, moving the video element into it.
 */
export function activateMiniplayer() {
  if (!videoPlayer.src) return;

  const wasHidden = miniplayer.classList.contains("hidden");
  // To get current item, we need to import state, but that creates a circular dependency.
  // Instead, we derive info from the main player's UI elements which are already populated.
  const currentTitle = document.getElementById("video-info-title").textContent;
  const currentUploader = document.getElementById(
    "video-info-uploader"
  ).textContent;
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

  miniplayerTitle.textContent = currentTitle;
  miniplayerUploader.textContent = currentUploader;

  videoPlayer.play();
}

/**
 * Deactivates the miniplayer, hiding it and returning the video element to the main player.
 */
export function deactivateMiniplayer() {
  if (miniplayer.classList.contains("hidden")) return;

  miniplayerArtworkImg.classList.add("hidden");
  miniplayerVideoContainer.style.display = "block";

  // Move video player back to the main player view
  playerSection.insertBefore(videoPlayer, playerSection.firstChild);
  miniplayer.classList.add("hidden");
}

/**
 * Fully closes the miniplayer and stops playback.
 */
export function closeMiniplayer() {
  deactivateMiniplayer();
  videoPlayer.pause();
  videoPlayer.src = "";
  // We cannot reset state here due to circular dependencies.
  // This is handled in the renderer/context menu where the call originates.
}

/**
 * Initializes all event listeners for the miniplayer controls.
 */
export function initializeMiniplayer() {
  // Using dynamic imports within event listeners to break circular dependencies
  // between player.js and miniplayer.js.
  miniplayerPlayPauseBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const { togglePlay } = await import("./player.js");
    togglePlay();
  });

  miniplayerNextBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const { playNext } = await import("./player.js");
    playNext();
  });

  miniplayerPrevBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const { playPrevious } = await import("./player.js");
    playPrevious();
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

  videoPlayer.addEventListener("play", () => {
    miniplayerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
  });

  videoPlayer.addEventListener("pause", () => {
    miniplayerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
  });
}
