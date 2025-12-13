import {
    AppState,
    setAssetsPath,
    setLibrary,
    setCurrentlyPlaying,
    setFilters,
    resetPlaybackState
} from '../../../src/renderer/js/state.js';

describe('Renderer State Management', () => {
    test('should set assets path', () => {
        setAssetsPath('/tmp/assets');
        expect(AppState.assetsPath).toBe('/tmp/assets');
    });

    test('should update library', () => {
        const mockLib = [{ id: 1, title: 'Test' }];
        setLibrary(mockLib);
        expect(AppState.library).toBe(mockLib);
        expect(AppState.library).toHaveLength(1);
    });

    test('should set currently playing item and context', () => {
        const queue = [{ id: 'a' }, { id: 'b' }];
        const context = { type: 'playlist', id: 1, name: 'My List' };

        setCurrentlyPlaying(1, queue, context);

        expect(AppState.currentlyPlayingIndex).toBe(1);
        expect(AppState.playbackQueue).toEqual(queue);
        expect(AppState.playbackContext).toEqual(context);
    });

    test('should merge filters instead of overwriting', () => {
        // Initial state check
        expect(AppState.currentFilters.type).toBe('all');

        setFilters({ type: 'audio' });
        expect(AppState.currentFilters.type).toBe('audio');
        // Check if other filters remained 'all' (default)
        expect(AppState.currentFilters.duration).toBe('all');

        setFilters({ duration: '>20', source: 'local' });
        expect(AppState.currentFilters.type).toBe('audio'); // Should persist
        expect(AppState.currentFilters.duration).toBe('>20');
        expect(AppState.currentFilters.source).toBe('local');
    });

    test('should reset playback state', () => {
        // Setup dirty state
        AppState.playbackQueue = [1, 2, 3];
        AppState.currentlyPlayingIndex = 2;

        resetPlaybackState();

        expect(AppState.playbackQueue).toEqual([]);
        expect(AppState.currentlyPlayingIndex).toBe(-1);
        expect(AppState.playbackContext.type).toBeNull();
    });
});