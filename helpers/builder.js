const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
// Rimraf v6 compat
const rimrafPkg = require("rimraf");
const rimraf = rimrafPkg.rimraf || rimrafPkg;
const rimrafSync = rimrafPkg.rimrafSync || rimrafPkg.sync;

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

function parseVerbose() {
    return process.argv.includes("--verbose") || process.argv.includes("--debug");
}

function parseDebug() {
    return process.argv.includes("--debug");
}

function parseTargets() {
    const args = process.argv.slice(2);
    let targets = [];

    // Check for --target argument
    args.forEach(arg => {
        if (arg.startsWith("--target=")) {
            const val = arg.split("=")[1];
            if (val === "all") {
                // EXCLUDED tar.gz and tar.xz as requested
                targets = ["AppImage", "deb", "rpm", "snap", "flatpak"];
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
                // Path relative to project root
                pythonSource: "python-portable/python-win-x64",
                cliFlag: "--win",
                target: targets.length > 0 ? targets : "msi"
            };
        case "darwin":
            return {
                id: "mac",
                name: "macOS",
                pythonSource: "python-portable/python-mac-darwin",
                cliFlag: "--mac",
                target: targets.length > 0 ? targets : "dmg"
            };
        case "linux":
            // Check which linux folder exists (gnu or musl)
            const gnuPath = "python-portable/python-linux-gnu";
            const muslPath = "python-portable/python-linux-musl";
            const pythonSource = fs.existsSync(path.join(__dirname, "..", gnuPath)) ? gnuPath : muslPath;

            return {
                id: "linux",
                name: "Linux",
                pythonSource: pythonSource,
                cliFlag: "--linux",
                target: targets.length > 0 ? targets : ["AppImage"]
            };
        default:
            throw new Error(`Unsupported platform: ${process.platform}`);
    }
}

async function executeCommand(command, args, cwd) {
    const verbose = parseVerbose();
    return new Promise((resolve, reject) => {
        const cmd = process.platform === "win32" && command === "npx" ? "npx.cmd" : command;
        const fullCommand = [cmd, ...args].map(a => a.includes(" ") ? `"${a}"` : a).join(" ");

        const child = spawn(fullCommand, {
            cwd: cwd,
            shell: true,
            env: { ...process.env, NODE_NO_WARNINGS: 1 }
        });

        let hasLoggedPackaging = false;
        let hasLoggedInstaller = false;
        let hasLoggedSigning = false;
        let hasLoggedPublishing = false;

        child.stdout.on("data", (data) => {
            const str = data.toString();
            // In verbose mode, print everything
            if (verbose) {
                console.log(str.trimEnd());
            }

            // Always try to detect key steps for custom logging
            const lowerStr = str.toLowerCase();

            if (lowerStr.includes("downloading") && !lowerStr.includes("part")) {
                console.log(`   ${colors.gray}↓  Downloading resources...${colors.reset}`);
            } else if (lowerStr.includes("packaging") && !hasLoggedPackaging) {
                console.log(`   ${colors.green}→  Packaging application...${colors.reset}`);
                hasLoggedPackaging = true;
            } else if ((lowerStr.includes("msi") || lowerStr.includes("nsis") || lowerStr.includes("dmg") || lowerStr.includes("snap") || lowerStr.includes("deb") || lowerStr.includes("rpm")) && !hasLoggedInstaller && lowerStr.includes("building")) {
                console.log(`   ${colors.green}→  Building Installer...${colors.reset}`);
                hasLoggedInstaller = true;
            } else if (lowerStr.includes("rebuilding native dependencies")) {
                console.log(`   ${colors.yellow}⧗  Rebuilding native dependencies...${colors.reset}`);
            } else if (lowerStr.includes("signing") && !hasLoggedSigning) {
                console.log(`   ${colors.yellow}✎  Signing...${colors.reset}`);
                hasLoggedSigning = true;
            } else if (lowerStr.includes("publishing") && !hasLoggedPublishing) {
                console.log(`   ${colors.green}☁  Publishing...${colors.reset}`);
                hasLoggedPublishing = true;
            }
        });

        child.stderr.on("data", (data) => {
            const str = data.toString();
            // Suppress warnings in non-verbose mode unless it looks like an error
            // electron-builder puts a lot of info in stderr
            if (verbose) {
                console.error(`${colors.red}${str.trimEnd()}${colors.reset}`);
            } else {
                // Minimal error logging or filtering
                // If it contains "Error", we probably want to see it
                if (str.toLowerCase().includes("error") || str.toLowerCase().includes("failed")) {
                    console.error(`${colors.red}${str.trimEnd()}${colors.reset}`);
                }
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
        ".exe", ".msi", ".dmg", ".AppImage", ".deb", ".rpm", ".snap", ".flatpak", ".zip", ".blockmap"
    ];

    for (const file of files) {
        const fullPath = path.join(sourceDir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) continue;

        const isInteresting = interestingExtensions.some(ext => file.endsWith(ext));
        const isYml = file.endsWith(".yml");

        // In debug mode, we might want to see yml files in the final folder too, 
        // but typically we just keep them in releaseDir. 
        // This function moves final installers.
        if (isInteresting) {
            const dest = path.join(destDir, file);
            try {
                if (path.relative(fullPath, dest) !== "") fs.renameSync(fullPath, dest);
                movedFiles.push(file);
            } catch (e) { }
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

    const verbose = parseVerbose();
    const debug = parseDebug();

    console.log(colors.cyan + "==================================================" + colors.reset);
    console.log(colors.cyan + "            ViveStream Custom Builder             " + colors.reset);
    console.log(colors.cyan + "==================================================" + colors.reset);
    console.log(`   Target Platform: ${colors.yellow}${platformConfig.name}${colors.reset}`);
    console.log(`   Target Formats:  ${colors.yellow}${Array.isArray(platformConfig.target) ? platformConfig.target.join(", ") : platformConfig.target}${colors.reset}`);
    console.log(`   Bundling Python: ${colors.yellow}${platformConfig.pythonSource}${colors.reset}`);
    console.log(`   Mode:            ${debug ? colors.red + "DEBUG" : colors.green + "RELEASE"}${colors.reset}`);
    console.log(`   Verbose Logging: ${verbose ? colors.green + "ON" : colors.gray + "OFF"}${colors.reset}`);

    // --- PRE-BUILD HOOKS ---
    log("1/6", "Preparing Environment");
    console.log(`   ${colors.gray}→  Joining split files...${colors.reset}`);
    await executeCommand("node", ["helpers/large-file-manager.js", "join"], rootDir);

    console.log(`   ${colors.gray}→  Cleaning Python environment...${colors.reset}`);
    await executeCommand("node", ["helpers/cleanup.js"], rootDir);
    console.log(`   ${colors.green}✔ Environment Ready.${colors.reset}`);

    log("\n2/6", "Cleanup Build Dirs");
    // Only clean if NOT in debug mode, or if user explicitly wants a fresh start.
    // Debug mode usually implies we want to inspect what happened, but for a build command,
    // we generally want a clean output folder to avoid mixing old/new artifacts.
    // However, if we are debugging the builder itself, maybe we keep it. 
    // Requirement: "generate ... files and dont delete them". 
    // Usually means don't delete *after*. Deleting *before* is safe/good practice.
    if (fs.existsSync(releaseDir)) {
        try {
            if (rimrafSync) rimrafSync(releaseDir);
            else await rimraf(releaseDir);
        } catch (e) { }
    }
    console.log(`   ${colors.green}✔ Release directory cleaned.${colors.reset}`);

    log("\n3/6", "Rebuilding Native Dependencies");
    await executeCommand("npx", ["electron-builder", "install-app-deps"], rootDir);
    console.log(`   ${colors.green}✔  Rebuild Complete.${colors.reset}`);

    log("\n4/6", "Packaging (electron-builder)");
    console.log(`   ${colors.gray}→  Generating configuration...${colors.reset}`);

    const extraResources = [];

    // Bundle the Portable Python Environment
    if (platformConfig.pythonSource) {
        const pythonPath = path.join(rootDir, platformConfig.pythonSource);
        if (fs.existsSync(pythonPath)) {
            // Ensure permissions on Linux/Mac
            if (process.platform !== "win32") {
                try {
                    // Make bin directory executable
                    const binDir = path.join(pythonPath, "bin");
                    if (fs.existsSync(binDir)) {
                        fs.readdirSync(binDir).forEach(f => {
                            fs.chmodSync(path.join(binDir, f), "755");
                        });
                    }
                } catch (e) {
                    console.warn("Could not set permissions on python binaries:", e.message);
                }
            }

            extraResources.push({
                from: platformConfig.pythonSource,
                to: platformConfig.pythonSource, // Preserves structure in resources/
                filter: ["**/*"]
            });
        } else {
            console.warn(`${colors.red}WARNING: Portable Python not found at ${platformConfig.pythonSource}${colors.reset}`);
        }
    }

    const videoExts = ["mp4", "mkv", "webm", "avi", "mov"];
    const audioExts = ["mp3", "m4a", "wav", "flac", "ogg", "opus"];
    const fileAssociations = [];

    videoExts.forEach(ext => {
        fileAssociations.push({
            ext: ext,
            name: "Video File",
            description: "ViveStream Video",
            mimeType: "video/" + (ext === "mkv" ? "x-matroska" : ext),
            role: "Viewer",
            icon: iconPath
        });
    });

    audioExts.forEach(ext => {
        fileAssociations.push({
            ext: ext,
            name: "Audio File",
            description: "ViveStream Audio",
            mimeType: "audio/" + (ext === "m4a" ? "mp4" : ext),
            role: "Viewer",
            icon: iconPath
        });
    });

    const buildConfig = {
        appId: "com.vivestream.revived.app",
        productName: "ViveStream Revived",
        copyright: "Copyright © 2025 Md Siam Mia",
        directories: {
            output: "release",
            buildResources: "assets"
        },
        files: [
            "src/**/*",
            "package.json",
            "assets/**/*",
            "!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}",
            "!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}",
            "!**/node_modules/*.d.ts",
            "!**/node_modules/.bin",
            "!vendor/**/*",
            "!python-portable/**/*",
            "!**/.git/**",
            "!**/.github/**",
            "!**/helpers/**"
        ],
        extraResources: extraResources,
        fileAssociations: fileAssociations,
        // In debug mode, use 'store' for speed. In release, 'maximum'.
        compression: debug ? "store" : "maximum",
        // Do not pack asar in debug if you want to inspect files easily, 
        // but usually we want to test the ASAR.
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
            identity: null,
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

    const builderArgs = ["electron-builder", "--config", "temp-build-config.json", platformConfig.cliFlag];
    if (process.env.GH_TOKEN) {
        console.log(`   ${colors.yellow}✔ GitHub Token detected, enabling publish...${colors.reset}`);
        builderArgs.push("--publish", "always");
    }

    try {
        await executeCommand("npx", builderArgs, rootDir);
    } catch (e) {
        // Keep config in debug mode for inspection
        if (!debug && fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath);
        throw e;
    }

    if (!debug && fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath);

    log("\n5/6", "Organizing Artifacts");

    const movedFiles = moveArtifacts(releaseDir, finalArtifactDir);
    if (movedFiles && movedFiles.length > 0) {
        movedFiles.forEach(f => console.log(`   ✔ Moved: ${f}`));
    }

    // Cleanup Logic (Skipped in Debug)
    if (!debug) {
        if (fs.existsSync(releaseDir)) {
            const files = fs.readdirSync(releaseDir);
            for (const file of files) {
                const fullPath = path.join(releaseDir, file);
                // Keep the platform folder (e.g. release/win)
                if (file === platformConfig.id) continue;
                try {
                    if (fs.statSync(fullPath).isDirectory()) {
                        if (rimrafSync) rimrafSync(fullPath);
                        else await rimraf(fullPath);
                    }
                    else fs.unlinkSync(fullPath);
                } catch (e) { }
            }
        }
    } else {
        console.log(`   ${colors.yellow}⚠ Debug Mode: Artifacts (blockmap, yml, unpacked) preserved in 'release/' folder.${colors.reset}`);
    }

    log("\n6/6", "Complete");
    if (movedFiles && movedFiles.length > 0) {
        console.log(`${colors.green}   Build Successful!${colors.reset}`);
        console.log(`   Installers are in: release/${platformConfig.id}/`);
        if (debug) console.log(`   Debug files are in: release/`);
        console.log("");
    } else {
        console.log(`${colors.yellow}   Build finished, but no artifacts moved.${colors.reset}\n`);
    }
}

runBuild().catch(err => {
    console.error(`\n${colors.red}[FATAL] ${err.message}${colors.reset}`);
    process.exit(1);
});