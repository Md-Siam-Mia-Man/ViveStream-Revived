const sidebar = document.querySelector(".sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const logoHomeButton = document.getElementById("logo-home-button");
const sidebarNav = document.querySelector(".sidebar-nav");
const sidebarNavBottom = document.querySelector(".sidebar-nav-bottom");
const pages = document.querySelectorAll(".page");
const downloadForm = document.getElementById("download-form");
const urlInput = document.getElementById("url-input");
const statusArea = document.getElementById("status-area");
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
const uploaderInfo = document.querySelector(".uploader-info");
const channelThumbContainer = document.querySelector(
  ".channel-thumb-container"
);
const channelThumb = document.getElementById("channel-thumb");
const videoInfoUploader = document.getElementById("video-info-uploader");
const videoInfoDate = document.getElementById("video-info-date");
const videoMenuBtn = document.getElementById("video-menu-btn");

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

const trayBtn = document.getElementById("tray-btn");
const minimizeBtn = document.getElementById("minimize-btn");
const maximizeBtn = document.getElementById("maximize-btn");
const closeBtn = document.getElementById("close-btn");
const contextMenu = document.getElementById("video-item-context-menu");
const contextDeleteBtn = document.getElementById("context-delete-btn");

let currentLibrary = [];
let currentlyPlayingIndex = -1;
let sleepTimerId = null;

function showPage(pageId) {
  const isLeavingPlayer = !playerPage.classList.contains("hidden");
  const willActivateMiniplayer =
    isLeavingPlayer && pageId !== "player" && videoPlayer.src;

  if (willActivateMiniplayer) {
    activateMiniplayer();
  }

  pages.forEach((page) =>
    page.classList.toggle("hidden", page.id !== `${pageId}-page`)
  );

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pageId);
  });

  if (pageId === "player") {
    deactivateMiniplayer();
  }

  if (isLeavingPlayer && !willActivateMiniplayer && videoPlayer.src) {
    videoPlayer.pause();
  }
}

function handleNav(e) {
  const navItem = e.target.closest(".nav-item");
  if (navItem) showPage(navItem.dataset.page);
}

document.addEventListener("DOMContentLoaded", () => {
  showPage("home");
  loadLibrary();
  loadSettings();
  initializeMiniplayer();
  initializeWindowControls();
  initializeContextMenu();

  sidebarNav.addEventListener("click", handleNav);
  sidebarNavBottom.addEventListener("click", handleNav);
});

function initializeWindowControls() {
  trayBtn.addEventListener("click", () => window.electronAPI.trayWindow());
  minimizeBtn.addEventListener("click", () =>
    window.electronAPI.minimizeWindow()
  );
  maximizeBtn.addEventListener("click", () =>
    window.electronAPI.maximizeWindow()
  );
  closeBtn.addEventListener("click", () => window.electronAPI.closeWindow());

  window.electronAPI.onWindowMaximized((isMaximized) => {
    maximizeBtn.innerHTML = `<i class="far ${
      isMaximized ? "fa-window-restore" : "fa-square"
    }"></i>`;
  });
}

function initializeContextMenu() {
  document.addEventListener("click", () => {
    contextMenu.classList.remove("visible");
  });

  contextMenu.addEventListener("click", (e) => e.stopPropagation());

  contextDeleteBtn.addEventListener("click", async () => {
    const videoId = contextMenu.dataset.videoId;
    if (videoId) {
      const result = await window.electronAPI.deleteVideo(videoId);
      if (result.success) {
        if (
          currentlyPlayingIndex > -1 &&
          currentLibrary[currentlyPlayingIndex]?.id === videoId
        ) {
          closeMiniplayer();
          videoPlayer.src = "";
          currentlyPlayingIndex = -1;
          showPage("home");
        }
        loadLibrary();
      } else {
        statusText.innerText = `Error: ${result.error}`;
      }
    }
    contextMenu.classList.remove("visible");
  });
}
