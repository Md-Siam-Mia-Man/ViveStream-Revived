// src/js/settings.js
let currentSettings = {};

function initializeSettingsPage() {
  const slider = document.getElementById("concurrent-downloads-slider");
  const valueLabel = document.getElementById("concurrent-downloads-value");
  const resetAppBtn = document.getElementById("reset-app-btn");
  const clearMediaBtn = document.getElementById("clear-media-btn");
  const appVersionEl = document.getElementById("app-version");
  const autoSubsToggle = document.getElementById("auto-subs-toggle");
  const cookieBrowserSelect = document.getElementById(
    "cookie-browser-select-container"
  );
  const sponsorblockToggle = document.getElementById("sponsorblock-toggle");
  const updateYtdlpBtn = document.getElementById("update-ytdlp-btn");
  const updaterConsoleContainer = document.getElementById(
    "updater-console-container"
  );
  const updaterConsole = document.getElementById("updater-console");
  // --- NEW: Elements for new settings ---
  const concurrentFragmentsSlider = document.getElementById(
    "concurrent-fragments-slider"
  );
  const concurrentFragmentsValue = document.getElementById(
    "concurrent-fragments-value"
  );
  const outputTemplateInput = document.getElementById("output-template-input");
  const templateHelpLink = document.getElementById("template-help-link");

  const updateSettingsUI = (settings) => {
    currentSettings = settings;
    slider.value = settings.concurrentDownloads;
    valueLabel.textContent = settings.concurrentDownloads;
    autoSubsToggle.checked = !!settings.downloadAutoSubs;
    sponsorblockToggle.checked = !!settings.removeSponsors;
    // --- NEW: Update new UI elements ---
    concurrentFragmentsSlider.value = settings.concurrentFragments;
    concurrentFragmentsValue.textContent = settings.concurrentFragments;
    outputTemplateInput.value = settings.outputTemplate || "";

    const selectedBrowser = settings.cookieBrowser || "none";
    const selectedOptionEl =
      cookieBrowserSelect.querySelector(".selected-option");
    const options = cookieBrowserSelect.querySelectorAll(".option-item");
    options.forEach((opt) => {
      opt.classList.remove("selected");
      if (opt.dataset.value === selectedBrowser) {
        opt.classList.add("selected");
        selectedOptionEl.querySelector("span").textContent = opt.textContent;
        selectedOptionEl.dataset.value = opt.dataset.value;
      }
    });
  };

  window.electronAPI.getSettings().then(updateSettingsUI);
  window.electronAPI.getAppVersion().then((v) => {
    if (appVersionEl) appVersionEl.textContent = `Version ${v}`;
  });

  // --- NEW: Event listeners for new settings ---
  concurrentFragmentsSlider.addEventListener("input", (e) => {
    concurrentFragmentsValue.textContent = e.target.value;
  });
  concurrentFragmentsSlider.addEventListener("change", (e) => {
    const newSettings = {
      ...currentSettings,
      concurrentFragments: parseInt(e.target.value, 10),
    };
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
  templateHelpLink.addEventListener("click", () => {
    window.electronAPI.openExternal(
      "https://github.com/yt-dlp/yt-dlp#output-template"
    );
  });

  slider.addEventListener("input", (e) => {
    valueLabel.textContent = e.target.value;
  });
  slider.addEventListener("change", (e) => {
    const newSettings = {
      ...currentSettings,
      concurrentDownloads: parseInt(e.target.value, 10),
    };
    window.electronAPI.saveSettings(newSettings);
    currentSettings = newSettings;
  });

  const selectedOption = cookieBrowserSelect.querySelector(".selected-option");
  const optionsList = cookieBrowserSelect.querySelector(".options-list");
  selectedOption.addEventListener("click", () =>
    cookieBrowserSelect.classList.toggle("open")
  );
  optionsList.addEventListener("click", (e) => {
    if (e.target.classList.contains("option-item")) {
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

  window.electronAPI.onYtDlpUpdateProgress((message) => {
    updaterConsole.textContent += message;
    updaterConsole.scrollTop = updaterConsole.scrollHeight;
  });

  resetAppBtn.addEventListener("click", () => {
    showConfirmationModal(
      "Reset ViveStream?",
      "This will restore all settings to their defaults. Your downloaded media will not be deleted.",
      async () => {
        const newSettings = await window.electronAPI.resetApp();
        updateSettingsUI(newSettings);
        loadSettings();
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
          currentlyPlayingIndex = -1;
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

window.electronAPI.onClearLocalStorage(() => {
  localStorage.clear();
  console.log(
    "Cleared all localStorage as requested by main process for app reset."
  );
});
