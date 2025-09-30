// src/renderer/js/ui.js
import { AppState } from "./state.js";
import { showPage, handleNav, showLoader, hideLoader } from "./renderer.js";
import { formatTime, debounce } from "./utils.js";
import { eventBus } from "./event-bus.js";
import { openAddToPlaylistModal } from "./playlists.js";
import { renderArtistsPage } from "./artists.js";
import { renderPlaylistsPage } from "./playlists.js";

const homeSearchInput = document.getElementById("home-search-input");
const videoContextMenu = document.getElementById("video-item-context-menu");
const contextRemoveFromPlaylistBtn = document.getElementById(
  "context-remove-from-playlist-btn"
);
const gridItemTemplate = document.getElementById("video-grid-item-template");
const sidebar = document.querySelector(".sidebar");

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

export function createGridItem(item, isPlaylistItem = false) {
  const clone = gridItemTemplate.content.cloneNode(true);
  const element = clone.querySelector(".video-grid-item");
  const thumbnail = element.querySelector(".grid-thumbnail");
  const overlayIconContainer = element.querySelector(".thumbnail-overlay-icon");
  const favoriteBtn = element.querySelector(".favorite-btn");
  const favoriteIcon = favoriteBtn.querySelector("i");

  element.dataset.id = item.id;
  if (isPlaylistItem) {
    element.dataset.playlistItem = "true";
  }

  const placeholderSrc = `${AppState.assetsPath}/logo.png`;
  const actualSrc = item.coverPath
    ? decodeURIComponent(item.coverPath)
    : placeholderSrc;
  thumbnail.dataset.src = actualSrc;
  thumbnail.src = placeholderSrc;
  thumbnail.onerror = () => {
    thumbnail.onerror = null;
    thumbnail.src = placeholderSrc;
  };

  if (item.type === "audio") {
    overlayIconContainer.innerHTML = '<i class="fa-solid fa-music"></i>';
  }

  element.querySelector(".thumbnail-duration").textContent = formatTime(
    item.duration || 0
  );
  element.querySelector(".grid-item-title").textContent = item.title;
  element.querySelector(".grid-item-meta").textContent =
    item.creator || item.uploader || "Unknown";

  favoriteBtn.classList.toggle("is-favorite", !!item.isFavorite);
  favoriteBtn.title = item.isFavorite ? "Unfavorite" : "Favorite";
  favoriteIcon.className = `fa-${
    item.isFavorite ? "solid" : "regular"
  } fa-heart`;

  return element;
}

function renderGrid(container, library, isPlaylistItem = false) {
  if (!container) return;

  container.innerHTML = "";
  const fragment = document.createDocumentFragment();
  if (library && library.length > 0) {
    library.forEach((item) => {
      const gridItem = createGridItem(item, isPlaylistItem);
      fragment.appendChild(gridItem);
    });
  }
  container.appendChild(fragment);

  container
    .querySelectorAll("img.lazy")
    .forEach((img) => lazyLoadObserver.observe(img));
}

function ensureGridExists(pageElement, gridId) {
  let grid = document.getElementById(gridId);
  if (!grid) {
    const placeholder = pageElement.querySelector(".placeholder-page");
    const newGridHtml = `<div class="video-grid" id="${gridId}"></div>`;
    if (placeholder) {
      placeholder.insertAdjacentHTML("afterend", newGridHtml);
    } else if (pageElement.querySelector(".page-header")) {
      pageElement
        .querySelector(".page-header")
        .insertAdjacentHTML("afterend", newGridHtml);
    } else {
      pageElement.innerHTML = newGridHtml;
    }
    grid = document.getElementById(gridId);
  }
  return grid;
}

