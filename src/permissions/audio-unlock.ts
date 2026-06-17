/**
 * Mobile Audio Unlock Utilities
 *
 * On iOS and Android, audio elements must be "unlocked" by loading/playing
 * audio during a user gesture. This module provides utilities for this purpose.
 *
 * The legacy implementation loaded a silent audio file into each pool element
 * on the first user click event to prepare them for playback.
 */

import type { AudioPool } from '../audio';
import type { PlatformInfo } from '../platform';

/**
 * Silent MP3 audio (base64 encoded)
 * This is a minimal valid MP3 file that produces no audible sound
 */
const SILENT_AUDIO_SRC =
  'data:audio/mpeg;base64,/+NIxAAAAAAAAAAAAFhpbmcAAAAPAAAAEwAACZAAIiIiIiIqKioqKjMzMzMzRERERERETExMTExdXV1dXWZmZmZmd3d3d3d3gICAgICRkZGRkZmZmZmZqqqqqqqqs7Ozs7PExMTExMzMzMzM3d3d3d3d5ubm5ub39/f39///////AAAAUExBTUUzLjEwMAQoAAAAAAAAAAAVCCQCQCEAAeAAAAmQ/qJL7wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+NIxAAGkAJAGAAAAABn///////////////6w//L/IeGCGc//+U61QAP/4LmWycNjPzmXtEL0VxbXSoQaadV7pSNs2X6hJ3Ok1a9yNRtf7ddPJrLR2nyP/p/30b0OdF6Su29GKp9Ls6LORkWRJ1sOsGr4mUADf9n/P+9v/FR5t08rK1UubPiChtJS2Yoop4MH48ec+PjR01tJJOmX8O3Mvmf//nf6s7pnCzO5wl8y7aVyzX5lLGdCKJYgd6S33q26FtBZVczczydHIbM6oMQuaUADf9n/9v//js/ijDGj7uNKCaLVPLY2TzXwmkzHCZrHdGypjNcBdIf+cssK+/f4397ez1JaRw1aI3FlV5ubTY1LQIWVb2m7K89qpjxLf5g/+MYxPgS5FZAeADFKNGO6mh1fMqEEQGWqWYmg3FqAA2vQlp77/uffWS702wqfv8vFD5PuNitqPG8p77pLmWf/+/HA5ryUlu7/+MYxOcXRFo8eAGHKS//vwnLX//6HPNCIzXla56JRuFPNdKV2pety8ID4VN+uRuoU+VV8zTMMfXYUQ4eh9ZoGKKlPHBCqgAN/+MoxMUX3CY8eAGHKbdmn+OeVJTGIlzpdOsUYwaXtdxnHOiuHjAFIU+ZnMzIo2eVWlxPy//y8rD9GK8OTKZXL6Wply47bXzyeYUcuXSE5qSwGGPcoJv2DchBu8Jw8gGwmW09AA23RXO3nb6WmOopONBSqNIeqnXWiAz7K4XEHwmcIdATmzwV0jJ9s4V/k////+MYxOgYlGo4eAGHLO/5f9nlL8kDpHZv+mbMu4mH7HHuyyqHq6TeK5/8aMjm1eRixEgQJqGo+0p5lQAN/0f477nlU9IqLh3g/+MoxMAV6+48eABHIXO7Otw9wgTCohOLjxNDi9CJZRx1mRayrbDuUE9K1/pzV12nzc/+fe9/4ZerXKtVHrfdcl3Snkp5pGPb7DmYQNJNSh9zwUw9UvZi6fQYM8eKDZqHEZhiAA3/Y/3//e/ncbwBH455AViDJuJXNlQhwMiabt6ZEy6bRZ0EyOvDkSz2KvaZ/+MYxOsWVDY8eAFHJX7d09JbPf7UcpGYFU4MK/TuiMtVI3U+7sa9XVlqveysYtTVmOxmQruJCGeRFdkDcQANv0P3v3+7/3v8/+MoxMwY7F48eAIHLXy7nE/l1671KjRcnSXttqsdJjz2h+kezUHiUdTRuwjpGa8vMy/+f55c7D+2xUlyOfmTv66UvLp0GeRl5WIljlTvLXeKT5Jwvad3F1mByDEbg4DVAA33Y/siOm/FK0CDQEmy6l1gwcQJgyQLX8QIFrg8G8A8hcy4q8OF+ZHkb0p5fP/K/+MYxOsXRCo8eAGFKUPMFnky0+ddOU/S++kPVj1z5qq55m56zXyFmmU0V3mwIsuiUKchEUZjC1y1AA33Y+///fv+5GmZj12N/+MoxMkXhGI8eAGHKcORvd5V0ztA0tUM1d+s21a+e6KTMnBOORPRyKWf/+1Of+f5OxsW9IyZ2uy3M/mef1/vzuZZ1+5S4ttla/eWHjROLbPed0N/NGppAxUqAA33YL08vVo7VkuqIZR2GbZVHBO0MUUIGSGq5ID2e8wpwECpKV8878nSmv//S/Ms5dUdI5Hm/+MYxO4W3F48eABHIQiMTfh86Vs7nfvC9Uz8pZcymIeTPMKyUIcIsjkcyeKlrzc2k0CVAA3/Y+Pr/fn//7zv3OWUiaOhGM2//+MoxM0Wy+48eAGHKRjF4VTgSyzCCRr9P73Jc005wH9MiLp5G/2/Kn+yf/86jUqeNwFTqP5fqU4xMbl/8SdmZ/NtnZjdrWFF6UKjAWGFTDC2EeELBAvBAA2vI/f7nm2z7j8yZbGhowotlks7nfrmUdf4x2L/eGdHO1CiZMbZmtjJ08Rr/e+YzL1v///y7/3O/+MYxPQW3G48eAAGPNpFgkl87qjOVlLOrn9vCSGL5fOHCRe/Unm5gbFu+VQFRSCPW4kxnBUHAA2/R//35++f7/8f5UFOi5dp/+MoxNMXs/48eAGHKeb7ShEhrRrJ7ox2Dwom6lJchCIyAxmlmRblJ8/+J///5/9kbi6dYzc7Dzh3ZeZJOeKImygKWGTGRWucLNkQ180DEbzPRTV2MRjGM6SOHQoADfdn/vX13Zq7bvdmzAaHWaYxtxRuGeiA/JGqh7PMwvZd9KC2NEoEYzKdkrrd/Z21t1u7/+MYxPcYhGY4eAGHLTf0v8++Rq1UzJCdC1k5f3yfRSooW/dmui4H0GqxkF8S+GJJmuU6GQOYJDfCiLo9zim9ElBNAA+/gj5S/+MoxNAYHGY8eAGHKKw6Zmxn++StD2qiVTXJhRFSftxQ4s7mwjZjKC1IcjKvv8xXov/77EeQqjPV3az/vqlNe6XVJFSs7UVlR7oxnY/eeRFcis7KrkJGMgtyc+lMAFWYnvEQQh4ViYhGFC/59/vG+MdJtVsaBhUV3+FHcKDf/EVLf/6KCeBWWK2STEFNRTMu/+MYxPIaLG44eAGHLDEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq/+MoxMQVRE48eADFKaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq/+MYxPELK54oGABHoaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

