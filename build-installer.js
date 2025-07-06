// build-installer.js

const { createWindowsInstaller } = require("electron-winstaller");
const path = require("path");
const fs = require("fs");

// --- Configuration ---
const appDirectory = path.join(
  __dirname,
  "release",
  "ViveStream-win32-x64"
);
const outputDirectory = path.join(__dirname, "installers");
const setupIconPath = path.join(__dirname, "build", "icon.ico");
const setupExeName = `ViveStream-Setup-v${
  require("./package.json").version
}.exe`;

console.log("--- Inno Setup Installer Configuration ---");

// --- Pre-build Checks and Logging ---
if (!fs.existsSync(appDirectory)) {
  console.error(`❌ ERROR: The application directory does not exist.`);
  console.error(`   Please run the packaging script first.`);
  console.error(`   Expected path: ${appDirectory}`);
  process.exit(1);
}
console.log(`✔️ App source directory:   ${appDirectory}`);

if (!fs.existsSync(setupIconPath)) {
  console.warn(
    `⚠️ WARNING: Setup icon not found at ${setupIconPath}. Using default icon.`
  );
} else {
  console.log(`✔️ Setup icon:             ${setupIconPath}`);
}

console.log(`✔️ Installer output folder:  ${outputDirectory}`);
console.log(`✔️ Installer executable name: ${setupExeName}`);
console.log("------------------------------------------");
console.log("Starting Inno Setup compilation. This may take a moment...");

// --- Create the Installer ---
createWindowsInstaller({
  appDirectory: appDirectory,
  outputDirectory: outputDirectory,
  authors: "ViveStream Developer",
  exe: "ViveStream.exe",
  setupExe: setupExeName,
  setupIcon: setupIconPath,
  noMsi: true,
  useInno: true, // Explicitly use Inno Setup
})
  .then(() => {
    console.log(
      `✅ Success! Installer created at: ${path.join(
        outputDirectory,
        setupExeName
      )}`
    );
  })
  .catch((error) => {
    console.error("❌ Installer creation failed:", error.message || error);
    process.exit(1);
  });
