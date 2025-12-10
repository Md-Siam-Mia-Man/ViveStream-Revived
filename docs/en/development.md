# Development

## Prerequisites

- Node.js (v18 or later recommended)
- Git
- `rpm` package (including `rpmbuild`) for Linux RPM builds
- `snapcraft` for Linux Snap builds

## Setup

1. **Clone the repository:**

    ```bash
    git clone https://github.com/Md-Siam-Mia-Man/ViveStream-Revived.git
    cd ViveStream-Revived
    ```

2. **Install dependencies:**

    ```bash
    npm install
    ```

3. **Run the application in development mode:**

    ```bash
    npm start
    ```

## Build From Source

To create an installer for your platform:

```bash
# This command will package the app and generate a setup executable
npm run build
```

The final installer will be located in the `release/` directory.

### Linux Builds

For Linux, you can target specific package formats:

```bash
# Build all targets (AppImage, deb, rpm, snap, flatpak)
npm run build:linux:all

# Build specific targets
npm run build:linux:deb
npm run build:linux:rpm
npm run build:linux:appimage
```

## Code Examples

### Database Query (Knex)

The project uses `knex` with `sqlite3`. Here is how you might query the database:

```javascript
// src/main/db.js (example usage)
const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: "./data.db"
  },
  useNullAsDefault: true
});

async function getVideos() {
  const videos = await knex('videos').select('*');
  console.log(videos);
}
```

### Adding a New IPC Handler

To communicate between the renderer and main process:

```javascript
// src/main/main.js
const { ipcMain } = require('electron');

ipcMain.handle('my-custom-action', async (event, arg) => {
  console.log('Received:', arg);
  return 'Success';
});

// src/renderer/preload.js (or wherever you expose APIs)
// You might expose this via contextBridge
```
