// src/renderer/js/utils.js

/**
 * Formats a duration in seconds into a HH:MM:SS or MM:SS string.
 * @param {number} seconds - The duration in seconds.
 * @returns {string} The formatted time string.
 */
export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  // Create a date object at the Unix epoch and set the seconds
  const date = new Date(0);
  date.setSeconds(seconds);
  // Get the time string, then slice off the relevant part
  const timeString = date.toISOString().substr(11, 8);
  return seconds < 3600 ? timeString.substr(3) : timeString;
}

/**
 * Creates a debounced function that delays invoking the provided function.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The number of milliseconds to delay.
 * @returns {Function} The new debounced function.
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
