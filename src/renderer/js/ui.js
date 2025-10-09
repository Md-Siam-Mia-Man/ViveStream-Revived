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

let currentSort = localStorage.getItem("librarySort") || "downloadedAt-desc";

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

function sortLibrary(library, sortKey) {
  const [key, direction] = sortKey.split("-");
  return [...library].sort((a, b) => {
    let valA = a[key];
    let valB = b[key];

    if (key === "title") {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return direction === "asc" ? -1 : 1;
    if (valA > valB) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

function renderGrid(container, library, isPlaylistItem = false) {
  if (!container) return;
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();
  if (library && library.length > 0) {
    const sortedLibrary = sortLibrary(library, currentSort);
    sortedLibrary.forEach((item) => {
      const gridItem = createGridItem(item, isPlaylistItem);
      fragment.appendChild(gridItem);
    });
  }
  container.appendChild(fragment);

  container
    .querySelectorAll("img.lazy")
    .forEach((img) => lazyLoadObserver.observe(img));
}

function createPageHeader(title) {
  const header = document.createElement("div");
  header.className = "page-header";
  header.innerHTML = `
        <h1 class="page-header-title">${title}</h1>
        <div class="page-header-actions">
            <div class="sort-dropdown-container" id="sort-dropdown">
                <button class="sort-dropdown-btn">
                    <i class="fa-solid fa-sort"></i>
                    <span id="sort-dropdown-label">Sort By</span>
                    <i class="fa-solid fa-chevron-down chevron"></i>
                </button>
                <div class="sort-options-list">
                    <div class="sort-option-item" data-value="downloadedAt-desc"><span class="check"><i class="fa-solid fa-check"></i></span>Date Added (Newest)</div>
                    <div class="sort-option-item" data-value="downloadedAt-asc"><span class="check"><i class="fa-solid fa-check"></i></span>Date Added (Oldest)</div>
                    <div class="sort-option-item" data-value="title-asc"><span class="check"><i class="fa-solid fa-check"></i></span>Title (A-Z)</div>
                    <div class="sort-option-item" data-value="title-desc"><span class="check"><i class="fa-solid fa-check"></i></span>Title (Z-A)</div>
                    <div class="sort-option-item" data-value="duration-asc"><span class="check"><i class="fa-solid fa-check"></i></span>Duration (Shortest)</div>
                    <div class="sort-option-item" data-value="duration-desc"><span class="check"><i class="fa-solid fa-check"></i></span>Duration (Longest)</div>
                </div>
            </div>
        </div>`;
  return header;
}

function updateSortUI() {
  const dropdown = document.querySelector("#sort-dropdown");
  if (!dropdown) return;
  const label = dropdown.querySelector("#sort-dropdown-label");
  const options = dropdown.querySelectorAll(".sort-option-item");
  options.forEach((opt) => {
    const isActive = opt.dataset.value === currentSort;
    opt.classList.toggle("active", isActive);
    if (isActive) {
      label.textContent = opt.textContent.trim();
    }
  });
}

export function renderHomePageGrid(library = AppState.library) {
  const homePage = document.getElementById("home-page");
  homePage.innerHTML = "";
  if (AppState.library.length === 0) {
    homePage.innerHTML = `<div class="placeholder-page"><i class="fa-solid fa-house-chimney-crack placeholder-icon"></i><h2 class="placeholder-title">Your Library is Empty</h2><p class="placeholder-text">Go to the <span class="link-style" id="go-to-downloads-link">Downloads</span> page to get started.</p></div>`;
  } else {
    homePage.appendChild(createPageHeader("Home"));
    const grid = document.createElement("div");
    grid.className = "video-grid";
    grid.id = "video-grid-home";
    homePage.appendChild(grid);
    if (library.length === 0 && homeSearchInput.value) {
      grid.innerHTML = `<p class="empty-message">No results found for "<strong>${homeSearchInput.value}</strong>"</p>`;
    } else {
      renderGrid(grid, library);
    }
  }
  updateSortUI();
  hideLoader();
}

export function renderFavoritesPage(library) {
  const favoritesPage = document.getElementById("favorites-page");
  favoritesPage.innerHTML = "";
  const favoritesLibrary = AppState.library.filter((video) => video.isFavorite);
  const libraryToRender = library || favoritesLibrary;

  if (favoritesLibrary.length > 0) {
    favoritesPage.appendChild(createPageHeader("Favorites"));
    const grid = document.createElement("div");
    grid.className = "video-grid";
    grid.id = "video-grid-favorites";
    favoritesPage.appendChild(grid);
    if (libraryToRender.length === 0 && homeSearchInput.value) {
      grid.innerHTML = `<p class="empty-message">No favorite items match "<strong>${homeSearchInput.value}</strong>"</p>`;
    } else {
      renderGrid(grid, libraryToRender);
    }
  } else {
    favoritesPage.innerHTML = `<div class="page-header"><h1 class="page-header-title">Favorites</h1></div><div class="placeholder-page"><i class="fa-solid fa-heart-crack placeholder-icon"></i><h2 class="placeholder-title">No Favorites Yet</h2><p class="placeholder-text">Click the heart icon on any video to add it to your favorites.</p></div>`;
  }
  updateSortUI();
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
      if (e.target.closest(".add-to-playlist-grid-btn")) {
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

    const sortDropdown = e.target.closest("#sort-dropdown");
    if (sortDropdown) {
      if (e.target.closest(".sort-dropdown-btn")) {
        sortDropdown.classList.toggle("open");
      }
      const option = e.target.closest(".sort-option-item");
      if (option) {
        currentSort = option.dataset.value;
        localStorage.setItem("librarySort", currentSort);
        updateSortUI();
        const activePage =
          document.querySelector(".nav-item.active").dataset.page;
        if (activePage === "home") renderHomePageGrid();
        if (activePage === "favorites") renderFavoritesPage();
        sortDropdown.classList.remove("open");
      }
    } else {
      document
        .querySelectorAll(".sort-dropdown-container.open")
        .forEach((d) => d.classList.remove("open"));
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
