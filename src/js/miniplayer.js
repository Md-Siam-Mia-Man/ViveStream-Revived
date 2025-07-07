// miniplayer.js

function activateMiniplayer() {
  if (!videoPlayer.src) return; // A video must be loaded to activate.

  const wasHidden = miniplayer.classList.contains("hidden");

  // Move video player element to the miniplayer container if it's not already there.
  if (videoPlayer.parentElement !== miniplayerVideoContainer) {
    miniplayerVideoContainer.appendChild(videoPlayer);
  }

  // If it was hidden, un-hide it.
  if (wasHidden) {
    miniplayer.classList.remove("hidden");
  }

  // Always update metadata, useful for when a new video is played in the miniplayer.
  const currentItem = currentLibrary[currentlyPlayingIndex];
  if (currentItem) {
    miniplayerTitle.textContent = currentItem.title;
    miniplayerUploader.textContent = currentItem.uploader;
  }

  // Ensure video continues playing without interruption.
  videoPlayer.play();
}

function deactivateMiniplayer() {
  if (miniplayer.classList.contains("hidden")) return;

  // Move video player back to main player section
  // It's inserted before the first child, which is the controls container
  playerSection.insertBefore(videoPlayer, playerSection.firstChild);
  miniplayer.classList.add("hidden");
}

function closeMiniplayer() {
  deactivateMiniplayer();
  videoPlayer.pause();
  videoPlayer.src = ""; // Clear the source
  currentlyPlayingIndex = -1;
}

function initializeMiniplayer() {
  // --- Event Listeners for Miniplayer buttons ---
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
    showPage("player"); // This handles the deactivation logic
  });

  miniplayerCloseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeMiniplayer();
  });

  // Clicking on the miniplayer body (but not buttons) should also expand it
  miniplayer.addEventListener("click", (e) => {
    // Make sure the click is not on a button
    if (e.target.closest("button")) return;
    showPage("player");
  });

  // Sync miniplayer play/pause icon with video state
  videoPlayer.addEventListener("play", () => {
    miniplayerPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
  });
  videoPlayer.addEventListener("pause", () => {
    miniplayerPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
  });
}
