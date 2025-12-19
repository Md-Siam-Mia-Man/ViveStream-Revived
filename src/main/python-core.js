const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const isDev = !app.isPackaged;
let pythonDetails = null;

function getPythonDetails() {
  if (pythonDetails) return pythonDetails;

  const root = isDev
    ? path.join(__dirname, "..", "..", "python-portable")
    : path.join(process.resourcesPath, "python-portable");

  console.log(`[Python Core] Detecting environment. Dev: ${isDev}, Root: ${root}`);

  let pythonPath = null;
  let binDir = null;

  // 1. Try Portable Python First
  if (process.platform === "win32") {
    const winDir = path.join(root, "python-win-x64");
    if (fs.existsSync(winDir)) {
      pythonPath = path.join(winDir, "python.exe");
      binDir = path.join(winDir, "Scripts");
    }
  } else if (process.platform === "darwin") {
    const macDir = path.join(root, "python-mac-darwin");
    if (fs.existsSync(path.join(macDir, "bin", "python3"))) {
      pythonPath = path.join(macDir, "bin", "python3");
      binDir = path.join(macDir, "bin");
    }
  } else {
    // Linux
    const linuxGnu = path.join(root, "python-linux-gnu");
    const linuxMusl = path.join(root, "python-linux-musl");
    let targetDir = null;

    if (fs.existsSync(linuxGnu)) targetDir = linuxGnu;
    else if (fs.existsSync(linuxMusl)) targetDir = linuxMusl;

    if (targetDir) {
      pythonPath = path.join(targetDir, "bin", "python3");
      binDir = path.join(targetDir, "bin");
    }
  }

  // 2. Fallback to System Python if Portable not found
  if (!pythonPath || !fs.existsSync(pythonPath)) {
    console.warn("[Python Core] Portable Python not found. Checking system...");
    try {
      // Check if python3 or python matches our requirements (simple version check)
      // This is a synchronous check to ensure we have a valid path before returning
      const { execSync } = require('child_process');
      try {
        const out = execSync('python3 --version').toString();
        if (out.includes('Python 3')) {
          pythonPath = 'python3';
          console.log("[Python Core] System 'python3' found:", out.trim());
        }
      } catch (e) {
        const out = execSync('python --version').toString();
        if (out.includes('Python 3')) {
          pythonPath = 'python';
          console.log("[Python Core] System 'python' found:", out.trim());
        }
      }
    } catch (e) {
      console.error("[Python Core] No system Python found either.");
    }
  }

  pythonDetails = { pythonPath, binDir };
  console.log(`[Python Core] Final Resolution: binary=${pythonPath}, scriptDir=${binDir}`);
  return pythonDetails;
}

function spawnPython(args, options = {}) {
  const { pythonPath, binDir } = getPythonDetails();
  const env = { ...process.env, ...options.env };
  if (binDir) {
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    env[pathKey] = `${binDir}${path.delimiter}${env[pathKey] || ''}`;
  }
  // Force unbuffered output so logs stream immediately
  env['PYTHONUNBUFFERED'] = '1';
  return spawn(pythonPath, args, { ...options, env });
}

module.exports = {
  getPythonDetails,
  spawnPython
};