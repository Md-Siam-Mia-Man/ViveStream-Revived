> **⚠️ Note:** Docs are generate by AI

# Build System & Vendor Management

The project uses a sophisticated custom build system to handle cross-platform complexities, particularly regarding external dependencies like Python, FFmpeg, and yt-dlp.

## The Builder Script (`helpers/builder.js`)

We do not use the standard `electron-builder` CLI directly. Instead, we run `node helpers/builder.js [flags]`.

### Workflow

1.  **Preparation**:
    - **Join Split Files**: Runs `helpers/large-file-manager.js` to reassemble any large binaries split to bypass GitHub file size limits.
    - **Cleanup**: Runs `helpers/cleanup.js` to remove temp files from previous builds.
2.  **Configuration**:
    - Detects the OS or target flag (`--win`, `--linux`, `--mac`).
    - Selects the appropriate Python environment from `python-portable/`.
    - Selects the appropriate `vendor/<platform>` binaries.
3.  **Dependency Injection**:
    - Copies the **platform-specific** Python folder into the build artifacts.
    - Ensures binaries in `vendor/` have executable permissions (`chmod 755`).
4.  **Building**:
    - Generates a temporary `temp-build-config.json` for `electron-builder`.
    - Executes `electron-builder` with this dynamic config.
    - **Linux**: Builds AppImage, Deb, RPM, Snap (if requested).
    - **Windows**: Builds NSIS Installer (setup.exe).
    - **macOS**: Builds DMG.
5.  **Cleanup**:
    - Moves final artifacts to `release/<platform>/`.
    - Deletes temporary build folders.

## Vendor Binaries (The "Vendor" Folder)

The `vendor/` directory contains the executable dependencies. These are **NOT** checked into standard Git history due to size; they are managed by **Git LFS**.

### Structure

```
vendor/
├── win/
│   ├── ffmpeg.exe
│   ├── ffprobe.exe
│   └── yt-dlp.exe
├── linux/
│   ├── ffmpeg
│   ├── ffprobe
│   └── yt-dlp
└── mac/
    ├── ffmpeg
    ├── ffprobe
    └── yt-dlp
```

### Why this approach?

1.  **Offline Install**: The user doesn't need to download FFmpeg separately.
2.  **Version Control**: We lock specific versions of tools known to work with our code.
3.  **Cross-Platform**: The build script ensures a Windows user building for Windows gets `.exe` files, while a Linux CI runner gets ELF binaries.

## Portable Python

For Windows builds, we embed a "Portable Python" distribution (`python-portable/python-win-x64`). This is because Windows does not come with Python installed by default, and `yt-dlp` (even the binary version) often benefits from or requires a python environment for certain extractors.

- **Source**: [https://github.com/Md-Siam-Mia-Main/python-portable](https://github.com/Md-Siam-Mia-Main/python-portable)
- The build script copies this entire folder into the app's resources, allowing us to spawn it via relative paths.

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/release.yml`) mirrors the local build process:

1.  Checks out code (with LFS enabled).
2.  Runs `npm install`.
3.  Runs `node helpers/builder.js --target=all` (for Linux) or specific platform flags.
4.  Uploads artifacts to GitHub Releases.
