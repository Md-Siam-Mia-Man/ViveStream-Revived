import { showConfirmationModal } from "./modals.js";
import { showNotification } from "./notifications.js";
import { loadLibrary, showPage } from "./renderer.js";
import { resetPlaybackState } from "./state.js";
import { closeMiniplayer } from "./miniplayer.js";

let currentSettings = {};

const appVersionEl = document.getElementById("app-version");
const themeToggle = document.getElementById("theme-toggle");
const concurrentDownloadsSlider = document.getElementById(
  "concurrent-downloads-slider"
);
const concurrentDownloadsValue = document.getElementById(
  "concurrent-downloads-value"
);
const concurrentFragmentsSlider = document.getElementById(
  "concurrent-fragments-slider"
);
const concurrentFragmentsValue = document.getElementById(
  "concurrent-fragments-value"
);
const speedLimitInput = document.getElementById("speed-limit-input");
const cookieBrowserSelect = document.getElementById(
  "cookie-browser-select-container"
);
const autoSubsToggle = document.getElementById("auto-subs-toggle");
const sponsorblockToggle = document.getElementById("sponsorblock-toggle");
const importFilesBtn = document.getElementById("import-files-btn");
const exportAllBtn = document.getElementById("export-all-btn");
const reinitializeAppBtn = document.getElementById("reinitialize-app-btn");
const updateYtdlpBtn = document.getElementById("update-ytdlp-btn");
const updaterConsoleContainer = document.getElementById(
  "updater-console-container"
);
const updaterConsole = document.getElementById("updater-console");
const resetAppBtn = document.getElementById("reset-app-btn");
const clearMediaBtn = document.getElementById("clear-media-btn");
const videoPlayer = document.getElementById("video-player");

const fileOpProgressContainer = document.getElementById(
  "file-op-progress-container"
);
const fileOpProgressLabel = document.getElementById("file-op-progress-label");
const fileOpProgressFilename = document.getElementById(
  "file-op-progress-filename"
);
const fileOpProgressBar = document.getElementById("file-op-progress-bar");
const fileOpProgressValue = document.getElementById("file-op-progress-value");

function updateSettingsUI(settings) {
  currentSettings = settings;
  concurrentDownloadsSlider.value = settings.concurrentDownloads;
  concurrentDownloadsValue.textContent = settings.concurrentDownloads;
  autoSubsToggle.checked = !!settings.downloadAutoSubs;
  sponsorblockToggle.checked = !!settings.removeSponsors;
  concurrentFragmentsSlider.value = settings.concurrentFragments;
  concurrentFragmentsValue.textContent = settings.concurrentFragments;
  speedLimitInput.value = settings.speedLimit || "";

  const selectedBrowser = settings.cookieBrowser || "none";
  const selectedOptionEl =
    cookieBrowserSelect.querySelector(".selected-option");
  const options = cookieBrowserSelect.querySelectorAll(".option-item");
  options.forEach((opt) => {
    const isSelected = opt.dataset.value === selectedBrowser;
    opt.classList.toggle("selected", isSelected);
    if (isSelected) {
      selectedOptionEl.querySelector("span").textContent = opt.textContent;
      selectedOptionEl.dataset.value = opt.dataset.value;
    }
  });
}

export async function loadSettings() {
  const settings = await window.electronAPI.getSettings();
  updateSettingsUI(settings);
  const savedTheme = localStorage.getItem("theme") || "dark";
  themeToggle.checked = savedTheme === "light";
}

