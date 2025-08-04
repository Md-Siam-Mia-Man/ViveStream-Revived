// src/js/settings.js
import { showConfirmationModal } from "./modals.js";
import { showNotification } from "./notifications.js";
import { loadLibrary, showPage } from "./renderer.js";
import { resetPlaybackState } from "./state.js";
import { closeMiniplayer } from "./miniplayer.js";

// --- State ---
let currentSettings = {};

// --- DOM Element Selectors ---
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
const outputTemplateInput = document.getElementById("output-template-input");
const templateHelpLink = document.getElementById("template-help-link");
const cookieBrowserSelect = document.getElementById(
  "cookie-browser-select-container"
);
const autoSubsToggle = document.getElementById("auto-subs-toggle");
const sponsorblockToggle = document.getElementById("sponsorblock-toggle");
const updateYtdlpBtn = document.getElementById("update-ytdlp-btn");
const updaterConsoleContainer = document.getElementById(
  "updater-console-container"
);
const updaterConsole = document.getElementById("updater-console");
const resetAppBtn = document.getElementById("reset-app-btn");
const clearMediaBtn = document.getElementById("clear-media-btn");
const videoPlayer = document.getElementById("video-player");

/**
 * Updates the entire settings UI based on a settings object.
 * @param {object} settings - The settings object.
 */
function updateSettingsUI(settings) {
  currentSettings = settings;
  concurrentDownloadsSlider.value = settings.concurrentDownloads;
  concurrentDownloadsValue.textContent = settings.concurrentDownloads;
  autoSubsToggle.checked = !!settings.downloadAutoSubs;
  sponsorblockToggle.checked = !!settings.removeSponsors;
  concurrentFragmentsSlider.value = settings.concurrentFragments;
  concurrentFragmentsValue.textContent = settings.concurrentFragments;
  outputTemplateInput.value = settings.outputTemplate || "";

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

/**
 * Loads settings from the main process and populates the UI.
 */
export async function loadSettings() {
  const settings = await window.electronAPI.getSettings();
  updateSettingsUI(settings);
}

/**
 * Initializes all event listeners for the settings page.
 */
export function initializeSettingsPage() {
  window.electronAPI.getAppVersion().then((v) => {
    if (appVersionEl) appVersionEl.textContent = `Version ${v}`;
  });

  // --- Event Listeners for Individual Settings ---
  concurrentDownloadsSlider.addEventListener("change", (e) => {
    const value = parseInt(e.target.value, 10);
    concurrentDownloadsValue.textContent = value;
    const newSettings = { ...currentSettings, concurrentDownloads: value };
    window.electronAPI.saveSettings(newSettings);
    currentSettings = newSettings;
  });

  concurrentFragmentsSlider.addEventListener("change", (e) => {
    const value = parseInt(e.target.value, 10);
    concurrentFragmentsValue.textContent = value;
    const newSettings = { ...currentSettings, concurrentFragments: value };
    window.electronAPI.saveSettings(newSettings);
    currentSettings = newSettings;
  });

  outputTemplateInput.addEventListener("change", (e) => {
    const newSettings = {
      ...currentSettings,
      outputTemplate: e.target.value.trim(),
    };
    window.electronAPI.saveSettings(newSettings);
    currentSettings = newSettings;
  });

  autoSubsToggle.addEventListener("change", (e) => {
    const newSettings = {
      ...currentSettings,
      downloadAutoSubs: e.target.checked,
    };
    window.electronAPI.saveSettings(newSettings);
    currentSettings = newSettings;
  });

  sponsorblockToggle.addEventListener("change", (e) => {
    const newSettings = {
      ...currentSettings,
      removeSponsors: e.target.checked,
    };
    window.electronAPI.saveSettings(newSettings);
    currentSettings = newSettings;
  });

  // Custom Select Dropdown Logic
  cookieBrowserSelect.addEventListener("click", (e) => {
    const selectedOption =
      cookieBrowserSelect.querySelector(".selected-option");
    const optionsList = cookieBrowserSelect.querySelector(".options-list");
    if (e.target.closest(".selected-option")) {
      cookieBrowserSelect.classList.toggle("open");
    } else if (e.target.classList.contains("option-item")) {
      const selectedValue = e.target.dataset.value;
      selectedOption.querySelector("span").textContent = e.target.textContent;
      selectedOption.dataset.value = selectedValue;
      optionsList
        .querySelectorAll(".option-item")
        .forEach((i) => i.classList.remove("selected"));
      e.target.classList.add("selected");
      cookieBrowserSelect.classList.remove("open");
      const newSettings = { ...currentSettings, cookieBrowser: selectedValue };
      window.electronAPI.saveSettings(newSettings);
      currentSettings = newSettings;
      showNotification(
        `Cookie setting saved to: ${e.target.textContent}`,
        "success"
      );
    }
  });

  document.addEventListener("click", (e) => {
    if (!cookieBrowserSelect.contains(e.target)) {
      cookieBrowserSelect.classList.remove("open");
    }
  });

  // --- Maintenance and Danger Zone Buttons ---
  updateYtdlpBtn.addEventListener("click", async () => {
    updateYtdlpBtn.disabled = true;
    updateYtdlpBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating...`;
    updaterConsole.textContent = "Starting update process...\n";
    updaterConsoleContainer.classList.remove("hidden");

    const result = await window.electronAPI.checkYtDlpUpdate();

    updateYtdlpBtn.disabled = false;
    updateYtdlpBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> Check for Updates`;

    if (result.success) {
      showNotification("Downloader updated successfully!", "success");
      updaterConsole.textContent += "\nUpdate process finished.";
    } else {
      showNotification(
        "Downloader update failed. See log for details.",
        "error"
      );
      updaterConsole.textContent += "\nUpdate process failed.";
    }
  });

  resetAppBtn.addEventListener("click", () => {
    showConfirmationModal(
      "Reset ViveStream?",
      "This will restore all settings to their defaults. Your downloaded media will not be deleted.",
      async () => {
        const newSettings = await window.electronAPI.resetApp();
        updateSettingsUI(newSettings);
        loadSettings(); // Reloads player settings from localStorage
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

  // --- About Section Links ---
  templateHelpLink.addEventListener("click", () =>
    window.electronAPI.openExternal(
      "https://github.com/yt-dlp/yt-dlp#output-template"
    )
  );
  document
    .getElementById("github-view-link")
    ?.addEventListener("click", () =>
      window.electronAPI.openExternal(
        "https://github.com/Md-Siam-Mia-Code/ViveStream-Revived"
      )
    );
  document
    .getElementById("github-star-link")
    ?.addEventListener("click", () =>
      window.electronAPI.openExternal(
        "https://github.com/Md-Siam-Mia-Code/ViveStream-Revived/stargazers"
      )
    );
}

// --- IPC Listeners ---
window.electronAPI.onYtDlpUpdateProgress((message) => {
  updaterConsole.textContent += message;
  updaterConsole.scrollTop = updaterConsole.scrollHeight;
});

window.electronAPI.onClearLocalStorage(() => {
  localStorage.clear();
});
