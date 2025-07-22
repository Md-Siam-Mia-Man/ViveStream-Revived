// notifications.js
const notificationContainer = document.getElementById("notification-container");

function showNotification(message, type = "success", details = "") {
  if (!notificationContainer) return;

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;

  const detailsHTML = details ? `<span>${details}</span>` : "";
  const iconClass = {
    success: "fa-solid fa-check-circle",
    error: "fa-solid fa-triangle-exclamation",
    info: "fa-solid fa-circle-info",
  }[type];

  notification.innerHTML = `
        <i class="${iconClass} notification-icon"></i>
        <div class="notification-content">
            <p>${message}</p>
            ${detailsHTML}
        </div>
        <button class="close-notification" title="Close"><i class="fa-solid fa-xmark"></i></button>
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
