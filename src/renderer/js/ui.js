import { AppState, setFilters } from "./state.js";
import {
  showPage,
  handleNav,
  showLoader,
  hideLoader,
  renderSearchPage,
} from "./renderer.js";
import { formatTime, debounce } from "./utils.js";
import { eventBus } from "./event-bus.js";
import { openAddToPlaylistModal } from "./playlists.js";

const homeSearchInput = document.getElementById("home-search-input");
const videoContextMenu = document.getElementById("video-item-context-menu");
const contextRemoveFromPlaylistBtn = document.getElementById(
  "context-remove-from-playlist-btn"
);
const gridItemTemplate = document.getElementById("video-grid-item-template");
const sidebar = document.querySelector(".sidebar");
const searchPage = document.getElementById("search-page");

let currentSort = localStorage.getItem("librarySort") || "downloadedAt-desc";
let lastActivePageId = "home";

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

export function setHeaderActions(content) {
  const container = document.getElementById("header-actions-container");
  if (container) {
    container.innerHTML = "";
    if (content) {
      container.appendChild(content);
    }
  }
}

export function createGridItem(item, isPlaylistItem = false) {
  const clone = gridItemTemplate.content.cloneNode(true);
  const element = clone.querySelector(".video-grid-item");
  const thumbnail = element.querySelector(".grid-thumbnail");
  const overlayIconContainer = element.querySelector(".thumbnail-overlay-icon");
  const favoriteBtn = element.querySelector(".favorite-btn");
  const favoriteIcon = favoriteBtn.querySelector("span");

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
    overlayIconContainer.innerHTML =
      '<span class="material-symbols-outlined">music_note</span>';
  }

  element.querySelector(".thumbnail-duration").textContent = formatTime(
    item.duration || 0
  );
  element.querySelector(".grid-item-title").textContent = item.title;
  element.querySelector(".grid-item-meta").textContent =
    item.creator || item.uploader || "Unknown";

  favoriteBtn.classList.toggle("is-favorite", !!item.isFavorite);
  favoriteBtn.title = item.isFavorite ? "Unfavorite" : "Favorite";
  if (item.isFavorite) {
    favoriteIcon.style.fontVariationSettings = "'FILL' 1";
  }

  return element;
}

