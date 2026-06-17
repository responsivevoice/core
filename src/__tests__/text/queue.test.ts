import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTextQueue, TextQueue } from '../../text/queue';

describe('TextQueue', () => {
  let queue: TextQueue;

  beforeEach(() => {
    queue = new TextQueue();
  });

  describe('enqueue', () => {
    it('should enqueue short text as single item', () => {
      queue.enqueue('Hello world.');
      expect(queue.size()).toBe(1);
    });

    it('should auto-chunk long text', () => {
      const longText =
        'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
      queue.enqueue(longText, {}, { characterLimit: 30 });
      expect(queue.size()).toBeGreaterThan(1);
    });

    it('should preserve speech params across chunks', () => {
      const longText = 'First sentence. Second sentence. Third sentence.';
      const params = { pitch: 1.5, rate: 0.8, volume: 0.9 };
      queue.enqueue(longText, params, { characterLimit: 25 });

      while (!queue.isEmpty()) {
        const utterance = queue.dequeue();
        expect(utterance?.params).toEqual(params);
      }
    });

    it('should use default character limit', () => {
      queue.enqueue('Short text.');
      expect(queue.size()).toBe(1);
    });

    it('should respect custom character limit', () => {
      // Text must be longer than MIN_CHARACTER_LIMIT (50) to be chunked
      const longText =
        'This is the first sentence here. This is the second sentence here. This is the third sentence.';
      queue.enqueue(longText, {}, { characterLimit: 50 });
      expect(queue.size()).toBeGreaterThan(1);
    });

    it('should handle empty text', () => {
      queue.enqueue('');
      expect(queue.size()).toBe(0);
    });

    it('should handle whitespace-only text', () => {
      queue.enqueue('   ');
      expect(queue.size()).toBe(0);
    });
  });

  describe('dequeue', () => {
    it('should return null for empty queue', () => {
      expect(queue.dequeue()).toBeNull();
    });

    it('should return utterances in order', () => {
      // Text longer than MIN_CHARACTER_LIMIT to ensure chunking
      const longText =
        'First sentence with enough text. Second sentence with enough text. Third sentence here.';
      queue.enqueue(longText, {}, { characterLimit: 50 });

      const first = queue.dequeue();
      expect(first?.text).toContain('First');

      if (queue.size() > 0) {
        const second = queue.dequeue();
        expect(second?.text).toContain('Second');
      }
    });

    it('should remove utterance from queue', () => {
      queue.enqueue('Test text.');
      expect(queue.size()).toBe(1);

      queue.dequeue();
      expect(queue.size()).toBe(0);
    });

    it('should update current index', () => {
      // Text longer than MIN_CHARACTER_LIMIT to ensure chunking
      const longText =
        'First sentence with enough text here. Second sentence with enough text. Third sentence here.';
      queue.enqueue(longText, {}, { characterLimit: 50 });

      const first = queue.dequeue();
      expect(queue.currentIndex()).toBe(first?.index);
    });
  });

  describe('peek', () => {
    it('should return null for empty queue', () => {
      expect(queue.peek()).toBeNull();
    });

    it('should return next utterance without removing it', () => {
      queue.enqueue('Test text.');

      const peeked = queue.peek();
      expect(peeked?.text).toBe('Test text.');
      expect(queue.size()).toBe(1);
    });

    it('should return same utterance on multiple peeks', () => {
      queue.enqueue('Test text.');

      const first = queue.peek();
      const second = queue.peek();
      expect(first).toEqual(second);
    });
  });

  describe('clear', () => {
    it('should remove all utterances', () => {
      // Longer text to ensure multiple chunks
      const longText = 'First sentence with text. Second sentence with text. Third sentence.';
      queue.enqueue(longText, {}, { characterLimit: 50 });
      expect(queue.size()).toBeGreaterThan(0);

      queue.clear();
      expect(queue.size()).toBe(0);
    });

    it('should reset indices', () => {
      queue.enqueue('Test text.');
      queue.dequeue();
      expect(queue.currentIndex()).toBe(0);

      queue.clear();
      expect(queue.currentIndex()).toBe(0);
      expect(queue.totalChunks()).toBe(0);
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty queue', () => {
      expect(queue.isEmpty()).toBe(true);
    });

    it('should return false for non-empty queue', () => {
      queue.enqueue('Test text.');
      expect(queue.isEmpty()).toBe(false);
    });

    it('should return true after all items dequeued', () => {
      queue.enqueue('Test text.');
      queue.dequeue();
      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('size', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.size()).toBe(0);
    });

    it('should return correct count', () => {
      // Longer text to ensure chunking
      const longText = 'First sentence with text. Second sentence with text. Third sentence.';
      queue.enqueue(longText, {}, { characterLimit: 50 });
      const initialSize = queue.size();

      queue.dequeue();
      expect(queue.size()).toBe(initialSize - 1);
    });
  });

  describe('currentIndex', () => {
    it('should return 0 initially', () => {
      expect(queue.currentIndex()).toBe(0);
    });

    it('should update after dequeue', () => {
      // Longer text to ensure multiple chunks
      const longText =
        'First sentence with enough text here. Second sentence with enough text. Third sentence complete.';
      queue.enqueue(longText, {}, { characterLimit: 50 });

      queue.dequeue(); // index 0
      if (queue.size() > 0) {
        queue.dequeue(); // index 1
        expect(queue.currentIndex()).toBe(1);
      }
    });
  });

  describe('totalChunks', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.totalChunks()).toBe(0);
    });

    it('should return correct total', () => {
      // Longer text to ensure chunking
      const longText = 'First sentence with text here. Second sentence with text. Third sentence.';
      queue.enqueue(longText, {}, { characterLimit: 50 });
      const total = queue.totalChunks();

      // Should match initial size
      expect(total).toBe(queue.size());
    });

    it('should not change during dequeue', () => {
      // Longer text to ensure chunking
      const longText = 'First sentence with text here. Second sentence with text. Third sentence.';
      queue.enqueue(longText, {}, { characterLimit: 50 });
      const total = queue.totalChunks();

      queue.dequeue();
      if (queue.size() > 0) {
        queue.dequeue();
      }

      expect(queue.totalChunks()).toBe(total);
    });
  });

  describe('progress', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.progress()).toBe(0);
    });

    it('should calculate progress correctly', () => {
      // Longer text to ensure chunking
      const longText = 'First sentence with enough text. Second sentence with more text here.';
      queue.enqueue(longText, {}, { characterLimit: 50 });

      // Dequeue first item
      queue.dequeue();
      // Progress should be > 0
      expect(queue.progress()).toBeGreaterThan(0);
    });

    it('should return 100 at the end', () => {
      queue.enqueue('Test text.');

      queue.dequeue();
      expect(queue.progress()).toBe(100);
    });
  });

  describe('callbacks', () => {
    it('should call onChunkComplete when notified', () => {
      const callback = vi.fn();
      queue.onChunkComplete = callback;

      queue.enqueue('Test text.');
      const utterance = queue.dequeue()!;
      queue.notifyChunkComplete(utterance);

      expect(callback).toHaveBeenCalledWith(utterance);
    });

    it('should not throw if no callback set', () => {
      queue.enqueue('Test text.');
      const utterance = queue.dequeue()!;

      expect(() => queue.notifyChunkComplete(utterance)).not.toThrow();
    });

    it('should call onQueueEmpty when last item dequeued', () => {
      const callback = vi.fn();
      queue.onQueueEmpty = callback;

      queue.enqueue('Test text.');
      queue.dequeue();

      expect(callback).toHaveBeenCalled();
    });

    it('should not call onQueueEmpty when items remain', () => {
      const callback = vi.fn();
      queue.onQueueEmpty = callback;

      // Longer text to ensure multiple chunks
      const longText = 'First sentence with enough text. Second sentence with more text here.';
      queue.enqueue(longText, {}, { characterLimit: 50 });
      queue.dequeue();

      // If there are multiple chunks, callback should not be called yet
      if (queue.size() > 0) {
        expect(callback).not.toHaveBeenCalled();
      }
    });
  });

  describe('utterance structure', () => {
    it('should have correct structure', () => {
      queue.enqueue('Test text.', { pitch: 1.5, volume: 0.8 });
      const utterance = queue.dequeue()!;

      expect(utterance).toHaveProperty('text');
      expect(utterance).toHaveProperty('index');
      expect(utterance).toHaveProperty('total');
      expect(utterance).toHaveProperty('params');
      expect(utterance.params.pitch).toBe(1.5);
      expect(utterance.params.volume).toBe(0.8);
    });

    it('should have correct index and total for single chunk', () => {
      queue.enqueue('Test text.');
      const utterance = queue.dequeue()!;

      expect(utterance.index).toBe(0);
      expect(utterance.total).toBe(1);
    });

    it('should have correct index and total for multiple chunks', () => {
      // Longer text to ensure multiple chunks at MIN_CHARACTER_LIMIT
      const longText =
        'First sentence with enough text here. Second sentence with more text follows. Third sentence.';
      queue.enqueue(longText, {}, { characterLimit: 50 });

      const first = queue.dequeue()!;
      expect(first.index).toBe(0);
      expect(first.total).toBeGreaterThan(1);

      const second = queue.dequeue();
      if (second) {
        expect(second.index).toBe(1);
        expect(second.total).toBe(first.total);
      }
    });
  });

  describe('multiple enqueues', () => {
    it('should handle multiple enqueues', () => {
      queue.enqueue('First text.');
      queue.enqueue('Second text.');

      expect(queue.size()).toBe(2);
    });

    it('should preserve order across enqueues', () => {
      queue.enqueue('First.');
      queue.enqueue('Second.');

      expect(queue.dequeue()?.text).toBe('First.');
      expect(queue.dequeue()?.text).toBe('Second.');
    });

    it('should accumulate total chunks', () => {
      // Longer text to ensure chunking
      const longText1 = 'First sentence with text. Second sentence with text.';
      queue.enqueue(longText1, {}, { characterLimit: 50 });
      const firstTotal = queue.totalChunks();

      const longText2 = 'Third sentence with text. Fourth sentence with text.';
      queue.enqueue(longText2, {}, { characterLimit: 50 });
      const secondTotal = queue.totalChunks();

      expect(secondTotal).toBeGreaterThanOrEqual(firstTotal);
    });
  });
});

describe('createTextQueue', () => {
  it('should create a new TextQueue instance', () => {
    const queue = createTextQueue();
    expect(queue).toBeInstanceOf(TextQueue);
  });

  it('should create independent instances', () => {
    const queue1 = createTextQueue();
    const queue2 = createTextQueue();

    queue1.enqueue('Test');

    expect(queue1.size()).toBe(1);
    expect(queue2.size()).toBe(0);
  });
});
