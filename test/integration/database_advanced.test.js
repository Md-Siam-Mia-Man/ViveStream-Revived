const database = require('../../src/main/database');
const fs = require('fs');
const path = require('path');

// Mock electron app
const mockApp = {
    getPath: jest.fn().mockReturnValue('/tmp'),
    quit: jest.fn()
};

describe('Advanced Database Logic', () => {
    // Use a unique DB file name
    const dbPath = path.join('/tmp', `ViveStream_Advanced_${Date.now()}_${Math.random()}.db`);

    beforeAll(async () => {
        await database.initialize(mockApp, dbPath);
        await new Promise(r => setTimeout(r, 500));
    });

    afterAll(async () => {
        await database.shutdown();
        if (fs.existsSync(dbPath)) try { fs.unlinkSync(dbPath); } catch (e) { }
    });

    beforeEach(async () => {
        await database.clearAllMedia();
    });

    test('regenerateArtists should extract multiple artists from video creator field', async () => {
        const complexCreator = "Daft Punk feat. Pharrell Williams; Nile Rodgers";

        // Use getDB() to access knex instance
        await database.getDB()('videos').insert({
            id: 'vid_complex',
            title: 'Get Lucky',
            creator: complexCreator,
            uploader: 'DaftPunkVEVO',
            filePath: '/tmp/get_lucky.mp4',
            downloadedAt: new Date().toISOString()
        });

        // Verify no artist links exist yet
        const initialLinks = await database.getDB()('video_artists').where({ videoId: 'vid_complex' });
        expect(initialLinks.length).toBe(0);

        // 2. Run Regeneration
        const result = await database.regenerateArtists();
        expect(result.success).toBe(true);

        // 3. Verify Artists were created
        const artists = await database.getAllArtistsWithStats();
        const artistNames = artists.map(a => a.name).sort();

        expect(artistNames).toContain('Daft Punk');
        expect(artistNames).toContain('Pharrell Williams');
        expect(artistNames).toContain('Nile Rodgers');

        // 4. Verify Links
        const links = await database.getDB()('video_artists').where({ videoId: 'vid_complex' });
        expect(links.length).toBe(3);
    });

    test('regenerateArtists should handle duplicates gracefully', async () => {
        // Create an artist beforehand
        await database.findOrCreateArtist('Existing Guy', null);

        // Insert video featuring that artist
        await database.getDB()('videos').insert({
            id: 'vid_dup',
            title: 'Another Song',
            creator: 'Existing Guy',
            filePath: '/tmp/dup.mp4'
        });

        // Regenerate
        await database.regenerateArtists();

        const artists = await database.getAllArtistsWithStats();
        const targetArtist = artists.find(a => a.name === 'Existing Guy');

        expect(targetArtist).toBeDefined();
        expect(artists.filter(a => a.name === 'Existing Guy').length).toBe(1);

        const links = await database.getDB()('video_artists').where({ videoId: 'vid_dup' });
        expect(links.length).toBe(1);
        expect(links[0].artistId).toBe(targetArtist.id);
    });

    test('cleanupOrphanArtists should remove artists with no videos', async () => {
        // 1. Create an artist with a video
        const a1 = await database.findOrCreateArtist('Busy Artist', null);
        await database.getDB()('videos').insert({ id: 'v1', title: 't1', filePath: 'p1' });
        await database.linkVideoToArtist('v1', a1.id);

        // 2. Create an orphan artist
        await database.findOrCreateArtist('Lonely Artist', null);

        // Verify count
        let all = await database.getAllArtistsWithStats();
        expect(all.length).toBe(2);

        // 3. Cleanup
        const res = await database.cleanupOrphanArtists();
        expect(res.success).toBe(true);
        expect(res.count).toBe(1);

        // 4. Verify result
        all = await database.getAllArtistsWithStats();
        expect(all.length).toBe(1);
        expect(all[0].name).toBe('Busy Artist');
    });
});