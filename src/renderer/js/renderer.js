// src/renderer/js/renderer.js
import {
  AppState,
  setLibrary,
  setAllPlaylists,
  setAllArtists,
  resetPlaybackState,
  setAssetsPath,
} from "./state.js";
import {
  renderHomePageGrid,
  renderFavoritesPage,
  updateSearchPlaceholder,
  initializeUI,
} from "./ui.js";
import {
  renderPlaylistsPage,
  initializePlaylistContextMenus,
  renderPlaylistDetailPage,
} from "./playlists.js";
import { renderArtistsPage } from "./artists.js";
import {
  updateVideoDetails,
  renderUpNextList,
  loadSettings as loadPlayerSettings,
  enterEditMode,
} from "./player.js";
import {
  activateMiniplayer,
  deactivateMiniplayer,
  closeMiniplayer,
  initializeMiniplayer,
} from "./miniplayer.js";
import {
  initializeSettingsPage,
  loadSettings as loadAppSettings,
} from "./settings.js";
import { showConfirmationModal } from "./modals.js";
import { showNotification } from "./notifications.js";
import { eventBus } from "./event-bus.js";

const pages = document.querySelectorAll(".page");
const homeSearchInput = document.getElementById("home-search-input");
const playerPage = document.getElementById("player-page");
const videoPlayer = document.getElementById("video-player");
const trayBtn = document.getElementById("tray-btn");
const minimizeBtn = document.getElementById("minimize-btn");
const maximizeBtn = document.getElementById("maximize-btn");
const closeBtn = document.getElementById("close-btn");
const videoContextMenu = document.getElementById("video-item-context-menu");
const contextEditBtn = document.getElementById("context-edit-btn");
const contextDeleteBtn = document.getElementById("context-delete-btn");
const contextRemoveFromPlaylistBtn = document.getElementById(
  "context-remove-from-playlist-btn"
);
const playlistContextMenu = document.getElementById(
  "playlist-item-context-menu"
);
const loaderOverlay = document.getElementById("loader-overlay");

let currentPlaylistId = null;

export function showLoader() {
  loaderOverlay.classList.remove("hidden");
}
export function hideLoader() {
  loaderOverlay.classList.add("hidden");
}

export function showPage(pageId, isSubPage = false) {
  const isPlayerPageVisible = !playerPage.classList.contains("hidden");
  const targetPageId = isSubPage ? pageId : `${pageId}-page`;
  const shouldActivateMiniplayer =
    isPlayerPageVisible &&
    targetPageId !== "player-page" &&
    videoPlayer.src &&
    !videoPlayer.ended;

  if (shouldActivateMiniplayer) activateMiniplayer();
  pages.forEach((page) =>
    page.classList.toggle("hidden", page.id !== targetPageId)
  );

  if (!isSubPage) {
    document
      .querySelectorAll(".nav-item")
      .forEach((item) =>
        item.classList.toggle("active", item.dataset.page === pageId)
      );
    updateSearchPlaceholder(pageId);
  }

  if (homeSearchInput.value) {
    homeSearchInput.value = "";
    homeSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  if (targetPageId === "player-page") deactivateMiniplayer();
  if (
    isPlayerPageVisible &&
    !shouldActivateMiniplayer &&
    targetPageId !== "player-page" &&
    !videoPlayer.paused
  ) {
    eventBus.emit("controls:pause");
  }
}

export async function handleNav(pageId) {
  showLoader();
  showPage(pageId);
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
        hideLoader();
        break;
    }
  } catch (error) {
    console.error(`Error rendering page ${pageId}:`, error);
    hideLoader();
  }
}

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
  if (AppState.currentlyPlayingIndex > -1) renderUpNextList();
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

  contextEditBtn.addEventListener("click", () => {
    videoContextMenu.classList.remove("visible");
    const videoId = videoContextMenu.dataset.videoId;
    if (!videoId) return;

    if (
      AppState.currentlyPlayingIndex > -1 &&
      AppState.playbackQueue[AppState.currentlyPlayingIndex].id === videoId
    ) {
      showPage("player");
      enterEditMode();
    } else {
      const videoIndex = AppState.library.findIndex((v) => v.id === videoId);
      if (videoIndex > -1) {
        eventBus.emit("player:play_request", videoIndex, AppState.library, {
          startInEditMode: true,
        });
      }
    }
  });

  contextDeleteBtn.addEventListener("click", () => {
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
        await renderPlaylistDetailPage(playlistId);
      } else {
        showNotification(`Error: ${result.error}`, "error");
      }
    }
    videoContextMenu.classList.remove("visible");
  });
}

function initializeCustomSelects() {
  document.addEventListener("click", (e) => {
    const selectContainer = e.target.closest(".custom-select-container");

    document
      .querySelectorAll(".custom-select-container.open")
      .forEach((openSelect) => {
        if (openSelect !== selectContainer) {
          openSelect.classList.remove("open");
        }
      });

    if (selectContainer) {
      if (e.target.closest(".selected-option")) {
        selectContainer.classList.toggle("open");
      }

      const optionItem = e.target.closest(".option-item");
      if (optionItem) {
        const selectedOption =
          selectContainer.querySelector(".selected-option");
        const previouslySelected = selectContainer.querySelector(
          ".option-item.selected"
        );

        if (previouslySelected) previouslySelected.classList.remove("selected");
        optionItem.classList.add("selected");

        selectedOption.dataset.value = optionItem.dataset.value;
        selectedOption.querySelector("span:first-child").textContent =
          optionItem.textContent;
        selectContainer.classList.remove("open");

        selectContainer.dispatchEvent(
          new CustomEvent("change", { bubbles: true })
        );
      }
    }
  });
}

function initializeMediaKeyListeners() {
  window.electronAPI.onMediaKeyPlayPause(() =>
    eventBus.emit("controls:toggle_play")
  );
  window.electronAPI.onMediaKeyNextTrack(() => eventBus.emit("controls:next"));
  window.electronAPI.onMediaKeyPrevTrack(() => eventBus.emit("controls:prev"));
}

function initializeAppEventListeners() {
  eventBus.on("controls:close_player", () => {
    videoPlayer.pause();
    videoPlayer.src = "";
    resetPlaybackState();
    updateVideoDetails(null);
    renderUpNextList();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  showLoader();
  const assetsPath = await window.electronAPI.getAssetsPath();
  setAssetsPath(assetsPath);

  await loadLibrary();
  renderHomePageGrid();
  showPage("home");
  hideLoader();

  initializeUI();
  initializeMiniplayer();
  initializeWindowControls();
  initializeCustomSelects();
  initializeContextMenu();
  initializePlaylistContextMenus();
  initializeSettingsPage();
  initializeAppEventListeners();
  loadPlayerSettings();
  loadAppSettings();
  initializeMediaKeyListeners();
});

export function setCurrentPlaylistId(id) {
  currentPlaylistId = id;
}
