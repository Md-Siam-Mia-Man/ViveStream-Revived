const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
};

const TARGET_DIR = path.join(__dirname, '..', 'python-portable');
const CHUNK_EXT = '.chunk';
// GitHub hard limit is 100MB. We use 90MB to be safe and avoid warnings.
const CHUNK_SIZE = 1024 * 1024 * 90;

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

function splitFile(filePath) {
  const stats = fs.statSync(filePath);
  const fileName = path.basename(filePath);

  if (stats.size <= CHUNK_SIZE) return; // Skip small files

  // Skip files that are already chunks
  if (fileName.includes(CHUNK_EXT)) return;

  console.log(
    `✂️  Splitting: ${fileName} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`
  );

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(CHUNK_SIZE);
  let bytesRead = 0;
  let part = 1;

  try {
    while ((bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, null)) > 0) {
      const chunkName = `${filePath}${CHUNK_EXT}${String(part).padStart(3, '0')}`;
      const dataToWrite =
        bytesRead < CHUNK_SIZE ? buffer.slice(0, bytesRead) : buffer;
      fs.writeFileSync(chunkName, dataToWrite);
      console.log(`   📄 Created: ${path.basename(chunkName)}`);
      part++;
    }
  } finally {
    fs.closeSync(fd);
  }

  // Remove the original large file so it doesn't get committed to git
  fs.unlinkSync(filePath);
  console.log(`   🗑️  Removed original: ${fileName}`);
}

function joinFile(firstChunkPath) {
  // Reconstruct original filename from file.ext.chunk001
  const originalPath = firstChunkPath.slice(0, -9);
  const baseName = path.basename(originalPath);

  if (fs.existsSync(originalPath)) {
    console.log(`   ⏭️  Skipping ${baseName} (already exists)`);
    // We do not delete chunks here in case the user wants to keep them for git
    // But usually, in a build process, you might want to.
    // For now, we assume this is "dev setup", so we keep chunks if logic dictates,
    // OR we delete them if we want a clean folder.
    // The previous logic deleted chunks after merge. Let's stick to that for 'join'.
    return;
  }

  console.log(`🧵 Joining: ${baseName}`);

  const dir = path.dirname(firstChunkPath);
  // Filter files that start with the original filename + chunk extension
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(path.basename(originalPath) + CHUNK_EXT))
    .sort();

  const writeStream = fs.createWriteStream(originalPath);

  for (const chunkFile of files) {
    const chunkPath = path.join(dir, chunkFile);
    const data = fs.readFileSync(chunkPath);
    writeStream.write(data);
    // We delete the chunks after joining so the app uses the real file
    // Note: Run 'split' again before committing to git!
    fs.unlinkSync(chunkPath);
  }

  writeStream.end();

  // Restore executable permissions for binaries
  if (
    originalPath.includes('/bin/') ||
    originalPath.endsWith('.so') ||
    originalPath.includes('.so.') ||
    originalPath.endsWith('.dylib') ||
    originalPath.endsWith('.exe') ||
    originalPath.includes('ffmpeg') ||
    originalPath.includes('ffprobe')
  ) {
    try {
      fs.chmodSync(originalPath, 0o755);
    } catch (e) {}
  }

  console.log(`   ✅ Restored.`);
}

const action = process.argv[2];

// Check if python-portable exists. If not, try to clone it.
if (!fs.existsSync(TARGET_DIR)) {
  console.log(
    `${colors.yellow}Target directory not found: ${TARGET_DIR}${colors.reset}`
  );
  console.log(`${colors.green}Auto-cloning python-portable...${colors.reset}`);

  try {
    execSync(
      'git clone https://github.com/Md-Siam-Mia-Main/python-portable.git',
      {
        cwd: path.dirname(TARGET_DIR),
        stdio: 'inherit', // Show git output
      }
    );
    console.log(`${colors.green}Clone successful.${colors.reset}`);
  } catch (e) {
    console.error(
      `${colors.red}Failed to clone python-portable: ${e.message}${colors.reset}`
    );
    console.warn(
      `${colors.yellow}Please manually run: git clone https://github.com/Md-Siam-Mia-Main/python-portable.git ${colors.reset}`
    );
    process.exit(1);
  }
}

if (action === 'split') {
  console.log(`🔍 Scanning ${TARGET_DIR} for large files (>90MB)...`);
  const files = getAllFiles(TARGET_DIR);
  let splitCount = 0;

  files.forEach((f) => {
    const stats = fs.statSync(f);
    if (stats.size > CHUNK_SIZE && !f.includes(CHUNK_EXT)) {
      splitFile(f);
      splitCount++;
    }
  });

  if (splitCount === 0) console.log('No large files found needing split.');
  else console.log('✨ Splitting complete.');
} else if (action === 'join') {
  console.log(`🔍 Scanning ${TARGET_DIR} for chunked files...`);
  const files = getAllFiles(TARGET_DIR);

  // Find only the first chunks (.chunk001)
  const startChunks = files.filter((f) => f.endsWith(`${CHUNK_EXT}001`));

  if (startChunks.length === 0) {
    console.log('No chunked files found.');
  } else {
    console.log(`Found ${startChunks.length} file(s) to join.`);
    startChunks.forEach((f) => joinFile(f));
  }
  console.log('✨ Reassembly complete.');
} else {
  console.log('Usage: node large-file-manager.js [join|split]');
}
