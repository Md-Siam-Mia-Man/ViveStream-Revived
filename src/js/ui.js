// src/js/ui.js
sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
  localStorage.setItem(
    "sidebarCollapsed",
    sidebar.classList.contains("collapsed")
  );
});

logoHomeButton.addEventListener("click", (e) => {
  e.preventDefault();
  showPage("home");
  renderHomePageGrid();
});

/**
 * Creates the HTML for a single video grid item.
 * @param {object} item - The video data object.
 * @returns {string} The inner HTML string for the grid item element.
 */
function createGridItemHTML(item) {
  const audioIconOverlay =
    item.type === "audio"
      ? '<div class="thumbnail-overlay-icon"><i class="fa-solid fa-music"></i></div>'
      : "";

  return `
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
    </div>`;
}

/**
 * Renders a grid of items efficiently using a DocumentFragment.
 * @param {HTMLElement} container - The DOM element to render the grid into.
 * @param {Array} library - The array of items to render.
 * @param {boolean} [isPlaylistItem=false] - Flag to add playlist-specific attributes.
 */
function renderGrid(container, library, isPlaylistItem = false) {
  if (!container) return;

  // Use a DocumentFragment to build the grid off-screen for performance
  const fragment = document.createDocumentFragment();

  if (library && library.length > 0) {
    library.forEach((item) => {
      const gridItem = document.createElement("div");
      gridItem.className = "video-grid-item";
      gridItem.dataset.id = item.id;
      if (isPlaylistItem) {
        gridItem.dataset.playlistItem = "true";
      }
      gridItem.innerHTML = createGridItemHTML(item);
      fragment.appendChild(gridItem);
    });
  }

  // Clear the container once and append the entire fragment in a single operation
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

function renderHomePageGrid(library = currentLibrary) {
  const homePage = document.getElementById("home-page");
  if (currentLibrary.length === 0) {
    homePage.innerHTML = `<div class="placeholder-page"><i class="fa-solid fa-house-chimney-crack placeholder-icon"></i><h2 class="placeholder-title">Your Library is Empty</h2><p class="placeholder-text">Go to the <span class="link-style" id="go-to-downloads-link">Downloads</span> page to get started.</p></div>`;
    document
      .getElementById("go-to-downloads-link")
      ?.addEventListener("click", () => showPage("downloads"));
    return;
  }
  const grid = ensureGridExists(homePage, "video-grid");
  if (library.length === 0 && homeSearchInput.value) {
    grid.innerHTML = '<p class="empty-message">No items match your search.</p>';
  } else {
    renderGrid(grid, library);
  }
}

function renderFavoritesPage(library) {
  const favoritesPage = document.getElementById("favorites-page");
  const favoritesLibrary = currentLibrary.filter((video) => video.isFavorite);
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
}

function handleGridClick(event) {
  const itemEl = event.target.closest(".video-grid-item");
  if (!itemEl) return;
  const videoId = itemEl.dataset.id;
  const sourceLib = event.target.closest("#video-grid-playlist")
    ? playbackQueue
    : currentLibrary;

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
      videoContextMenu.dataset.playlistId = currentPlaylistId;
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

async function toggleFavoriteStatus(videoId) {
  const result = await window.electronAPI.toggleFavorite(videoId);
  if (result.success) {
    const localVideo = currentLibrary.find((v) => v.id === videoId);
    if (localVideo) localVideo.isFavorite = result.isFavorite;

    const playbackVideo = playbackQueue.find((v) => v.id === videoId);
    if (playbackVideo) playbackVideo.isFavorite = result.isFavorite;

    updateFavoriteStatusInUI(videoId, result.isFavorite);

    const activePage = document.querySelector(".nav-item.active")?.dataset.page;
    if (activePage === "favorites") {
      renderFavoritesPage();
    }
  }
}

function updateFavoriteStatusInUI(videoId, isFavorite) {
  if (
    currentlyPlayingIndex > -1 &&
    playbackQueue[currentlyPlayingIndex]?.id === videoId
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

homeSearchInput.addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase().trim();
  const activeNavItem = document.querySelector(".nav-item.active");
  if (!activeNavItem) return;

  const activePage = activeNavItem.dataset.page;

  switch (activePage) {
    case "home": {
      const filtered = currentLibrary.filter(
        (v) =>
          v.title.toLowerCase().includes(searchTerm) ||
          (v.creator && v.creator.toLowerCase().includes(searchTerm)) ||
          (v.uploader && v.uploader.toLowerCase().includes(searchTerm))
      );
      renderHomePageGrid(filtered);
      break;
    }
    case "favorites": {
      const favoritesLibrary = currentLibrary.filter((v) => v.isFavorite);
      const filtered = favoritesLibrary.filter(
        (v) =>
          v.title.toLowerCase().includes(searchTerm) ||
          (v.creator && v.creator.toLowerCase().includes(searchTerm)) ||
          (v.uploader && v.uploader.toLowerCase().includes(searchTerm))
      );
      renderFavoritesPage(filtered);
      break;
    }
    case "playlists": {
      const filtered = allPlaylists.filter((p) =>
        p.name.toLowerCase().includes(searchTerm)
      );
      renderPlaylistsPage(filtered);
      break;
    }
    case "artists": {
      const filtered = allArtists.filter((a) =>
        a.name.toLowerCase().includes(searchTerm)
      );
      renderArtistsPage(filtered);
      break;
    }
  }
});

async function loadLibrary() {
  currentLibrary = await window.electronAPI.getLibrary();
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

  if (currentlyPlayingIndex > -1) {
    renderUpNextList();
  }
}

function loadSettings() {
  const savedVolume = localStorage.getItem("playerVolume");
  const savedMuted = localStorage.getItem("playerMuted") === "true";
  const savedTheater = localStorage.getItem("theaterMode") === "true";
  const savedAutoplay = localStorage.getItem("autoplayEnabled");
  const savedSidebar = localStorage.getItem("sidebarCollapsed") === "true";
  const subtitlesEnabled = localStorage.getItem("subtitlesEnabled") === "true";

  videoPlayer.muted = savedMuted;
  if (savedVolume !== null && !savedMuted)
    videoPlayer.volume = parseFloat(savedVolume);
  updateVolumeUI(videoPlayer.volume, videoPlayer.muted);

  if (savedTheater) playerPage.classList.add("theater-mode");

  autoplayToggle.checked = savedAutoplay !== "false";

  if (savedSidebar) sidebar.classList.add("collapsed");

  if (subtitleTrack) {
    subtitleTrack.track.mode = subtitlesEnabled ? "showing" : "hidden";
  }

  videoPlayer.disablePictureInPicture = true;
}
