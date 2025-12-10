#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const vendorRoot = path.join(__dirname, "../vendor");

// Only download for Windows. Linux/Mac use system binaries.
const binaries = {
    win: { name: "yt-dlp.exe", url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" }
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);

        function request(urlToGet) {
            https.get(urlToGet, { headers: { "User-Agent": "Mozilla/5.0 (Node.js downloader)" } }, res => {
                if ([301, 302, 307, 308].includes(res.statusCode)) {
                    return request(res.headers.location);
                }
                if (res.statusCode !== 200) {
                    file.close(() => fs.unlink(dest, () => { }));
                    return reject(new Error(`HTTP ${res.statusCode} for ${urlToGet}`));
                }

                res.pipe(file);

                file.on("finish", () => {
                    file.close(() => resolve());
                });

                file.on("error", (err) => {
                    file.close(() => fs.unlink(dest, () => { }));
                    reject(err);
                });

            }).on("error", err => {
                file.close(() => fs.unlink(dest, () => { }));
                reject(err);
            });
        }

        request(url);
    });
}

(async () => {
    try {
        console.log(`Vendor root: ${vendorRoot}`);
        for (const [platform, info] of Object.entries(binaries)) {
            const folder = path.join(vendorRoot, platform);
            ensureDir(folder);
            const dest = path.join(folder, info.name);
            console.log(`Downloading ${info.name} for ${platform}...`);
            await download(info.url, dest);
            console.log(`Saved to ${dest}`);
        }
        console.log("Windows binary downloaded successfully.");
    } catch (err) {
        console.error("Download failed:", err);
        process.exit(1);
    }
})();