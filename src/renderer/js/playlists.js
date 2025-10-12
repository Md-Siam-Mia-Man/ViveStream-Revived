// src/renderer/js/playlists.js
import { AppState, setAllPlaylists } from "./state.js";
import {
  showPage,
  setCurrentPlaylistId,
  showLoader,
  hideLoader,
} from "./renderer.js";
import { createGridItem } from "./ui.js";
import { showConfirmationModal, showPromptModal } from "./modals.js";
import { showNotification } from "./notifications.js";
import { eventBus } from "./event-bus.js";

const playlistsPage = document.getElementById("playlists-page");
const playlistDetailPage = document.getElementById("playlist-detail-page");
const addToPlaylistModal = document.getElementById("add-to-playlist-modal");
const playlistContextMenu = document.getElementById(
  "playlist-item-context-menu"
);

let videoIdToAddToPlaylist = null;
let sortableInstance = null;

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

export async function renderPlaylistsPage(playlistsToRender) {
  if (!playlistsToRender) {
    const playlists = await window.electronAPI.playlistGetAll();
    setAllPlaylists(playlists);
    playlistsToRender = AppState.playlists;
  }

  playlistsPage.innerHTML = "";

  const header = document.createElement("div");
  header.className = "page-header";
  header.innerHTML = `
    <h1 class="page-header-title">Playlists</h1>
    <div class="page-header-actions">
        <button class="action-button" id="create-new-playlist-btn"><i class="fa-solid fa-plus"></i> Create Playlist</button>
    </div>`;
  playlistsPage.appendChild(header);

  if (AppState.playlists.length === 0) {
    header.querySelector("#create-new-playlist-btn").id =
      "create-new-playlist-btn-placeholder";
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder-page";
    placeholder.innerHTML = `
        <i class="fa-solid fa-layer-group placeholder-icon"></i>
        <h2 class="placeholder-title">No Playlists Yet</h2>
        <p class="placeholder-text">Create your first playlist to organize your media.</p>`;
    playlistsPage.appendChild(placeholder);
  } else {
    const content = document.createElement("div");
    content.className = "page-content";

    const grid = document.createElement("div");
    grid.className = "playlist-grid";
    grid.id = "playlist-grid-main";

    if (playlistsToRender.length > 0) {
      const fragment = document.createDocumentFragment();
      playlistsToRender.forEach((playlist) => {
        const card = renderPlaylistCard(playlist);
        fragment.appendChild(card);
      });
      grid.appendChild(fragment);
      grid
        .querySelectorAll("img.lazy")
        .forEach((img) => lazyLoadObserver.observe(img));
    } else {
      grid.innerHTML =
        '<p class="empty-message">No playlists match your search.</p>';
    }
    content.appendChild(grid);
    playlistsPage.appendChild(content);
  }
  hideLoader();
}

export function renderPlaylistCard(playlist) {
  const videoCountText =
    playlist.videoCount === 1 ? "1 video" : `${playlist.videoCount} videos`;
  const placeholderSrc = `${AppState.assetsPath}/logo.png`;
  const thumbnailSrc = playlist.thumbnail
    ? decodeURIComponent(playlist.thumbnail)
    : placeholderSrc;

  const card = document.createElement("div");
  card.className = "playlist-grid-item";
  card.dataset.id = playlist.id;
  card.dataset.name = playlist.name;

  card.innerHTML = `
    <div class="playlist-thumbnail-container">
        <img data-src="${thumbnailSrc}" src="${placeholderSrc}" class="playlist-thumbnail lazy" alt="playlist-thumbnail" onerror="this.onerror=null;this.src='${placeholderSrc}';">
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
    </div>`;
  return card;
}

export async function renderPlaylistDetailPage(playlistId) {
  showLoader();
  const playlist = await window.electronAPI.playlistGetDetails(playlistId);

  playlistDetailPage.innerHTML = "";

  if (!playlist) {
    showNotification(`Could not find playlist with ID ${playlistId}`, "error");
    showPage("playlists");
    hideLoader();
    return;
  }

  setCurrentPlaylistId(playlistId);

  const videoCountText =
    playlist.videos.length === 1
      ? "1 video"
      : `${playlist.videos.length} videos`;
  const placeholderSrc = `${AppState.assetsPath}/logo.png`;
  const coverSrc = playlist.coverPath
    ? decodeURIComponent(playlist.coverPath)
    : playlist.videos[0]?.coverPath
      ? decodeURIComponent(playlist.videos[0].coverPath)
      : placeholderSrc;

  const header = document.createElement("div");
  header.className = "playlist-detail-header-container";
  header.innerHTML = `
    <div class="playlist-detail-cover-container">
        <img src="${coverSrc}" class="playlist-detail-cover" alt="playlist cover" onerror="this.onerror=null;this.src='${placeholderSrc}';">
        <button class="edit-cover-btn" id="edit-playlist-cover-btn" title="Change cover"><i class="fa-solid fa-camera"></i></button>
    </div>
    <div class="playlist-detail-info">
        <h1 class="playlist-detail-title">${playlist.name}</h1>
        <p class="playlist-detail-meta">${videoCountText}</p>
        <div class="playlist-detail-actions">
             <button class="action-button" id="rename-playlist-btn" data-id="${playlist.id}" data-name="${playlist.name}"><i class="fa-solid fa-pencil"></i> Rename</button>
             <button class="action-button danger-btn" id="delete-playlist-btn" data-id="${playlist.id}" data-name="${playlist.name}"><i class="fa-solid fa-trash-can"></i> Delete</button>
        </div>
    </div>
    `;
  playlistDetailPage.appendChild(header);

  const content = document.createElement("div");
  content.className = "page-content";
  content.id = "playlist-detail-content";

  if (playlist.videos.length > 0) {
    const grid = document.createElement("div");
    grid.className = "video-grid";
    grid.id = "video-grid-playlist";
    grid.dataset.playlistId = playlist.id;
    grid.dataset.playlistName = playlist.name;

    const fragment = document.createDocumentFragment();
    playlist.videos.forEach((item) => {
      const gridItem = createGridItem(item, true);
      fragment.appendChild(gridItem);
    });
    grid.appendChild(fragment);
    grid
      .querySelectorAll("img.lazy")
      .forEach((img) => lazyLoadObserver.observe(img));

    content.appendChild(grid);

    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(grid, {
      animation: 150,
      ghostClass: "sortable-ghost",
      onEnd: async (evt) => {
        const videoIds = [...evt.to.children].map((el) => el.dataset.id);
        await window.electronAPI.playlistUpdateOrder(playlistId, videoIds);
      },
    });
  } else {
    content.innerHTML = `
      <div class="placeholder-page" style="flex-grow: 1;">
        <i class="fa-solid fa-video-slash placeholder-icon"></i>
        <h2 class="placeholder-title">Playlist is Empty</h2>
        <p class="placeholder-text">Add some videos to get started.</p>
      </div>`;
  }
  playlistDetailPage.appendChild(content);

  hideLoader();
}

