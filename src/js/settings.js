// settings.js
document.addEventListener("DOMContentLoaded", () => {
  const settingsPage = document.getElementById("settings-page");
  if (settingsPage) {
    initializeSettingsPage();
  }
});

function initializeSettingsPage() {
  const concurrentDownloadsSlider = document.getElementById(
    "concurrent-downloads-slider"
  );
  const concurrentDownloadsValue = document.getElementById(
    "concurrent-downloads-value"
  );

  if (!concurrentDownloadsSlider || !concurrentDownloadsValue) return;

  window.electronAPI.getSettings().then((settings) => {
    concurrentDownloadsSlider.value = settings.concurrentDownloads || 3;
    concurrentDownloadsValue.textContent = settings.concurrentDownloads || 3;
  });

  concurrentDownloadsSlider.addEventListener("input", (e) => {
    const value = e.target.value;
    concurrentDownloadsValue.textContent = value;
  });

  concurrentDownloadsSlider.addEventListener("change", (e) => {
    const value = parseInt(e.target.value, 10);
    window.electronAPI.saveSettings({ concurrentDownloads: value });
  });
}
