const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf");

process.env.NODE_NO_WARNINGS = "1";

const colors = {
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
    reset: "\x1b[0m",
};

function log(step, message) {
    console.log(`${colors.cyan}[${step}]${colors.reset} ${message}`);
}

function parseTargets() {
    const args = process.argv.slice(2);
    let targets = [];

    // Check for --target argument
    args.forEach(arg => {
        if (arg.startsWith("--target=")) {
            const val = arg.split("=")[1];
            if (val === "all") {
                targets = ["AppImage", "deb", "rpm", "snap", "flatpak", "tar.gz", "tar.xz"];
            } else {
                targets = val.split(",").map(t => t.trim());
            }
        }
    });

    return targets;
}

function getPlatformConfig() {
    const targets = parseTargets();

    switch (process.platform) {
        case "win32":
            return {
                id: "win",
                name: "Windows",
                vendorFolder: "vendor/win",
                cliFlag: "--win",
                target: targets.length > 0 ? targets : "msi"
            };
        case "darwin":
            return {
                id: "mac",
                name: "macOS",
                vendorFolder: "vendor/mac",
                cliFlag: "--mac",
                target: targets.length > 0 ? targets : "dmg"
            };
        case "linux":
            return {
                id: "linux",
                name: "Linux",
                vendorFolder: "vendor/linux",
                cliFlag: "--linux",
                target: targets.length > 0 ? targets : ["AppImage"]
            };
        default:
            throw new Error(`Unsupported platform: ${process.platform}`);
    }
}

