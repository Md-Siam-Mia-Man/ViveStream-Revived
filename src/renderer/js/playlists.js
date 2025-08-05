// src/js/playlists.js
import { AppState, setAllPlaylists } from "./state.js";
import {
  showPage,
  setCurrentPlaylistId,
  showLoader,
  hideLoader,
} from "./renderer.js";
import { renderGridItem } from "./ui.js";
import { showConfirmationModal, showPromptModal } from "./modals.js";
import { showNotification } from "./notifications.js";
import { playLibraryItem } from "./player.js";

// --- DOM Element Selectors ---
const playlistsPage = document.getElementById("playlists-page");
const playlistDetailPage = document.getElementById("playlist-detail-page");
const addToPlaylistModal = document.getElementById("add-to-playlist-modal");
const playlistContextMenu = document.getElementById(
  "playlist-item-context-menu"
);

// --- State ---
let videoIdToAddToPlaylist = null;
let sortableInstance = null;

/**
 * Renders the main playlists page grid.
 * @param {Array} [playlistsToRender] - Optional array of playlists to render, used for filtering.
 */
export async function renderPlaylistsPage(playlistsToRender) {
  if (!playlistsToRender) {
    const playlists = await window.electronAPI.playlistGetAll();
    setAllPlaylists(playlists); // Update central state
    playlistsToRender = AppState.playlists;
  }

  if (AppState.playlists.length === 0) {
    playlistsPage.innerHTML = `
            <div class="page-header">
                <h1 class="page-header-title">Playlists</h1>
                <div class="page-header-actions">
                    <button class="action-button" id="create-new-playlist-btn-placeholder"><i class="fa-solid fa-plus"></i> Create Playlist</button>
                </div>
            </div>
            <div class="placeholder-page">
                <i class="fa-solid fa-layer-group placeholder-icon"></i>
                <h2 class="placeholder-title">No Playlists Yet</h2>
                <p class="placeholder-text">Create your first playlist to organize your media.</p>
            </div>`;
  } else {
    playlistsPage.innerHTML = `
            <div class="page-header">
                <h1 class="page-header-title">Playlists</h1>
                <div class="page-header-actions">
                    <button class="action-button" id="create-new-playlist-btn"><i class="fa-solid fa-plus"></i> Create Playlist</button>
                </div>
            </div>
            <div class="page-content">
                <div class="playlist-grid" id="playlist-grid-main">
                    ${
                      playlistsToRender.length > 0
                        ? playlistsToRender.map(renderPlaylistCard).join("")
                        : '<p class="empty-message">No playlists match your search.</p>'
                    }
                </div>
            </div>`;
  }
  hideLoader();
}

/**
 * Generates the HTML string for a single playlist card.
 * @param {object} playlist - The playlist data object.
 * @returns {string} The HTML string.
 */
function renderPlaylistCard(playlist) {
  const videoCountText =
    playlist.videoCount === 1 ? "1 video" : `${playlist.videoCount} videos`;
  return `
        <div class="playlist-grid-item" data-id="${playlist.id}" data-name="${
    playlist.name
  }">
            <div class="playlist-thumbnail-container">
                <img src="${
                  playlist.thumbnail
                    ? decodeURIComponent(playlist.thumbnail)
                    : "../assets/logo.png"
                }" class="playlist-thumbnail" alt="playlist-thumbnail" onerror="this.onerror=null;this.src='../assets/logo.png';">
                <div class="playlist-overlay-info"><i class="fa-solid fa-layer-group"></i><span>Playlist</span></div>
                <i class="fa-solid fa-play playlist-play-icon"></i>
            </div>
            <div class="playlist-item-details">
                <div class="playlist-item-info">
                    <p class="playlist-item-title">${playlist.name}</p>
                    <p class="playlist-item-meta">${videoCountText}</p>
                </div>
                <div class="playlist-item-actions">
                     <button class="grid-item-action-btn menu-btn" title="More"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                </div>
            </div>
        </div>`;
}

/**
 * Renders the detailed view for a single playlist.
 * @param {number} playlistId - The ID of the playlist to render.
 */
