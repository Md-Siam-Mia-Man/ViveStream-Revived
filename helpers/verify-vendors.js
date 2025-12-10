#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const vendorRoot = path.join(__dirname, "../vendor");

// Only verify Windows binaries.
const expected = {
    win: ["ffmpeg.exe", "ffprobe.exe", "yt-dlp.exe"]
};

const signatures = {
    PE: Buffer.from([0x4D, 0x5A]),
};

function startsWith(buf, sig) {
    return buf.slice(0, sig.length).equals(sig);
}

function detectType(filepath) {
    try {
        const fd = fs.openSync(filepath, "r");
        const header = Buffer.alloc(4);
        fs.readSync(fd, header, 0, 4, 0);
        fs.closeSync(fd);

        if (startsWith(header, signatures.PE)) return "PE";
        return "UNKNOWN";
    } catch (e) {
        return "ERROR_READING";
    }
}

let errors = [];

function validate(platform) {
    // Only validate Windows
    if (platform !== "win") return;

    const folder = path.join(vendorRoot, platform);

    if (!fs.existsSync(folder)) {
        errors.push(`Missing vendor directory: vendor/${platform}`);
        return;
    }

    const files = fs.readdirSync(folder);
    console.log(`Checking vendor/${platform}...`);

    expected[platform].forEach(req => {
        if (!files.includes(req)) {
            errors.push(`Missing file in vendor/${platform}: ${req}`);
        }
    });

    files.forEach(file => {
        const full = path.join(folder, file);
        const type = detectType(full);

        if (type === "ERROR_READING") {
            errors.push(`Could not read file header: vendor/${platform}/${file}`);
            return;
        }

        if (file.endsWith(".md") || file.endsWith(".txt")) return;

        if (!file.endsWith(".exe") || type !== "PE") {
            errors.push(`Invalid Windows binary: vendor/win/${file} (type: ${type})`);
        }
    });
}

const args = process.argv.slice(2);
let targetPlatforms = ["win"];

// If on non-windows dev env, allow bypassing or checking if explicitly asked
// But requirement says only win binaries are used.

console.log(`Validating vendors for: ${targetPlatforms.join(", ")}`);
targetPlatforms.forEach(p => validate(p));

console.log("\n===========================");
if (errors.length === 0) {
    console.log("Vendor binaries check passed.");
    console.log("===========================\n");
    process.exit(0);
} else {
    console.error("Vendor verification FAILED:\n");
    errors.forEach(e => console.error(" - " + e));
    console.error("\n===========================\n");
    process.exit(1);
}