export function renderHomePageGrid(library = AppState.library) {
  const homePage = document.getElementById("home-page");
  if (AppState.library.length === 0) {
    homePage.innerHTML = `<div class="placeholder-page"><i class="fa-solid fa-house-chimney-crack placeholder-icon"></i><h2 class="placeholder-title">Your Library is Empty</h2><p class="placeholder-text">Go to the <span class="link-style" id="go-to-downloads-link">Downloads</span> page to get started.</p></div>`;
  } else {
    const grid = ensureGridExists(homePage, "video-grid-home");
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

  const hasFavorites = favoritesLibrary.length > 0;
  placeholder.style.display = hasFavorites ? "none" : "flex";
  grid.style.display = hasFavorites ? "grid" : "none";

  if (hasFavorites) {
    if (libraryToRender.length === 0 && homeSearchInput.value) {
      grid.innerHTML = `<p class="empty-message">No favorite items match "<strong>${homeSearchInput.value}</strong>"</p>`;
    } else {
      renderGrid(grid, libraryToRender);
    }
  }
  hideLoader();
}

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

  document
    .querySelectorAll(`.video-grid-item[data-id="${videoId}"]`)
    .forEach((item) => {
      const gridBtn = item.querySelector(".favorite-btn");
      if (gridBtn) {
        gridBtn.classList.toggle("is-favorite", isFavorite);
        gridBtn.title = isFavorite ? "Unfavorite" : "Favorite";
        gridBtn.querySelector("i").className = `fa-${
          isFavorite ? "solid" : "regular"
        } fa-heart`;
      }
    });

  const activePage = document.querySelector(".nav-item.active")?.dataset.page;
  if (activePage === "favorites") {
    renderFavoritesPage();
  }
}

eventBus.on("ui:favorite_toggled", updateFavoriteUI);

export function updateSearchPlaceholder(pageId) {
  let placeholderText = "Search...";
  let isSearchable = true;
  switch (pageId) {
    case "home":
    case "favorites":
      placeholderText = "Search your library...";
      break;
    case "playlists":
      placeholderText = "Search playlists...";
      break;
    case "artists":
      placeholderText = "Search artists...";
      break;
    default:
      placeholderText = "Search is unavailable";
      isSearchable = false;
  }
  homeSearchInput.placeholder = placeholderText;
  homeSearchInput.disabled = !isSearchable;
}

const debouncedSearchHandler = debounce((term, page) => {
  const lowerTerm = term.toLowerCase().trim();
  switch (page) {
    case "home":
      renderHomePageGrid(
        AppState.library.filter(
          (v) =>
            v.title.toLowerCase().includes(lowerTerm) ||
            v.creator?.toLowerCase().includes(lowerTerm)
        )
      );
      break;
    case "favorites":
      renderFavoritesPage(
        AppState.library.filter(
          (v) =>
            v.isFavorite &&
            (v.title.toLowerCase().includes(lowerTerm) ||
              v.creator?.toLowerCase().includes(lowerTerm))
        )
      );
      break;
    case "playlists":
      renderPlaylistsPage(
        AppState.playlists.filter((p) =>
          p.name.toLowerCase().includes(lowerTerm)
        )
      );
      break;
    case "artists":
      renderArtistsPage(
        AppState.artists.filter((a) => a.name.toLowerCase().includes(lowerTerm))
      );
      break;
    default:
      hideLoader();
  }
}, 300);

function initializeMainEventListeners() {
  document.body.addEventListener("click", (e) => {
    const itemEl = e.target.closest(".video-grid-item");
    if (itemEl) {
      const videoId = itemEl.dataset.id;
      const sourceLib = e.target.closest("#video-grid-playlist")
        ? AppState.playbackQueue
        : AppState.library;

      if (e.target.closest(".menu-btn")) {
        e.stopPropagation();
        const menuBtn = e.target.closest(".menu-btn");
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
      if (e.target.closest(".favorite-btn")) {
        e.stopPropagation();
        toggleFavoriteStatus(videoId);
        return;
      }
      if (e.target.closest(".save-to-playlist-grid-btn")) {
        e.stopPropagation();
        openAddToPlaylistModal(videoId);
        return;
      }
      const videoIndex = sourceLib.findIndex((v) => v.id === videoId);
      if (videoIndex > -1) {
        eventBus.emit("player:play_request", videoIndex, sourceLib);
      }
      return;
    }

    const navItem = e.target.closest(".nav-item");
    if (navItem) {
      handleNav(navItem.dataset.page);
      return;
    }

    if (e.target.closest("#logo-home-button")) {
      const isPinned = sidebar.classList.toggle("pinned");
      localStorage.setItem("sidebarPinned", isPinned);
      return;
    }

    if (e.target.closest("#go-to-downloads-link")) {
      handleNav("downloads");
    }
  });

  homeSearchInput.addEventListener("input", (e) => {
    if (homeSearchInput.disabled) return;
    const searchTerm = e.target.value;
    const activeNavItem = document.querySelector(".nav-item.active");
    if (!activeNavItem) {
      hideLoader();
      return;
    }
    showLoader();
    debouncedSearchHandler(searchTerm, activeNavItem.dataset.page);
  });
}

export function initializeUI() {
  if (localStorage.getItem("sidebarPinned") === "true") {
    sidebar.classList.add("pinned");
  }
  initializeMainEventListeners();
}
