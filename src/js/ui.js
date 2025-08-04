// src/js/ui.js
import { AppState } from "./state.js";
import { showPage } from "./renderer.js";
import { playLibraryItem, formatTime } from "./player.js";
import { openAddToPlaylistModal } from "./playlists.js";
import { renderArtistsPage } from "./artists.js";
import { renderPlaylistsPage } from "./playlists.js";
import { showLoader, hideLoader } from "./renderer.js";

// --- Element Selectors ---
const sidebarToggle = document.getElementById("sidebar-toggle");
const logoHomeButton = document.getElementById("logo-home-button");
const homeSearchInput = document.getElementById("home-search-input");
const favoriteBtn = document.getElementById("favorite-btn");
const videoContextMenu = document.getElementById("video-item-context-menu");
const contextRemoveFromPlaylistBtn = document.getElementById(
  "context-remove-from-playlist-btn"
);

// --- Debounce Utility ---
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// --- Event Listeners ---
sidebarToggle.addEventListener("click", () => {
  document.querySelector(".sidebar").classList.toggle("collapsed");
  localStorage.setItem(
    "sidebarCollapsed",
    document.querySelector(".sidebar").classList.contains("collapsed")
  );
});

logoHomeButton.addEventListener("click", (e) => {
  e.preventDefault();
  showPage("home");
  renderHomePageGrid();
});

// --- Grid Rendering ---
/**
 * Creates the HTML for a single video grid item.
 * @param {object} item - The video data object.
 * @returns {string} The inner HTML string for the grid item element.
 */
export function renderGridItem(item, isPlaylistItem = false) {
  const audioIconOverlay =
    item.type === "audio"
      ? '<div class="thumbnail-overlay-icon"><i class="fa-solid fa-music"></i></div>'
      : "";
  return `
        <div class="video-grid-item" data-id="${item.id}" ${
    isPlaylistItem ? `data-playlist-item="true"` : ""
  }>
            <div class="grid-thumbnail-container">
                <img src="${
                  item.coverPath
                    ? decodeURIComponent(item.coverPath)
                    : "../assets/logo.png"
                }" class="grid-thumbnail" alt="thumbnail" onerror="this.onerror=null;this.src='../assets/logo.png';">
                ${audioIconOverlay}
                <span class="thumbnail-duration">${formatTime(
                  item.duration || 0
                )}</span>
            </div>
            <div class="grid-item-details">
                <div class="grid-item-info">
                    <p class="grid-item-title">${item.title}</p>
                    <p class="grid-item-meta">${
                      item.creator || item.uploader || "Unknown"
                    }</p>
                </div>
                <div class="grid-item-actions">
                    <button class="grid-item-action-btn favorite-btn ${
                      item.isFavorite ? "is-favorite" : ""
                    }" title="${item.isFavorite ? "Unfavorite" : "Favorite"}">
                        <i class="fa-${
                          item.isFavorite ? "solid" : "regular"
                        } fa-heart"></i>
                    </button>
                    <button class="grid-item-action-btn save-to-playlist-grid-btn" title="Save to Playlist"><i class="fa-solid fa-plus"></i></button>
                    <button class="grid-item-action-btn menu-btn" title="More">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                </div>
            </div>
        </div>`;
}

function renderGrid(container, library, isPlaylistItem = false) {
  if (!container) return;
  const fragment = document.createDocumentFragment();
  if (library && library.length > 0) {
    library.forEach((item) => {
      const gridItem = document.createElement("div");
      gridItem.className = "video-grid-item";
      gridItem.dataset.id = item.id;
      if (isPlaylistItem) {
        gridItem.dataset.playlistItem = "true";
      }
      gridItem.innerHTML = renderGridItem(item, isPlaylistItem); // Corrected this line
      fragment.appendChild(gridItem);
    });
  }
  container.innerHTML = "";
  container.appendChild(fragment);
}

function ensureGridExists(pageElement, gridId) {
  let grid = document.getElementById(gridId);
  if (!grid) {
    pageElement.innerHTML = `<div class="video-grid" id="${gridId}"></div>`;
    grid = document.getElementById(gridId);
  }
  return grid;
}

export function renderHomePageGrid(library = AppState.library) {
  const homePage = document.getElementById("home-page");
  if (AppState.library.length === 0) {
    homePage.innerHTML = `<div class="placeholder-page"><i class="fa-solid fa-house-chimney-crack placeholder-icon"></i><h2 class="placeholder-title">Your Library is Empty</h2><p class="placeholder-text">Go to the <span class="link-style" id="go-to-downloads-link">Downloads</span> page to get started.</p></div>`;
    document
      .getElementById("go-to-downloads-link")
      ?.addEventListener("click", () => showPage("downloads"));
  } else {
    const grid = ensureGridExists(homePage, "video-grid");
    if (library.length === 0 && homeSearchInput.value) {
      grid.innerHTML =
        '<p class="empty-message">No items match your search.</p>';
    } else {
      renderGrid(grid, library);
    }
  }
  hideLoader();
}

export function renderFavoritesPage(library) {
  const favoritesPage = document.getElementById("favorites-page");
  const favoritesLibrary = AppState.library.filter((video) => video.isFavorite);
  const libraryToRender = library || favoritesLibrary;
  const placeholder = favoritesPage.querySelector(".placeholder-page");
  const grid = ensureGridExists(favoritesPage, "video-grid-favorites");

  if (favoritesLibrary.length === 0) {
    if (placeholder) placeholder.style.display = "flex";
    if (grid) grid.innerHTML = "";
  } else {
    if (placeholder) placeholder.style.display = "none";
    if (libraryToRender.length === 0 && homeSearchInput.value) {
      grid.innerHTML =
        '<p class="empty-message">No favorite items match your search.</p>';
    } else {
      renderGrid(grid, libraryToRender);
    }
  }
  hideLoader();
}

