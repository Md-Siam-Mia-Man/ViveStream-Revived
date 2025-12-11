> **⚠️ Note:** Docs are generate by AI

# Application Architecture

## Overview

ViveStream Revived is an Electron-based application that follows a standard multi-process architecture:

1. **Main Process (Node.js)**: Controls the application lifecycle, manages the database, performs file operations, and spawns child processes for heavy lifting (downloads, conversions).
2. **Renderer Process (React/Vite)**: Handles the user interface. It is sandboxed and communicates with the Main Process strictly via the `ContextBridge`.
3. **Child Processes**: External binaries (Python/yt-dlp, FFmpeg) managed by the Main Process.

## Directory Structure

```
├── assets/             # Icons and static resources
├── build/              # Build artifacts (NSIS scripts, etc.)
├── docs/               # Technical documentation
├── helpers/            # Build and maintenance scripts
├── release/            # Output folder for compiled installers
├── src/
│   ├── main/           # Main Process code (Node.js)
│   ├── preload/        # Preload script (Context Bridge)
│   └── renderer/       # Frontend code (React + Vite)
└── vendor/             # Platform-specific binaries (managed via Git LFS)
```

## Key Components

### 1. Main Process (`src/main/`)

The backend logic is split into three core modules:

* **`main.js`**: The entry point.
  * Initializes the `BrowserWindow`.
  * Sets up IPC event listeners (`ipcMain`).
  * Manages native menus and tray icons.
  * Handles "single instance" locking.
* **`database.js`**: Data persistence layer.
  * Uses `knex` as a query builder.
  * Uses `sqlite3` as the database engine.
  * Manages schema migrations and relational data (Videos <-> Artists, Videos <-> Playlists).
* **`utils.js`**: Utility belt.
  * Wraps `yt-dlp` for downloading content.
  * Wraps `ffmpeg` for media processing.
  * Handles file system operations (path sanitization, cleanup).

### 2. The Bridge (`src/preload/`)

To maintain security, the Renderer process has **no direct access** to Node.js APIs. We expose a safe API via `preload.js`:

```javascript
// Exposing a specific function, not the entire 'fs' module
contextBridge.exposeInMainWorld('api', {
    downloadVideo: (url) => ipcRenderer.send('download-video', url),
    onProgress: (callback) => ipcRenderer.on('download-progress', callback)
});
```

### 3. Renderer (`src/renderer/`)

A standard React SPA (Single Page Application) bundled with Vite.

* **State Management**: Uses a custom `state.js` (lightweight store) or React Context.
* **Routing**: Likely client-side routing or simple conditional rendering.
* **Styling**: CSS/SCSS.

## Data Flow: The Download Lifecycle

1. **UI Trigger**: User inputs a URL and clicks "Download".
2. **IPC Request**: Renderer calls `window.api.downloadVideo(url)`.
3. **Validation**: Main Process (`ipc.js`) validates the URL.
4. **Metadata Fetch**: Main calls `utils.getVideoInfo(url)` (spawns `yt-dlp --dump-json`).
5. **DB Insert**: A record is created in `videos` table with status "pending".
6. **Download**: Main spawns `yt-dlp` process.
    * `stdout` is parsed for progress percentage.
    * Progress is sent to Renderer via `win.webContents.send('download-progress', ...)`.
7. **Post-Processing**: If needed, `ffmpeg` is spawned to convert/merge formats.
8. **Finalization**:
    * File is moved to the library folder.
    * DB record updated to "completed".
    * `library-updated` event sent to Renderer.

## "Vendor" Binary Management

A unique feature of this project is how it handles dependencies like `ffmpeg` and `yt-dlp`.

* **No Runtime Downloads**: We do **not** download binaries at runtime. This ensures offline capability and security.
* **Git LFS**: Large binaries are stored in `vendor/<platform>/` and tracked with Git LFS.
* **Build-Time Injection**:
  * `helpers/builder.js` detects the target platform.
  * It copies the specific binaries from `vendor/<platform>/` into the app's `resources` folder.
  * `utils.js` detects the OS at runtime and locates the binaries relative to `process.resourcesPath`.

## Build System

We use a custom wrapper around `electron-builder` (`helpers/builder.js`) to handle complex cross-platform requirements:

* **Windows**: Injects a portable Python environment (`python-portable/`) so users don't need Python installed.
* **Linux**: Supports AppImage, Deb, RPM, Snap.
* **macOS**: Handles DMG creation.

See [Build System](./BUILD_SYSTEM.md) for details.
