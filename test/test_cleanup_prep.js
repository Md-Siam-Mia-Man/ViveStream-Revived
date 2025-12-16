const fs = require('fs');
const path = require('path');

// Mock fs to avoid actual file deletions, or use a temp directory.
// Using a temp directory is better for integration testing.

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

// Copy the relevant functions from helpers/cleanup.js
// or require it if it exports them. It doesn't seem to export them.
// So I will duplicate the logic for testing purposes, or modify cleanup.js to export them.

// Modifying cleanup.js to export functions for testing is a good practice.

const cleanupScriptPath = path.join(__dirname, 'helpers', 'cleanup.js');
const cleanupScriptContent = fs.readFileSync(cleanupScriptPath, 'utf8');

// I will attempt to require the file.
// However, the file executes `main()` at the end.
// I should check if it has a guard `if (require.main === module)`.
// It calls `main()` at the end directly: `main();`

// I should first modify `helpers/cleanup.js` to export functions and only run main if executed directly.
