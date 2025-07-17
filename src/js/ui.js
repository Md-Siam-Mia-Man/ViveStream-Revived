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

sidebarNav.addEventListener("click", (e) => {
  const navItem = e.target.closest(".nav-item");
  if (navItem) showPage(navItem.dataset.page);
});

sidebarNavBottom.addEventListener("click", (e) => {
  const navItem = e.target.closest(".nav-item");
  if (navItem) showPage(navItem.dataset.page);
});

function renderGrid(container, library) {
  container.innerHTML = library
    .map((item) => {
      const isFavorite = item.isFavorite || false;
      return `
        <div class="video-grid-item" data-id="${item.id}">
            <div class="grid-thumbnail-container">
                <img src="${
                  item.coverPath
                }" class="grid-thumbnail" alt="thumbnail">
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
                    <button class="grid-item-action-btn favorite-btn" title="Favorite"><i class="${
                      isFavorite ? "fas" : "far"
                    } fa-heart"></i></button>
                    <button class="grid-item-action-btn save-btn" title="Save to Playlist"><i class="far fa-bookmark"></i></button>
                    <button class="grid-item-action-btn menu-btn" title="More"><i class="fas fa-ellipsis-v"></i></button>
                </div>
            </div>
        </div>`;
    })
    .join("");
}

function renderHomePageGrid(library = currentLibrary) {
  videoGrid.innerHTML = "";

  if (library.length === 0 && homeSearchInput.value) {
    videoGrid.innerHTML = `
            <div class="placeholder-page" style="grid-column: 1 / -1;">
                <i class="fas fa-search placeholder-icon"></i>
                <h2 class="placeholder-title">No Results Found</h2>
                <p class="placeholder-text">Try different keywords to find what you're looking for.</p>
            </div>`;
    return;
  }

  if (currentLibrary.length === 0) {
    document.getElementById("home-page").innerHTML = `
            <div class="placeholder-page">
                <i class="fas fa-compact-disc placeholder-icon"></i>
                <h2 class="placeholder-title">Your Library is Empty</h2>
                <p class="placeholder-text">Go to the <span class="link-style" id="go-to-downloads-link">Downloads</span> page to get started.</p>
            </div>`;

    document
      .getElementById("go-to-downloads-link")
      ?.addEventListener("click", () => {
        showPage("downloads");
      });
    return;
  }
  renderGrid(videoGrid, library);
}

function renderFavoritesPage() {
  const favoritesLibrary = currentLibrary.filter((video) => video.isFavorite);
  const favoritesPage = document.getElementById("favorites-page");
  favoritesPage.innerHTML = "";

  if (favoritesLibrary.length > 0) {
    const grid = document.createElement("div");
    grid.className = "video-grid";
    grid.id = "video-grid-favorites";
    favoritesPage.appendChild(grid);
    renderGrid(grid, favoritesLibrary);
  } else {
    favoritesPage.innerHTML = `
            <div class="placeholder-page">
                <i class="fas fa-heart-crack placeholder-icon"></i>
                <h2 class="placeholder-title">No Favorites Yet</h2>
                <p class="placeholder-text">Click the heart icon on any video to add it to your favorites.</p>
            </div>`;
  }
}

function handleGridClick(event) {
  const e = event;
  const itemEl = e.target.closest(".video-grid-item");
  if (!itemEl) return;
  const videoId = itemEl.dataset.id;

  const menuBtn = e.target.closest(".menu-btn");
  if (menuBtn) {
    e.stopPropagation();
    const rect = menuBtn.getBoundingClientRect();
    contextMenu.style.left = `${
      rect.left - contextMenu.offsetWidth + rect.width
    }px`;
    contextMenu.style.top = `${rect.bottom + 5}px`;
    contextMenu.dataset.videoId = videoId;
    contextMenu.classList.add("visible");
    return;
  }

  const favoriteBtn = e.target.closest(".favorite-btn");
  if (favoriteBtn) {
    e.stopPropagation();
    toggleFavoriteStatus(videoId, favoriteBtn);
    return;
  }

  const saveBtn = e.target.closest(".save-btn");
  if (saveBtn) {
    e.stopPropagation();
    console.log("Save to playlist clicked for:", videoId);
    return;
  }

  const videoIndex = currentLibrary.findIndex((v) => v.id === videoId);
  if (videoIndex === -1) return;

  const isMiniplayerActive = !miniplayer.classList.contains("hidden");

  if (isMiniplayerActive) {
    if (videoIndex === currentlyPlayingIndex) {
      showPage("player");
    } else {
      playLibraryItem(videoIndex, { stayInMiniplayer: true });
    }
  } else {
    playLibraryItem(videoIndex);
  }
}

