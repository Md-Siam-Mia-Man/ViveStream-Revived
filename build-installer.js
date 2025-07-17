const packager = require("electron-packager");
const compile = require("innosetup-compiler");
const path = require("path");
const fs = require("fs-extra");
const packageJson = require("./package.json");

const appName = packageJson.name;
const appVersion = packageJson.version;
const appAuthor = packageJson.author;
const appExeName = `${appName}.exe`;
const iconPath = path.join(__dirname, "assets", "icon.ico");

const outputDir = path.join(__dirname, "release");
const packagedAppDirName = `${appName}-win32-ia32`;
const packagedAppPath = path.join(outputDir, packagedAppDirName);
const innoSetupOutput = path.join(__dirname, "InnoSetupOutput");

async function build() {
  console.log(
    `🚀 --- Starting Build & Installer Process for ViveStream v${appVersion} --- 🚀`
  );

  try {
    console.log("1/4: 🧹 Cleaning up previous builds...");
    await fs.remove(outputDir);
    await fs.remove(innoSetupOutput);
    await fs.ensureDir(outputDir);
    console.log("   -> Done.");

    console.log("2/4: 📦 Packaging Electron app with Electron Packager...");
    await packager({
      dir: __dirname,
      out: outputDir,
      name: appName,
      platform: "win32",
      arch: "ia32",
      overwrite: true,
      asar: true,
      icon: iconPath,
      extraResource: [path.join(__dirname, "vendor")],
      ignore: [
        /^\/release($|\/)/,
        /^\/InnoSetupOutput($|\/)/,
        /^\/build-installer\.js$/,
        /^\/setup\.iss$/,
        /\.git($|\/)/,
        /\.vscode($|\/)/,
      ],
    });
    console.log(`   -> ✅ App packaged successfully at: ${packagedAppPath}`);

    console.log("3/4: ✍️ Creating Windows Installer with Inno Setup...");
    const issPath = path.join(__dirname, "setup.iss");
    await compile(issPath, {
      O: innoSetupOutput,
      D: {
        MyAppName: appName,
        MyAppVersion: appVersion,
        MyAppPublisher: appAuthor,
        SourceAppPath: packagedAppPath,
        MyAppExeName: appExeName,
        AppIcon: iconPath,
      },
    });
    console.log("   -> ✅ Installer compiled successfully.");

    const tempInstallerName = fs.readdirSync(innoSetupOutput)[0];
    const tempInstallerPath = path.join(innoSetupOutput, tempInstallerName);

    const finalInstallerName = `ViveStream-Installer-v${appVersion}.exe`;
    const finalInstallerPath = path.join(outputDir, finalInstallerName);

    await fs.move(tempInstallerPath, finalInstallerPath, { overwrite: true });

    console.log("4/4: ✨ Cleaning up temporary directories...");
    await fs.remove(packagedAppPath);
    await fs.remove(innoSetupOutput);
    console.log("   -> Done.");

    console.log("\n--- 🎉 Build Complete! ---");
    console.log(`✅ Final installer located at: ${finalInstallerPath}`);
  } catch (error) {
    console.error("\n❌ Build failed:");
    console.error(error);
    process.exit(1);
  }
}

build();
