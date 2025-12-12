import { eventBus } from '../../../src/renderer/js/event-bus';

// Jest usually handles imports relative to the test file.
// test/unit/renderer/event-bus.test.js
// ../../../src/renderer/js/event-bus.js
// This path is correct.

describe('Event Bus', () => {
    test('should subscribe and emit events', () => {
        const callback = jest.fn();
        eventBus.on('test-event', callback);
        eventBus.emit('test-event', 'data');
        expect(callback).toHaveBeenCalledWith('data');
    });

    test('should unsubscribe from events', () => {
        const callback = jest.fn();
        eventBus.on('test-event-off', callback);
        eventBus.off('test-event-off', callback);
        eventBus.emit('test-event-off');
        expect(callback).not.toHaveBeenCalled();
    });

    test('should handle multiple listeners', () => {
        const cb1 = jest.fn();
        const cb2 = jest.fn();
        eventBus.on('multi', cb1);
        eventBus.on('multi', cb2);
        eventBus.emit('multi');
        expect(cb1).toHaveBeenCalled();
        expect(cb2).toHaveBeenCalled();
    });
});
