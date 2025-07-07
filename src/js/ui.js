// ui.js

// --- Sidebar and Navigation ---
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

// --- Library Rendering ---
function renderHomePageGrid(library = currentLibrary) {
  videoGrid.innerHTML = "";
  if (library.length === 0) {
    videoGrid.innerHTML = `<p class="empty-message">${
      currentLibrary.length === 0
        ? "Your library is empty. Go to the Downloads page to get started."
        : "No videos match your search."
    }</p>`;
    return;
  }
  library.forEach((item) => {
    const div = document.createElement("div");
    div.className = "video-grid-item";
    div.dataset.id = item.id;
    div.innerHTML = `
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
                    <p class="grid-item-meta">${
                      item.view_count
                        ? item.view_count.toLocaleString() + " views"
                        : ""
                    }</p>
                </div>
            </div>`;
    videoGrid.appendChild(div);
  });
}

videoGrid.addEventListener("click", (e) => {
  const itemEl = e.target.closest(".video-grid-item");
  if (!itemEl) return;

  const videoId = itemEl.dataset.id;
  const newIndex = currentLibrary.findIndex((v) => v.id === videoId);
  if (newIndex === -1) return;

  const isMiniplayerActive = !miniplayer.classList.contains("hidden");

  if (isMiniplayerActive) {
    // If clicking the currently playing video, expand to main player view
    if (newIndex === currentlyPlayingIndex) {
      showPage("player");
    } else {
      // If clicking a different video, play it directly in the miniplayer
      playLibraryItem(newIndex, { stayInMiniplayer: true });
    }
  } else {
    // Default behavior: open in the main player view
    playLibraryItem(newIndex);
  }
});

homeSearchInput.addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const filteredLibrary = currentLibrary.filter(
    (video) =>
      video.title.toLowerCase().includes(searchTerm) ||
      (video.uploader && video.uploader.toLowerCase().includes(searchTerm))
  );
  renderHomePageGrid(filteredLibrary);
});

// --- Library Management ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

async function loadLibrary() {
  currentLibrary = await window.electronAPI.getLibrary();
  shuffleArray(currentLibrary);
  renderHomePageGrid();
}

// --- Settings Management ---
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
    autoplayToggle.checked = true; // Default to on
  }

  if (savedSidebar) {
    sidebar.classList.add("collapsed");
  }
  // Disable native Picture-in-Picture since we have a custom one
  videoPlayer.disablePictureInPicture = true;
}
