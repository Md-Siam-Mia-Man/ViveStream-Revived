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

async function executeCommand(command, args, cwd) {
    const commandString = `${command} ${args.join(" ")}`;

    return new Promise((resolve, reject) => {
        const child = spawn(commandString, {
            cwd: cwd,
            shell: true,
            env: { ...process.env, NODE_NO_WARNINGS: 1 }
        });

        let hasLoggedNative = false;
        let hasLoggedPackaging = false;
        let hasLoggedNSIS = false;

        child.stdout.on("data", (data) => {
            const str = data.toString();
            const lowerStr = str.toLowerCase();

            if ((lowerStr.includes("installing native dependencies") || lowerStr.includes("rebuild")) && !hasLoggedNative) {
                console.log(`   ${colors.yellow}⧗  Compiling native dependencies...${colors.reset}`);
                hasLoggedNative = true;
            } else if (lowerStr.includes("downloading")) {
                console.log(`   ${colors.gray}↓  Downloading resources...${colors.reset}`);
            } else if (lowerStr.includes("packaging") && lowerStr.includes("win32") && !hasLoggedPackaging) {
                console.log(`   ${colors.green}→  Packaging application...${colors.reset}`);
                hasLoggedPackaging = true;
            } else if (lowerStr.includes("nsis") && !hasLoggedNSIS) {
                console.log(`   ${colors.green}→  Building Installer (NSIS)...${colors.reset}`);
                hasLoggedNSIS = true;
            }
        });

        child.stderr.on("data", (data) => {
            const str = data.toString();
            if (str.toLowerCase().includes("error") && !str.includes("DeprecationWarning")) {
                console.error(`${colors.red}   [Error] ${str.trim()}${colors.reset}`);
            }
        });

        child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with code ${code}`));
        });
    });
}

function findInstaller(dir) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && file.endsWith(".exe") && !file.includes("uninstaller")) {
            return { name: file, path: fullPath };
        }
    }
    return null;
}

async function runBuild() {
    console.log(colors.cyan + "==================================================" + colors.reset);
    console.log(colors.cyan + "         ViveStream Custom Builder v3.0           " + colors.reset);
    console.log(colors.cyan + "==================================================" + colors.reset);

    const rootDir = path.join(__dirname, "..");
    const releaseDir = path.join(rootDir, "release");
    const winReleaseDir = path.join(releaseDir, "win");

    // --------------------------------------------------------------------------
    // STEP 1: CLEANUP
    // --------------------------------------------------------------------------
    log("1/5", "Cleanup");
    if (fs.existsSync(releaseDir)) {
        try {
            process.stdout.write("   Cleaning release directory... ");
            if (rimraf.sync) rimraf.sync(releaseDir);
            else rimraf(releaseDir).catch(() => { });
            console.log(colors.green + "Done." + colors.reset);
        } catch (e) {
            console.log(colors.red + "Failed." + colors.reset);
        }
    } else {
        console.log("   Clean.");
    }

    // --------------------------------------------------------------------------
    // STEP 2: NATIVE REBUILD
    // --------------------------------------------------------------------------
    log("\n2/5", "Rebuilding Native Dependencies");
    console.log(`   ${colors.yellow}⧗  Starting compilation (sqlite3)...${colors.reset}`);
    // Use -f -w sqlite3 per your original working script
    await executeCommand("electron-rebuild", ["-f", "-w", "sqlite3"], rootDir);
    console.log(`   ${colors.green}✔  Rebuild Complete.${colors.reset}`);

    // --------------------------------------------------------------------------
    // STEP 3: EXECUTE BUILDER
    // --------------------------------------------------------------------------
    log("\n3/5", "Packaging (electron-builder)");
    console.log(`   ${colors.gray}→  Initializing...${colors.reset}`);

    // Explicitly force NSIS target
    await executeCommand("electron-builder", ["--win", "nsis:x64"], rootDir);

    // --------------------------------------------------------------------------
    // STEP 4: ORGANIZE
    // --------------------------------------------------------------------------
    log("\n4/5", "Organizing Artifacts");

    if (!fs.existsSync(winReleaseDir)) fs.mkdirSync(winReleaseDir, { recursive: true });

    let found = findInstaller(releaseDir);

    if (found) {
        const dest = path.join(winReleaseDir, found.name);
        try {
            if (path.relative(found.path, dest) !== "") {
                fs.renameSync(found.path, dest);
            }
            console.log(`   ✔ Moved installer to: release/win/${found.name}`);
        } catch (err) {
            console.error(`   ✘ Failed to move installer: ${err.message}`);
        }
    }

    // Cleanup artifacts
    if (fs.existsSync(releaseDir)) {
        const files = fs.readdirSync(releaseDir);
        for (const file of files) {
            const fullPath = path.join(releaseDir, file);
            if (file === "win") continue;

            try {
                if (fs.statSync(fullPath).isDirectory()) {
                    rimraf.sync(fullPath);
                } else {
                    fs.unlinkSync(fullPath);
                }
            } catch (e) { }
        }
    }

    // --------------------------------------------------------------------------
    // STEP 5: COMPLETE
    // --------------------------------------------------------------------------
    log("\n5/5", "Complete");

    const finalCheck = findInstaller(winReleaseDir);

    if (finalCheck) {
        console.log(`${colors.green}   Build Successful!${colors.reset}`);
        console.log(`   Installer: ${finalCheck.path}\n`);
    } else {
        console.log(`${colors.yellow}   Build finished, but no installer was found in release/win/.${colors.reset}`);
        console.log(`${colors.gray}   Please check the logs above for errors.${colors.reset}\n`);
    }
}

runBuild().catch(err => {
    console.error(`\n${colors.red}[FATAL] ${err.message}${colors.reset}`);
    process.exit(1);
});