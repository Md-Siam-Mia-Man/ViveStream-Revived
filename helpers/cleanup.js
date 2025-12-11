const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURATION
// ==========================================

// Path to 'python-portable' relative to 'helpers/cleanup.js'
const PORTABLE_ROOT = path.join(__dirname, '..', 'python-portable');

// 1. Root folders to delete immediately inside any platform folder
// (e.g., python-linux-gnu/share or python-win-x64/tcl)
const TOP_LEVEL_DIRS_TO_REMOVE = [
    'include',
    'share',     // Documentation and Man pages
    'tcl',       // Tkinter GUI toolkit (not needed for yt-dlp)
    'doc',
    'man',
    'manuals',
    'libs',      // Windows static C libs (usually not needed for runtime)
];

// 2. Binaries/Executables to KEEP in 'bin' or 'Scripts'.
// Everything else in those folders will be DELETED.
// NOTE: Matches filenames with and without .exe extension.
const EXECUTABLES_ALLOWLIST = [
    'python',
    'python3',
    'python3.14',
    'pythonw',
    'pip',
    'pip3',
    'pip3.14',
    'yt-dlp',
    'static_ffmpeg',
    'static_ffmpeg_paths',
    'static_ffprobe'
];

// 3. Bloat inside 'site-packages' to remove specific subdirectories from
const SITE_PACKAGES_CLEANUP_RULES = [
    { pkg: 'docutils', remove: ['languages', 'test', 'tests'] },
    { pkg: 'urllib3', remove: ['tests', 'contrib/emscripten'] },
    { pkg: 'keyring', remove: ['tests', 'testing'] },
    { pkg: 'rich', remove: ['tests'] },
    { pkg: 'pygments', remove: ['tests'] },
    { pkg: 'pip', remove: ['_vendor/rich/tests'] },
    { pkg: 'yt_dlp', remove: ['__pyinstaller'] } // Remove pyinstaller hooks
];

// ==========================================
// HELPERS
// ==========================================

function deleteItem(itemPath) {
    if (fs.existsSync(itemPath)) {
        try {
            fs.rmSync(itemPath, { recursive: true, force: true });
            // console.log(`🗑️  Deleted: ${path.basename(itemPath)}`); // Uncomment for verbose logging
        } catch (e) {
            console.error(`❌ Failed to delete ${itemPath}: ${e.message}`);
        }
    }
}

/**
 * Cleaning Logic for 'bin' (Linux/Mac) and 'Scripts' (Windows) folders.
 * Uses the Whitelist approach.
 */
function cleanExecutablesFolder(folderPath) {
    console.log(`   ⚙️  Cleaning Executables in: ${folderPath}`);
    const files = fs.readdirSync(folderPath);

    files.forEach(file => {
        const fileNameNoExt = path.parse(file).name; // 'pip.exe' -> 'pip'

        // If it is NOT in our allowlist, delete it
        if (!EXECUTABLES_ALLOWLIST.includes(fileNameNoExt)) {
            deleteItem(path.join(folderPath, file));
        }
    });
}

/**
 * Cleaning Logic for 'site-packages'.
 * Removes tests, languages, and dist-info records.
 */
function cleanSitePackagesFolder(folderPath) {
    console.log(`   📦 Cleaning Libraries in: ${folderPath}`);

    // 1. specific package rules
    SITE_PACKAGES_CLEANUP_RULES.forEach(rule => {
        rule.remove.forEach(target => {
            deleteItem(path.join(folderPath, rule.pkg, target));
        });
    });

    // 2. Generic cleanup inside site-packages
    const contents = fs.readdirSync(folderPath);
    contents.forEach(item => {
        const fullPath = path.join(folderPath, item);

        // Remove .dist-info/RECORD files (large text files not needed for runtime)
        if (item.endsWith('.dist-info') && fs.statSync(fullPath).isDirectory()) {
            deleteItem(path.join(fullPath, 'RECORD'));
        }
    });
}

/**
 * Recursive Walker
 * Finds 'Scripts', 'bin', 'site-packages' regardless of depth (handling %cd%).
 * Also cleans __pycache__ and .pyc files globally.
 */
function walkAndClean(currentDir) {
    if (!fs.existsSync(currentDir)) return;

    const items = fs.readdirSync(currentDir);

    items.forEach(item => {
        const fullPath = path.join(currentDir, item);
        let stat;

        try {
            stat = fs.statSync(fullPath);
        } catch (e) {
            return; // Skip broken links/permissions
        }

        if (stat.isDirectory()) {
            // 1. Global delete for __pycache__
            if (item === '__pycache__') {
                deleteItem(fullPath);
                return;
            }

            // 2. Identify Target Folders
            if (item.toLowerCase() === 'scripts' || item.toLowerCase() === 'bin') {
                cleanExecutablesFolder(fullPath);
                // We still recurse into bin/Scripts to clean __pycache__ if any
            } else if (item === 'site-packages') {
                cleanSitePackagesFolder(fullPath);
            }

            // Recurse
            walkAndClean(fullPath);
        } else {
            // 3. File cleanup
            if (item.endsWith('.pyc') || item.endsWith('.pyo') || item.endsWith('.whl')) {
                deleteItem(fullPath);
            }
        }
    });
}

// ==========================================
// MAIN LOGIC
// ==========================================

function main() {
    console.log("=========================================");
    console.log("   🐍 PYTHON PORTABLE CLEANUP SCRIPT");
    console.log("=========================================");

    if (!fs.existsSync(PORTABLE_ROOT)) {
        console.error(`❌ Could not find directory: ${PORTABLE_ROOT}`);
        return;
    }

    // Get all platform folders (python-win-x64, python-linux-gnu, etc.)
    const platforms = fs.readdirSync(PORTABLE_ROOT).filter(f => {
        return fs.statSync(path.join(PORTABLE_ROOT, f)).isDirectory();
    });

    if (platforms.length === 0) {
        console.log("⚠️  No platform folders found in python-portable.");
        return;
    }

    platforms.forEach(platform => {
        const platformPath = path.join(PORTABLE_ROOT, platform);
        console.log(`\n📂 Processing Platform: ${platform}`);

        // 1. Remove Top Level Junk (docs, man pages, tcl)
        TOP_LEVEL_DIRS_TO_REMOVE.forEach(d => deleteItem(path.join(platformPath, d)));

        // 2. Walk the tree to find 'Scripts', 'site-packages' and clean artifacts
        // This handles the %cd% folder in Windows automatically because it just walks into it.
        walkAndClean(platformPath);
    });

    console.log(`\n✨ Cleanup Complete!`);
    console.log(`✅ Preserved: ${EXECUTABLES_ALLOWLIST.join(', ')}`);
}

main();