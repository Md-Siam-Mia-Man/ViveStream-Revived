import { eventBus } from '../../../src/renderer/js/event-bus.js';

describe('Event Bus', () => {
  beforeEach(() => {
    // Clear events before each test to ensure isolation
    eventBus.events = {};
  });

  test('should subscribe to and receive events', () => {
    const callback = jest.fn();
    eventBus.on('test-event', callback);
    eventBus.emit('test-event', 'payload');

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('payload');
  });

  test('should handle multiple listeners for same event', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();

    eventBus.on('multi-event', cb1);
    eventBus.on('multi-event', cb2);

    eventBus.emit('multi-event');

    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  test('should unsubscribe (off) correctly', () => {
    const callback = jest.fn();
    eventBus.on('temp-event', callback);

    eventBus.emit('temp-event', 1);
    eventBus.off('temp-event', callback);
    eventBus.emit('temp-event', 2);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(1);
  });

  test('should handle emit with no listeners safely', () => {
    expect(() => {
      eventBus.emit('non-existent-event');
    }).not.toThrow();
  });

  test('should pass multiple arguments', () => {
    const callback = jest.fn();
    eventBus.on('args-event', callback);
    eventBus.emit('args-event', 1, 2, 3);

    expect(callback).toHaveBeenCalledWith(1, 2, 3);
  });
});
