// miniplayer.js
function activateMiniplayer() {
  if (!videoPlayer.src) return;

  const wasHidden = miniplayer.classList.contains("hidden");

  if (videoPlayer.parentElement !== miniplayerVideoContainer) {
    miniplayerVideoContainer.appendChild(videoPlayer);
  }

  if (wasHidden) {
    miniplayer.classList.remove("hidden");
  }

  const currentItem = currentLibrary[currentlyPlayingIndex];
  if (currentItem) {
    miniplayerTitle.textContent = currentItem.title;
    miniplayerUploader.textContent = currentItem.uploader;
  }

  videoPlayer.play();
}

function deactivateMiniplayer() {
  if (miniplayer.classList.contains("hidden")) return;

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
