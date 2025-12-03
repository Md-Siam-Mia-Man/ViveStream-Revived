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
  createGridItem,
  setHeaderActions,
  createHeaderActionsElement,
  createFilterPanel,
} from "./ui.js";
import {
  renderPlaylistsPage,
  initializePlaylistContextMenus,
  renderPlaylistDetailPage,
  renderPlaylistCard,
} from "./playlists.js";
import { renderArtistsPage, renderArtistCard } from "./artists.js";
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
import { fuzzySearch } from "./utils.js";

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
const contextExportBtn = document.getElementById("context-export-btn");
const contextDeleteBtn = document.getElementById("context-delete-btn");
const contextRemoveFromPlaylistBtn = document.getElementById(
  "context-remove-from-playlist-btn"
);
const playlistContextMenu = document.getElementById(
  "playlist-item-context-menu"
);
const loaderOverlay = document.getElementById("loader-overlay");
const contentWrapper = document.querySelector(".content-wrapper");

let currentPlaylistId = null;

const lazyLoadObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const src = img.dataset.src;
        if (src) {
          img.src = src;
        }
        img.classList.remove("lazy");
        observer.unobserve(img);
      }
    });
  },
  { rootMargin: "0px 0px 200px 0px" }
);

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

  if (targetPageId === "player-page") {
    deactivateMiniplayer();
    contentWrapper.scrollTo(0, 0);
    // Explicitly set header actions for player page so filtering works
    setHeaderActions(createHeaderActionsElement());

    // Ensure filter panel is present if not already appended
    if (!playerPage.querySelector(".filter-panel")) {
      const panel = createFilterPanel();
      playerPage.insertBefore(panel, playerPage.firstChild);
    }
  }

  if (
    isPlayerPageVisible &&
    !shouldActivateMiniplayer &&
    targetPageId !== "player-page" &&
    !videoPlayer.paused
  ) {
    eventBus.emit("controls:pause");
  }

  if (pageId === 'settings' || pageId === 'downloads') {
    setHeaderActions(null);
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

export function renderSearchPage(term) {
  const searchPage =
    document.getElementById("search-page") || document.createElement("div");
  searchPage.id = "search-page";
  searchPage.className = "page";
  contentWrapper.appendChild(searchPage);

  showPage("search-page", true);
  setHeaderActions(null);

  const videoResults = fuzzySearch(term, AppState.library, [
    "title",
    "creator",
  ]);
  const playlistResults = fuzzySearch(term, AppState.playlists, ["name"]);
  const artistResults = fuzzySearch(term, AppState.artists, ["name"]);

  searchPage.innerHTML = `
        <div class="page-header"><h1 class="page-header-title">Search Results for "${term}"</h1></div>
        <div class="page-content"></div>
    `;

  const content = searchPage.querySelector(".page-content");
  const template = document.getElementById("search-results-section-template");

  const createSection = (title, items, renderFn, gridClass) => {
    if (items.length === 0) return;
    const section = template.content.cloneNode(true);
    section.querySelector(".search-section-title").textContent = title;
    const grid = section.querySelector(".search-section-grid");
    grid.classList.add(gridClass);
    items.forEach((item) => grid.appendChild(renderFn(item)));
    content.appendChild(section);
  };

  createSection("Videos", videoResults, createGridItem, "video-grid");
  createSection(
    "Playlists",
    playlistResults,
    renderPlaylistCard,
    "playlist-grid"
  );
  createSection("Artists", artistResults, renderArtistCard, "artist-grid");

  if (content.children.length === 0) {
    content.innerHTML = `<p class="empty-message">No results found for "<strong>${term}</strong>".</p>`;
  }

  content
    .querySelectorAll("img.lazy")
    .forEach((img) => lazyLoadObserver.observe(img));

  hideLoader();
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
  // Removed logic that updated text content of spans, as they no longer exist.
}

function initializeContextMenu() {
  const hideContextMenus = () => {
    if (videoContextMenu.classList.contains("visible")) {
      videoContextMenu.classList.remove("visible");
    }
    if (playlistContextMenu.classList.contains("visible")) {
      playlistContextMenu.classList.remove("visible");
    }
  };

  document.addEventListener("click", hideContextMenus);
  document.addEventListener("scroll", hideContextMenus, true);
  window.addEventListener("resize", hideContextMenus);

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
        eventBus.emit("player:play_request", {
          index: videoIndex,
          queue: AppState.library,
          options: { startInEditMode: true },
        });
      }
    }
  });

  contextExportBtn.addEventListener("click", async () => {
    const videoId = videoContextMenu.dataset.videoId;
    if (videoId) {
      const result = await window.electronAPI.mediaExportFile(videoId);
      if (result.success) {
        showNotification("File exported successfully.", "success");
      } else if (result.error !== "Export cancelled.") {
        showNotification(`Export failed: ${result.error}`, "error");
      }
    }
    videoContextMenu.classList.remove("visible");
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
              handleNav("home");
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

function initializeExternalFileHandler() {
  window.electronAPI.onPlayExternalFile((filePath) => {
    const fileName = filePath.split(/[\\/]/).pop();
    const isAudio = /\.(mp3|m4a|wav|flac|opus)$/i.test(fileName);
    const fileUrl = "file://" + filePath.replace(/\\/g, "/");

    const tempVideoObject = {
      id: `external-${Date.now()}`,
      title: fileName,
      creator: "External Media",
      filePath: fileUrl,
      coverPath: null,
      type: isAudio ? "audio" : "video",
      isFavorite: false,
      upload_date: new Date().toISOString(),
      duration: 0
    };

    // Play request for this temporary item
    // We pass it as a single-item queue
    eventBus.emit("player:play_request", {
      index: 0,
      queue: [tempVideoObject],
      context: { type: "external", id: null, name: "External File" }
    });
  });
}

function applyTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.body.classList.toggle("light-theme", savedTheme === "light");
}

document.addEventListener("DOMContentLoaded", async () => {
  showLoader();
  applyTheme();

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
  initializeExternalFileHandler();
  loadPlayerSettings();
  loadAppSettings();
  initializeMediaKeyListeners();
});

export function setCurrentPlaylistId(id) {
  currentPlaylistId = id;
}