function sortLibrary(library, sortKey) {
  const [key, direction] = sortKey.split("-");
  return [...library].sort((a, b) => {
    let valA = a[key];
    let valB = b[key];

    if (valA === undefined || valA === null) valA = "";
    if (valB === undefined || valB === null) valB = "";

    if (key === "title") {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return direction === "asc" ? -1 : 1;
    if (valA > valB) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

function applyFilters(library) {
  const { type, duration, source, uploadDate } = AppState.currentFilters;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  return library.filter((item) => {
    const typeMatch = type === "all" || item.type === type;

    const durationMatch =
      duration === "all" ||
      (duration === "<5" && item.duration < 300) ||
      (duration === "5-20" && item.duration >= 300 && item.duration <= 1200) ||
      (duration === ">20" && item.duration > 1200);

    const sourceMatch = source === "all" || item.source === source;

    let uploadDateMatch = true;
    if (uploadDate !== "all" && item.upload_date) {
      const year = parseInt(item.upload_date.substring(0, 4), 10);
      const month = parseInt(item.upload_date.substring(4, 6), 10);

      if (uploadDate === "this_month") {
        uploadDateMatch = year === currentYear && month === currentMonth;
      } else if (uploadDate === "this_year") {
        uploadDateMatch = year === currentYear;
      } else if (uploadDate === "older") {
        uploadDateMatch = year < currentYear;
      }
    } else if (uploadDate !== "all" && !item.upload_date) {
      uploadDateMatch = false;
    }

    return typeMatch && durationMatch && sourceMatch && uploadDateMatch;
  });
}

function renderGrid(container, library, isPlaylistItem = false) {
  if (!container) return;
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();
  if (library && library.length > 0) {
    const filteredLibrary = applyFilters(library);
    const sortedLibrary = sortLibrary(filteredLibrary, currentSort);

    if (sortedLibrary.length > 0) {
      sortedLibrary.forEach((item) => {
        const gridItem = createGridItem(item, isPlaylistItem);
        fragment.appendChild(gridItem);
      });
    } else {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "empty-message";
      emptyMessage.textContent = "No media matches the current filters.";
      fragment.appendChild(emptyMessage);
    }
  }
  container.appendChild(fragment);

  container
    .querySelectorAll("img.lazy")
    .forEach((img) => lazyLoadObserver.observe(img));
}

function createHeaderActionsElement() {
  const fragment = document.createDocumentFragment();

  const filterBtn = document.createElement("button");
  filterBtn.className = "action-button";
  filterBtn.id = "filter-btn";
  filterBtn.innerHTML = `<span class="material-symbols-outlined">filter_list</span><span>Filter</span>`;
  fragment.appendChild(filterBtn);

  const sortDropdown = document.createElement("div");
  sortDropdown.className = "sort-dropdown-container";
  sortDropdown.id = "sort-dropdown";
  sortDropdown.innerHTML = `
        <button class="sort-dropdown-btn">
            <span class="material-symbols-outlined">sort</span>
            <span id="sort-dropdown-label">Sort By</span>
            <span class="material-symbols-outlined chevron">expand_more</span>
        </button>
        <div class="sort-options-list">
            <div class="sort-option-item" data-value="downloadedAt-desc">
            Date Added (Newest)<span class="check material-symbols-outlined">done</span></div>
            <div class="sort-option-item" data-value="downloadedAt-asc">Date Added (Oldest)<span class="check material-symbols-outlined">done</span></div>
            <div class="sort-option-item" data-value="upload_date-desc">
            Upload Date (Newest)<span class="check material-symbols-outlined">done</span></div>
            <div class="sort-option-item" data-value="upload_date-asc">
            Upload Date (Oldest)<span class="check material-symbols-outlined">done</span></div>
            <div class="sort-option-item" data-value="title-asc">A-Z<span class="check material-symbols-outlined">done</span></div>
            <div class="sort-option-item" data-value="title-desc">Z-A<span class="check material-symbols-outlined">done</span></div>
            <div class="sort-option-item" data-value="duration-desc">Longest<span class="check material-symbols-outlined">done</span>
            </div>
            <div class="sort-option-item" data-value="duration-asc">Shortest<span class="check material-symbols-outlined">done</span></div>
        </div>`;
  fragment.appendChild(sortDropdown);

  return fragment;
}

export function createFilterPanel() {
  const panel = document.createElement("div");
  panel.className = "filter-panel";
  panel.id = "filter-panel";
  panel.innerHTML = `
        <div class="filter-group" data-filter="type">
            <div class="filter-selection-indicator"></div>
            <label>Type:</label>
            <button class="filter-btn" data-value="all">All</button>
            <button class="filter-btn" data-value="video">Video</button>
            <button class="filter-btn" data-value="audio">Audio</button>
        </div>
        <div class="filter-group" data-filter="duration">
            <div class="filter-selection-indicator"></div>
            <label>Duration:</label>
            <button class="filter-btn" data-value="all">All</button>
            <button class="filter-btn" data-value="<5">&lt; 5 min</button>
            <button class="filter-btn" data-value="5-20">5-20 min</button>
            <button class="filter-btn" data-value=">20">&gt; 20 min</button>
        </div>
        <div class="filter-group" data-filter="source">
            <div class="filter-selection-indicator"></div>
            <label>Source:</label>
            <button class="filter-btn" data-value="all">All</button>
            <button class="filter-btn" data-value="youtube">YouTube</button>
            <button class="filter-btn" data-value="local">Local</button>
        </div>
        <div class="filter-group" data-filter="uploadDate">
            <div class="filter-selection-indicator"></div>
            <label>Upload Date:</label>
            <button class="filter-btn" data-value="all">All</button>
            <button class="filter-btn" data-value="this_month">This Month</button>
            <button class="filter-btn" data-value="this_year">This Year</button>
            <button class="filter-btn" data-value="older">Older</button>
        </div>
    `;
  return panel;
}

function updateFilterIndicators() {
  const panel = document.getElementById("filter-panel");
  if (!panel) return;

  panel.querySelectorAll(".filter-group").forEach((group) => {
    const filterType = group.dataset.filter;
    const activeValue = AppState.currentFilters[filterType];
    const activeButton = group.querySelector(
      `.filter-btn[data-value="${activeValue}"]`
    );

    group
      .querySelectorAll(".filter-btn")
      .forEach((btn) => btn.classList.remove("active"));

    if (activeButton) {
      activeButton.classList.add("active");
      const indicator = group.querySelector(".filter-selection-indicator");

      // Ensure calculation is based on the active button's current position
      indicator.style.left = `${activeButton.offsetLeft}px`;
      indicator.style.width = `${activeButton.offsetWidth}px`;
    }
  });
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
      label.textContent = opt.textContent.replace("done", "").trim();
    }
  });
}

function reapplyCurrentView() {
  const activePage =
    document.querySelector(".nav-item.active")?.dataset.page || "home";
  let gridContainer;
  let librarySource;

  if (activePage === "home") {
    gridContainer = document.getElementById("video-grid-home");
    librarySource = AppState.library;
  } else if (activePage === "favorites") {
    gridContainer = document.getElementById("video-grid-favorites");
    librarySource = AppState.library.filter((video) => video.isFavorite);
  }

  if (gridContainer && librarySource) {
    renderGrid(gridContainer, librarySource);
  }
}

export function renderHomePageGrid() {
  const homePage = document.getElementById("home-page");
  homePage.innerHTML = "";

  setHeaderActions(null);

  if (AppState.library.length === 0) {
    homePage.innerHTML = `<div class="placeholder-page"><span class="material-symbols-outlined placeholder-icon">home</span><h2 class="placeholder-title">Your Library is Empty</h2><p class="placeholder-text">Go to the <span class="link-style" id="go-to-downloads-link">Downloads</span> page to get started.</p></div>`;
  } else {
    setHeaderActions(createHeaderActionsElement());
    homePage.appendChild(createFilterPanel());

    const grid = document.createElement("div");
    grid.className = "video-grid";
    grid.id = "video-grid-home";
    homePage.appendChild(grid);
    renderGrid(grid, AppState.library);
    updateFilterIndicators();
  }
  updateSortUI();
  hideLoader();
}

export function renderFavoritesPage() {
  const favoritesPage = document.getElementById("favorites-page");
  favoritesPage.innerHTML = "";
  setHeaderActions(null);

  const favoritesLibrary = AppState.library.filter((video) => video.isFavorite);

  if (favoritesLibrary.length > 0) {
    setHeaderActions(createHeaderActionsElement());
    favoritesPage.appendChild(createFilterPanel());
    const grid = document.createElement("div");
    grid.className = "video-grid";
    grid.id = "video-grid-favorites";
    favoritesPage.appendChild(grid);
    renderGrid(grid, favoritesLibrary);
    updateFilterIndicators();
  } else {
    favoritesPage.innerHTML = `<div class="placeholder-page"><span class="material-symbols-outlined placeholder-icon">heart_broken</span><h2 class="placeholder-title">No Favorites Yet</h2><p class="placeholder-text">Click the heart icon on any video to add it to your favorites.</p></div>`;
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
    const playerIcon = favoriteBtn.querySelector("span");
    playerIcon.style.fontVariationSettings = isFavorite
      ? "'FILL' 1"
      : "'FILL' 0";
  }

  document
    .querySelectorAll(`.video-grid-item[data-id="${videoId}"]`)
    .forEach((item) => {
      const gridBtn = item.querySelector(".favorite-btn");
      if (gridBtn) {
        gridBtn.classList.toggle("is-favorite", isFavorite);
        gridBtn.title = isFavorite ? "Unfavorite" : "Favorite";
        gridBtn.querySelector("span").style.fontVariationSettings = isFavorite
          ? "'FILL' 1"
          : "'FILL' 0";
      }
    });

  const activePage = document.querySelector(".nav-item.active")?.dataset.page;
  if (activePage === "favorites") {
    reapplyCurrentView();
  }
}

eventBus.on("ui:favorite_toggled", updateFavoriteUI);

export function updateSearchPlaceholder(pageId) {
  let isSearchable = true;
  switch (pageId) {
    case "downloads":
    case "settings":
      isSearchable = false;
  }
  homeSearchInput.placeholder = isSearchable
    ? "Search videos, artists, playlists..."
    : "Search is unavailable";
  homeSearchInput.disabled = !isSearchable;
  lastActivePageId = pageId;
}

const debouncedSearchHandler = debounce((term) => {
  renderSearchPage(term);
}, 300);

function initializeMainEventListeners() {
  document.body.addEventListener("click", async (e) => {
    const itemEl = e.target.closest(".video-grid-item");
    if (itemEl) {
      const videoId = itemEl.dataset.id;
      const playlistGrid = e.target.closest("#video-grid-playlist");
      const artistGrid = e.target.closest("#video-grid-artist");
      const favoritesGrid = e.target.closest("#video-grid-favorites");

      let sourceLib;
      let context = null;

      if (playlistGrid) {
        const playlistId = playlistGrid.dataset.playlistId;
        const playlist = await window.electronAPI.playlistGetDetails(
          playlistId
        );
        sourceLib = playlist.videos;
        context = { type: "playlist", id: playlistId, name: playlist.name };
      } else if (artistGrid) {
        const artistId = artistGrid.dataset.artistId;
        const artist = await window.electronAPI.artistGetDetails(artistId);
        sourceLib = artist.videos;
        context = { type: "artist", id: artistId, name: artist.name };
      } else if (favoritesGrid) {
        sourceLib = AppState.library.filter((v) => v.isFavorite);
        context = { type: "favorites", id: null, name: "Favorites" };
      } else {
        sourceLib = AppState.library;
        context = { type: "home", id: null, name: "Library" };
      }

      if (e.target.closest(".menu-btn")) {
        e.stopPropagation();
        const menuBtn = e.target.closest(".menu-btn");
        const rect = menuBtn.getBoundingClientRect();
        videoContextMenu.style.left = `${rect.left - videoContextMenu.offsetWidth + rect.width
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
        eventBus.emit("player:play_request", {
          index: videoIndex,
          queue: sourceLib,
          context: context,
        });
      }
      return;
    }

    if (e.target.closest("#filter-btn")) {
      const panel = document.getElementById("filter-panel");
      if (panel) {
        panel.classList.toggle("visible");
        // Force recalculation of indicators when panel becomes visible
        // This fixes the 76px vs 116px misalignment issue caused by 
        // calculating layout on a hidden/collapsed element.
        if (panel.classList.contains("visible")) {
          requestAnimationFrame(() => {
            updateFilterIndicators();
          });
        }
      }
    }

    if (e.target.closest(".filter-btn")) {
      const btn = e.target.closest(".filter-btn");
      const group = btn.closest(".filter-group");
      const filterType = group.dataset.filter;
      const value = btn.dataset.value;

      setFilters({ [filterType]: value });
      updateFilterIndicators();
      reapplyCurrentView();
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
        reapplyCurrentView();
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
    if (searchTerm.trim() === "") {
      showPage(lastActivePageId);
      if (searchPage) searchPage.innerHTML = "";
      return;
    }
    showLoader();
    debouncedSearchHandler(searchTerm);
  });
}

export function initializeUI() {
  if (localStorage.getItem("sidebarPinned") === "true") {
    sidebar.classList.add("pinned");
  }
  initializeMainEventListeners();
}