#!/usr/bin/env node

const https = require("https");

const owner = "yt-dlp";
const repo = "yt-dlp";
const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

function fetchLatestRelease() {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                "User-Agent": "node.js",
                "Accept": "application/vnd.github+json"
            }
        };

        https.get(apiUrl, options, (res) => {
            let data = "";

            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`GitHub API responded with ${res.statusCode}: ${data}`));
                }
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(e);
                }
            });
        }).on("error", (err) => {
            reject(err);
        });
    });
}

(async () => {
    try {
        const release = await fetchLatestRelease();
        console.log(`Latest release: ${release.tag_name}`);
        console.log(`Assets (${release.assets.length}):`);
        release.assets.forEach(asset => {
            console.log(`  - ${asset.name}`);
            console.log(`    URL: ${asset.browser_download_url}`);
        });
    } catch (err) {
        console.error("Error fetching latest release:", err);
        process.exit(1);
    }
})();
