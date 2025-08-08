// src/renderer/js/ui.js
import { AppState } from "./state.js";
import { showPage } from "./renderer.js";
import { formatTime, debounce } from "./utils.js";
import { eventBus } from "./event-bus.js";
import { openAddToPlaylistModal } from "./playlists.js";
import { renderArtistsPage } from "./artists.js";
import { renderPlaylistsPage } from "./playlists.js";
import { showLoader, hideLoader } from "./renderer.js";

// --- Element Selectors ---
const sidebarToggle = document.getElementById("sidebar-toggle");
const logoHomeButton = document.getElementById("logo-home-button");
const homeSearchInput = document.getElementById("home-search-input");
const videoContextMenu = document.getElementById("video-item-context-menu");
const contextRemoveFromPlaylistBtn = document.getElementById(
  "context-remove-from-playlist-btn"
);

// --- Lazy Loading ---
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
export function renderGridItem(item, isPlaylistItem = false) {
  const audioIconOverlay =
    item.type === "audio"
      ? '<div class="thumbnail-overlay-icon"><i class="fa-solid fa-music"></i></div>'
      : "";
  const placeholderSrc = `${AppState.assetsPath}/logo.png`;
  const actualSrc = item.coverPath
    ? decodeURIComponent(item.coverPath)
    : placeholderSrc;

  return `
        <div class="video-grid-item" data-id="${item.id}" ${
          isPlaylistItem ? `data-playlist-item="true"` : ""
        }>
            <div class="grid-thumbnail-container">
                <img data-src="${actualSrc}" src="${placeholderSrc}" class="grid-thumbnail lazy" alt="thumbnail" onerror="this.onerror=null;this.src='${placeholderSrc}';">
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
      const gridItemWrapper = document.createElement("div");
      gridItemWrapper.innerHTML = renderGridItem(item, isPlaylistItem);
      const gridItem = gridItemWrapper.firstElementChild;
      fragment.appendChild(gridItem);
    });
  }

  container.innerHTML = "";
  container.appendChild(fragment);

  container
    .querySelectorAll("img.lazy")
    .forEach((img) => lazyLoadObserver.observe(img));
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
      grid.innerHTML = `<p class="empty-message">No results found for "<strong>${homeSearchInput.value}</strong>"</p>`;
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
      grid.innerHTML = `<p class="empty-message">No favorite items match "<strong>${homeSearchInput.value}</strong>"</p>`;
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
    contextRemoveFromPlaylistBtn.style.display = itemEl.dataset.playlistItem
      ? "flex"
      : "none";
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
  if (videoIndex > -1) {
    eventBus.emit("player:play_request", videoIndex, sourceLib);
  }
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

    eventBus.emit("ui:favorite_toggled", videoId, result.isFavorite);
  }
}

function updateFavoriteUI(videoId, isFavorite) {
  if (
    AppState.currentlyPlayingIndex > -1 &&
    AppState.playbackQueue[AppState.currentlyPlayingIndex]?.id === videoId
  ) {
    const favoriteBtn = document.getElementById("favorite-btn");
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

  const activePage = document.querySelector(".nav-item.active")?.dataset.page;
  if (activePage === "favorites") {
    renderFavoritesPage();
  }
}

eventBus.on("ui:favorite_toggled", updateFavoriteUI);

// --- Debounced Search ---
const debouncedSearchHandler = debounce((term, page) => {
  const lowerTerm = term.toLowerCase().trim();
  switch (page) {
    case "home": {
      const filtered = AppState.library.filter(
        (v) =>
          v.title.toLowerCase().includes(lowerTerm) ||
          v.creator?.toLowerCase().includes(lowerTerm)
      );
      renderHomePageGrid(filtered);
      break;
    }
    case "favorites": {
      const favoritesLibrary = AppState.library.filter((v) => v.isFavorite);
      const filtered = favoritesLibrary.filter(
        (v) =>
          v.title.toLowerCase().includes(lowerTerm) ||
          v.creator?.toLowerCase().includes(lowerTerm)
      );
      renderFavoritesPage(filtered);
      break;
    }
    case "playlists": {
      const filtered = AppState.playlists.filter((p) =>
        p.name.toLowerCase().includes(lowerTerm)
      );
      renderPlaylistsPage(filtered);
      break;
    }
    case "artists": {
      const filtered = AppState.artists.filter((a) =>
        a.name.toLowerCase().includes(lowerTerm)
      );
      renderArtistsPage(filtered);
      break;
    }
  }
  hideLoader();
}, 300);

homeSearchInput.addEventListener("input", (e) => {
  const searchTerm = e.target.value;
  const activeNavItem = document.querySelector(".nav-item.active");
  if (!activeNavItem) return;
  const activePage = activeNavItem.dataset.page;
  showLoader();
  debouncedSearchHandler(searchTerm, activePage);
});
