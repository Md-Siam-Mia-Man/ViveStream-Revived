// notifications.js
const notificationContainer = document.getElementById("notification-container");

function showNotification(message, type = "success", details = "") {
  if (!notificationContainer) return;

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;

  const detailsHTML = details ? `<span>${details}</span>` : "";

  notification.innerHTML = `
        <img src="./assets/svg/Notifications.svg" class="icon-svg notification-icon" alt="Notification">
        <div class="notification-content">
            <p>${message}</p>
            ${detailsHTML}
        </div>
        <button class="close-notification" title="Close">✕</button>
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
