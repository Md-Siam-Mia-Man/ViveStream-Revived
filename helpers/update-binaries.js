const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORTABLE_ROOT = path.join(__dirname, '..', 'python-portable');

function getPythonPath() {
    if (process.platform === 'win32') {
        return path.join(PORTABLE_ROOT, 'python-win-x64', 'python.exe');
    } else if (process.platform === 'darwin') {
        return path.join(PORTABLE_ROOT, 'python-mac-darwin', 'bin', 'python3');
    } else if (process.platform === 'linux') {
        // Prefer GNU, fallback to MUSL if GNU missing (rare for dev envs)
        const gnu = path.join(PORTABLE_ROOT, 'python-linux-gnu', 'bin', 'python3');
        return fs.existsSync(gnu) ? gnu : path.join(PORTABLE_ROOT, 'python-linux-musl', 'bin', 'python3');
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

function runCommand(cmd, args) {
    return new Promise((resolve, reject) => {
        console.log(`\n> ${cmd} ${args.join(' ')}`);

        const child = spawn(cmd, args, {
            stdio: 'inherit',
            shell: true
        });

        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with code ${code}`));
        });

        child.on('error', (err) => reject(err));
    });
}

async function main() {
    try {
        console.log("=========================================");
        console.log("   🔄 UPDATING PORTABLE BINARIES");
        console.log("=========================================");

        const pythonExe = getPythonPath();

        if (!fs.existsSync(pythonExe)) {
            throw new Error(`Python executable not found at: ${pythonExe}\nMake sure you have the 'python-portable' folder structure set up.`);
        }

        console.log(`Target Python: ${pythonExe}`);

        // 1. Ensure permissions on Unix
        if (process.platform !== 'win32') {
            console.log("Setting executable permissions...");
            await runCommand('chmod', ['+x', pythonExe]);
        }

        // 2. PIP Install/Update
        console.log("Installing/Updating packages...");
        await runCommand(pythonExe, ['-m', 'pip', 'install', '-U', 'yt-dlp', 'static-ffmpeg']);

        // 3. Hydrate Static FFmpeg
        // This downloads the actual ffmpeg/ffprobe binaries into site-packages
        console.log("Hydrating FFmpeg binaries...");
        await runCommand(pythonExe, ['-c', '"import static_ffmpeg; static_ffmpeg.add_paths()"']);

        console.log("\n✅ Success! Environment is up to date.");
        console.log("   Don't forget to run 'npm run env:clean' before building to remove bloat.");

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
    }
}

main();