videoGrid.addEventListener("click", handleGridClick);
document
  .getElementById("favorites-page")
  .addEventListener("click", handleGridClick);

async function toggleFavoriteStatus(videoId, btnElement) {
  const result = await window.electronAPI.toggleFavorite(videoId);
  if (result.success) {
    const icon = btnElement.querySelector("i");
    icon.classList.toggle("fas", result.isFavorite);
    icon.classList.toggle("far", !result.isFavorite);

    const localVideo = currentLibrary.find((v) => v.id === videoId);
    if (localVideo) {
      localVideo.isFavorite = result.isFavorite;
    }

    const playerFavoriteIcon = favoriteBtn.querySelector("i");
    if (
      currentlyPlayingIndex > -1 &&
      currentLibrary[currentlyPlayingIndex]?.id === videoId
    ) {
      playerFavoriteIcon.classList.toggle("fas", result.isFavorite);
      playerFavoriteIcon.classList.toggle("far", !result.isFavorite);
    }

    if (document.querySelector('.nav-item[data-page="favorites"].active')) {
      renderFavoritesPage();
    }
  }
}

homeSearchInput.addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const currentActivePage =
    document.querySelector(".nav-item.active")?.dataset.page;

  const libraryToFilter =
    currentActivePage === "favorites"
      ? currentLibrary.filter((v) => v.isFavorite)
      : currentLibrary;

  const filteredLibrary = libraryToFilter.filter(
    (video) =>
      video.title.toLowerCase().includes(searchTerm) ||
      (video.uploader && video.uploader.toLowerCase().includes(searchTerm))
  );

  if (currentActivePage === "home") {
    renderHomePageGrid(filteredLibrary);
  } else if (currentActivePage === "favorites") {
    const favGrid = document.getElementById("video-grid-favorites");
    if (favGrid) renderGrid(favGrid, filteredLibrary);
  }
});

async function loadLibrary() {
  currentLibrary = await window.electronAPI.getLibrary();
  const activePage =
    document.querySelector(".nav-item.active")?.dataset.page || "home";
  if (activePage === "home" || currentLibrary.length > 0) {
    if (
      document
        .getElementById("home-page")
        .innerHTML.includes("placeholder-page")
    ) {
      document.getElementById("home-page").innerHTML =
        '<div class="video-grid" id="video-grid"></div>';
      document
        .getElementById("video-grid")
        .addEventListener("click", handleGridClick);
    }
    renderHomePageGrid();
  }
  if (activePage === "favorites") {
    renderFavoritesPage();
  }
}

function loadSettings() {
  const savedVolume = localStorage.getItem("playerVolume");
  const savedMuted = localStorage.getItem("playerMuted") === "true";
  const savedTheater = localStorage.getItem("theaterMode") === "true";
  const savedAutoplay = localStorage.getItem("autoplayEnabled");
  const savedSidebar = localStorage.getItem("sidebarCollapsed") === "true";

  videoPlayer.muted = savedMuted;
  if (savedVolume !== null && !savedMuted) {
    videoPlayer.volume = parseFloat(savedVolume);
  }
  updateVolumeUI(videoPlayer.volume, videoPlayer.muted);

  if (savedTheater) {
    playerPage.classList.add("theater-mode");
  }

  if (savedAutoplay !== null) {
    autoplayToggle.checked = savedAutoplay === "true";
  } else {
    autoplayToggle.checked = true;
  }

  if (savedSidebar) {
    sidebar.classList.add("collapsed");
  }
  videoPlayer.disablePictureInPicture = true;
}
