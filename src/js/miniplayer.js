// src/js/miniplayer.js
const miniplayerArtworkImg = document.getElementById("miniplayer-artwork-img");

function activateMiniplayer() {
  if (!videoPlayer.src) return;

  const wasHidden = miniplayer.classList.contains("hidden");
  const currentItem = playbackQueue[currentlyPlayingIndex];

  // --- UPDATED: Handle audio vs video mode in miniplayer ---
  if (currentItem && currentItem.type === "audio") {
    // Audio mode: show artwork, hide video
    miniplayerArtworkImg.src = currentItem.coverPath
      ? decodeURIComponent(currentItem.coverPath)
      : "../assets/logo.png";
    miniplayerArtworkImg.classList.remove("hidden");
    miniplayerVideoContainer.style.display = "none";
  } else {
    // Video mode: hide artwork, show video
    miniplayerArtworkImg.classList.add("hidden");
    miniplayerVideoContainer.style.display = "block";
    if (videoPlayer.parentElement !== miniplayerVideoContainer) {
      miniplayerVideoContainer.appendChild(videoPlayer);
    }
  }

  if (wasHidden) {
    miniplayer.classList.remove("hidden");
  }

  if (currentItem) {
    miniplayerTitle.textContent = currentItem.title;
    miniplayerUploader.textContent =
      currentItem.creator || currentItem.uploader;
  }

  videoPlayer.play();
}

function deactivateMiniplayer() {
  if (miniplayer.classList.contains("hidden")) return;

  // Reset miniplayer UI for the next use
  miniplayerArtworkImg.classList.add("hidden");
  miniplayerVideoContainer.style.display = "block";

  // Move video player back to the main player view
  playerSection.insertBefore(videoPlayer, playerSection.firstChild);
  miniplayer.classList.add("hidden");
}

function closeMiniplayer() {
  deactivateMiniplayer();
  videoPlayer.pause();
  videoPlayer.src = "";
  currentlyPlayingIndex = -1;
}

function initializeMiniplayer() {
  miniplayerPlayPauseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePlay();
  });
  miniplayerNextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    playNext();
  });
  miniplayerPrevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    playPrevious();
  });

  miniplayerExpandBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showPage("player");
  });

  miniplayerCloseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeMiniplayer();
  });

  miniplayer.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    showPage("player");
  });

  videoPlayer.addEventListener("play", () => {
    miniplayerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
  });
  videoPlayer.addEventListener("pause", () => {
    miniplayerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
  });
}
