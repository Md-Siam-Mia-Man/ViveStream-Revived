> **⚠️ Note:** Docs are generate by AI

# IPC API Reference

Communication between the **Renderer** (React) and **Main** (Node.js) processes is handled via the `electron` IPC module.

## Usage

**Renderer**:

```javascript
window.api.send('channel', data);
window.api.receive('channel', (event, data) => { ... });
window.api.invoke('channel', data).then(result => { ... });
```

**Main**:

```javascript
ipcMain.on('channel', (event, data) => { ... });
ipcMain.handle('channel', async (event, data) => { return result; });
```

## API Channels

### 1. Video Operations

| Channel               | Type     | Payload             | Response/Effect                                 |
| :-------------------- | :------- | :------------------ | :---------------------------------------------- |
| `download-video`      | `send`   | `url` (string)      | Starts download. Emits `download-progress`.     |
| `get-video-info`      | `invoke` | `url` (string)      | Returns `{ title, thumbnail, duration }`.       |
| `get-library`         | `invoke` | `null`              | Returns `Array<Video>`.                         |
| `delete-video`        | `invoke` | `id` (string)       | Returns `{ success: true }`. Deletes file & DB. |
| `toggle-favorite`     | `invoke` | `id` (string)       | Returns `{ success, isFavorite }`.              |
| `open-file-location`  | `send`   | `filePath` (string) | Opens OS file explorer.                         |
| `play-video-external` | `send`   | `filePath` (string) | Opens file in default OS player.                |

### 2. Playlist Operations

| Channel                | Type     | Payload                   | Response/Effect                         |
| :--------------------- | :------- | :------------------------ | :-------------------------------------- |
| `create-playlist`      | `invoke` | `name` (string)           | Returns `{ success, id }`.              |
| `get-playlists`        | `invoke` | `null`                    | Returns `Array<Playlist>`.              |
| `add-to-playlist`      | `invoke` | `{ playlistId, videoId }` | Returns `{ success }`.                  |
| `get-playlist-details` | `invoke` | `playlistId`              | Returns `Playlist` with `videos` array. |

### 3. Artist Operations

| Channel              | Type     | Payload    | Response/Effect                        |
| :------------------- | :------- | :--------- | :------------------------------------- |
| `get-artists`        | `invoke` | `null`     | Returns `Array<Artist>`.               |
| `get-artist-details` | `invoke` | `artistId` | Returns `Artist` with `videos` array.  |
| `regenerate-artists` | `invoke` | `null`     | Scans library to rebuild artist links. |

### 4. System / App

| Channel         | Type     | Payload | Response/Effect                 |
| :-------------- | :------- | :------ | :------------------------------ |
| `app-minimize`  | `send`   | `null`  | Minimizes window.               |
| `app-maximize`  | `send`   | `null`  | Toggles maximize/restore.       |
| `app-close`     | `send`   | `null`  | Closes app.                     |
| `select-folder` | `invoke` | `null`  | Opens native folder picker.     |
| `get-version`   | `invoke` | `null`  | Returns `package.json` version. |
| `check-update`  | `invoke` | `null`  | Checks GitHub releases.         |

### 5. Events (Main -> Renderer)

| Channel             | Payload                 | Description                   |
| :------------------ | :---------------------- | :---------------------------- |
| `download-progress` | `{ url, percent, eta }` | Real-time download stats.     |
| `download-complete` | `{ url, filePath }`     | Fired when download finishes. |
| `download-error`    | `{ url, error }`        | Fired on failure.             |
| `library-updated`   | `null`                  | Signal to refresh the grid.   |
