#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const vendorRoot = path.join(__dirname, "../vendor");

// Expected binaries
const expected = {
    linux: ["ffmpeg", "ffprobe", "yt-dlp"],
    mac: ["ffmpeg", "ffprobe", "yt-dlp_macos"],
    win: ["ffmpeg.exe", "ffprobe.exe", "yt-dlp.exe"]
};

// Signatures
const signatures = {
    ELF: Buffer.from([0x7F, 0x45, 0x4C, 0x46]),         // Linux ELF
    PE: Buffer.from([0x4D, 0x5A]),                      // Windows PE
    ZIP: Buffer.from([0x50, 0x4B, 0x03, 0x04]),         // ZIP archive
    MACH_1: Buffer.from([0xFE, 0xED, 0xFA, 0xCE]),
    MACH_2: Buffer.from([0xFE, 0xED, 0xFA, 0xCF]),
    MACH_3: Buffer.from([0xCE, 0xFA, 0xED, 0xFE]),
    MACH_4: Buffer.from([0xCF, 0xFA, 0xED, 0xFE])
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

        if (startsWith(header, signatures.ELF)) return "ELF";
        if (startsWith(header, signatures.PE)) return "PE";
        if (startsWith(header, signatures.ZIP)) return "ZIP";
        if (
            startsWith(header, signatures.MACH_1) ||
            startsWith(header, signatures.MACH_2) ||
            startsWith(header, signatures.MACH_3) ||
            startsWith(header, signatures.MACH_4)
        ) return "MACH_O";

        return "CUSTOM_HEADER"; // treat unknown as custom header
    } catch (e) {
        return "ERROR_READING";
    }
}

let errors = [];

function validate(platform) {
    const folder = path.join(vendorRoot, platform);

    // Check if folder exists
    if (!fs.existsSync(folder)) {
        errors.push(`Missing vendor directory: vendor/${platform}`);
        return;
    }

    const files = fs.readdirSync(folder);
    console.log(`Checking vendor/${platform}...`);

    // Check for required files
    expected[platform].forEach(req => {
        if (!files.includes(req)) {
            errors.push(`Missing file in vendor/${platform}: ${req}`);
        }
    });

    // Validate types of present files
    files.forEach(file => {
        const full = path.join(folder, file);
        const type = detectType(full);

        if (type === "ERROR_READING") {
             errors.push(`Could not read file header: vendor/${platform}/${file}`);
             return;
        }

        // Windows: must be PE
        if (platform === "win") {
            // Ignore non-executables if any (though usually only exes are here)
            if (file.endsWith(".md") || file.endsWith(".txt")) return;

            if (!file.endsWith(".exe") || type !== "PE") {
                errors.push(`Invalid Windows binary: vendor/win/${file} (type: ${type})`);
            }
            return;
        }

        // Linux
        if (platform === "linux") {
             if (file.endsWith(".md") || file.endsWith(".txt")) return;

            if (type === "ELF") return;
            if (file === "yt-dlp" && type === "CUSTOM_HEADER") {
                console.log(`   Note: vendor/linux/${file} contains a custom header (valid).`);
                return;
            }
            errors.push(`Invalid Linux binary: vendor/linux/${file} (type: ${type})`);
            return;
        }

        // macOS
        if (platform === "mac") {
             if (file.endsWith(".md") || file.endsWith(".txt")) return;

            if (type === "MACH_O") return;
            if (file === "yt-dlp_macos" && type === "CUSTOM_HEADER") {
                console.log(`   Note: vendor/mac/${file} contains a custom header (valid).`);
                return;
            }
            errors.push(`Invalid macOS binary: vendor/mac/${file} (type: ${type})`);
            return;
        }
    });
}

// Logic to decide what to validate
const args = process.argv.slice(2);
let targetPlatforms = [];

if (args.includes("--all")) {
    targetPlatforms = ["linux", "mac", "win"];
} else {
    // Check for specific --platform=xxx
    const platformArg = args.find(a => a.startsWith("--platform="));
    if (platformArg) {
        const p = platformArg.split("=")[1];
        if (["linux", "mac", "win"].includes(p)) {
            targetPlatforms = [p];
        } else {
            console.error(`Unknown platform argument: ${p}`);
            process.exit(1);
        }
    } else {
        // Default: Detect host platform
        switch (process.platform) {
            case "win32": targetPlatforms = ["win"]; break;
            case "darwin": targetPlatforms = ["mac"]; break;
            case "linux": targetPlatforms = ["linux"]; break;
            default:
                console.warn(`Warning: Could not detect platform '${process.platform}'. checking all.`);
                targetPlatforms = ["linux", "mac", "win"];
        }
    }
}

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
