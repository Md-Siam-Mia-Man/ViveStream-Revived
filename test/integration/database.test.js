const database = require('../../src/main/database');
const fs = require('fs');
const path = require('path');

// Mock `electron` app
const mockApp = {
  getPath: jest.fn().mockReturnValue('/tmp'),
  quit: jest.fn(),
};

describe('Database Integration', () => {
  // Use a unique DB file name to avoid locking conflicts with other tests
  const dbPath = path.join(
    '/tmp',
    `ViveStream_Basic_${Date.now()}_${Math.random()}.db`
  );

  beforeAll(async () => {
    // Initialize DB with custom path
    await database.initialize(mockApp, dbPath);
    // Wait a bit for async init
    await new Promise((r) => setTimeout(r, 500));
  });

  afterAll(async () => {
    await database.shutdown();
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (e) {}
    }
  });

  test('should create playlists', async () => {
    const res = await database.createPlaylist('My Playlist');
    expect(res.success).toBe(true);
    expect(res.id).toBeDefined();

    const playlists = await database.getAllPlaylistsWithStats();
    expect(playlists.length).toBeGreaterThan(0);
    expect(playlists[0].name).toBe('My Playlist');
  });

  test('should add and retrieve a video', async () => {
    const videoData = {
      id: 'vid123',
      title: 'Test Video',
      uploader: 'Tester',
      creator: 'Artist A',
      duration: 120,
      upload_date: '2023-01-01',
      originalUrl: 'http://youtube.com/watch?v=vid123',
      filePath: '/tmp/vid123.mp4',
      type: 'video',
    };

    await database.addOrUpdateVideo(videoData);

    const video = await database.getVideoById('vid123');
    expect(video).toBeDefined();
    expect(video.title).toBe('Test Video');
  });

  test('should link video to playlist', async () => {
    // Create playlist
    const pRes = await database.createPlaylist('Link Test Playlist');
    const playlistId = pRes.id;

    // Create video
    const videoData = {
      id: 'vidLink',
      title: 'Link Video',
      filePath: '/tmp/vidLink.mp4',
    };
    await database.addOrUpdateVideo(videoData);

    // Link
    const linkRes = await database.addVideoToPlaylist(playlistId, 'vidLink');
    expect(linkRes.success).toBe(true);

    // Verify
    const details = await database.getPlaylistDetails(playlistId);
    expect(details.videos).toHaveLength(1);
    expect(details.videos[0].id).toBe('vidLink');
  });

  test('should handle artists', async () => {
    const artist = await database.findOrCreateArtist(
      'New Artist',
      '/tmp/artist.jpg'
    );
    expect(artist.id).toBeDefined();
    expect(artist.name).toBe('New Artist');

    const allArtists = await database.getAllArtistsWithStats();
    const found = allArtists.find((a) => a.name === 'New Artist');
    expect(found).toBeDefined();
  });

  test('should add to history', async () => {
    const item = {
      url: 'http://test.com/vid',
      title: 'History Vid',
      type: 'video',
    };
    await database.addToHistory(item);

    const history = await database.getHistory();
    expect(history[0].url).toBe('http://test.com/vid');
  });
});
