/**
 * @jest-environment jsdom
 */

// 1. Setup Globals BEFORE requiring the module
// This prevents ReferenceError: IntersectionObserver is not defined in ui.js top-level code.
global.IntersectionObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn()
}));

// Mock localStorage
global.localStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    clear: jest.fn()
};

// Mock window globals
global.window.electronAPI = {
    getPlatform: jest.fn().mockReturnValue('linux')
};

// Mock document body structure required by ui.js top-level selectors
document.body.innerHTML = `
  <div id="home-search-input"></div>
  <div class="search-container"></div>
  <div id="video-item-context-menu"></div>
  <div id="context-remove-from-playlist-btn"></div>
  <template id="video-grid-item-template">
    <div class="video-grid-item">
        <img class="grid-thumbnail" />
        <div class="thumbnail-overlay-icon"></div>
        <span class="thumbnail-duration"></span>
        <p class="grid-item-title"></p>
        <p class="grid-item-meta"></p>
        <button class="favorite-btn"><span></span></button>
    </div>
  </template>
  <div class="sidebar"></div>
  <div id="search-page"></div>
  <div id="scroll-sentinel"></div>
  <div id="fps-counter"></div>
  <div class="content-wrapper"></div>
  <div id="header-actions-container"></div>
  <div id="sort-dropdown">
      <span id="sort-dropdown-label"></span>
  </div>
`;

// 2. Mock dependencies
jest.mock('../../../src/renderer/js/state.js', () => ({
    AppState: {
        currentFilters: {
            type: "all",
            duration: "all",
            source: "all",
            uploadDate: "all",
        },
        assetsPath: ''
    },
    setFilters: jest.fn()
}));

jest.mock('../../../src/renderer/js/renderer.js', () => ({
    showPage: jest.fn(),
    handleNav: jest.fn(),
    showLoader: jest.fn(),
    hideLoader: jest.fn(),
    renderSearchPage: jest.fn()
}));

jest.mock('../../../src/renderer/js/playlists.js', () => ({
    openAddToPlaylistModal: jest.fn(),
    renderPlaylistCard: jest.fn()
}));

jest.mock('../../../src/renderer/js/player.js', () => ({
    renderUpNextList: jest.fn()
}));

jest.mock('../../../src/renderer/js/artists.js', () => ({
    renderArtistCard: jest.fn()
}));

jest.mock('../../../src/renderer/js/utils.js', () => ({
    formatTime: jest.fn(),
    debounce: fn => fn,
    fuzzySearch: jest.fn()
}));

jest.mock('../../../src/renderer/js/event-bus.js', () => ({
    eventBus: { emit: jest.fn(), on: jest.fn() }
}));

jest.mock('../../../src/renderer/js/modals.js', () => ({
    showConfirmationModal: jest.fn()
}));

jest.mock('../../../src/renderer/js/notifications.js', () => ({
    showNotification: jest.fn()
}));

jest.mock('../../../src/renderer/js/miniplayer.js', () => ({
    activateMiniplayer: jest.fn(),
    deactivateMiniplayer: jest.fn(),
    closeMiniplayer: jest.fn(),
    initializeMiniplayer: jest.fn()
}));

jest.mock('../../../src/renderer/js/settings.js', () => ({
    initializeSettingsPage: jest.fn(),
    loadSettings: jest.fn()
}));

// 3. Import Module Under Test (using require to ensure mocks run first)
const { applyFilters } = require('../../../src/renderer/js/ui.js');
const { AppState } = require('../../../src/renderer/js/state.js');

describe('UI Logic - applyFilters', () => {
    const mockDate = new Date('2023-05-15T12:00:00Z');

    const mockLibrary = [
        { id: 1, type: 'video', duration: 100, source: 'youtube', upload_date: '20230501', title: 'Short YT Video' },
        { id: 2, type: 'audio', duration: 600, source: 'local', upload_date: '20230101', title: 'Medium Audio' },
        { id: 3, type: 'video', duration: 1500, source: 'youtube', upload_date: '20221201', title: 'Long YT Video' },
        { id: 4, type: 'video', duration: 200, source: 'local', upload_date: '20230510', title: 'Short Local Video' }
    ];

    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(mockDate);
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        AppState.currentFilters = {
            type: "all",
            duration: "all",
            source: "all",
            uploadDate: "all",
        };
        jest.clearAllMocks();
    });

    test('should return all items when filters are default', () => {
        const result = applyFilters(mockLibrary);
        expect(result).toHaveLength(4);
    });

    test('should filter by type', () => {
        AppState.currentFilters.type = 'audio';
        const result = applyFilters(mockLibrary);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(2);
    });

    test('should filter by duration (<5 min)', () => {
        AppState.currentFilters.duration = '<5';
        const result = applyFilters(mockLibrary);
        expect(result).toHaveLength(2); // Items 1 and 4
    });

    test('should filter by duration (5-20 min)', () => {
        AppState.currentFilters.duration = '5-20';
        const result = applyFilters(mockLibrary);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(2);
    });

    test('should filter by duration (>20 min)', () => {
        AppState.currentFilters.duration = '>20';
        const result = applyFilters(mockLibrary);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(3);
    });

    test('should filter by source', () => {
        AppState.currentFilters.source = 'local';
        const result = applyFilters(mockLibrary);
        expect(result).toHaveLength(2); // Items 2 and 4
    });

    test('should filter by date (This Month)', () => {
        AppState.currentFilters.uploadDate = 'this_month';
        const result = applyFilters(mockLibrary);
        expect(result).toHaveLength(2); // Items 1 and 4
    });

    test('should filter by date (This Year)', () => {
        AppState.currentFilters.uploadDate = 'this_year';
        const result = applyFilters(mockLibrary);
        expect(result).toHaveLength(3);
    });

    test('should filter by date (Older)', () => {
        AppState.currentFilters.uploadDate = 'older';
        const result = applyFilters(mockLibrary);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(3);
    });

    test('should combine multiple filters', () => {
        AppState.currentFilters.type = 'video';
        AppState.currentFilters.source = 'local';
        AppState.currentFilters.duration = '<5';

        const result = applyFilters(mockLibrary);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(4);
    });
});