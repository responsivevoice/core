import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter, type EventPayload } from '../../events/emitter';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter(false); // Disable DOM events for testing
  });

  describe('on/addEventListener', () => {
    it('should add event listeners', () => {
      const callback = vi.fn();
      emitter.on('OnStart', callback);
      expect(emitter.listenerCount('OnStart')).toBe(1);
    });

    it('should allow multiple listeners for same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      emitter.on('OnStart', callback1);
      emitter.on('OnStart', callback2);
      expect(emitter.listenerCount('OnStart')).toBe(2);
    });

    it('addEventListener should work as alias for on', () => {
      const callback = vi.fn();
      emitter.addEventListener('OnEnd', callback);
      expect(emitter.listenerCount('OnEnd')).toBe(1);
    });
  });

  describe('off/removeEventListener', () => {
    it('should remove event listeners', () => {
      const callback = vi.fn();
      emitter.on('OnStart', callback);
      emitter.off('OnStart', callback);
      expect(emitter.listenerCount('OnStart')).toBe(0);
    });

    it('should only remove specified listener', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      emitter.on('OnStart', callback1);
      emitter.on('OnStart', callback2);
      emitter.off('OnStart', callback1);
      expect(emitter.listenerCount('OnStart')).toBe(1);
    });

    it('removeEventListener should work as alias for off', () => {
      const callback = vi.fn();
      emitter.on('OnEnd', callback);
      emitter.removeEventListener('OnEnd', callback);
      expect(emitter.listenerCount('OnEnd')).toBe(0);
    });
  });

  describe('emit', () => {
    it('should call listeners with void payload', () => {
      const callback = vi.fn();
      emitter.on('OnStart', callback);
      emitter.emit('OnStart');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call listeners with typed payload', () => {
      const callback = vi.fn();
      emitter.on('OnError', callback);
      const payload: EventPayload['OnError'] = {
        error: new Error('test'),
        message: 'Test error',
      };
      emitter.emit('OnError', payload);
      expect(callback).toHaveBeenCalledWith(payload);
    });

    it('should call all listeners for an event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      emitter.on('OnEnd', callback1);
      emitter.on('OnEnd', callback2);
      emitter.emit('OnEnd');
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should not throw if no listeners', () => {
      expect(() => emitter.emit('OnStart')).not.toThrow();
    });

    it('should handle errors in listeners gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Listener error');
      });
      const normalCallback = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      emitter.on('OnStart', errorCallback);
      emitter.on('OnStart', normalCallback);

      emitter.emit('OnStart');

      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled(); // Should still be called despite error
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('once', () => {
    it('should call listener only once', () => {
      const callback = vi.fn();
      emitter.once('OnStart', callback);
      emitter.emit('OnStart');
      emitter.emit('OnStart');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should remove listener after first call', () => {
      const callback = vi.fn();
      emitter.once('OnStart', callback);
      expect(emitter.listenerCount('OnStart')).toBe(1);
      emitter.emit('OnStart');
      expect(emitter.listenerCount('OnStart')).toBe(0);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for specific event', () => {
      emitter.on('OnStart', vi.fn());
      emitter.on('OnStart', vi.fn());
      emitter.on('OnEnd', vi.fn());

      emitter.removeAllListeners('OnStart');

      expect(emitter.listenerCount('OnStart')).toBe(0);
      expect(emitter.listenerCount('OnEnd')).toBe(1);
    });

    it('should remove all listeners when no event specified', () => {
      emitter.on('OnStart', vi.fn());
      emitter.on('OnEnd', vi.fn());
      emitter.on('OnError', vi.fn());

      emitter.removeAllListeners();

      expect(emitter.listenerCount('OnStart')).toBe(0);
      expect(emitter.listenerCount('OnEnd')).toBe(0);
      expect(emitter.listenerCount('OnError')).toBe(0);
    });
  });

  describe('hasListeners', () => {
    it('should return true when listeners exist', () => {
      emitter.on('OnStart', vi.fn());
      expect(emitter.hasListeners('OnStart')).toBe(true);
    });

    it('should return false when no listeners', () => {
      expect(emitter.hasListeners('OnStart')).toBe(false);
    });
  });

  describe('eventNames', () => {
    it('should return array of event types with listeners', () => {
      emitter.on('OnStart', vi.fn());
      emitter.on('OnEnd', vi.fn());

      const names = emitter.eventNames();

      expect(names).toContain('OnStart');
      expect(names).toContain('OnEnd');
      expect(names).not.toContain('OnError');
    });

    it('should return empty array when no listeners', () => {
      expect(emitter.eventNames()).toEqual([]);
    });
  });

  describe('DOM CustomEvent dispatch', () => {
    it('should dispatch DOM events when enabled', () => {
      const domEmitter = new EventEmitter(true);
      const listener = vi.fn();

      document.addEventListener('ResponsiveVoice_OnStart', listener);
      domEmitter.emit('OnStart');

      expect(listener).toHaveBeenCalled();

      document.removeEventListener('ResponsiveVoice_OnStart', listener);
    });

    it('should not dispatch DOM events when disabled', () => {
      const domEmitter = new EventEmitter(false);
      const listener = vi.fn();

      document.addEventListener('ResponsiveVoice_OnStart', listener);
      domEmitter.emit('OnStart');

      expect(listener).not.toHaveBeenCalled();

      document.removeEventListener('ResponsiveVoice_OnStart', listener);
    });

    it('should include payload in CustomEvent detail', () => {
      const domEmitter = new EventEmitter(true);
      let receivedDetail: unknown = null;

      const listener = (event: Event) => {
        receivedDetail = (event as CustomEvent).detail;
      };

      document.addEventListener('ResponsiveVoice_OnServiceSwitched', listener);

      const payload: EventPayload['OnServiceSwitched'] = {
        from: 'native',
        to: 'fallback',
      };
      domEmitter.emit('OnServiceSwitched', payload);

      expect(receivedDetail).toEqual(payload);

      document.removeEventListener('ResponsiveVoice_OnServiceSwitched', listener);
    });

    it('should allow toggling DOM event dispatch', () => {
      const domEmitter = new EventEmitter(true);
      const listener = vi.fn();

      document.addEventListener('ResponsiveVoice_OnStart', listener);

      domEmitter.emit('OnStart');
      expect(listener).toHaveBeenCalledTimes(1);

      domEmitter.setDispatchDOMEvents(false);
      domEmitter.emit('OnStart');
      expect(listener).toHaveBeenCalledTimes(1); // Still 1

      document.removeEventListener('ResponsiveVoice_OnStart', listener);
    });
  });
});
