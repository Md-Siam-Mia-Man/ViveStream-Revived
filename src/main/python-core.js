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

  if (process.platform === "win32") {
    const winDir = path.join(root, "python-win-x64");
    if (fs.existsSync(winDir)) {
      pythonPath = path.join(winDir, "python.exe");
      binDir = path.join(winDir, "Scripts");
    } else {
      console.warn("[Python Core] Portable Python not found at expected path:", winDir);
      pythonPath = "python";
    }
  } else if (process.platform === "darwin") {
    const macDir = path.join(root, "python-mac-darwin");
    if (fs.existsSync(path.join(macDir, "bin", "python3"))) {
      pythonPath = path.join(macDir, "bin", "python3");
      binDir = path.join(macDir, "bin");
    } else {
      console.warn("[Python Core] Portable Python not found at expected path:", macDir);
      pythonPath = "python3";
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
    } else {
      console.warn("[Python Core] Portable Python not found at expected paths:", linuxGnu);
      pythonPath = "python3";
    }
  }

  pythonDetails = { pythonPath, binDir };
  console.log(`[Python Core] Resolved: ${pythonPath}`);
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