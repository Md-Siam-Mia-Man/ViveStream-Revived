# How ViveStream Revived Works

## Overview

ViveStream Revived is an Electron-based desktop application that serves as a personal, offline media sanctuary for downloading and organizing YouTube videos, playlists, and audio content. The application provides a sleek interface for managing your media library with advanced features like playlists, artist organization, and sleep timers.

## Architecture

The application follows a typical Electron architecture with three main components:

1. **Main Process** (`src/main/main.js`): Handles system-level operations, file management, and communication with external tools
2. **Renderer Process** (`src/renderer/`): Provides the user interface and user interactions
3. **Preload Process** (`src/preload/preload.js`): Acts as a bridge between the main and renderer processes using IPC (Inter-Process Communication)

## Core Components

### Main Process

The main process handles:
- **Database Management**: SQLite-based storage using Knex.js for videos, playlists, and artists
- **Download Management**: Integration with yt-dlp for downloading media content
- **File System Operations**: Media file handling, thumbnail generation using FFmpeg
- **System Integration**: Tray icons, system controls, and media key support

### Database Schema

The application uses SQLite with four main tables:

- **videos**: Stores media information (title, creator, file paths, duration, etc.)
- **playlists**: User-created collections of videos
- **playlist_videos**: Junction table linking videos to playlists
- **artists**: Artist/creator organization
- **video_artists**: Junction table linking videos to artists

### Download System

The download system uses `yt-dlp` (a fork of youtube-dl) with the following features:
- Concurrent downloads (configurable)
- Multiple quality options for videos
- Audio extraction with various formats
- Subtitle downloading
- Thumbnail extraction
- Metadata embedding
- Download speed limiting
- Cookie integration for age-restricted content

### Media Management

- **Local File Import**: Import existing media files with automatic metadata extraction and thumbnail generation
- **Export Functionality**: Export individual files or entire library
- **Metadata Editing**: Edit video titles, creators, and descriptions in-app
- **File Organization**: Automatic organization of media, covers, and subtitles into dedicated folders

## User Interface Components

### Main Views

1. **Home**: Grid view of all media in the library
2. **Favorites**: Collection of favorited media
3. **Playlists**: User-created collections
4. **Artists**: Artist/creator organization
5. **Downloader**: Interface for adding new content
6. **Player**: Full-featured media player

### Player Features

- **Playback Controls**: Play/pause, next, previous, volume, progress bar
- **Playback Speed**: Adjustable speed (0.5x to 2x)
- **Sleep Timer**: Multiple options (minutes, tracks, specific time)
- **Theater Mode**: Immersive viewing experience
- **Fullscreen Support**: Native fullscreen functionality
- **Keyboard Shortcuts**: Hotkeys for all major functions
- **Up Next Queue**: View and navigate through the current playlist/queue

### Library Organization

The application organizes media in several ways:

- **By Favorites**: Star your favorite content for quick access
- **By Playlists**: Create custom collections of videos
- **By Artist**: Videos are automatically organized by creator/artist
- **By Search**: Fuzzy search across videos, playlists, and artists

## Technical Implementation

### IPC Communication

The application uses Electron's IPC system extensively:

- **invoke/handle**: For request-response communication (e.g., getting settings, saving data)
- **send/on**: For one-way communication (e.g., updating progress, triggering actions)

### File Structure

- `userData/ViveStream.db`: Main SQLite database
- `userData/settings.json`: User preferences
- `~/ViveStream/videos/`: Media files storage
- `~/ViveStream/covers/`: Thumbnail images
- `~/ViveStream/subtitles/`: Subtitle files
- `resources/vendor/`: Bundled binaries (yt-dlp, FFmpeg)

### Vendor Binaries

The application includes:
- **yt-dlp**: For downloading media from YouTube
- **FFmpeg**: For video processing, thumbnail generation, and audio extraction
- **FFprobe**: For media metadata inspection

## Key Features Explained

### Fuzzy Search
The application implements fuzzy search across videos, playlists, and artists using a custom algorithm with configurable weights for different fields.

### Sleep Timer
Implemented with three options:
- Time in minutes until pause
- Number of tracks until pause  
- Specific time of day to pause

### Media Import/Export
- **Import**: Scan local files, extract metadata, generate thumbnails using FFmpeg
- **Export**: Batch export with progress tracking

### Download Concurrency
The application manages multiple downloads simultaneously with user-configurable limits and queuing system.

### Mini Player
A compact player that stays visible when navigating to other parts of the app, can be minimized to system tray.

## Settings and Configuration

Users can configure:
- Concurrent download limits
- Download quality preferences
- Subtitle options
- Cookie browser integration
- Sponsorblock filtering
- Speed limits
- Audio format preferences
- Concurrent fragments for faster downloads

## Data Lifecycle

1. **Content Addition**: User adds YouTube URL or imports local files
2. **Processing**: yt-dlp downloads content, metadata is extracted
3. **Storage**: Files are saved to appropriate directories, metadata to SQLite
4. **Organization**: Content is linked to artists/playlists as appropriate
5. **Playback**: Content is played using native HTML5 video/audio elements
6. **Management**: Users can edit metadata, organize content, and manage library