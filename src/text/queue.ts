/**
 * Text queue for managing multipart utterances
 *
 * This module provides queue management for chunked text, allowing
 * sequential playback of long texts that have been split into
 * multiple speech segments.
 */

import {
  type ChunkerOptions,
  chunkText,
  DEFAULT_CHARACTER_LIMIT,
  type TextChunk,
} from '@responsivevoice/text';
import type { SpeakParams } from '@responsivevoice/types';

/**
 * Represents a queued utterance ready for speech synthesis
 */
export interface QueuedUtterance {
  /** The text to speak */
  text: string;
  /** Zero-based index in the multipart sequence */
  index: number;
  /** Total number of parts in the sequence */
  total: number;
  /** Speech parameters for this utterance */
  params: SpeakParams;
}

/**
 * Callback for chunk completion events
 */
export type ChunkCompleteCallback = (chunk: QueuedUtterance) => void;

/**
 * Callback for queue empty events
 */
export type QueueEmptyCallback = () => void;

/**
 * Options for queue operations
 */
export interface QueueOptions {
  /** Character limit for chunking (default: 100) */
  characterLimit?: number;
  /**
   * Internal character limit that bypasses min/max clamping.
   * Used by voice-aware logic (e.g. 40 chars for CJK + Google remote voices).
   * @internal
   */
  _internalCharacterLimit?: number;
  /** Whether to prioritize sentence boundaries */
  preserveSentences?: boolean;
}

/**
 * Manages a queue of text chunks for sequential speech synthesis
 *
 * The TextQueue handles:
 * - Automatic text chunking on enqueue
 * - Sequential dequeuing for playback
 * - Progress tracking (current index, total chunks)
 * - Event callbacks for chunk completion
 *
 * @example
 * ```typescript
 * const queue = new TextQueue();
 *
 * // Enqueue long text (auto-chunked)
 * queue.enqueue('This is a very long text that will be split...', { volume: 0.8 });
 *
 * // Process chunks
 * while (!queue.isEmpty()) {
 *   const utterance = queue.dequeue();
 *   if (utterance) {
 *     await speak(utterance.text, utterance.params);
 *     queue.onChunkComplete?.(utterance);
 *   }
 * }
 * ```
 */
export class TextQueue {
  private queue: QueuedUtterance[] = [];
  private currentChunkIndex = 0;
  private totalChunksCount = 0;

  /**
   * Callback invoked when a chunk completes
   */
  public onChunkComplete: ChunkCompleteCallback | undefined;

  /**
   * Callback invoked when the queue becomes empty
   */
  public onQueueEmpty: QueueEmptyCallback | undefined;

  /**
   * Adds text to the queue, automatically chunking if necessary
   *
   * @param text - The text to enqueue
   * @param params - Speech parameters for the utterance
   * @param options - Chunking options
   */
  public enqueue(text: string, params: SpeakParams = {}, options: QueueOptions = {}): void {
    const chunkerOptions: ChunkerOptions = {
      characterLimit: options.characterLimit ?? DEFAULT_CHARACTER_LIMIT,
      _internalCharacterLimit: options._internalCharacterLimit,
      preserveSentences: options.preserveSentences,
    };

    const chunks = chunkText(text, chunkerOptions);

    // Convert chunks to queued utterances
    const utterances: QueuedUtterance[] = chunks.map((chunk: TextChunk) => ({
      text: chunk.text,
      index: chunk.index,
      total: chunk.total,
      params,
    }));

    // Add to queue
    this.queue.push(...utterances);

    // Update totals (only if this is the first enqueue or queue was empty)
    if (this.totalChunksCount === 0) {
      this.totalChunksCount = chunks.length;
      this.currentChunkIndex = 0;
    } else {
      // Accumulate totals for multiple enqueues
      this.totalChunksCount += chunks.length;
    }
  }

  /**
   * Removes and returns the next utterance from the queue
   *
   * @returns The next queued utterance, or null if queue is empty
   */
  public dequeue(): QueuedUtterance | null {
    if (this.queue.length === 0) {
      return null;
    }

    const utterance = this.queue.shift()!;
    this.currentChunkIndex = utterance.index;

    // Check if queue is now empty
    if (this.queue.length === 0 && this.onQueueEmpty) {
      this.onQueueEmpty();
    }

    return utterance;
  }

  /**
   * Returns the next utterance without removing it
   *
   * @returns The next queued utterance, or null if queue is empty
   */
  public peek(): QueuedUtterance | null {
    if (this.queue.length === 0) {
      return null;
    }
    return this.queue[0];
  }

  /**
   * Peek at the next N utterances without removing them
   * Useful for pre-buffering upcoming chunks
   * @param count - Number of utterances to peek (default 1)
   * @returns Array of upcoming utterances (may be less than count if queue is shorter)
   */
  public peekNext(count: number = 1): QueuedUtterance[] {
    return this.queue.slice(0, Math.max(0, count));
  }

  /**
   * Clears all utterances from the queue
   */
  public clear(): void {
    this.queue = [];
    this.currentChunkIndex = 0;
    this.totalChunksCount = 0;
  }

  /**
   * Checks if the queue is empty
   *
   * @returns true if queue has no utterances
   */
  public isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Returns the number of utterances in the queue
   *
   * @returns Queue size
   */
  public size(): number {
    return this.queue.length;
  }

  /**
   * Returns the current chunk index (0-based)
   *
   * @returns Current position in the multipart sequence
   */
  public currentIndex(): number {
    return this.currentChunkIndex;
  }

  /**
   * Returns the total number of chunks for the current text
   *
   * @returns Total chunks in the sequence
   */
  public totalChunks(): number {
    return this.totalChunksCount;
  }

  /**
   * Calculates progress as a percentage
   *
   * @returns Progress from 0 to 100
   */
  public progress(): number {
    if (this.totalChunksCount === 0) {
      return 0;
    }
    return Math.round(((this.currentChunkIndex + 1) / this.totalChunksCount) * 100);
  }

  /**
   * Notifies that a chunk has completed
   *
   * @param chunk - The completed chunk
   */
  public notifyChunkComplete(chunk: QueuedUtterance): void {
    if (this.onChunkComplete) {
      this.onChunkComplete(chunk);
    }
  }
}

/**
 * Creates a new TextQueue instance
 *
 * @returns A new TextQueue
 */
export function createTextQueue(): TextQueue {
  return new TextQueue();
}
