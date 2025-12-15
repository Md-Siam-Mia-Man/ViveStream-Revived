const fs = require("fs");
const path = require("path");
const os = require("os");

// Safety fallback: Ensure HOME is a string to prevent path.join crashes
const HOME = os.homedir() || "";

// Helper to get Windows env vars safely
const getWinPath = (key) => process.env[key] || "";

// Database of potential paths for browsers on different OSs
// We look for specific files/folders that indicate a profile exists (e.g., 'Cookies' file or 'Default' folder)
const BROWSER_PATHS = {
    brave: {
        linux: [
            // Native
            path.join(HOME, ".config", "BraveSoftware", "Brave-Browser"),
            // Flatpak
            path.join(HOME, ".var", "app", "com.brave.Browser", "config", "BraveSoftware", "Brave-Browser"),
            // Snap
            path.join(HOME, "snap", "brave", "current", ".config", "BraveSoftware", "Brave-Browser"),
        ],
        win32: [
            path.join(getWinPath("LOCALAPPDATA"), "BraveSoftware", "Brave-Browser", "User Data"),
        ],
    },
    chrome: {
        linux: [
            path.join(HOME, ".config", "google-chrome"),
            path.join(HOME, ".var", "app", "com.google.Chrome", "config", "google-chrome"),
        ],
        win32: [
            path.join(getWinPath("LOCALAPPDATA"), "Google", "Chrome", "User Data"),
        ],
    },
    chromium: {
        linux: [
            path.join(HOME, ".config", "chromium"),
            path.join(HOME, ".var", "app", "org.chromium.Chromium", "config", "chromium"),
        ],
        win32: [],
    },
    edge: {
        linux: [
            path.join(HOME, ".config", "microsoft-edge"),
            path.join(HOME, ".var", "app", "com.microsoft.Edge", "config", "microsoft-edge"),
        ],
        win32: [
            path.join(getWinPath("LOCALAPPDATA"), "Microsoft", "Edge", "User Data"),
        ],
    },
    firefox: {
        linux: [
            path.join(HOME, ".mozilla", "firefox"),
            path.join(HOME, ".var", "app", "org.mozilla.firefox", ".mozilla", "firefox"),
            path.join(HOME, "snap", "firefox", "common", ".mozilla", "firefox"),
        ],
        win32: [
            path.join(getWinPath("APPDATA"), "Mozilla", "Firefox", "Profiles"),
        ],
    },
    opera: {
        linux: [
            path.join(HOME, ".config", "opera"),
            path.join(HOME, ".var", "app", "com.opera.Opera", "config", "opera"),
        ],
        win32: [
            path.join(getWinPath("APPDATA"), "Opera Software", "Opera Stable"),
        ],
    },
    vivaldi: {
        linux: [
            path.join(HOME, ".config", "vivaldi"),
            path.join(HOME, ".var", "app", "com.vivaldi.Vivaldi", "config", "vivaldi"),
        ],
        win32: [
            path.join(getWinPath("LOCALAPPDATA"), "Vivaldi", "User Data"),
        ],
    },
};

/**
 * Checks if a specific path effectively contains browser data.
 * @param {string} p - Path to check
 * @param {string} browserName - Name of browser
 * @returns {boolean}
 */
function isValidBrowserPath(p, browserName) {
    try {
        if (!p || !fs.existsSync(p)) return false;

        // For Chromium based, look for 'Default' or 'Profile 1' or just the folder existence
        // For Firefox, look for profiles.ini or just the folder
        // yt-dlp is usually smart enough if given the root config folder
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Finds the actual path on disk for a specific browser.
 * @param {string} browserName 
 * @returns {string|null} The path to pass to yt-dlp, or null if not found/standard.
 */
function findPathForBrowser(browserName) {
    const platform = process.platform;
    const candidates = BROWSER_PATHS[browserName]?.[platform];

    if (!candidates) return null;

    for (const candidate of candidates) {
        if (isValidBrowserPath(candidate, browserName)) {
            return candidate;
        }
    }
    return null;
}

/**
 * Main entry point. Returns the argument string for yt-dlp.
 * @param {string} userSelection - 'auto', 'chrome', 'brave', etc.
 * @returns {string|null} e.g. "brave:/path/to/profile" or "chrome"
 */
function resolveBrowser(userSelection) {
    if (!userSelection || userSelection === "none") return null;

    const browserList = ["brave", "chrome", "firefox", "edge", "chromium", "opera", "vivaldi"];

    // 1. AUTO MODE: Scan all browsers in priority order
    if (userSelection === "auto") {
        console.log("[Cookies] Auto-detecting browser...");
        for (const browser of browserList) {
            const foundPath = findPathForBrowser(browser);
            if (foundPath) {
                console.log(`[Cookies] Auto-detected: ${browser} at ${foundPath}`);
                // If it's a standard native path, we can often just return the browser name
                // But to be safe (especially with Flatpaks/Snaps), we always return NAME:PATH
                return `${browser}:${foundPath}`;
            }
        }
        console.warn("[Cookies] Auto-detection failed. No browsers found.");
        return null;
    }

    // 2. MANUAL MODE: Specific browser selected
    const foundPath = findPathForBrowser(userSelection);
    if (foundPath) {
        console.log(`[Cookies] Resolved ${userSelection} to: ${foundPath}`);
        return `${userSelection}:${foundPath}`;
    }

    // Fallback: If we couldn't find the path on disk, just return the name 
    // and let yt-dlp try its internal default logic (might fail for Flatpaks)
    console.log(`[Cookies] Could not locate path for ${userSelection}, using default.`);
    return userSelection;
}

module.exports = {
    resolveBrowser
};