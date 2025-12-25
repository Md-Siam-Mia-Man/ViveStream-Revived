> **⚠️ Note:** Docs are generate by AI

# Database Schema & Management

The application uses **SQLite** for data persistence, managed by **Knex.js** as the query builder.

## Configuration

- **File**: `src/main/database.js`
- **Location**: `AppData/ViveStream/ViveStream.db` (Platform dependent `userData` path).
- **Mode**: `WAL` (Write-Ahead Logging) enabled for performance.

## Schema

### 1. `videos` table

Stores the main library of downloaded content.

| Column            | Type        | Description                                       |
| :---------------- | :---------- | :------------------------------------------------ |
| `id`              | `VARCHAR`   | Primary Key. Usually the YouTube Video ID.        |
| `title`           | `VARCHAR`   | Video title.                                      |
| `uploader`        | `VARCHAR`   | Channel name (legacy field).                      |
| `creator`         | `VARCHAR`   | Artist/Creator name (parsed for Artist linkage).  |
| `description`     | `TEXT`      | Full video description.                           |
| `duration`        | `INTEGER`   | Length in seconds.                                |
| `upload_date`     | `VARCHAR`   | Date string (YYYYMMDD).                           |
| `originalUrl`     | `VARCHAR`   | Source URL.                                       |
| `filePath`        | `VARCHAR`   | **Unique**. Local absolute path to the file.      |
| `coverPath`       | `VARCHAR`   | Local absolute path to the thumbnail.             |
| `subtitlePath`    | `VARCHAR`   | Local path to `.vtt` file (if any).               |
| `hasEmbeddedSubs` | `BOOLEAN`   | True if subs are embedded in the container (MKV). |
| `type`            | `VARCHAR`   | `video` or `audio`. Indexed.                      |
| `downloadedAt`    | `TIMESTAMP` | Import timestamp. Indexed.                        |
| `isFavorite`      | `BOOLEAN`   | User favorite flag. Indexed.                      |
| `source`          | `VARCHAR`   | `youtube`, `soundcloud`, etc.                     |

### 2. `playlists` table

User-created collections.

| Column      | Type        | Description                           |
| :---------- | :---------- | :------------------------------------ |
| `id`        | `INTEGER`   | Primary Key (Auto-increment).         |
| `name`      | `VARCHAR`   | Display name.                         |
| `coverPath` | `VARCHAR`   | Custom or auto-generated cover image. |
| `createdAt` | `TIMESTAMP` | Creation time.                        |

### 3. `playlist_videos` table

Many-to-Many link between Playlists and Videos.

| Column       | Type      | Description               |
| :----------- | :-------- | :------------------------ |
| `playlistId` | `INTEGER` | FK to `playlists.id`.     |
| `videoId`    | `VARCHAR` | FK to `videos.id`.        |
| `sortOrder`  | `INTEGER` | Position in the playlist. |

_Primary Key_: `(playlistId, videoId)`

### 4. `artists` table

Normalized artist entities.

| Column          | Type        | Description           |
| :-------------- | :---------- | :-------------------- |
| `id`            | `INTEGER`   | Primary Key.          |
| `name`          | `VARCHAR`   | Unique name. Indexed. |
| `thumbnailPath` | `VARCHAR`   | Artist image.         |
| `createdAt`     | `TIMESTAMP` |                       |

### 5. `video_artists` table

Many-to-Many link between Videos and Artists.
_Note: A single video can have multiple artists (e.g., "Feat. X & Y")._

| Column     | Type      | Description         |
| :--------- | :-------- | :------------------ |
| `videoId`  | `VARCHAR` | FK to `videos.id`.  |
| `artistId` | `INTEGER` | FK to `artists.id`. |

### 6. `download_history` table

Transient log of download attempts.

| Column   | Type      | Description            |
| :------- | :-------- | :--------------------- |
| `id`     | `INTEGER` | Primary Key.           |
| `url`    | `VARCHAR` | URL attempted.         |
| `status` | `VARCHAR` | `success` or `failed`. |

## Migration Strategy

The application performs **Auto-Migration** on startup inside the `initialize()` function in `database.js`.

1.  Checks if tables exist (`hasTable`).
2.  If not, creates them.
3.  Checks if specific columns exist (`hasColumn`) to support upgrades from older versions.
    - _Example_: When `subtitlePath` was added, a check ensures existing databases get the new column without data loss.

## Performance Optimizations

- **Indices**: Added on high-traffic columns (`type`, `isFavorite`, `downloadedAt`, `name`) to speed up filtering and sorting.
- **Pragmas**:
  - `journal_mode = WAL`: Allows concurrent reads while writing.
  - `synchronous = NORMAL`: Reduces file system sync overhead.
  - `cache_size = -64000`: Allocates ~64MB RAM for caching.