export async function renderPlaylistDetailPage(playlistId) {
  showLoader();
  const playlist = await window.electronAPI.playlistGetDetails(playlistId);

  if (!playlist) {
    showNotification(`Could not find playlist with ID ${playlistId}`, "error");
    showPage("playlists");
    hideLoader();
    return;
  }

  setCurrentPlaylistId(playlistId);

  playlistDetailPage.innerHTML = `
        <div class="page-header">
             <h1 class="page-header-title">${playlist.name}</h1>
             <div class="page-header-actions">
                 <button class="action-button" id="rename-playlist-btn" data-id="${
                   playlist.id
                 }" data-name="${
    playlist.name
  }"><i class="fa-solid fa-pencil"></i> Rename</button>
                 <button class="action-button danger-btn" id="delete-playlist-btn" data-id="${
                   playlist.id
                 }" data-name="${
    playlist.name
  }"><i class="fa-solid fa-trash-can"></i> Delete</button>
             </div>
        </div>
        <div class="page-content" id="playlist-detail-content">
            ${
              playlist.videos.length > 0
                ? `<div class="video-grid" id="video-grid-playlist">${playlist.videos
                    .map((item) => renderGridItem(item, true))
                    .join("")}</div>`
                : `<div class="placeholder-page" style="flex-grow: 1;">
                <i class="fa-solid fa-video-slash placeholder-icon"></i>
                <h2 class="placeholder-title">Playlist is Empty</h2>
                <p class="placeholder-text">Add some videos to get started.</p>
            </div>`
            }
        </div>`;

  const grid = playlistDetailPage.querySelector("#video-grid-playlist");
  if (grid) {
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(grid, {
      animation: 150,
      ghostClass: "sortable-ghost",
      onEnd: async (evt) => {
        const videoIds = [...evt.to.children].map((el) => el.dataset.id);
        await window.electronAPI.playlistUpdateOrder(playlistId, videoIds);
      },
    });
  }
  hideLoader();
}

/**
 * Opens the "Add to Playlist" modal for a specific video.
 * @param {string} videoId - The ID of the video being added.
 */
export async function openAddToPlaylistModal(videoId) {
  videoIdToAddToPlaylist = videoId;
  const listContainer = addToPlaylistModal.querySelector(".add-playlist-list");

  const [playlists, checkedPlaylists] = await Promise.all([
    window.electronAPI.playlistGetAll(),
    window.electronAPI.playlistGetForVideo(videoId),
  ]);
  const checkedIds = new Set(checkedPlaylists.map((p) => p.playlistId));

  listContainer.innerHTML =
    playlists.length === 0
      ? `<p class="placeholder-text" style="text-align:center; padding: 20px 0;">No playlists exist. Create one below.</p>`
      : playlists
          .map(
            (p) => `
            <div class="add-playlist-item">
                <input type="checkbox" id="playlist-check-${p.id}" data-id="${
              p.id
            }" ${checkedIds.has(p.id) ? "checked" : ""}>
                <label for="playlist-check-${p.id}">${p.name}</label>
            </div>`
          )
          .join("");

  addToPlaylistModal.classList.remove("hidden");
  document.getElementById("new-playlist-input").value = "";
}

// --- Event Delegation ---
playlistsPage.addEventListener("click", async (e) => {
  const menuBtn = e.target.closest(".playlist-grid-item .menu-btn");
  if (menuBtn) {
    e.stopPropagation();
    const itemEl = e.target.closest(".playlist-grid-item");
    const rect = menuBtn.getBoundingClientRect();
    playlistContextMenu.style.left = `${
      rect.left - playlistContextMenu.offsetWidth + rect.width
    }px`;
    playlistContextMenu.style.top = `${rect.bottom + 5}px`;
    playlistContextMenu.dataset.playlistId = itemEl.dataset.id;
    playlistContextMenu.dataset.playlistName = itemEl.dataset.name;
    playlistContextMenu.classList.add("visible");
    return;
  }

  const playlistCard = e.target.closest(".playlist-grid-item");
  if (playlistCard) {
    const playlistId = playlistCard.dataset.id;
    if (e.target.closest(".playlist-thumbnail-container")) {
      const playlistData = await window.electronAPI.playlistGetDetails(
        playlistId
      );
      if (playlistData && playlistData.videos.length > 0) {
        playLibraryItem(0, playlistData.videos);
      } else {
        showNotification("Playlist is empty.", "info");
      }
    } else {
      await renderPlaylistDetailPage(playlistId);
      showPage("playlist-detail-page", true);
    }
    return;
  }

  if (
    e.target.closest("#create-new-playlist-btn") ||
    e.target.closest("#create-new-playlist-btn-placeholder")
  ) {
    const newName = await showPromptModal(
      "Create New Playlist",
      "Enter a name for your new playlist:"
    );
    if (newName && newName.trim()) {
      const result = await window.electronAPI.playlistCreate(newName.trim());
      if (result.success) {
        showNotification(`Playlist "${newName.trim()}" created.`, "success");
        await renderPlaylistsPage();
      } else {
        showNotification(`Error: ${result.error}`, "error");
      }
    }
  }
});

