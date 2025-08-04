// src/js/renderer.js
import {
  AppState,
  setLibrary,
  setAllPlaylists,
  setAllArtists,
  resetPlaybackState,
} from "./state.js";
import { renderHomePageGrid, renderFavoritesPage } from "./ui.js";
import {
  renderPlaylistsPage,
  initializePlaylistContextMenus,
} from "./playlists.js";
import { renderArtistsPage } from "./artists.js";
import {
  playLibraryItem,
  updateVideoDetails,
  renderUpNextList,
} from "./player.js";
import {
  activateMiniplayer,
  deactivateMiniplayer,
  closeMiniplayer,
  initializeMiniplayer,
} from "./miniplayer.js";
import { initializeSettingsPage, loadSettings } from "./settings.js";
import { showConfirmationModal } from "./modals.js";

// --- Element Selectors ---
const sidebar = document.querySelector(".sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const logoHomeButton = document.getElementById("logo-home-button");
const sidebarNav = document.querySelector(".sidebar-nav");
const sidebarNavBottom = document.querySelector(".sidebar-nav-bottom");
const pages = document.querySelectorAll(".page");
const homeSearchInput = document.getElementById("home-search-input");
const playerPage = document.getElementById("player-page");
const videoPlayer = document.getElementById("video-player");
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
const loaderOverlay = document.getElementById("loader-overlay");

// This is now the only global variable related to UI state
let currentPlaylistId = null;

// --- Loader Utility Functions ---
export function showLoader() {
  loaderOverlay.classList.remove("hidden");
}

export function hideLoader() {
  loaderOverlay.classList.add("hidden");
}

/**
 * Shows a specific page and handles related UI state changes.
 * @param {string} pageId - The ID of the page to show.
 * @param {boolean} [isSubPage=false] - True if the page is a detail view.
 */
export function showPage(pageId, isSubPage = false) {
  const isPlayerPageVisible = !playerPage.classList.contains("hidden");
  const targetPageId = isSubPage ? pageId : `${pageId}-page`;

  const shouldActivateMiniplayer =
    isPlayerPageVisible &&
    targetPageId !== "player-page" &&
    videoPlayer.src &&
    !videoPlayer.ended;

  if (shouldActivateMiniplayer) {
    activateMiniplayer();
  }

  pages.forEach((page) =>
    page.classList.toggle("hidden", page.id !== targetPageId)
  );

  let placeholderText = "Search...";
  if (!isSubPage) {
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.page === pageId);
    });
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
  if (homeSearchInput.value) {
    homeSearchInput.value = "";
    homeSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  if (targetPageId === "player-page") {
    deactivateMiniplayer();
  }

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
async function handleNav(e) {
  const navItem = e.target.closest(".nav-item");
  if (navItem) {
    const pageId = navItem.dataset.page;

    // Show loader immediately for better user feedback
    showLoader();

    // Show the page structure first
    showPage(pageId);

    // Then render the content asynchronously
    // The render functions themselves will hide the loader when done
    try {
      switch (pageId) {
        case "home":
          await renderHomePageGrid();
          break;
        case "favorites":
          await renderFavoritesPage();
          break;
        case "playlists":
          await renderPlaylistsPage();
          break;
        case "artists":
          await renderArtistsPage();
          break;
        default:
          hideLoader(); // Hide loader for pages without async content
          break;
      }
    } catch (error) {
      console.error(`Error rendering page ${pageId}:`, error);
      hideLoader();
    }
  }
}

/**
 * Fetches all necessary data from the main process and populates the state.
 */
export async function loadLibrary() {
  const [library, playlists, artists] = await Promise.all([
    window.electronAPI.getLibrary(),
    window.electronAPI.playlistGetAll(),
    window.electronAPI.artistGetAll(),
  ]);

  setLibrary(library);
  setAllPlaylists(playlists);
  setAllArtists(artists);

  const activePage =
    document.querySelector(".nav-item.active")?.dataset.page || "home";

  switch (activePage) {
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

  if (AppState.currentlyPlayingIndex > -1) {
    renderUpNextList();
  }
}

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
  document.addEventListener("click", () => {
    videoContextMenu.classList.remove("visible");
    playlistContextMenu.classList.remove("visible");
  });

  videoContextMenu.addEventListener("click", (e) => e.stopPropagation());
  playlistContextMenu.addEventListener("click", (e) => e.stopPropagation());

  contextDeleteBtn.addEventListener("click", async () => {
    const videoId = videoContextMenu.dataset.videoId;
    if (videoId) {
      showConfirmationModal(
        "Delete Video?",
        "Are you sure you want to permanently delete this video and its associated files?",
        async () => {
          const result = await window.electronAPI.deleteVideo(videoId);
          if (result.success) {
            if (
              AppState.currentlyPlayingIndex > -1 &&
              AppState.playbackQueue[AppState.currentlyPlayingIndex]?.id ===
                videoId
            ) {
              closeMiniplayer();
              videoPlayer.src = "";
              resetPlaybackState();
              updateVideoDetails(null);
              renderUpNextList();
            }
            showNotification("Video deleted successfully.", "success");
            await loadLibrary();
          } else {
            showNotification(`Error: ${result.error}`, "error");
          }
        }
      );
    }
    videoContextMenu.classList.remove("visible");
  });

  contextRemoveFromPlaylistBtn.addEventListener("click", async () => {
    const videoId = videoContextMenu.dataset.videoId;
    const playlistId = currentPlaylistId;
    if (videoId && playlistId) {
      const result = await window.electronAPI.playlistRemoveVideo(
        playlistId,
        videoId
      );
      if (result.success) {
        showNotification("Removed video from playlist.", "success");
        const { renderPlaylistDetailPage } = await import("./playlists.js");
        await renderPlaylistDetailPage(playlistId);
      } else {
        showNotification(`Error: ${result.error}`, "error");
      }
    }
    videoContextMenu.classList.remove("visible");
  });
}

// --- App Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  showLoader();
  await loadLibrary();
  renderHomePageGrid();
  showPage("home");
  hideLoader();

  initializeMiniplayer();
  initializeWindowControls();
  initializeContextMenu();
  initializePlaylistContextMenus();
  initializeSettingsPage();
  loadSettings();

  sidebarNav.addEventListener("click", handleNav);
  sidebarNavBottom.addEventListener("click", handleNav);
});

// Expose currentPlaylistId setter for other modules
export function setCurrentPlaylistId(id) {
  currentPlaylistId = id;
}
