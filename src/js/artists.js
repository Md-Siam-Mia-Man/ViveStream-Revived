// src/js/artists.js

// This array will hold the full list of artists for client-side searching
let allArtists = [];

/**
 * Fetches artists from the backend and renders the main artists grid page.
 * @param {Array} [artistsToRender] - Optional array of artists to render, used for search filtering.
 */
async function renderArtistsPage(artistsToRender) {
  const artistsPage = document.getElementById("artists-page");
  if (!artistsPage) return;

  // If no specific list is provided, fetch the full list from the backend.
  if (!artistsToRender) {
    allArtists = await window.electronAPI.artistGetAll();
    artistsToRender = allArtists;
  }

  // Handle the case where there are no artists in the library.
  if (artistsToRender.length === 0) {
    artistsPage.innerHTML = `
      <div class="page-header">
        <h1 class="page-header-title">Artists</h1>
      </div>
      <div class="placeholder-page">
        <i class="fa-solid fa-microphone-stand-slash placeholder-icon"></i>
        <h2 class="placeholder-title">No Artists Found</h2>
        <p class="placeholder-text">Artists you download will appear here automatically.</p>
      </div>`;
    return;
  }

  // Render the page with the grid of artists.
  artistsPage.innerHTML = `
    <div class="page-header">
      <h1 class="page-header-title">Artists</h1>
    </div>
    <div class="artist-grid">
      ${artistsToRender.map(renderArtistCard).join("")}
    </div>`;
}

/**
 * Generates the HTML for a single artist card in the grid.
 * @param {object} artist - The artist object from the database.
 * @returns {string} HTML string for the artist card.
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
 * Fetches details for a specific artist and renders their dedicated page.
 * @param {number} artistId - The ID of the artist to display.
 */
async function renderArtistDetailPage(artistId) {
  const detailPage = document.getElementById("artist-detail-page");
  if (!detailPage) return;

  const artist = await window.electronAPI.artistGetDetails(artistId);

  if (!artist) {
    showNotification(`Could not find artist with ID ${artistId}`, "error");
    showPage("artists"); // Go back to the main artists page
    return;
  }

  const videoCountText =
    artist.videos.length === 1 ? "1 video" : `${artist.videos.length} videos`;
  const thumbnailSrc = artist.thumbnailPath
    ? decodeURIComponent(artist.thumbnailPath)
    : "../assets/logo.png";

  detailPage.innerHTML = `
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

  // Add event listener to the newly created grid.
  const grid = detailPage.querySelector("#video-grid-artist");
  if (grid) {
    grid.addEventListener("click", (event) => {
      // We're re-using the generic grid click handler, but need to provide the correct
      // library source (the artist's videos) for playback.
      const itemEl = event.target.closest(".video-grid-item");
      if (!itemEl) return;

      // Find the video index within this artist's specific video list.
      const videoIndex = artist.videos.findIndex(
        (v) => v.id === itemEl.dataset.id
      );
      if (videoIndex > -1) {
        // We call playLibraryItem with the artist's video array as the source.
        playLibraryItem(videoIndex, artist.videos);
      }
    });
  }
}

// Add a single event listener to the main artists page to handle clicks on any artist card.
document.getElementById("artists-page").addEventListener("click", async (e) => {
  const artistCard = e.target.closest(".artist-grid-item");
  if (artistCard) {
    const artistId = artistCard.dataset.id;
    await renderArtistDetailPage(artistId);
    showPage("artist-detail-page", true); // `true` indicates it's a sub-page
  }
});
