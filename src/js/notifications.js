const notificationContainer = document.getElementById("notification-container");

function showNotification(message, type = "success") {
  if (!notificationContainer) return;

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;

  const iconClass =
    type === "success" ? "fa-check-circle" : "fa-exclamation-triangle";
  notification.innerHTML = `
        <i class="fas ${iconClass}"></i>
        <p>${message}</p>
        <button class="close-notification"><i class="fas fa-xmark"></i></button>
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
  setTimeout(close, 2000);
}
