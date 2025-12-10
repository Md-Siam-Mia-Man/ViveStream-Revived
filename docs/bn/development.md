# ডেভেলপমেন্ট (Development)

## প্রয়োজনীয়তা (Prerequisites)

- Node.js (v18 বা তার পরবর্তী ভার্সন প্রস্তাবিত)
- Git
- `rpm` প্যাকেজ (Linux RPM বিল্ডের জন্য)
- `snapcraft` (Linux Snap বিল্ডের জন্য)

## সেটআপ (Setup)

১. **রিপোজিটরি ক্লোন করুন:**

    ```bash
    git clone https://github.com/Md-Siam-Mia-Man/ViveStream-Revived.git
    cd ViveStream-Revived
    ```

২. **ডিপেন্ডেন্সি ইনস্টল করুন:**

    ```bash
    npm install
    ```

৩. **ডেভেলপমেন্ট মোডে অ্যাপটি রান করুন:**

    ```bash
    npm start
    ```

## সোর্স থেকে বিল্ড করা (Build From Source)

আপনার প্ল্যাটফর্মের জন্য ইনস্টলার তৈরি করতে:

```bash
# এই কমান্ডটি অ্যাপটি প্যাকেজ করবে এবং একটি সেটআপ এক্সিকিউটেবল তৈরি করবে
npm run build
```

ফাইনাল ইনস্টলারটি `release/` ডিরেক্টরিতে পাওয়া যাবে।

### লিনাক্স বিল্ড (Linux Builds)

লিনাক্সের জন্য নির্দিষ্ট প্যাকেজ ফরম্যাটে বিল্ড করতে পারেন:

```bash
# সব টার্গেট বিল্ড করুন (AppImage, deb, rpm, snap, flatpak)
npm run build:linux:all

# নির্দিষ্ট টার্গেট বিল্ড করুন
npm run build:linux:deb
npm run build:linux:rpm
npm run build:linux:appimage
```

## কোড উদাহরণ (Code Examples)

### ডাটাবেস কোয়েরি (Knex)

এই প্রজেক্টটি `sqlite3` এর সাথে `knex` ব্যবহার করে। যেভাবে ডাটাবেস কোয়েরি করতে পারেন:

```javascript
// src/main/db.js (উদাহরণ)
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

### নতুন IPC হ্যান্ডলার যোগ করা

রেন্ডারার (Renderer) এবং মেইন (Main) প্রসেসের মধ্যে যোগাযোগের জন্য:

```javascript
// src/main/main.js
const { ipcMain } = require('electron');

ipcMain.handle('my-custom-action', async (event, arg) => {
  console.log('Received:', arg);
  return 'Success'; // সফল
});

// src/renderer/preload.js (অথবা যেখানে আপনি API এক্সপোজ করেন)
```
