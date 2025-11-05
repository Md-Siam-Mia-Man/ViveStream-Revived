const packager = require("@electron/packager");
const compile = require("innosetup-compiler");
const path = require("path");
const fs = require("fs-extra");
const packageJson = require("./package.json");

const config = {
  appName: packageJson.name,
  appVersion: packageJson.version,
  appAuthor: packageJson.author,
  appExeName: `${packageJson.name}.exe`,
  iconPath: path.join(__dirname, "assets", "icon.ico"),
  outputDir: path.join(__dirname, "release"),
  issPath: path.join(__dirname, "setup.iss"),
  vendorDir: path.join(__dirname, "vendor"),
  assetsDir: path.join(__dirname, "assets"),
  innoSetupOutputDir: path.join(__dirname, "InnoSetupOutput"),
};
config.packagedAppDirName = `${config.appName}-win32-x64`;
config.packagedAppPath = path.join(config.outputDir, config.packagedAppDirName);
config.finalInstallerName = `ViveStream-Installer-v${config.appVersion}.exe`;
config.finalInstallerPath = path.join(
  config.outputDir,
  config.finalInstallerName
);

async function runPreBuildChecks() {
  console.log("[1/5] 🧐 Running pre-build checks...");
  const requiredFiles = [
    config.issPath,
    path.join(config.vendorDir, "yt-dlp.exe"),
    path.join(config.vendorDir, "ffmpeg.exe"),
    path.join(config.vendorDir, "ffprobe.exe"),
  ];

  for (const file of requiredFiles) {
    if (!(await fs.pathExists(file))) {
      throw new Error(`Required file is missing: ${file}`);
    }
  }
  console.log("   ✅ All required files found.");
}

async function cleanupPreviousBuild() {
  console.log("[2/5] 🧹 Cleaning up previous build artifacts...");
  await fs.remove(config.outputDir);
  await fs.remove(config.innoSetupOutputDir);
  await fs.ensureDir(config.outputDir);
  console.log("   ✅ Cleanup complete.");
}

async function packageApp() {
  console.log("[3/5] 📦 Packaging Electron app with Electron Packager...");
  await packager({
    dir: __dirname,
    out: config.outputDir,
    name: config.appName,
    platform: "win32",
    arch: "x64",
    overwrite: true,
    asar: true,
    icon: config.iconPath,
    extraResource: [config.vendorDir, config.assetsDir],
    ignore: [
      /^\/release(\/|$)/,
      /^\/InnoSetupOutput(\/|$)/,
      /^\/build-installer\.js$/,
      /^\/setup\.iss$/,
      /\.git(\/|$)/,
      /\.vscode(\/|$)/,
      /^\/README\.md$/,
      /^\/Prompt\.txt$/,
    ],
  });
  console.log("   ✅ App packaged successfully.");
}

async function createInstaller() {
  console.log("[4/5] ⚙️ Compiling Windows installer with Inno Setup...");
  await compile(config.issPath, {
    O: config.innoSetupOutputDir,
    D: {
      MyAppName: config.appName,
      MyAppVersion: config.appVersion,
      MyAppPublisher: config.appAuthor,
      SourceAppPath: config.packagedAppPath,
      MyAppExeName: config.appExeName,
      AppIcon: config.iconPath,
    },
  });
  console.log("   ✅ Installer compiled.");
}

async function finalizeBuild() {
  console.log("[5/5] ✨ Finalizing and cleaning up...");
  console.group("   Tasks:");
  const tempInstallerName = (await fs.readdir(config.innoSetupOutputDir))[0];
  const tempInstallerPath = path.join(
    config.innoSetupOutputDir,
    tempInstallerName
  );

  await fs.move(tempInstallerPath, config.finalInstallerPath, {
    overwrite: true,
  });
  console.log(`- Installer moved to: ${config.finalInstallerPath}`);

  await fs.remove(config.packagedAppPath);
  await fs.remove(config.innoSetupOutputDir);
  console.log("- Temporary directories removed.");
  console.groupEnd();
}

async function build() {
  console.log(
    `🚀 --- Starting Build Process for ViveStream v${config.appVersion} --- 🚀\n`
  );
  try {
    await runPreBuildChecks();
    await cleanupPreviousBuild();
    await packageApp();
    await createInstaller();
    await finalizeBuild();

    console.log("\n--- 🎉 Build Complete! ---");
    console.log(`✅ Installer is ready at: ${config.finalInstallerPath}`);
  } catch (error) {
    console.error("\n❌ Build failed!");
    console.error(error);
    process.exit(1);
  }
}

build();
