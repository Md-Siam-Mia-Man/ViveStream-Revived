// src/renderer/js/state.js

export const AppState = {
  assetsPath: "",

  library: [],
  playbackQueue: [],
  currentlyPlayingIndex: -1,
  playbackContext: {
    type: null,
    id: null,
    name: "",
  },

  playlists: [],
  artists: [],

  currentFilters: {
    type: "all", // 'all', 'video', 'audio'
    duration: "all", // 'all', '<5', '5-20', '>20'
    source: "all", // 'all', 'youtube', 'local'
    uploadDate: "all", // 'all', 'this_month', 'this_year', 'older'
  },
};

export function setAssetsPath(path) {
  AppState.assetsPath = path;
}

export function setLibrary(media) {
  AppState.library = media;
}

export function setCurrentlyPlaying(index, queue, context = null) {
  AppState.currentlyPlayingIndex = index;
  AppState.playbackQueue = queue;
  AppState.playbackContext = context || { type: null, id: null, name: "" };
}

export function setAllPlaylists(playlists) {
  AppState.playlists = playlists;
}

export function setAllArtists(artists) {
  AppState.artists = artists;
}

export function setFilters(newFilters) {
  AppState.currentFilters = { ...AppState.currentFilters, ...newFilters };
}

export function resetPlaybackState() {
  AppState.playbackQueue = [];
  AppState.currentlyPlayingIndex = -1;
  AppState.playbackContext = { type: null, id: null, name: "" };
}