// --- Grid Interaction ---
function handleGridClick(event) {
  const itemEl = event.target.closest(".video-grid-item");
  if (!itemEl) return;
  const videoId = itemEl.dataset.id;
  const sourceLib = event.target.closest("#video-grid-playlist")
    ? AppState.playbackQueue
    : AppState.library;

  if (event.target.closest(".menu-btn")) {
    event.stopPropagation();
    const menuBtn = event.target.closest(".menu-btn");
    const rect = menuBtn.getBoundingClientRect();
    videoContextMenu.style.left = `${
      rect.left - videoContextMenu.offsetWidth + rect.width
    }px`;
    videoContextMenu.style.top = `${rect.bottom + 5}px`;
    videoContextMenu.dataset.videoId = videoId;
    if (itemEl.dataset.playlistItem) {
      contextRemoveFromPlaylistBtn.style.display = "flex";
    } else {
      contextRemoveFromPlaylistBtn.style.display = "none";
    }
    videoContextMenu.classList.add("visible");
    return;
  }
  if (event.target.closest(".favorite-btn")) {
    event.stopPropagation();
    toggleFavoriteStatus(videoId);
    return;
  }
  if (event.target.closest(".save-to-playlist-grid-btn")) {
    event.stopPropagation();
    openAddToPlaylistModal(videoId);
    return;
  }
  const videoIndex = sourceLib.findIndex((v) => v.id === videoId);
  if (videoIndex > -1) playLibraryItem(videoIndex, sourceLib);
}

document.getElementById("home-page").addEventListener("click", handleGridClick);
document
  .getElementById("favorites-page")
  .addEventListener("click", handleGridClick);
document
  .getElementById("playlist-detail-page")
  .addEventListener("click", handleGridClick);
document
  .getElementById("artist-detail-page")
  .addEventListener("click", handleGridClick);

export async function toggleFavoriteStatus(videoId) {
  const result = await window.electronAPI.toggleFavorite(videoId);
  if (result.success) {
    const localVideo = AppState.library.find((v) => v.id === videoId);
    if (localVideo) localVideo.isFavorite = result.isFavorite;
    const playbackVideo = AppState.playbackQueue.find((v) => v.id === videoId);
    if (playbackVideo) playbackVideo.isFavorite = result.isFavorite;
    updateFavoriteStatusInUI(videoId, result.isFavorite);
    const activePage = document.querySelector(".nav-item.active")?.dataset.page;
    if (activePage === "favorites") {
      renderFavoritesPage();
    }
  }
}

export function updateFavoriteStatusInUI(videoId, isFavorite) {
  if (
    AppState.currentlyPlayingIndex > -1 &&
    AppState.playbackQueue[AppState.currentlyPlayingIndex]?.id === videoId
  ) {
    favoriteBtn.classList.toggle("is-favorite", isFavorite);
    const playerIcon = favoriteBtn.querySelector("i");
    playerIcon.className = `fa-solid fa-heart`;
  }
  const gridItems = document.querySelectorAll(
    `.video-grid-item[data-id="${videoId}"]`
  );
  gridItems.forEach((item) => {
    const gridBtn = item.querySelector(".favorite-btn");
    if (gridBtn) {
      gridBtn.classList.toggle("is-favorite", isFavorite);
      gridBtn.title = isFavorite ? "Unfavorite" : "Favorite";
      const gridIcon = gridBtn.querySelector("i");
      gridIcon.className = `fa-${isFavorite ? "solid" : "regular"} fa-heart`;
    }
  });
}

// --- Debounced Search ---
const debouncedSearch = debounce((term, page) => {
  switch (page) {
    case "home": {
      const filtered = AppState.library.filter(
        (v) =>
          v.title.toLowerCase().includes(term) ||
          (v.creator && v.creator.toLowerCase().includes(term)) ||
          (v.uploader && v.uploader.toLowerCase().includes(term))
      );
      renderHomePageGrid(filtered);
      break;
    }
    case "favorites": {
      const favoritesLibrary = AppState.library.filter((v) => v.isFavorite);
      const filtered = favoritesLibrary.filter(
        (v) =>
          v.title.toLowerCase().includes(term) ||
          (v.creator && v.creator.toLowerCase().includes(term)) ||
          (v.uploader && v.uploader.toLowerCase().includes(term))
      );
      renderFavoritesPage(filtered);
      break;
    }
    case "playlists": {
      const filtered = AppState.playlists.filter((p) =>
        p.name.toLowerCase().includes(term)
      );
      renderPlaylistsPage(filtered);
      break;
    }
    case "artists": {
      const filtered = AppState.artists.filter((a) =>
        a.name.toLowerCase().includes(term)
      );
      renderArtistsPage(filtered);
      break;
    }
  }
}, 300);

homeSearchInput.addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase().trim();
  const activeNavItem = document.querySelector(".nav-item.active");
  if (!activeNavItem) return;
  const activePage = activeNavItem.dataset.page;
  showLoader(); // Show loader while search is processing
  debouncedSearch(searchTerm, activePage);
});
