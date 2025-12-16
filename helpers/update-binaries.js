const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORTABLE_ROOT = path.join(__dirname, '..', 'python-portable');

function getPythonPath() {
    if (process.platform === 'win32') {
        return {
            exe: path.join(PORTABLE_ROOT, 'python-win-x64', 'python.exe'),
            binDir: path.join(PORTABLE_ROOT, 'python-win-x64', 'Scripts')
        };
    } else if (process.platform === 'darwin') {
        return {
            exe: path.join(PORTABLE_ROOT, 'python-mac-darwin', 'bin', 'python3'),
            binDir: path.join(PORTABLE_ROOT, 'python-mac-darwin', 'bin')
        };
    } else if (process.platform === 'linux') {
        const gnu = path.join(PORTABLE_ROOT, 'python-linux-gnu', 'bin', 'python3');
        const gnuBin = path.join(PORTABLE_ROOT, 'python-linux-gnu', 'bin');
        if (fs.existsSync(gnu)) return { exe: gnu, binDir: gnuBin };

        const musl = path.join(PORTABLE_ROOT, 'python-linux-musl', 'bin', 'python3');
        const muslBin = path.join(PORTABLE_ROOT, 'python-linux-musl', 'bin');
        return { exe: musl, binDir: muslBin };
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

function runCommand(cmd, args) {
    return new Promise((resolve, reject) => {
        console.log(`\n> ${cmd} ${args.join(' ')}`);
        const child = spawn(cmd, args, { stdio: 'inherit', shell: true });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with code ${code}`));
        });
        child.on('error', (err) => reject(err));
    });
}

function findFileRecursive(dir, filename) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            const found = findFileRecursive(fullPath, filename);
            if (found) return found;
        } else if (file.toLowerCase() === filename.toLowerCase()) {
            return fullPath;
        }
    }
    return null;
}

async function main() {
    try {
        console.log("=========================================");
        console.log("   🔄 UPDATING & CONSOLIDATING BINARIES");
        console.log("=========================================");

        const { exe, binDir } = getPythonPath();

        if (!fs.existsSync(exe)) {
            throw new Error(`Python executable not found at: ${exe}`);
        }

        if (process.platform !== 'win32') {
            await runCommand('chmod', ['+x', exe]);
        }

        // 1. Update Packages
        console.log("Installing/Updating packages...");
        await runCommand(exe, ['-m', 'pip', 'install', '-U', 'yt-dlp', 'static-ffmpeg']);

        // 2. Trigger Download
        console.log("Hydrating FFmpeg binaries (downloading if missing)...");
        await runCommand(exe, ['-c', '"import static_ffmpeg; static_ffmpeg.add_paths()"']);

        // 3. Consolidate FFmpeg to binDir
        console.log("Consolidating binaries...");
        const targetName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
        const probeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

        // Find where static_ffmpeg hid them (usually in site-packages)
        // We search from the root of the python portable folder
        const searchRoot = path.dirname(path.dirname(binDir)); // Go up two levels to catch Lib/site-packages

        const ffmpegSrc = findFileRecursive(searchRoot, targetName);
        const ffprobeSrc = findFileRecursive(searchRoot, probeName);

        if (ffmpegSrc) {
            const dest = path.join(binDir, targetName);
            console.log(`Copying FFmpeg:\n   From: ${ffmpegSrc}\n   To:   ${dest}`);
            fs.copyFileSync(ffmpegSrc, dest);
            if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
        } else {
            console.warn("⚠️  Could not locate downloaded FFmpeg binary to consolidate.");
        }

        if (ffprobeSrc) {
            const dest = path.join(binDir, probeName);
            console.log(`Copying FFprobe:\n   From: ${ffprobeSrc}\n   To:   ${dest}`);
            fs.copyFileSync(ffprobeSrc, dest);
            if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
        }

        console.log("\n✅ Success! Binaries are ready and consolidated.");

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
    }
}

main();