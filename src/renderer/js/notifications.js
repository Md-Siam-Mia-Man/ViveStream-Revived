const notificationContainer = document.getElementById("notification-container");

export function showNotification(message, type = "success", details = "") {
  if (!notificationContainer) return;

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;

  const detailsHTML = details ? `<span>${details}</span>` : "";
  const iconName = {
    success: "check_circle",
    error: "warning",
    info: "info",
  }[type];

  notification.innerHTML = `
        <span class="material-symbols-outlined notification-icon">${iconName}</span>
        <div class="notification-content">
            <p>${message}</p>
            ${detailsHTML}
        </div>
        <button class="close-notification" title="Close"><span class="material-symbols-outlined">close</span></button>
    `;

  notificationContainer.appendChild(notification);

  const closeButton = notification.querySelector(".close-notification");
  const close = () => {
    notification.classList.add("fade-out");
    notification.addEventListener("animationend", () => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });
  };

  closeButton.addEventListener("click", close);
  setTimeout(close, 5000);
}
