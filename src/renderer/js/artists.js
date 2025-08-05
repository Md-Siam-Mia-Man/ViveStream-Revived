// src/js/artists.js
import { AppState, setAllArtists } from "./state.js";
import { showPage, showLoader, hideLoader } from "./renderer.js";
import { renderGridItem } from "./ui.js";
import { playLibraryItem } from "./player.js";
import { showNotification } from "./notifications.js";

// --- DOM Element Selectors ---
const artistsPage = document.getElementById("artists-page");
const artistDetailPage = document.getElementById("artist-detail-page");

/**
 * Renders the main artists grid page.
 * @param {Array} [artistsToRender] - Optional array of artists for filtering/searching.
 */
export async function renderArtistsPage(artistsToRender) {
  if (!artistsToRender) {
    const allArtists = await window.electronAPI.artistGetAll();
    setAllArtists(allArtists); // Update central state
    artistsToRender = AppState.artists;
  }

  if (AppState.artists.length === 0) {
    artistsPage.innerHTML = `
      <div class="page-header">
        <h1 class="page-header-title">Artists</h1>
      </div>
      <div class="placeholder-page">
        <i class="fa-solid fa-microphone-slash placeholder-icon"></i>
        <h2 class="placeholder-title">No Artists Found</h2>
        <p class="placeholder-text">Artists you download will appear here automatically.</p>
      </div>`;
  } else {
    artistsPage.innerHTML = `
      <div class="page-header">
        <h1 class="page-header-title">Artists</h1>
      </div>
      <div class="artist-grid">
        ${
          artistsToRender.length > 0
            ? artistsToRender.map(renderArtistCard).join("")
            : '<p class="empty-message">No artists match your search.</p>'
        }
      </div>`;
  }
  hideLoader();
}

/**
 * Generates the HTML string for a single artist card.
 * @param {object} artist - The artist data object.
 * @returns {string} The HTML string.
 */
function renderArtistCard(artist) {
  const videoCountText =
    artist.videoCount === 1 ? "1 video" : `${artist.videoCount} videos`;
  const thumbnailSrc = artist.thumbnailPath
    ? decodeURIComponent(artist.thumbnailPath)
    : "../assets/logo.png";

  return `
    <div class="artist-grid-item" data-id="${artist.id}">
      <div class="artist-thumbnail-container">
        <img src="${thumbnailSrc}" class="artist-thumbnail" alt="${artist.name}" onerror="this.onerror=null;this.src='../assets/logo.png';">
      </div>
      <div class="artist-info">
        <p class="artist-name">${artist.name}</p>
        <p class="artist-meta">${videoCountText}</p>
      </div>
    </div>`;
}

/**
 * Renders the detailed view for a single artist.
 * @param {number} artistId - The ID of the artist to display.
 */
export async function renderArtistDetailPage(artistId) {
  showLoader();
  const artist = await window.electronAPI.artistGetDetails(artistId);

  if (!artist) {
    showNotification(`Could not find artist with ID ${artistId}`, "error");
    showPage("artists");
    hideLoader();
    return;
  }

  const videoCountText =
    artist.videos.length === 1 ? "1 video" : `${artist.videos.length} videos`;
  const thumbnailSrc = artist.thumbnailPath
    ? decodeURIComponent(artist.thumbnailPath)
    : "../assets/logo.png";

  artistDetailPage.innerHTML = `
    <div class="artist-detail-header">
      <img src="${thumbnailSrc}" class="artist-detail-image" alt="${
    artist.name
  }" onerror="this.onerror=null;this.src='../assets/logo.png';">
      <div class="artist-detail-info">
        <h1 class="artist-detail-name">${artist.name}</h1>
        <p class="artist-detail-meta">${videoCountText}</p>
      </div>
    </div>
    <div class="page-content" id="artist-detail-content">
      ${
        artist.videos.length > 0
          ? `<div class="video-grid" id="video-grid-artist">${artist.videos
              .map((item) => renderGridItem(item))
              .join("")}</div>`
          : `<div class="placeholder-page" style="flex-grow: 1;">
            <i class="fa-solid fa-video-slash placeholder-icon"></i>
            <h2 class="placeholder-title">No Videos Found</h2>
            <p class="placeholder-text">This artist currently has no videos in your library.</p>
        </div>`
      }
    </div>`;

  // Attach event listener to the newly created grid.
  const grid = artistDetailPage.querySelector("#video-grid-artist");
  if (grid) {
    grid.addEventListener("click", (event) => {
      const itemEl = event.target.closest(".video-grid-item");
      if (!itemEl) return;
      const videoIndex = artist.videos.findIndex(
        (v) => v.id === itemEl.dataset.id
      );
      if (videoIndex > -1) {
        playLibraryItem(videoIndex, artist.videos);
      }
    });
  }
  hideLoader();
}

// --- Event Delegation ---
artistsPage.addEventListener("click", async (e) => {
  const artistCard = e.target.closest(".artist-grid-item");
  if (artistCard) {
    const artistId = artistCard.dataset.id;
    await renderArtistDetailPage(artistId);
    showPage("artist-detail-page", true);
  }
});
