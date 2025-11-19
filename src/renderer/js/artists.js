import { AppState, setAllArtists } from "./state.js";
import { showPage, showLoader, hideLoader } from "./renderer.js";
import { createGridItem, setHeaderActions } from "./ui.js";
import { eventBus } from "./event-bus.js";
import { showNotification } from "./notifications.js";

const artistsPage = document.getElementById("artists-page");
const artistDetailPage = document.getElementById("artist-detail-page");

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

export async function renderArtistsPage(artistsToRender) {
  if (!artistsToRender) {
    const allArtists = await window.electronAPI.artistGetAll();
    setAllArtists(allArtists);
    artistsToRender = AppState.artists;
  }

  artistsPage.innerHTML = "";
  setHeaderActions(null); // Clear header actions

  if (AppState.artists.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder-page";
    placeholder.innerHTML = `
      <span class="material-symbols-outlined placeholder-icon">mic_off</span>
      <h2 class="placeholder-title">No Artists Found</h2>
      <p class="placeholder-text">Artists you download will appear here automatically.</p>`;
    artistsPage.appendChild(placeholder);
  } else {
    const grid = document.createElement("div");
    grid.className = "artist-grid";

    if (artistsToRender.length > 0) {
      const fragment = document.createDocumentFragment();
      artistsToRender.forEach((artist) => {
        const card = renderArtistCard(artist);
        fragment.appendChild(card);
      });
      grid.appendChild(fragment);
      grid
        .querySelectorAll("img.lazy")
        .forEach((img) => lazyLoadObserver.observe(img));
    } else {
      grid.innerHTML =
        '<p class="empty-message">No artists match your search.</p>';
    }
    artistsPage.appendChild(grid);
  }
  hideLoader();
}

export function renderArtistCard(artist) {
  const videoCountText =
    artist.videoCount === 1 ? "1 video" : `${artist.videoCount} videos`;
  const placeholderSrc = `${AppState.assetsPath}/logo.png`;
  const thumbnailSrc = artist.thumbnailPath
    ? decodeURIComponent(artist.thumbnailPath)
    : placeholderSrc;

  const card = document.createElement("div");
  card.className = "artist-grid-item";
  card.dataset.id = artist.id;

  card.innerHTML = `
    <div class="artist-thumbnail-container">
      <img data-src="${thumbnailSrc}" src="${placeholderSrc}" class="artist-thumbnail lazy" alt="${artist.name}" onerror="this.onerror=null;this.src='${placeholderSrc}';">
    </div>
    <div class="artist-info">
      <p class="artist-name">${artist.name}</p>
      <p class="artist-meta">${videoCountText}</p>
    </div>`;
  return card;
}

export async function renderArtistDetailPage(artistId) {
  showLoader();
  setHeaderActions(null);
  const artist = await window.electronAPI.artistGetDetails(artistId);

  artistDetailPage.innerHTML = "";

  if (!artist) {
    showNotification(`Could not find artist with ID ${artistId}`, "error");
    showPage("artists");
    hideLoader();
    return;
  }

  const videoCountText =
    artist.videos.length === 1 ? "1 video" : `${artist.videos.length} videos`;
  const placeholderSrc = `${AppState.assetsPath}/logo.png`;
  const thumbnailSrc = artist.thumbnailPath
    ? decodeURIComponent(artist.thumbnailPath)
    : placeholderSrc;

  const headerWrapper = document.createElement("div");
  headerWrapper.className = "artist-detail-header-wrapper";
  headerWrapper.style.setProperty("--bg-image", `url('${thumbnailSrc}')`);

  headerWrapper.innerHTML = `
    <div class="artist-detail-header">
        <div class="artist-detail-image-container">
            <img src="${thumbnailSrc}" class="artist-detail-image" alt="${artist.name}" onerror="this.onerror=null;this.src='${placeholderSrc}';">
            <button class="edit-cover-btn" id="edit-artist-thumbnail-btn" title="Change thumbnail"><span class="material-symbols-outlined">photo_camera</span></button>
        </div>
        <div class="artist-detail-info">
            <h1 class="artist-detail-name">${artist.name}</h1>
            <p class="artist-detail-meta">${videoCountText}</p>
        </div>
    </div>`;
  artistDetailPage.appendChild(headerWrapper);

  const content = document.createElement("div");
  content.className = "page-content";
  content.id = "artist-detail-content";

  if (artist.videos.length > 0) {
    const grid = document.createElement("div");
    grid.className = "video-grid";
    grid.id = "video-grid-artist";
    grid.dataset.artistId = artist.id;
    grid.dataset.artistName = artist.name;

    const fragment = document.createDocumentFragment();
    artist.videos.forEach((item) => {
      const gridItem = createGridItem(item);
      fragment.appendChild(gridItem);
    });
    grid.appendChild(fragment);
    grid
      .querySelectorAll("img.lazy")
      .forEach((img) => lazyLoadObserver.observe(img));

    content.appendChild(grid);
  } else {
    content.innerHTML = `
      <div class="placeholder-page" style="flex-grow: 1;">
        <span class="material-symbols-outlined placeholder-icon">videocam_off</span>
        <h2 class="placeholder-title">No Videos Found</h2>
        <p class="placeholder-text">This artist currently has no videos in your library.</p>
      </div>`;
  }
  artistDetailPage.appendChild(content);

  document
    .getElementById("edit-artist-thumbnail-btn")
    .addEventListener("click", async () => {
      const result = await window.electronAPI.artistUpdateThumbnail(artistId);
      if (result.success) {
        showNotification("Artist thumbnail updated.", "success");
        await renderArtistDetailPage(artistId);
      } else if (result.error !== "File selection cancelled.") {
        showNotification(`Error: ${result.error}`, "error");
      }
    });

  hideLoader();
}

artistsPage.addEventListener("click", async (e) => {
  const artistCard = e.target.closest(".artist-grid-item");
  if (artistCard) {
    const artistId = artistCard.dataset.id;
    await renderArtistDetailPage(artistId);
    showPage("artist-detail-page", true);
  }
});
