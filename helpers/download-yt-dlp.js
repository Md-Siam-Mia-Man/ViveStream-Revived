#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const vendorRoot = path.join(__dirname, "../vendor");

const binaries = {
    win: { name: "yt-dlp.exe", url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" },
    linux: { name: "yt-dlp", url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" },
    mac: { name: "yt-dlp_macos", url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" }
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Download function that follows 302 redirects
function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);

        function request(urlToGet) {
            https.get(urlToGet, { headers: { "User-Agent": "Mozilla/5.0 (Node.js downloader)" } }, res => {
                if ([301, 302, 307, 308].includes(res.statusCode)) {
                    // Follow redirect
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

function makeExecutable(file) {
    if (process.platform !== "win32") {
        try { execSync(`chmod +x "${file}"`); } catch (e) { console.error(`Failed to chmod ${file}`, e); }
    }
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
            makeExecutable(dest);
            console.log(`Saved to ${dest}`);
        }
        console.log("All binaries downloaded successfully.");
    } catch (err) {
        console.error("Download failed:", err);
        process.exit(1);
    }
})();