addToPlaylistModal.addEventListener("click", async (e) => {
  if (e.target.id === "create-playlist-confirm-btn") {
    const inputField = document.getElementById("new-playlist-input");
    const name = inputField.value.trim();
    if (!name) return;
    const result = await window.electronAPI.playlistCreate(name);
    if (result.success) {
      showNotification(`Playlist "${name}" created.`, "success");
      await openAddToPlaylistModal(videoIdToAddToPlaylist); // Refresh modal
      const newCheckbox = document.querySelector(
        `#add-to-playlist-modal input[data-id="${result.id}"]`
      );
      if (newCheckbox) newCheckbox.checked = true;
    } else {
      showNotification(`Error: ${result.error}`, "error");
    }
  }
  if (e.target.id === "modal-done-btn") {
    const videoId = videoIdToAddToPlaylist;
    const checkboxes = addToPlaylistModal.querySelectorAll(
      '.add-playlist-list input[type="checkbox"]'
    );
    for (const box of checkboxes) {
      const playlistId = box.dataset.id;
      if (box.checked) {
        await window.electronAPI.playlistAddVideo(playlistId, videoId);
      } else {
        await window.electronAPI.playlistRemoveVideo(playlistId, videoId);
      }
    }
    addToPlaylistModal.classList.add("hidden");
    videoIdToAddToPlaylist = null;
  }
});

playlistDetailPage.addEventListener("click", async (e) => {
  const renameBtn = e.target.closest("#rename-playlist-btn");
  if (renameBtn) {
    const playlistId = renameBtn.dataset.id;
    const currentName = renameBtn.dataset.name;
    const newName = await showPromptModal(
      "Rename Playlist",
      "Enter a new name:",
      currentName
    );
    if (newName && newName.trim() && newName.trim() !== currentName) {
      const result = await window.electronAPI.playlistRename(
        playlistId,
        newName.trim()
      );
      if (result.success) {
        showNotification("Playlist renamed.", "success");
        await renderPlaylistDetailPage(playlistId);
      } else {
        showNotification(`Error: ${result.error}`, "error");
      }
    }
  }
  const deleteBtn = e.target.closest("#delete-playlist-btn");
  if (deleteBtn) {
    const playlistId = deleteBtn.dataset.id;
    const playlistName = deleteBtn.dataset.name;
    showConfirmationModal(
      "Delete Playlist?",
      `Are you sure you want to permanently delete the "${playlistName}" playlist? The videos inside will not be deleted from your library.`,
      async () => {
        const result = await window.electronAPI.playlistDelete(playlistId);
        if (result.success) {
          showNotification("Playlist deleted.", "success");
          await renderPlaylistsPage();
          showPage("playlists");
        } else {
          showNotification(`Error: ${result.error}`, "error");
        }
      }
    );
  }
});

export function initializePlaylistContextMenus() {
  document
    .getElementById("context-playlist-rename-btn")
    .addEventListener("click", async () => {
      const playlistId = playlistContextMenu.dataset.playlistId;
      const currentName = playlistContextMenu.dataset.playlistName;
      const newName = await showPromptModal(
        "Rename Playlist",
        "Enter a new name:",
        currentName
      );
      if (newName && newName.trim() && newName.trim() !== currentName) {
        const result = await window.electronAPI.playlistRename(
          playlistId,
          newName.trim()
        );
        if (result.success) {
          showNotification("Playlist renamed.", "success");
          await renderPlaylistsPage();
        } else {
          showNotification(`Error: ${result.error}`, "error");
        }
      }
      playlistContextMenu.classList.remove("visible");
    });

  document
    .getElementById("context-playlist-delete-btn")
    .addEventListener("click", () => {
      const playlistId = playlistContextMenu.dataset.playlistId;
      const playlistName = playlistContextMenu.dataset.playlistName;
      showConfirmationModal(
        "Delete Playlist?",
        `Are you sure you want to permanently delete the "${playlistName}" playlist? Videos will not be deleted.`,
        async () => {
          const result = await window.electronAPI.playlistDelete(playlistId);
          if (result.success) {
            showNotification("Playlist deleted.", "success");
            await renderPlaylistsPage();
          } else {
            showNotification(`Error: ${result.error}`, "error");
          }
        }
      );
      playlistContextMenu.classList.remove("visible");
    });
}