export async function openAddToPlaylistModal(videoId) {
  videoIdToAddToPlaylist = videoId;
  const listContainer = addToPlaylistModal.querySelector(".add-playlist-list");
  const inputField = document.getElementById("add-to-playlist-input");

  const [playlists, checkedPlaylists] = await Promise.all([
    window.electronAPI.playlistGetAll(),
    window.electronAPI.playlistGetForVideo(videoId),
  ]);
  const checkedIds = new Set(checkedPlaylists.map((p) => p.playlistId));

  listContainer.innerHTML =
    playlists.length === 0
      ? `<p class="placeholder-text" style="text-align:center; padding: 20px 0;">No playlists exist. Create one above.</p>`
      : playlists
          .map(
            (p) => `
            <div class="add-playlist-item" data-id="${p.id}">
                <input type="checkbox" id="playlist-check-${p.id}" ${
                  checkedIds.has(p.id) ? "checked" : ""
                }>
                <span class="custom-checkbox"><i class="fa-solid fa-check"></i></span>
                <label for="playlist-check-${p.id}">${p.name}</label>
            </div>`
          )
          .join("");

  addToPlaylistModal.classList.remove("hidden");
  inputField.value = "";
  inputField.focus();
}

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
      const playlistData =
        await window.electronAPI.playlistGetDetails(playlistId);
      if (playlistData && playlistData.videos.length > 0) {
        eventBus.emit("player:play_request", {
          index: 0,
          queue: playlistData.videos,
          context: {
            type: "playlist",
            id: playlistId,
            name: playlistData.name,
          },
        });
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

addToPlaylistModal.addEventListener("click", (e) => {
  if (
    e.target.id === "add-to-playlist-close-btn" ||
    (e.target.closest(".modal-overlay") === addToPlaylistModal &&
      !e.target.closest(".modal-content"))
  ) {
    addToPlaylistModal.classList.add("hidden");
    videoIdToAddToPlaylist = null;
  }
});

addToPlaylistModal
  .querySelector(".add-playlist-list")
  .addEventListener("click", async (e) => {
    const item = e.target.closest(".add-playlist-item");
    if (item) {
      const checkbox = item.querySelector('input[type="checkbox"]');
      const playlistId = item.dataset.id;
      checkbox.checked = !checkbox.checked;

      if (checkbox.checked) {
        await window.electronAPI.playlistAddVideo(
          playlistId,
          videoIdToAddToPlaylist
        );
      } else {
        await window.electronAPI.playlistRemoveVideo(
          playlistId,
          videoIdToAddToPlaylist
        );
      }
    }
  });

document
  .getElementById("add-to-playlist-input")
  .addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const items = addToPlaylistModal.querySelectorAll(".add-playlist-item");
    items.forEach((item) => {
      const label = item.querySelector("label").textContent.toLowerCase();
      item.classList.toggle("hidden", !label.includes(searchTerm));
    });
  });

document
  .getElementById("add-to-playlist-input")
  .addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const name = e.target.value.trim();
      if (!name) return;

      const result = await window.electronAPI.playlistCreate(name);
      if (result.success) {
        showNotification(`Playlist "${name}" created.`, "success");
        await window.electronAPI.playlistAddVideo(
          result.id,
          videoIdToAddToPlaylist
        );
        await openAddToPlaylistModal(videoIdToAddToPlaylist);
      } else {
        showNotification(`Error: ${result.error}`, "error");
      }
    }
  });

playlistDetailPage.addEventListener("click", async (e) => {
  const editCoverBtn = e.target.closest("#edit-playlist-cover-btn");
  if (editCoverBtn) {
    const playlistId = document.getElementById("rename-playlist-btn").dataset
      .id;
    const result = await window.electronAPI.playlistUpdateCover(playlistId);
    if (result.success) {
      showNotification("Playlist cover updated.", "success");
      await renderPlaylistDetailPage(playlistId);
    } else if (result.error !== "File selection cancelled.") {
      showNotification(`Error: ${result.error}`, "error");
    }
  }

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
