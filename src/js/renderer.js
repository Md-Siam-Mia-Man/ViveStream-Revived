// renderer.js
// --- Global Element Constants ---
const sidebar = document.querySelector(".sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const logoHomeButton = document.getElementById("logo-home-button");
const sidebarNav = document.querySelector(".sidebar-nav");
const pages = document.querySelectorAll(".page");
const downloadForm = document.getElementById("download-form");
const urlInput = document.getElementById("url-input");
const statusText = document.getElementById("status-text");
const progressBar = document.getElementById("progress-bar");
const homeSearchInput = document.getElementById("home-search-input");
const videoGrid = document.getElementById("video-grid");
const upNextList = document.getElementById("up-next-list");
const qualitySelectContainer = document.getElementById(
  "quality-select-container"
);
const playerPage = document.getElementById("player-page");
const playerSection = document.getElementById("player-section");
const videoPlayer = document.getElementById("video-player");
const subtitleTrack = document.getElementById("subtitle-track");
const playPauseBtn = document.querySelector(".play-pause-btn");
const prevBtn = document.querySelector(".prev-btn");
const nextBtn = document.querySelector(".next-btn");
const muteBtn = document.querySelector(".mute-btn");
const volumeSlider = document.querySelector(".volume-slider");
const currentTimeEl = document.querySelector(".current-time");
const totalTimeEl = document.querySelector(".total-time");
const timelineContainer = document.querySelector(".timeline-container");
const timelineProgress = document.querySelector(".timeline-progress");
const theaterBtn = document.getElementById("theater-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const miniplayerBtn = document.getElementById("miniplayer-btn");
const autoplayToggle = document.getElementById("autoplay-toggle");
const settingsBtn = document.getElementById("settings-btn");
const settingsMenu = document.getElementById("settings-menu");
const speedSubmenu = document.getElementById("speed-submenu");
const sleepSubmenu = document.getElementById("sleep-submenu");
const controlsContainer = document.querySelector(".video-controls-container");
const videoInfoTitle = document.getElementById("video-info-title");
const channelThumb = document.getElementById("channel-thumb");
const channelThumbFallback = document.getElementById("channel-thumb-fallback");
const videoInfoUploader = document.getElementById("video-info-uploader");
const videoInfoDate = document.getElementById("video-info-date");

// --- Miniplayer Element Constants ---
const miniplayer = document.getElementById("miniplayer");
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
const miniplayerCloseBtn = document.getElementById("miniplayer-close-btn");
const miniplayerExpandBtn = document.getElementById("miniplayer-expand-btn");
const miniplayerProgressBar = document.querySelector(
  ".miniplayer-progress-bar"
);

// --- Global State ---
let currentLibrary = [];
let currentlyPlayingIndex = -1;
let sleepTimerId = null;

// --- Core Functions ---
function showPage(pageId) {
  const isLeavingPlayer = !playerPage.classList.contains("hidden");
  const willActivateMiniplayer =
    isLeavingPlayer && pageId !== "player" && videoPlayer.src;

  // Activate miniplayer if navigating away from the player while a video is loaded
  if (willActivateMiniplayer) {
    activateMiniplayer();
  }

  pages.forEach((page) =>
    page.classList.toggle("hidden", page.id !== `${pageId}-page`)
  );
  document
    .querySelectorAll(".nav-item")
    .forEach((item) =>
      item.classList.toggle("active", item.dataset.page === pageId)
    );

  // If we are navigating TO the player, deactivate the miniplayer
  if (pageId === "player") {
    deactivateMiniplayer();
  }

  // Only pause the video if we are leaving the player AND not activating the miniplayer
  if (isLeavingPlayer && !willActivateMiniplayer && videoPlayer.src) {
    videoPlayer.pause();
  }
}

// --- App Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  showPage("home");
  loadLibrary();
  loadSettings();
  initializeMiniplayer();
});
