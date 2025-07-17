// downloader.js
downloadForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const selectedQuality =
    qualitySelectContainer.querySelector(".selected-option").dataset.value;
  const options = {
    url: urlInput.value,
    type: document.querySelector('input[name="download-type"]:checked').value,
    quality: selectedQuality,
  };
  if (options.url) {
    window.electronAPI.downloadVideo(options);
    statusArea.classList.add("visible");
    statusText.innerText = "Requesting video info...";
    progressBar.style.width = "0%";
  }
});

window.electronAPI.onDownloadProgress((progress) => {
  statusArea.classList.add("visible");
  const p =
    progress.playlistCount > 1
      ? `(${progress.playlistIndex}/${progress.playlistCount}) `
      : "";
  statusText.innerText = `Downloading: ${p}${progress.percent.toFixed(1)}%`;
  progressBar.style.width = `${progress.percent}%`;
});

window.electronAPI.onDownloadComplete((newData) => {
  statusArea.classList.add("visible");
  statusText.innerText = `Download Complete: ${newData.title}`;
  progressBar.style.width = "100%";
  if (!newData.isPlaylist) {
    urlInput.value = "";
  }
  loadLibrary();
});

window.electronAPI.onDownloadError((error) => {
  statusArea.classList.add("visible");
  statusText.innerText = `Error: ${error}`;
  progressBar.style.width = "0%";
});

const selectedOption = qualitySelectContainer.querySelector(".selected-option");
const optionsList = qualitySelectContainer.querySelector(".options-list");

selectedOption.addEventListener("click", () => {
  qualitySelectContainer.classList.toggle("open");
});

optionsList.addEventListener("click", (e) => {
  if (e.target.classList.contains("option-item")) {
    selectedOption.querySelector("span").textContent = e.target.textContent;
    selectedOption.dataset.value = e.target.dataset.value;
    optionsList
      .querySelectorAll(".option-item")
      .forEach((item) => item.classList.remove("selected"));
    e.target.classList.add("selected");
    qualitySelectContainer.classList.remove("open");
  }
});

document.addEventListener("click", (e) => {
  if (!qualitySelectContainer.contains(e.target)) {
    qualitySelectContainer.classList.remove("open");
  }
});
