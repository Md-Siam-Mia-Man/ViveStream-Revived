const packager = require("electron-packager");
const compile = require("innosetup-compiler");
const path = require("path");
const fs = require("fs-extra");
const packageJson = require("./package.json");

const appName = packageJson.name;
const appVersion = packageJson.version;
const appAuthor = packageJson.author;
const appExeName = `${appName}.exe`;

const outputDir = path.join(__dirname, "release");
const packagedAppDirName = `${appName}-win32-ia32`;
const packagedAppPath = path.join(outputDir, packagedAppDirName);

async function build() {
  console.log("--- Starting Electron Build & Install Process ---");

  try {
    console.log("1/4: Cleaning up previous builds...");
    await fs.remove(outputDir);
    await fs.ensureDir(outputDir);
    console.log("   -> Done.");

    console.log("2/4: Packaging Electron app...");
    await packager({
      dir: __dirname,
      out: outputDir,
      name: appName,
      platform: "win32",
      arch: "ia32",
      overwrite: true,
      asar: true,
      icon: path.join(__dirname, "build", "icon.ico"),
      extraResource: [path.join(__dirname, "vendor")],
      ignore: [
        /^\/release($|\/)/,
        /^\/installers($|\/)/,
        /^\/build-installer\.js$/,
        /^\/setup\.iss$/,
        /\.git($|\/)/,
        /\.vscode($|\/)/,
      ],
    });
    console.log(`   -> App packaged successfully at: ${packagedAppPath}`);

    console.log("3/4: Creating Windows Installer with Inno Setup...");
    const issPath = path.join(__dirname, "setup.iss");
    await compile(issPath, {
      defines: {
        MyAppName: appName,
        MyAppVersion: appVersion,
        MyAppPublisher: appAuthor,
        SourceAppPath: packagedAppPath,
        MyAppExeName: appExeName,
      },
    });
    console.log("   -> Installer compiled successfully.");

    const setupOutputPath = path.join(
      __dirname,
      "Output",
      `${appName}-${appVersion}-setup.exe`
    );
    const finalInstallerPath = path.join(
      outputDir,
      `${appName}-v${appVersion}-setup.exe`
    );
    await fs.move(setupOutputPath, finalInstallerPath, { overwrite: true });
    await fs.remove(path.join(__dirname, "Output"));

    console.log("4/4: Cleaning up build artifacts...");
    await fs.remove(packagedAppPath);
    console.log("   -> Done.");

    console.log("\n--- Build Complete! ---");
    console.log(`✅ Final installer located at: ${finalInstallerPath}`);
  } catch (error) {
    console.error("\n❌ Build failed:");
    console.error(error);
    process.exit(1);
  }
}

build();
