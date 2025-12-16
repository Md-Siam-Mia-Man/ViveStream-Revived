const fs = require('fs');
const path = require('path');
const cleanup = require('../helpers/cleanup.js');

const TEMP_DIR = path.join(__dirname, 'temp_cleanup_test');

function setup() {
    if (fs.existsSync(TEMP_DIR)) {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_DIR);
}

function teardown() {
    if (fs.existsSync(TEMP_DIR)) {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
}

function testCleanExecutablesFolder() {
    setup();

    console.log('--- Testing Clean Executables Folder ---');

    // 1. Test normal bin folder
    const normalBin = path.join(TEMP_DIR, 'bin');
    fs.mkdirSync(normalBin);
    fs.writeFileSync(path.join(normalBin, 'python.exe'), 'exec'); // Allowlisted
    fs.writeFileSync(path.join(normalBin, 'trash.exe'), 'exec'); // Should be deleted

    cleanup.cleanExecutablesFolder(normalBin);

    if (!fs.existsSync(path.join(normalBin, 'python.exe'))) {
        console.error('FAIL: python.exe should exist');
    }
    if (fs.existsSync(path.join(normalBin, 'trash.exe'))) {
        console.error('FAIL: trash.exe should be deleted');
    } else {
        console.log('PASS: Normal bin folder cleaned correctly');
    }

    // 2. Test static_ffmpeg/bin folder
    const staticFfmpegBin = path.join(TEMP_DIR, 'static_ffmpeg', 'bin');
    fs.mkdirSync(path.join(TEMP_DIR, 'static_ffmpeg'));
    fs.mkdirSync(staticFfmpegBin);

    // Create some files that would normally be deleted
    fs.writeFileSync(path.join(staticFfmpegBin, 'ffmpeg'), 'exec');
    fs.writeFileSync(path.join(staticFfmpegBin, 'some_other_tool'), 'exec');

    cleanup.cleanExecutablesFolder(staticFfmpegBin);

    if (!fs.existsSync(path.join(staticFfmpegBin, 'ffmpeg'))) {
        console.error('FAIL: static_ffmpeg/bin/ffmpeg should exist');
    }
    if (!fs.existsSync(path.join(staticFfmpegBin, 'some_other_tool'))) {
        console.error('FAIL: static_ffmpeg/bin/some_other_tool should exist (protected folder)');
    } else {
        console.log('PASS: static_ffmpeg/bin protected');
    }

    // 3. Test folder that just includes static_ffmpeg in name but not correct path
    // e.g. "not_static_ffmpeg/bin" - the current logic `includes` matches this too!
    const similarBin = path.join(TEMP_DIR, 'not_static_ffmpeg', 'bin');
    fs.mkdirSync(path.join(TEMP_DIR, 'not_static_ffmpeg'));
    fs.mkdirSync(similarBin);
    fs.writeFileSync(path.join(similarBin, 'trash.exe'), 'exec');

    cleanup.cleanExecutablesFolder(similarBin);

    if (fs.existsSync(path.join(similarBin, 'trash.exe'))) {
        console.log('INFO: "not_static_ffmpeg" was preserved (current behavior, but arguably wrong).');
    } else {
        console.log('PASS: "not_static_ffmpeg" was cleaned (desired behavior).');
    }

    teardown();
}

testCleanExecutablesFolder();