export function initializeSettingsPage() {
  window.electronAPI.getAppVersion().then((v) => {
    if (appVersionEl) appVersionEl.textContent = `Version ${v}`;
  });

  themeToggle.addEventListener("change", (e) => {
    const theme = e.target.checked ? "light" : "dark";
    document.body.classList.toggle("light-theme", e.target.checked);
    localStorage.setItem("theme", theme);
  });

  const saveSetting = (key, value) => {
    const newSettings = { ...currentSettings, [key]: value };
    window.electronAPI.saveSettings(newSettings);
    currentSettings = newSettings;
  };

  concurrentDownloadsSlider.addEventListener("change", (e) =>
    saveSetting("concurrentDownloads", parseInt(e.target.value, 10))
  );
  concurrentDownloadsSlider.addEventListener("input", (e) => {
    concurrentDownloadsValue.textContent = e.target.value;
  });

  concurrentFragmentsSlider.addEventListener("change", (e) =>
    saveSetting("concurrentFragments", parseInt(e.target.value, 10))
  );
  concurrentFragmentsSlider.addEventListener("input", (e) => {
    concurrentFragmentsValue.textContent = e.target.value;
  });

  speedLimitInput.addEventListener("change", (e) =>
    saveSetting("speedLimit", e.target.value.trim())
  );
  autoSubsToggle.addEventListener("change", (e) =>
    saveSetting("downloadAutoSubs", e.target.checked)
  );
  sponsorblockToggle.addEventListener("change", (e) =>
    saveSetting("removeSponsors", e.target.checked)
  );

  cookieBrowserSelect.addEventListener("change", (e) => {
    const value = e.target
      .closest(".custom-select-container")
      .querySelector(".selected-option").dataset.value;
    saveSetting("cookieBrowser", value);
  });

  importFilesBtn.addEventListener("click", async () => {
    importFilesBtn.disabled = true;
    exportAllBtn.disabled = true;
    fileOpProgressContainer.classList.remove("hidden");
    fileOpProgressLabel.textContent = "Importing...";

    const result = await window.electronAPI.mediaImportFiles();

    if (result.success) {
      showNotification(
        `Successfully imported ${result.count} file(s).`,
        "success"
      );
      await loadLibrary();
    } else {
      showNotification(`Import failed: ${result.error}`, "error");
    }

    importFilesBtn.disabled = false;
    exportAllBtn.disabled = false;
    fileOpProgressContainer.classList.add("hidden");
  });

  exportAllBtn.addEventListener("click", async () => {
    importFilesBtn.disabled = true;
    exportAllBtn.disabled = true;
    fileOpProgressContainer.classList.remove("hidden");
    fileOpProgressLabel.textContent = "Exporting...";

    const result = await window.electronAPI.mediaExportAll();

    if (result.success) {
      showNotification(
        `Successfully exported ${result.count} files.`,
        "success"
      );
    } else if (result.error !== "Export cancelled.") {
      showNotification(`Export failed: ${result.error}`, "error");
    }
    importFilesBtn.disabled = false;
    exportAllBtn.disabled = false;
    fileOpProgressContainer.classList.add("hidden");
  });

  reinitializeAppBtn.addEventListener("click", () => {
    showConfirmationModal(
      "Reinitialize App?",
      "This will rescan your media directory for deleted files, clear the application cache, and remove any artists that no longer have media. This can fix some library issues. Are you sure?",
      async () => {
        reinitializeAppBtn.disabled = true;
        reinitializeAppBtn.innerHTML = `<span class="material-symbols-outlined spin">progress_activity</span> Working...`;
        const result = await window.electronAPI.appReinitialize();
        if (result.success) {
          showNotification(
            `App reinitialized: ${result.deletedVideos} video(s) and ${result.deletedArtists} artist(s) removed.`,
            "success"
          );
          await loadLibrary();
        } else {
          showNotification(`Reinitialization failed: ${result.error}`, "error");
        }
        reinitializeAppBtn.disabled = false;
        reinitializeAppBtn.innerHTML = `<span class="material-symbols-outlined">sync</span> Reinitialize`;
      }
    );
  });

  updateYtdlpBtn.addEventListener("click", async () => {
    updateYtdlpBtn.disabled = true;
    updateYtdlpBtn.innerHTML = `<span class="material-symbols-outlined spin">progress_activity</span> Updating...`;
    updaterConsole.textContent = "Starting update process...\n";
    updaterConsoleContainer.classList.remove("hidden");
    const result = await window.electronAPI.checkYtDlpUpdate();
    updateYtdlpBtn.disabled = false;
    updateYtdlpBtn.innerHTML = `<span class="material-symbols-outlined">system_update</span> Check for Updates`;
    showNotification(
      result.success
        ? "Downloader updated successfully!"
        : "Downloader update failed. See log for details.",
      result.success ? "success" : "error"
    );
    updaterConsole.textContent += result.success
      ? "\nUpdate process finished."
      : "\nUpdate process failed.";
  });

  resetAppBtn.addEventListener("click", () => {
    showConfirmationModal(
      "Reset ViveStream?",
      "This will restore all settings to their defaults. Your downloaded media will not be deleted.",
      async () => {
        const newSettings = await window.electronAPI.resetApp();
        updateSettingsUI(newSettings);
        const playerModule = await import("./player.js");
        playerModule.loadSettings();
        showNotification(
          "ViveStream has been reset to default settings.",
          "info"
        );
      }
    );
  });

  clearMediaBtn.addEventListener("click", () => {
    showConfirmationModal(
      "Delete All Media?",
      "<strong>WARNING:</strong> This will permanently delete all your downloaded videos, audio, and metadata. This action cannot be undone.",
      async () => {
        const result = await window.electronAPI.clearAllMedia();
        if (result.success) {
          showNotification("All local media has been deleted.", "success");
          resetPlaybackState();
          videoPlayer.src = "";
          closeMiniplayer();
          await loadLibrary();
          showPage("home");
        } else {
          showNotification(`Error: ${result.error}`, "error");
        }
      }
    );
  });

  document
    .getElementById("github-view-link")
    ?.addEventListener("click", () =>
      window.electronAPI.openExternal(
        "https://github.com/Md-Siam-Mia-Man/ViveStream-Revived"
      )
    );
  document
    .getElementById("github-star-link")
    ?.addEventListener("click", () =>
      window.electronAPI.openExternal(
        "https://github.com/Md-Siam-Mia-Man/ViveStream-Revived/stargazers"
      )
    );
}

window.electronAPI.onYtDlpUpdateProgress((message) => {
  updaterConsole.textContent += message;
  updaterConsole.scrollTop = updaterConsole.scrollHeight;
});

window.electronAPI.onImportError(({ fileName, error }) => {
  showNotification(`Failed to import ${fileName}`, "error", error);
});

window.electronAPI.onClearLocalStorage(() => {
  localStorage.clear();
});

window.electronAPI.onFileOperationProgress(
  ({ type, fileName, currentFile, totalFiles, progress }) => {
    fileOpProgressContainer.classList.remove("hidden");
    fileOpProgressLabel.textContent =
      type === "import" ? `Importing...` : `Exporting...`;
    fileOpProgressFilename.textContent = `(${currentFile}/${totalFiles}) ${fileName}`;
    fileOpProgressBar.style.width = `${progress}%`;
    fileOpProgressValue.textContent = `${progress}%`;
  }
);