async function executeCommand(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const cmd = process.platform === "win32" && command === "npx" ? "npx.cmd" : command;
        // Fix for [DEP0190]: Manually construct command string
        const fullCommand = [cmd, ...args].map(a => a.includes(" ") ? `"${a}"` : a).join(" ");

        // console.log(`Executing: ${fullCommand}`); // DEBUG: quiet down

        const child = spawn(fullCommand, {
            cwd: cwd,
            shell: true,
            env: { ...process.env, NODE_NO_WARNINGS: 1 }
        });

        let hasLoggedPackaging = false;
        let hasLoggedInstaller = false;

        child.stdout.on("data", (data) => {
            const str = data.toString();
            // Log everything for debugging if needed, but keeping it clean for now unless verbose
            // console.log(str.trimEnd());

            const lowerStr = str.toLowerCase();
            if (lowerStr.includes("downloading") && !lowerStr.includes("part")) {
                console.log(`   ${colors.gray}↓  Downloading resources...${colors.reset}`);
            } else if (lowerStr.includes("packaging") && !hasLoggedPackaging) {
                console.log(`   ${colors.green}→  Packaging application...${colors.reset}`);
                hasLoggedPackaging = true;
            } else if ((lowerStr.includes("msi") || lowerStr.includes("nsis") || lowerStr.includes("dmg")) && !hasLoggedInstaller) {
                console.log(`   ${colors.green}→  Building Installer...${colors.reset}`);
                hasLoggedInstaller = true;
            } else if (lowerStr.includes("rebuilding native dependencies")) {
                console.log(`   ${colors.yellow}⧗  Rebuilding native dependencies...${colors.reset}`);
            }
        });

        child.stderr.on("data", (data) => {
            const str = data.toString();
            // Log all stderr to ensure we see fatal errors.
            // Filter out DeprecationWarning and known noise
            if (!str.includes("DeprecationWarning") && !str.includes("postinstall")) {
                console.error(`${colors.red}${str.trimEnd()}${colors.reset}`);
            }
        });

        child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with code ${code}`));
        });
    });
}

function moveArtifacts(sourceDir, destDir) {
    if (!fs.existsSync(sourceDir)) return [];
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const files = fs.readdirSync(sourceDir);
    const movedFiles = [];

    const interestingExtensions = [
        ".exe", ".msi", ".dmg", ".AppImage", ".deb", ".rpm", ".snap", ".flatpak", ".tar.gz", ".tar.xz", ".zip", ".blockmap"
    ];

    for (const file of files) {
        const fullPath = path.join(sourceDir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) continue;

        // Check extension or if it ends with one of the extensions
        const isInteresting = interestingExtensions.some(ext => file.endsWith(ext));

        // Also move .yml files for auto-updater
        const isYml = file.endsWith(".yml");

        if (isInteresting || isYml) {
             const dest = path.join(destDir, file);
             try {
                if (path.relative(fullPath, dest) !== "") fs.renameSync(fullPath, dest);
                movedFiles.push(file);
             } catch(e) {}
        }
    }
    return movedFiles;
}

async function runBuild() {
    const platformConfig = getPlatformConfig();
    const rootDir = path.join(__dirname, "..");
    const releaseDir = path.join(rootDir, "release");
    const finalArtifactDir = path.join(releaseDir, platformConfig.id);

    const iconPath = path.join(rootDir, "assets", "icon.ico");
    const macIconPath = path.join(rootDir, "assets", "icon.icns");
    const linuxIconPath = path.join(rootDir, "assets", "icon.png");
    const tempConfigPath = path.join(rootDir, "temp-build-config.json");

    console.log(colors.cyan + "==================================================" + colors.reset);
    console.log(colors.cyan + "            ViveStream Custom Builder             " + colors.reset);
    console.log(colors.cyan + "==================================================" + colors.reset);
    console.log(`   Target Platform: ${colors.yellow}${platformConfig.name}${colors.reset}`);
    console.log(`   Target Formats:  ${colors.yellow}${Array.isArray(platformConfig.target) ? platformConfig.target.join(", ") : platformConfig.target}${colors.reset}`);

    log("1/5", "Cleanup");
    if (fs.existsSync(releaseDir)) {
        try {
            if (rimraf.sync) rimraf.sync(releaseDir);
            else await rimraf(releaseDir);
        } catch (e) { }
    }
    console.log(`   ${colors.green}✔ Clean.${colors.reset}`);

    log("\n2/5", "Rebuilding Native Dependencies");
    // Use electron-builder's install-app-deps which handles rebuilding correctly using @electron/rebuild logic internally
    await executeCommand("npx", ["electron-builder", "install-app-deps"], rootDir);
    console.log(`   ${colors.green}✔  Rebuild Complete.${colors.reset}`);

    log("\n3/5", "Packaging (electron-builder)");
    console.log(`   ${colors.gray}→  Generating configuration...${colors.reset}`);

    const extraResources = [];
    if (fs.existsSync(path.join(rootDir, platformConfig.vendorFolder))) {
        extraResources.push({
            from: platformConfig.vendorFolder,
            to: platformConfig.vendorFolder,
            filter: ["**/*"]
        });
    }

    // Fix for AppImage builder failing on array 'ext'.
    // We provide separate entries if needed, or try string.
    // Electron builder usually supports arrays, but the AppImage tool seems picky in this environment.
    // Let's try expanding them into individual associations which is verbose but safe.

    const videoExts = ["mp4", "mkv", "webm", "avi", "mov"];
    const audioExts = ["mp3", "m4a", "wav", "flac", "ogg", "opus"];

    const fileAssociations = [];

    // Let's try single entry per extension.
    videoExts.forEach(ext => {
        fileAssociations.push({
            ext: ext, // Single string
            name: "Video File",
            description: "ViveStream Video",
            mimeType: "video/" + (ext === "mkv" ? "x-matroska" : ext),
            role: "Viewer",
            icon: iconPath
        });
    });

    audioExts.forEach(ext => {
        fileAssociations.push({
             ext: ext, // Single string
             name: "Audio File",
             description: "ViveStream Audio",
             mimeType: "audio/" + (ext === "m4a" ? "mp4" : ext),
             role: "Viewer",
             icon: iconPath
        });
    });

    const buildConfig = {
        appId: "com.vivestream.app",
        productName: "ViveStream",
        copyright: "Copyright © 2025 Md Siam Mia",
        directories: {
            output: "release",
            buildResources: "assets"
        },
        files: [
            "src/**/*",
            "package.json",
            "assets/**/*", // INCLUDE ASSETS IN ASAR
            "!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}",
            "!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}",
            "!**/node_modules/*.d.ts",
            "!**/node_modules/.bin",
            "!vendor/**/*", // Exclude binaries from ASAR
            "!**/.git/**",
            "!**/.github/**",
            "!**/helpers/**"
        ],
        extraResources: extraResources,
        fileAssociations: fileAssociations,
        compression: "maximum",
        asar: true,
        win: {
            target: platformConfig.id === "win" ? platformConfig.target : "msi",
            icon: iconPath,
            legalTrademarks: "ViveStream"
        },
        msi: {
            oneClick: false,
            perMachine: true,
            runAfterFinish: true,
            shortcutName: "ViveStream"
        },
        linux: {
            target: platformConfig.id === "linux" ? platformConfig.target : "AppImage",
            icon: linuxIconPath,
            category: "Video",
            mimeTypes: ["video/mp4", "video/x-matroska", "audio/mpeg", "audio/mp4"],
            maintainer: "Md Siam Mia <support@vivestream.app>"
        },
        mac: {
            target: platformConfig.id === "mac" ? platformConfig.target : "dmg",
            icon: macIconPath,
            category: "public.app-category.video",
            extendInfo: {
                CFBundleDocumentTypes: [
                    {
                        CFBundleTypeName: "Video File",
                        CFBundleTypeRole: "Viewer",
                        LSHandlerRank: "Alternate",
                        LSItemContentTypes: ["public.movie"]
                    },
                    {
                        CFBundleTypeName: "Audio File",
                        CFBundleTypeRole: "Viewer",
                        LSHandlerRank: "Alternate",
                        LSItemContentTypes: ["public.audio"]
                    }
                ]
            }
        }
    };

    fs.writeFileSync(tempConfigPath, JSON.stringify(buildConfig, null, 2));

    try {
        await executeCommand("npx", ["electron-builder", "--config", "temp-build-config.json", platformConfig.cliFlag], rootDir);
    } catch (e) {
        if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath);
        throw e;
    }

    if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath);

    log("\n4/5", "Organizing Artifacts");

    const movedFiles = moveArtifacts(releaseDir, finalArtifactDir);
    if (movedFiles && movedFiles.length > 0) {
        movedFiles.forEach(f => console.log(`   ✔ Moved: ${f}`));
    }

    // Cleanup rest
    if (fs.existsSync(releaseDir)) {
        const files = fs.readdirSync(releaseDir);
        for (const file of files) {
            const fullPath = path.join(releaseDir, file);
            if (file === platformConfig.id) continue;
            try {
                if (fs.statSync(fullPath).isDirectory()) rimraf.sync(fullPath);
                else fs.unlinkSync(fullPath);
            } catch (e) { }
        }
    }

    log("\n5/5", "Complete");
    if (movedFiles && movedFiles.length > 0) {
        console.log(`${colors.green}   Build Successful!${colors.reset}`);
        console.log(`   Artifacts are in: release/${platformConfig.id}/\n`);
    } else {
        console.log(`${colors.yellow}   Build finished, but no artifacts moved.${colors.reset}\n`);
    }
}

runBuild().catch(err => {
    console.error(`\n${colors.red}[FATAL] ${err.message}${colors.reset}`);
    process.exit(1);
});
