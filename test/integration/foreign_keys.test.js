const database = require('../../src/main/database');
const fs = require('fs');
const path = require('path');

// Mock `electron` app
const mockApp = {
  getPath: jest.fn().mockReturnValue('/tmp'),
  quit: jest.fn(),
};

describe('Database Foreign Key Constraint Bug', () => {
  const dbPath = path.join(
    '/tmp',
    `ViveStream_Bug_${Date.now()}_${Math.random()}.db`
  );

  beforeAll(async () => {
    // Initialize DB with custom path
    await database.initialize(mockApp, dbPath);
  });

  afterAll(async () => {
    await database.shutdown();
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (e) {}
    }
  });

  test('should cascade delete video_artists when video is deleted', async () => {
    const db = database.getDB();

    // 1. Create an artist
    const artistRes = await database.findOrCreateArtist('Artist FK Test', null);
    const artistId = artistRes.id;

    // 2. Create a video
    const videoData = {
      id: 'vid_fk_test',
      title: 'FK Test Video',
      filePath: '/tmp/vid_fk_test.mp4',
    };
    await database.addOrUpdateVideo(videoData);

    // 3. Link them
    await database.linkVideoToArtist('vid_fk_test', artistId);

    // Verify link exists
    const linkBefore = await db('video_artists')
      .where({ videoId: 'vid_fk_test', artistId })
      .first();
    expect(linkBefore).toBeDefined();

    // 4. Delete the video using raw delete to test FK specifically.
    await db('videos').where({ id: 'vid_fk_test' }).del();

    // 5. Check if link still exists
    const linkAfter = await db('video_artists')
      .where({ videoId: 'vid_fk_test', artistId })
      .first();

    // If FKs are working, linkAfter will be undefined.
    expect(linkAfter).toBeUndefined();
  });
});
