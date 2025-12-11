> **⚠️ Note:** Docs are generate by AI

# Platform Specific Installer/Uninstaller Behavior

## 🪟 Windows (NSIS)

**Behavior:** Installation Wizard & Custom Uninstaller.

- **Install:** We use NSIS (Nullsoft Scriptable Install System). This allows us to show a "Welcome" screen, ask the user for a destination folder, and create shortcuts.
- **Uninstall:** Windows maintains a registry of installed apps. When "Uninstall" is clicked, Windows runs our custom `assets/installer.nsh` script.
- **Data Removal:** We explicitly programmed the uninstaller to ask a "Yes/No" question about deleting the database. This is possible because NSIS supports interactive GUIs during uninstallation.

## 🍎 macOS (DMG)

**Behavior:** Drag-and-Drop.

- **Install:** The standard macOS experience is a Disk Image (`.dmg`). The user drags the `ViveStream.app` into the `Applications` folder. There is no "Wizard".
- **Uninstall:** Users uninstall apps by dragging them to the Trash. **macOS does not provide a hook to run code when an app is dragged to the Trash.**
- **Data Removal:** Because we cannot detect when the app is deleted, we cannot ask the user to clean up their data.
- **Solution:** Users must use the in-app **Settings > Danger Zone > Clear All Data** button *before* dragging the app to the Trash if they want a clean removal.

*Note: We could build a `.pkg` installer (Wizard style), but on macOS, this is considered bad practice for simple desktop apps, and it still does not solve the uninstallation issue (deleting a `.app` never triggers a script).*

## 🐧 Linux (AppImage / Deb / RPM)

**Behavior:** Package Managers or Standalone.

- **AppImage:** This is a portable executable. It is not "installed". To uninstall, the user simply deletes the file. We cannot intervene.
- **Deb / RPM:** These are installed via system package managers (`apt`, `dnf`, `dpkg`).
  - **Install:** Handled by the system.
  - **Uninstall:** Handled by `sudo apt remove livestream`.
  - **Data Removal:** While Linux packages support `postrm` (post-remove) scripts, these scripts run as **root** in a non-interactive terminal environment. We cannot launch a GUI popup asking "Do you want to delete data?" from a background root process. It is also against Linux conventions to touch the user's `/home/` directory during a system-level package removal.
- **Solution:** Like macOS, Linux users should use the in-app **Settings > Danger Zone** options to clean up before uninstalling.

## Summary

| Feature | Windows | macOS | Linux |
| :--- | :--- | :--- | :--- |
| **Install Method** | Wizard (Next > Next) | Drag & Drop | Package Manager / Portable |
| **Custom Install Path**| ✅ Yes | ✅ Yes (Drag anywhere) | ❌ No (System standard paths) |
| **Uninstall Trigger** | Control Panel | Drag to Trash | `apt remove` / Delete file |
| **Data Cleanup Prompt**| ✅ Yes (Popup) | ❌ No (OS limitation) | ❌ No (OS/Permission limitation) |
