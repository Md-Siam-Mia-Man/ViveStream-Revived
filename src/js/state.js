// src/js/state.js

/**
 * The single source of truth for the application's renderer-side state.
 */
export const AppState = {
  // Library and Playback State
  library: [],
  playbackQueue: [],
  currentlyPlayingIndex: -1,
  // Page-specific data caches
  playlists: [],
  artists: [],
};

/**
 * Updates the main media library.
 * @param {Array} media - The new array of media items.
 */
export function setLibrary(media) {
  AppState.library = media;
}

/**
 * Updates the currently playing track and its queue.
 * @param {number} index - The index of the new track in the queue.
 * @param {Array} queue - The playback queue.
 */
export function setCurrentlyPlaying(index, queue) {
  AppState.currentlyPlayingIndex = index;
  AppState.playbackQueue = queue;
}

/**
 * Updates the cached list of all playlists.
 * @param {Array} playlists - The array of playlist objects.
 */
export function setAllPlaylists(playlists) {
  AppState.playlists = playlists;
}

/**
 * Updates the cached list of all artists.
 * @param {Array} artists - The array of artist objects.
 */
export function setAllArtists(artists) {
  AppState.artists = artists;
}

/**
 * Clears all dynamic state, typically after a major library change.
 */
export function resetPlaybackState() {
  AppState.playbackQueue = [];
  AppState.currentlyPlayingIndex = -1;
}
