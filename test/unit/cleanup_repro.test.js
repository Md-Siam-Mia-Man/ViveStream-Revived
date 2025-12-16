const fs = require('fs');
const path = require('path');
const cleanup = require('../../helpers/cleanup.js');

const TEMP_DIR = path.join(__dirname, 'temp_cleanup_test');

describe('Cleanup Script', () => {
    beforeEach(() => {
        if (fs.existsSync(TEMP_DIR)) {
            fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(TEMP_DIR);
    });

    afterEach(() => {
        if (fs.existsSync(TEMP_DIR)) {
            fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        }
    });

    test('Clean Executables Folder - Normal bin folder', () => {
        const normalBin = path.join(TEMP_DIR, 'bin');
        fs.mkdirSync(normalBin);
        fs.writeFileSync(path.join(normalBin, 'python.exe'), 'exec'); // Allowlisted
        fs.writeFileSync(path.join(normalBin, 'trash.exe'), 'exec'); // Should be deleted

        cleanup.cleanExecutablesFolder(normalBin);

        expect(fs.existsSync(path.join(normalBin, 'python.exe'))).toBe(true);
        expect(fs.existsSync(path.join(normalBin, 'trash.exe'))).toBe(false);
    });

    test('Clean Executables Folder - Protected static_ffmpeg/bin folder', () => {
        const staticFfmpegBin = path.join(TEMP_DIR, 'static_ffmpeg', 'bin');
        fs.mkdirSync(path.join(TEMP_DIR, 'static_ffmpeg'));
        fs.mkdirSync(staticFfmpegBin);

        // Create some files that would normally be deleted
        fs.writeFileSync(path.join(staticFfmpegBin, 'ffmpeg'), 'exec');
        fs.writeFileSync(path.join(staticFfmpegBin, 'some_other_tool'), 'exec');

        cleanup.cleanExecutablesFolder(staticFfmpegBin);

        expect(fs.existsSync(path.join(staticFfmpegBin, 'ffmpeg'))).toBe(true);
        expect(fs.existsSync(path.join(staticFfmpegBin, 'some_other_tool'))).toBe(true);
    });

    test('Clean Executables Folder - Similar folder name but not protected', () => {
        const similarBin = path.join(TEMP_DIR, 'not_static_ffmpeg', 'bin');
        fs.mkdirSync(path.join(TEMP_DIR, 'not_static_ffmpeg'));
        fs.mkdirSync(similarBin);
        fs.writeFileSync(path.join(similarBin, 'trash.exe'), 'exec');

        cleanup.cleanExecutablesFolder(similarBin);

        expect(fs.existsSync(path.join(similarBin, 'trash.exe'))).toBe(false);
    });
});
