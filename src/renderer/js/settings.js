// src/js/settings.js
import { showConfirmationModal } from "./modals.js";
import { showNotification } from "./notifications.js";
import { loadLibrary, showPage } from "./renderer.js";
import { resetPlaybackState } from "./state.js";
import { closeMiniplayer } from "./miniplayer.js";

let currentSettings = {};

const appVersionEl = document.getElementById("app-version");
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
const outputTemplateInput = document.getElementById("output-template-input");
const templateHelpLink = document.getElementById("template-help-link");
const cookieBrowserSelect = document.getElementById(
  "cookie-browser-select-container"
);
const autoSubsToggle = document.getElementById("auto-subs-toggle");
const sponsorblockToggle = document.getElementById("sponsorblock-toggle");
const importFilesBtn = document.getElementById("import-files-btn");
const exportAllBtn = document.getElementById("export-all-btn");
const cleanupBtn = document.getElementById("cleanup-btn");
const updateYtdlpBtn = document.getElementById("update-ytdlp-btn");
const updaterConsoleContainer = document.getElementById(
  "updater-console-container"
);
const updaterConsole = document.getElementById("updater-console");
const resetAppBtn = document.getElementById("reset-app-btn");
const clearMediaBtn = document.getElementById("clear-media-btn");
const videoPlayer = document.getElementById("video-player");

function updateSettingsUI(settings) {
  currentSettings = settings;
  concurrentDownloadsSlider.value = settings.concurrentDownloads;
  concurrentDownloadsValue.textContent = settings.concurrentDownloads;
  autoSubsToggle.checked = !!settings.downloadAutoSubs;
  sponsorblockToggle.checked = !!settings.removeSponsors;
  concurrentFragmentsSlider.value = settings.concurrentFragments;
  concurrentFragmentsValue.textContent = settings.concurrentFragments;
  outputTemplateInput.value = settings.outputTemplate || "";
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
}

export function initializeSettingsPage() {
  window.electronAPI.getAppVersion().then((v) => {
    if (appVersionEl) appVersionEl.textContent = `Version ${v}`;
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
  outputTemplateInput.addEventListener("change", (e) =>
    saveSetting("outputTemplate", e.target.value.trim())
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
    importFilesBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Importing...`;
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
    importFilesBtn.innerHTML = `<i class="fa-solid fa-file-import"></i> Import Files`;
  });

  exportAllBtn.addEventListener("click", async () => {
    exportAllBtn.disabled = true;
    exportAllBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Exporting...`;
    const result = await window.electronAPI.mediaExportAll();
    if (result.success) {
      showNotification(
        `Successfully exported ${result.count} files.`,
        "success"
      );
    } else if (result.error !== "Export cancelled.") {
      showNotification(`Export failed: ${result.error}`, "error");
    }
    exportAllBtn.disabled = false;
    exportAllBtn.innerHTML = `<i class="fa-solid fa-folder-open"></i> Export Library`;
  });

  cleanupBtn.addEventListener("click", async () => {
    cleanupBtn.disabled = true;
    cleanupBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cleaning...`;
    const result = await window.electronAPI.dbCleanupOrphans();
    if (result.success) {
      showNotification(`Removed ${result.count} unused artist(s).`, "success");
      await loadLibrary();
    } else {
      showNotification(`Cleanup failed: ${result.error}`, "error");
    }
    cleanupBtn.disabled = false;
    cleanupBtn.innerHTML = `<i class="fa-solid fa-broom"></i> Clean Up`;
  });

  updateYtdlpBtn.addEventListener("click", async () => {
    updateYtdlpBtn.disabled = true;
    updateYtdlpBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating...`;
    updaterConsole.textContent = "Starting update process...\n";
    updaterConsoleContainer.classList.remove("hidden");
    const result = await window.electronAPI.checkYtDlpUpdate();
    updateYtdlpBtn.disabled = false;
    updateYtdlpBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> Check for Updates`;
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

  templateHelpLink.addEventListener("click", () =>
    window.electronAPI.openExternal(
      "https://github.com/yt-dlp/yt-dlp#output-template"
    )
  );
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