/**
 * Check if the current platform requires mobile audio unlock
 * @param platformInfo - Platform detection results
 * @returns True if mobile audio unlock is needed
 */
export function needsMobileAudioUnlock(platformInfo: PlatformInfo): boolean {
  return platformInfo.isIOS || platformInfo.isAndroid;
}

/**
 * Result of attempting to unlock audio elements
 */
interface AudioUnlockResult {
  /** Whether the unlock was successful */
  success: boolean;
  /** Number of elements successfully unlocked */
  unlockedCount: number;
  /** Total number of elements attempted */
  totalCount: number;
  /** Error message if unlock failed */
  error?: string;
}

/**
 * Unlock audio elements in a pool for mobile playback
 *
 * On iOS and Android, audio elements cannot play until they have been
 * "activated" by user interaction. This function loads a silent audio
 * file and attempts to play/pause each element to unlock them.
 *
 * Call this function during a user gesture (click, touch, etc.)
 *
 * @param pool - The AudioPool to unlock
 * @returns Promise resolving to unlock result
 */
export async function unlockAudioPool(pool: AudioPool): Promise<AudioUnlockResult> {
  // Pool must be initialized first
  if (!pool.isInitialized()) {
    pool.getNext(); // Force initialization by getting an element
  }

  const totalCount = pool.getSize();
  let unlockedCount = 0;

  try {
    // We need to iterate over all pool elements
    // Since the pool uses round-robin, getting size elements will cycle through all
    const promises: Promise<void>[] = [];

    for (let i = 0; i < totalCount; i++) {
      const audio = pool.getNext();

      const unlockPromise = (async () => {
        try {
          // Set silent audio source
          audio.src = SILENT_AUDIO_SRC;
          audio.load();

          // Attempt to play (this may succeed or fail depending on browser state)
          await audio.play();

          // Immediately pause - we just needed to "touch" the audio context
          audio.pause();
          audio.currentTime = 0;

          unlockedCount++;
        } catch {
          // Play may fail on some browsers/states - that's okay
          // The load() call alone may be enough to unlock on some platforms
          unlockedCount++; // Still count it as we attempted
        }
      })();

      promises.push(unlockPromise);
    }

    await Promise.all(promises);

    return {
      success: true,
      unlockedCount,
      totalCount,
    };
  } catch (error) {
    return {
      success: false,
      unlockedCount,
      totalCount,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if audio elements appear to be unlocked
 * This is a heuristic check - not 100% reliable
 *
 * @param pool - The AudioPool to check
 * @returns True if audio appears to be unlocked
 */
export function isAudioPoolUnlocked(pool: AudioPool): boolean {
  if (!pool.isInitialized()) {
    return false;
  }

  // Get an element and check if it can be configured
  try {
    const audio = pool.getNext();
    // If we can set properties without error, it's likely unlocked
    audio.volume = 0.5;
    audio.volume = 1;
    return true;
  } catch {
    return false;
  }
}
