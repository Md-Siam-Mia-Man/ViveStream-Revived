const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURATION
// ==========================================

const PORTABLE_ROOT = path.join(__dirname, '..', 'python-portable');

// Folders to remove immediately from the root of the python environment
const TOP_LEVEL_DIRS_TO_REMOVE = [
    'include',
    'share',
    'tcl',
    'doc',
    'man',
    'manuals',
    'libs', // Static libs often not needed for runtime execution of scripts
    'Tools'
];

// Binaries/Executables to KEEP in 'bin' or 'Scripts'.
const EXECUTABLES_ALLOWLIST = [
    'python', 'python.exe',
    'python3', 'python3.exe',
    'pythonw', 'pythonw.exe',
    'pip', 'pip.exe',
    'yt-dlp', 'yt-dlp.exe',
    'ffmpeg', 'ffmpeg.exe',
    'ffprobe', 'ffprobe.exe',
    'static_ffmpeg', 'static_ffmpeg.exe',
    'static_ffprobe', 'static_ffprobe.exe'
];

// Patterns or folder names to delete recursively anywhere
const RECURSIVE_DELETE_PATTERNS = [
    '__pycache__',
    'tests',
    'test',
    'testing',
    'examples',
    'sample',
    'samples',
    'docs'
];

// Specific cleanup rules for site-packages to save space
const SITE_PACKAGES_CLEANUP_RULES = [
    { pkg: 'docutils', remove: ['languages', 'parsers'] },
    { pkg: 'urllib3', remove: ['contrib/emscripten'] },
    { pkg: 'yt_dlp', remove: ['__pyinstaller'] },
    { pkg: 'babel', remove: ['locale-data'] }, // If present
    { pkg: 'numpy', remove: ['tests', 'doc'] }, // If present
    { pkg: 'cryptography', remove: ['hazmat/backends/openssl/src'] } // If present
];

// ==========================================
// HELPERS
// ==========================================

function deleteItem(itemPath) {
    if (fs.existsSync(itemPath)) {
        try {
            fs.rmSync(itemPath, { recursive: true, force: true });
        } catch (e) {
            console.error(`❌ Failed to delete ${itemPath}: ${e.message}`);
        }
    }
}

function isAllowlisted(filename) {
    // Check exact match or match without extension
    const name = path.parse(filename).name;
    const base = path.basename(filename);
    return EXECUTABLES_ALLOWLIST.includes(base) || EXECUTABLES_ALLOWLIST.includes(name);
}

function cleanExecutablesFolder(folderPath) {
    // ! FIX: Do not clean static_ffmpeg/bin folder, as it contains essential binaries
    if (folderPath.includes('static_ffmpeg')) return;

    console.log(`   ⚙️  Cleaning Executables in: ${folderPath}`);
    try {
        const files = fs.readdirSync(folderPath);
        files.forEach(file => {
            const fullPath = path.join(folderPath, file);
            const stat = fs.statSync(fullPath);

            if (stat.isFile()) {
                if (!isAllowlisted(file)) {
                    deleteItem(fullPath);
                }
            }
        });
    } catch (e) {
        console.warn(`   ⚠️  Could not clean executables folder: ${e.message}`);
    }
}

function cleanSitePackagesFolder(folderPath) {
    console.log(`   📦 Cleaning Libraries in: ${folderPath}`);

    if (!fs.existsSync(folderPath)) return;

    // 1. Specific Package Rules
    SITE_PACKAGES_CLEANUP_RULES.forEach(rule => {
        const pkgPath = path.join(folderPath, rule.pkg);
        if (fs.existsSync(pkgPath)) {
            rule.remove.forEach(target => {
                deleteItem(path.join(pkgPath, target));
            });
        }
    });

    // 2. Generic Cleanup
    const contents = fs.readdirSync(folderPath);
    contents.forEach(item => {
        const fullPath = path.join(folderPath, item);

        // Remove .dist-info folders entirely? 
        // WARNING: Removing .dist-info breaks 'pip' metadata.
        if (item.endsWith('.dist-info') && fs.statSync(fullPath).isDirectory()) {
            deleteItem(path.join(fullPath, 'RECORD'));
            deleteItem(path.join(fullPath, 'AUTHORS'));
            deleteItem(path.join(fullPath, 'LICENSE'));
            deleteItem(path.join(fullPath, 'licenses'));
        }
    });
}

function walkAndClean(currentDir) {
    if (!fs.existsSync(currentDir)) return;

    let items;
    try {
        items = fs.readdirSync(currentDir);
    } catch (e) {
        return;
    }

    items.forEach(item => {
        const fullPath = path.join(currentDir, item);

        // Check recursive delete patterns
        if (RECURSIVE_DELETE_PATTERNS.includes(item)) {
            deleteItem(fullPath);
            return;
        }

        let stat;
        try {
            stat = fs.statSync(fullPath);
        } catch (e) {
            return;
        }

        if (stat.isDirectory()) {
            const lowerItem = item.toLowerCase();

            // Identify special folders
            if (lowerItem === 'scripts' || lowerItem === 'bin') {
                cleanExecutablesFolder(fullPath);
                // Continue recursing
                walkAndClean(fullPath);
            } else if (lowerItem === 'site-packages') {
                cleanSitePackagesFolder(fullPath);
                walkAndClean(fullPath);
            } else {
                walkAndClean(fullPath);
            }
        } else {
            // File Cleanup
            if (item.endsWith('.pdb') || item.endsWith('.whl') || item.endsWith('.txt') || item.endsWith('.md')) {
                if (item.toLowerCase() !== 'license.txt' && item.toLowerCase() !== 'python314._pth') {
                    deleteItem(fullPath);
                }
            }
        }
    });
}

function main() {
    console.log("=========================================");
    console.log("   🧹 DEEP CLEANUP: Python Portable");
    console.log("=========================================");

    if (!fs.existsSync(PORTABLE_ROOT)) {
        console.error(`❌ Could not find: ${PORTABLE_ROOT}`);
        return;
    }

    const platforms = fs.readdirSync(PORTABLE_ROOT).filter(f => {
        return fs.statSync(path.join(PORTABLE_ROOT, f)).isDirectory();
    });

    platforms.forEach(platform => {
        const platformPath = path.join(PORTABLE_ROOT, platform);
        console.log(`\n📂 Platform: ${platform}`);

        // 1. Top Level Removal
        TOP_LEVEL_DIRS_TO_REMOVE.forEach(d => deleteItem(path.join(platformPath, d)));

        // 2. Recursive Walk
        walkAndClean(platformPath);
    });

    console.log(`\n✨ Cleanup Finished.`);
}

main();