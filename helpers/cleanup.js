const fs = require('fs');
const path = require('path');

// CONFIGURATION
const PORTABLE_ROOT = path.join(__dirname, '..', 'python-portable');
const PYTHON_VERSION_DIR = 'python3.14';

// LISTS OF ITEMS TO DELETE
// 1. Folders to delete immediately inside the platform folder (e.g., python-linux-gnu/)
const TOP_LEVEL_DIRS_TO_REMOVE = [
    'include',
    'share',
];

// 2. Binaries to remove from the /bin/ folder
const BINARIES_TO_REMOVE = [
    'idle3', 'idle3.14',
    'pydoc3', 'pydoc3.14',
    'python3-config', 'python3.14-config',
    '2to3'
];

// 3. Folders to remove from /lib/
const LIB_DIRS_TO_REMOVE_PREFIXES = [
    'tcl',      // Removes tcl8, tcl8.6
    'tk',       // Removes tk8.6
    'itcl',     // Removes itcl4.2.4
    'pkgconfig'
];

// 4. Folders to remove from /lib/python3.14/
const PYTHON_LIB_DIRS_TO_REMOVE = [
    'test',
    'unittest',
    'idlelib',
    'tkinter',
    'turtledemo',
    'pydoc_data',
    'ensurepip',
    'venv' // Usually not needed for runtime distribution if packages are pre-installed
];

// 5. Specific test folders inside other libraries
const DEEP_TEST_DIRS = [
    path.join('ctypes', 'test'),
    path.join('distutils', 'test'),
    path.join('sqlite3', 'test'),
    path.join('lib2to3', 'tests'),
];

// HELPER: Delete a file or folder recursively
function deleteItem(itemPath) {
    if (fs.existsSync(itemPath)) {
        try {
            fs.rmSync(itemPath, { recursive: true, force: true });
            console.log(`🗑️  Deleted: ${itemPath}`);
        } catch (e) {
            console.error(`❌ Failed to delete ${itemPath}: ${e.message}`);
        }
    }
}

// HELPER: Recursive walker to clean __pycache__, .pyc, .whl
function cleanArtifacts(dir) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (file === '__pycache__') {
                deleteItem(fullPath);
            } else {
                cleanArtifacts(fullPath);
            }
        } else {
            if (file.endsWith('.pyc') || file.endsWith('.whl')) {
                deleteItem(fullPath);
            }
        }
    }
}

// MAIN LOGIC
function main() {
    if (!fs.existsSync(PORTABLE_ROOT)) {
        console.error(`❌ Could not find directory: ${PORTABLE_ROOT}`);
        console.log("Make sure this script is in the root folder, next to 'ViveStream-Revived'");
        return;
    }

    console.log(`🚀 Starting cleanup in: ${PORTABLE_ROOT}`);

    // Get all platform folders (linux-gnu, mac-darwin, etc.)
    const platforms = fs.readdirSync(PORTABLE_ROOT).filter(f => {
        return fs.statSync(path.join(PORTABLE_ROOT, f)).isDirectory();
    });

    platforms.forEach(platform => {
        const platformPath = path.join(PORTABLE_ROOT, platform);
        console.log(`\n📂 Processing Platform: ${platform}...`);

        // 1. Remove Top Level Dirs (include, share)
        TOP_LEVEL_DIRS_TO_REMOVE.forEach(d => deleteItem(path.join(platformPath, d)));

        // 2. Clean Binaries
        const binPath = path.join(platformPath, 'bin');
        if (fs.existsSync(binPath)) {
            BINARIES_TO_REMOVE.forEach(b => deleteItem(path.join(binPath, b)));
        }

        // 3. Clean Lib root (tcl, tk, pkgconfig, config-*)
        const libPath = path.join(platformPath, 'lib');
        if (fs.existsSync(libPath)) {
            const libItems = fs.readdirSync(libPath);
            libItems.forEach(item => {
                // Check prefixes (tcl, tk, itcl)
                if (LIB_DIRS_TO_REMOVE_PREFIXES.some(prefix => item.startsWith(prefix))) {
                    deleteItem(path.join(libPath, item));
                }
                // Remove config folder (e.g. config-3.14-x86_64-linux-gnu)
                if (item.startsWith('config-') && fs.statSync(path.join(libPath, item)).isDirectory()) {
                    deleteItem(path.join(libPath, item));
                }
            });

            // 4. Clean Python Standard Lib
            const pyLibPath = path.join(libPath, PYTHON_VERSION_DIR);
            if (fs.existsSync(pyLibPath)) {
                // Remove main junk folders
                PYTHON_LIB_DIRS_TO_REMOVE.forEach(d => deleteItem(path.join(pyLibPath, d)));

                // Remove deep test folders
                DEEP_TEST_DIRS.forEach(d => deleteItem(path.join(pyLibPath, d)));
            }
        }
    });

    console.log(`\n🧹 Performing deep clean of __pycache__, .pyc, and .whl files...`);
    cleanArtifacts(PORTABLE_ROOT);

    console.log(`\n✨ Cleanup Complete! Your portable Python is now optimized.`);
}

main();