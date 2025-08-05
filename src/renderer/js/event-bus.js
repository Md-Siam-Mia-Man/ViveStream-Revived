// src/renderer/js/event-bus.js

/**
 * A simple event bus for decoupled communication between modules.
 */
class EventBus {
  constructor() {
    this.events = {};
  }

  /**
   * Subscribes to an event.
   * @param {string} eventName - The name of the event.
   * @param {Function} listener - The callback function to execute.
   */
  on(eventName, listener) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(listener);
  }

  /**
   * Unsubscribes from an event.
   * @param {string} eventName - The name of the event.
   * @param {Function} listener - The listener function to remove.
   */
  off(eventName, listener) {
    if (!this.events[eventName]) return;

    const index = this.events[eventName].indexOf(listener);
    if (index > -1) {
      this.events[eventName].splice(index, 1);
    }
  }

  /**
   * Emits an event, calling all subscribed listeners.
   * @param {string} eventName - The name of the event.
   * @param  {...any} args - Arguments to pass to the listeners.
   */
  emit(eventName, ...args) {
    if (!this.events[eventName]) return;

    // Call each listener with the provided arguments
    this.events[eventName].forEach((listener) => {
      listener(...args);
    });
  }
}

// Export a singleton instance for the entire app to use.
export const eventBus = new EventBus();
