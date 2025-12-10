const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.join(__dirname, '..', 'python-portable');
const CHUNK_EXT = '.chunk';

function getAllFiles(dirPath, arrayOfFiles) {
    if (!fs.existsSync(dirPath)) return [];

    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
}

async function joinFile(firstChunkPath) {
    // Reconstruct original filename from file.ext.chunk001
    // Logic: Remove the last 9 characters (.chunk001)
    const originalPath = firstChunkPath.slice(0, -9);
    const baseName = path.basename(originalPath);

    if (fs.existsSync(originalPath)) {
        console.log(`   ⏭️  Skipping ${baseName} (already exists)`);
        return;
    }

    console.log(`🧵 Joining: ${baseName}`);

    const dir = path.dirname(firstChunkPath);
    // Filter files that start with the original filename + chunk extension
    const files = fs.readdirSync(dir)
        .filter(f => f.startsWith(path.basename(originalPath) + CHUNK_EXT))
        .sort();

    const writeStream = fs.createWriteStream(originalPath);

    for (const chunkFile of files) {
        const chunkPath = path.join(dir, chunkFile);
        const data = fs.readFileSync(chunkPath);
        writeStream.write(data);
        fs.unlinkSync(chunkPath); // Clean up chunk after merging
    }

    writeStream.end();

    // Restore executable permissions for binaries
    if (originalPath.includes('/bin/') ||
        originalPath.endsWith('.so') ||
        originalPath.includes('.so.') ||
        originalPath.endsWith('.dylib') ||
        originalPath.endsWith('.exe') ||
        originalPath.includes('ffmpeg') ||
        originalPath.includes('ffprobe')) {
        try {
            fs.chmodSync(originalPath, 0o755);
        } catch (e) { }
    }

    console.log(`   ✅ Restored.`);
}

const action = process.argv[2];

if (action === 'join') {
    if (!fs.existsSync(TARGET_DIR)) {
        console.error(`Target directory not found: ${TARGET_DIR}`);
        process.exit(1);
    }

    console.log(`🔍 Scanning ${TARGET_DIR} for chunked files...`);
    const files = getAllFiles(TARGET_DIR);

    // Find only the first chunks (.chunk001)
    const startChunks = files.filter(f => f.endsWith(`${CHUNK_EXT}001`));

    if (startChunks.length === 0) {
        console.log("No chunked files found.");
    } else {
        console.log(`Found ${startChunks.length} file(s) to join.`);
        startChunks.forEach(f => joinFile(f));
    }
    console.log("✨ Reassembly complete.");
} else {
    console.log("Usage: node large-file-manager.js join");
}