// ui.js
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
});

function renderGridItem(item, isPlaylistItem = false) {
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
                <span class="thumbnail-duration">${formatTime(
                  item.duration || 0
                )}</span>
            </div>
            <div class="grid-item-details">
                <div class="grid-item-info">
                    <p class="grid-item-title">${item.title}</p>
                    <p class="grid-item-meta">${item.uploader || "Unknown"}</p>
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
  if (!library || library.length === 0) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = library
    .map((item) => renderGridItem(item, isPlaylistItem))
    .join("");
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
  if (library.length === 0) {
    homePage.innerHTML = `<div class="placeholder-page"><i class="fa-solid fa-house-chimney-crack placeholder-icon"></i><h2 class="placeholder-title">Your Library is Empty</h2><p class="placeholder-text">Go to the <span class="link-style" id="go-to-downloads-link">Downloads</span> page to get started.</p></div>`;
    document
      .getElementById("go-to-downloads-link")
      ?.addEventListener("click", () => showPage("downloads"));
    return;
  }
  const grid = ensureGridExists(homePage, "video-grid");
  renderGrid(grid, library);
}

function renderFavoritesPage() {
  const favoritesPage = document.getElementById("favorites-page");
  const favoritesLibrary = currentLibrary.filter((video) => video.isFavorite);
  const placeholder = favoritesPage.querySelector(".placeholder-page");
  const grid = ensureGridExists(favoritesPage, "video-grid-favorites");

  if (favoritesLibrary.length === 0) {
    if (placeholder) placeholder.style.display = "flex";
    if (grid) grid.innerHTML = "";
  } else {
    if (placeholder) placeholder.style.display = "none";
    const searchTerm = homeSearchInput.value.toLowerCase();
    const filtered = searchTerm
      ? favoritesLibrary.filter(
          (v) =>
            v.title.toLowerCase().includes(searchTerm) ||
            (v.uploader && v.uploader.toLowerCase().includes(searchTerm))
        )
      : favoritesLibrary;
    renderGrid(grid, filtered);
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
  const searchTerm = e.target.value.toLowerCase();
  const activePage = document.querySelector(".nav-item.active")?.dataset.page;
  const libraryToFilter =
    activePage === "favorites"
      ? currentLibrary.filter((v) => v.isFavorite)
      : currentLibrary;

  const filtered = libraryToFilter.filter(
    (v) =>
      v.title.toLowerCase().includes(searchTerm) ||
      (v.uploader && v.uploader.toLowerCase().includes(searchTerm))
  );

  if (activePage === "home") {
    renderHomePageGrid(filtered);
  } else if (activePage === "favorites") {
    const grid = document.getElementById("video-grid-favorites");
    renderGrid(grid, filtered);
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
  }

  if (currentlyPlayingIndex > -1) renderUpNextList();
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
