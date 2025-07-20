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

function renderGrid(container, library) {
  if (!container) return;
  container.innerHTML = library
    .map(
      (item) => `
        <div class="video-grid-item" data-id="${item.id}">
            <div class="grid-thumbnail-container">
                <img src="${
                  item.coverPath
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
                        <img src="./assets/svg/Favourite.svg" class="icon-svg" alt="Favorite">
                    </button>
                    <button class="grid-item-action-btn save-btn" title="Save to Playlist">+</button>
                    <button class="grid-item-action-btn menu-btn" title="More">
                        <img src="./assets/svg/Menu.svg" class="icon-svg" alt="More">
                    </button>
                </div>
            </div>
        </div>`
    )
    .join("");
}

function ensureGridExists(pageElement, gridId) {
  let grid = document.getElementById(gridId);
  if (!grid) {
    pageElement.innerHTML = `<div class="video-grid" id="${gridId}"></div>`;
    grid = document.getElementById(gridId);
    grid.addEventListener("click", handleGridClick);
  }
  return grid;
}

function renderHomePageGrid(library = currentLibrary) {
  const homePage = document.getElementById("home-page");
  if (currentLibrary.length === 0) {
    homePage.innerHTML = `<div class="placeholder-page"><img src="./assets/svg/Home.svg" class="placeholder-icon-svg" alt="Home"><h2 class="placeholder-title">Your Library is Empty</h2><p class="placeholder-text">Go to the <span class="link-style" id="go-to-downloads-link">Downloads</span> page to get started.</p></div>`;
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

  if (favoritesLibrary.length === 0) {
    if (placeholder) placeholder.style.display = "flex";
    document.getElementById("video-grid-favorites").innerHTML = "";
  } else {
    if (placeholder) placeholder.style.display = "none";
    const grid = ensureGridExists(favoritesPage, "video-grid-favorites");
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

  if (event.target.closest(".menu-btn")) {
    event.stopPropagation();
    const menuBtn = event.target.closest(".menu-btn");
    const rect = menuBtn.getBoundingClientRect();
    contextMenu.style.left = `${
      rect.left - contextMenu.offsetWidth + rect.width
    }px`;
    contextMenu.style.top = `${rect.bottom + 5}px`;
    contextMenu.dataset.videoId = videoId;
    contextMenu.classList.add("visible");
    return;
  }
  if (event.target.closest(".favorite-btn")) {
    event.stopPropagation();
    toggleFavoriteStatus(videoId, event.target.closest(".favorite-btn"));
    return;
  }
  if (event.target.closest(".save-btn")) {
    event.stopPropagation();
    showNotification("Playlist feature coming soon!", "info");
    return;
  }
  const videoIndex = currentLibrary.findIndex((v) => v.id === videoId);
  if (videoIndex > -1) playLibraryItem(videoIndex);
}

document
  .getElementById("video-grid")
  .addEventListener("click", handleGridClick);
document
  .getElementById("favorites-page")
  .addEventListener("click", handleGridClick);

async function toggleFavoriteStatus(videoId, btnElement) {
  const result = await window.electronAPI.toggleFavorite(videoId);
  if (result.success) {
    btnElement.classList.toggle("is-favorite", result.isFavorite);
    btnElement.title = result.isFavorite ? "Unfavorite" : "Favorite";
    const localVideo = currentLibrary.find((v) => v.id === videoId);
    if (localVideo) localVideo.isFavorite = result.isFavorite;
    if (
      currentlyPlayingIndex > -1 &&
      currentLibrary[currentlyPlayingIndex]?.id === videoId
    ) {
      favoriteBtn.classList.toggle("is-favorite", result.isFavorite);
    }
    if (document.querySelector('.nav-item[data-page="favorites"].active')) {
      renderFavoritesPage();
    }
  }
}

homeSearchInput.addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const activePage = document.querySelector(".nav-item.active")?.dataset.page;
  if (activePage === "home") {
    const filtered = currentLibrary.filter(
      (v) =>
        v.title.toLowerCase().includes(searchTerm) ||
        (v.uploader && v.uploader.toLowerCase().includes(searchTerm))
    );
    renderHomePageGrid(filtered);
  } else if (activePage === "favorites") {
    renderFavoritesPage();
  }
});

async function loadLibrary() {
  currentLibrary = await window.electronAPI.getLibrary();
  const activePage =
    document.querySelector(".nav-item.active")?.dataset.page || "home";
  if (activePage === "home") renderHomePageGrid();
  if (activePage === "favorites") renderFavoritesPage();
  if (currentlyPlayingIndex > -1) renderUpNextList();
}

function loadSettings() {
  const savedVolume = localStorage.getItem("playerVolume");
  const savedMuted = localStorage.getItem("playerMuted") === "true";
  const savedTheater = localStorage.getItem("theaterMode") === "true";
  const savedAutoplay = localStorage.getItem("autoplayEnabled");
  const savedSidebar = localStorage.getItem("sidebarCollapsed") === "true";

  videoPlayer.muted = savedMuted;
  if (savedVolume !== null && !savedMuted)
    videoPlayer.volume = parseFloat(savedVolume);
  updateVolumeUI(videoPlayer.volume, videoPlayer.muted);
  if (savedTheater) playerPage.classList.add("theater-mode");
  autoplayToggle.checked = savedAutoplay !== "false";
  if (savedSidebar) sidebar.classList.add("collapsed");
  videoPlayer.disablePictureInPicture = true;
}
