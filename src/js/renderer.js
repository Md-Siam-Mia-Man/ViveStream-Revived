// src/js/renderer.js
const sidebar = document.querySelector(".sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const logoHomeButton = document.getElementById("logo-home-button");
const sidebarNav = document.querySelector(".sidebar-nav");
const sidebarNavBottom = document.querySelector(".sidebar-nav-bottom");
const pages = document.querySelectorAll(".page");
const downloadForm = document.getElementById("download-form");
const urlInput = document.getElementById("url-input");
const homeSearchInput = document.getElementById("home-search-input");
const upNextList = document.getElementById("up-next-list");
const qualitySelectContainer = document.getElementById(
  "quality-select-container"
);
const downloadQueueArea = document.getElementById("download-queue-area");
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
const favoriteBtn = document.getElementById("favorite-btn");
const saveToPlaylistBtn = document.getElementById("save-to-playlist-btn");
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

const videoContextMenu = document.getElementById("video-item-context-menu");
const contextDeleteBtn = document.getElementById("context-delete-btn");
const contextRemoveFromPlaylistBtn = document.getElementById(
  "context-remove-from-playlist-btn"
);
const playlistContextMenu = document.getElementById(
  "playlist-item-context-menu"
);

let currentLibrary = [];
let currentlyPlayingIndex = -1;

/**
 * Shows a specific page, handles miniplayer logic, and updates UI elements like search placeholder.
 * @param {string} pageId - The ID of the page to show (e.g., 'home', 'artists', 'artist-detail-page').
 * @param {boolean} [isSubPage=false] - True if the page is a detail view, not a main sidebar item.
 */
function showPage(pageId, isSubPage = false) {
  const isPlayerPageVisible = !playerPage.classList.contains("hidden");
  const targetPageId = isSubPage ? pageId : `${pageId}-page`;

  // Activate miniplayer if navigating away from the main player while a video is playing
  const shouldActivateMiniplayer =
    isPlayerPageVisible &&
    targetPageId !== "player-page" &&
    videoPlayer.src &&
    !videoPlayer.ended;

  if (shouldActivateMiniplayer) {
    activateMiniplayer();
  }

  // Show the target page and hide all others
  pages.forEach((page) =>
    page.classList.toggle("hidden", page.id !== targetPageId)
  );

  // Update search bar placeholder and nav item highlight
  let placeholderText = "Search...";
  if (!isSubPage) {
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.page === pageId);
    });
    // Set placeholder based on the main page ID
    switch (pageId) {
      case "home":
      case "favorites":
        placeholderText = "Search videos...";
        break;
      case "playlists":
        placeholderText = "Search playlists...";
        break;
      case "artists":
        placeholderText = "Search artists...";
        break;
      case "downloads":
      case "settings":
        placeholderText = "Search is disabled here";
        break;
    }
  }
  homeSearchInput.placeholder = placeholderText;
  // If the search bar had text, clear it when changing pages
  if (homeSearchInput.value) {
    homeSearchInput.value = "";
    // Trigger an input event to reset the view
    homeSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Deactivate miniplayer if navigating to the main player page
  if (targetPageId === "player-page") {
    deactivateMiniplayer();
  }

  // Pause video if navigating away from the player without activating miniplayer
  if (
    isPlayerPageVisible &&
    !shouldActivateMiniplayer &&
    targetPageId !== "player-page"
  ) {
    if (!videoPlayer.paused) {
      videoPlayer.pause();
    }
  }
}

/**
 * Handles clicks on the sidebar navigation items.
 * @param {Event} e - The click event.
 */
function handleNav(e) {
  const navItem = e.target.closest(".nav-item");
  if (navItem) {
    const pageId = navItem.dataset.page;
    showPage(pageId); // Centralized page switching
    // Call the appropriate render function for the selected page
    switch (pageId) {
      case "home":
        renderHomePageGrid();
        break;
      case "favorites":
        renderFavoritesPage();
        break;
      case "playlists":
        renderPlaylistsPage();
        break;
      case "artists":
        renderArtistsPage();
        break;
    }
  }
}

// --- App Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  loadLibrary().then(() => {
    renderHomePageGrid();
    showPage("home");
  });

  initializeMiniplayer();
  initializeWindowControls();
  initializeContextMenu();
  initializePlaylistContextMenus();
  initializeSettingsPage();
  loadSettings();

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
    const icon = maximizeBtn.querySelector("i");
    icon.className = `fa-regular ${
      isMaximized ? "fa-window-restore" : "fa-square"
    }`;
  });
}

function initializeContextMenu() {
  // Hide context menus when clicking anywhere else
  document.addEventListener("click", () => {
    videoContextMenu.classList.remove("visible");
    playlistContextMenu.classList.remove("visible");
  });

  // Prevent context menus from closing when clicked on
  videoContextMenu.addEventListener("click", (e) => e.stopPropagation());
  playlistContextMenu.addEventListener("click", (e) => e.stopPropagation());

  // Handle "Delete" action
  contextDeleteBtn.addEventListener("click", async () => {
    const videoId = videoContextMenu.dataset.videoId;
    if (videoId) {
      showConfirmationModal(
        "Delete Video?",
        "Are you sure you want to permanently delete this video and its associated files?",
        async () => {
          const result = await window.electronAPI.deleteVideo(videoId);
          if (result.success) {
            // If the deleted video was playing, stop playback
            if (
              currentlyPlayingIndex > -1 &&
              playbackQueue[currentlyPlayingIndex]?.id === videoId
            ) {
              closeMiniplayer();
              videoPlayer.src = "";
              currentlyPlayingIndex = -1;
              updateVideoDetails(null);
              renderUpNextList();
            }
            showNotification("Video deleted successfully.", "success");
            await loadLibrary(); // Reloads all data and re-renders the current page
          } else {
            showNotification(`Error: ${result.error}`, "error");
          }
        }
      );
    }
    videoContextMenu.classList.remove("visible");
  });

  // Handle "Remove from Playlist" action
  contextRemoveFromPlaylistBtn.addEventListener("click", async () => {
    const videoId = videoContextMenu.dataset.videoId;
    const playlistId = videoContextMenu.dataset.playlistId;
    if (videoId && playlistId) {
      const result = await window.electronAPI.playlistRemoveVideo(
        playlistId,
        videoId
      );
      if (result.success) {
        showNotification("Removed video from playlist.", "success");
        await renderPlaylistDetailPage(playlistId);
      } else {
        showNotification(`Error: ${result.error}`, "error");
      }
    }
    videoContextMenu.classList.remove("visible");
  });
}
