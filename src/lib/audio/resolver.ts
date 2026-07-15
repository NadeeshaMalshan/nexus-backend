import { AudioCache } from "./cache";
import { YouTubeiClient } from "./youtubei";
import { resolveYtdlpStream } from "./ytdlp";
import { resolveYtdlStream } from "./ytdl";
import { resolvePipedStream } from "./piped";
import { AudioLogger } from "./logger";
import { AudioResolveError } from "./errors";

/**
 * Helper to wrap a promise in a timeout.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let settled = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`${name} resolution timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
  });
  
  return Promise.race([
    promise.then(
      (val) => {
        settled = true;
        if (timer) clearTimeout(timer);
        return val;
      },
      (err) => {
        settled = true;
        if (timer) clearTimeout(timer);
        throw err;
      }
    ),
    timeoutPromise
  ]);
}

/**
 * Resolves a direct audio stream URL for a YouTube video.
 * Uses a tiered strategy:
 * 1. Redis Cache lookup
 * 2. youtubei.js (primary stream resolver)
 * 3. yt-dlp (secondary stream resolver)
 * 4. @distube/ytdl-core (third stream resolver)
 * 5. Piped API instances (final fallback)
 *
 * Expired URLs are automatically refreshed on cache misses.
 *
 * @param videoId The YouTube video ID.
 * @param isLive Whether the video is a live stream.
 * @returns Direct stream URL, or null if resolution fails.
 */
export async function getYoutubeDirectAudioUrl(
  videoId: string,
  isLive: boolean = false
): Promise<string | null> {
  // 1. Try Cache
  try {
    const cachedUrl = await AudioCache.get(videoId, isLive);
    if (cachedUrl) {
      return cachedUrl;
    }
  } catch (err) {
    // Log cache read error, but don't fail resolution (continue to resolve)
    AudioLogger.warn("Cache", `Failed to read cache for ${videoId}, proceeding with resolution`, err);
  }

  let resolvedUrl: string | null = null;
  const errors: Error[] = [];

  // 2. Try youtubei.js (Primary) with a 10s timeout
  try {
    resolvedUrl = await withTimeout(
      YouTubeiClient.resolveStream(videoId),
      10000,
      "youtubei.js"
    );
  } catch (err: any) {
    errors.push(err);
    AudioLogger.warn("YouTube", `youtubei.js resolver failed/timed out for ${videoId}. Trying fallback yt-dlp...`);
  }

  // 3. Try yt-dlp (Secondary fallback) with a 10s timeout
  if (!resolvedUrl) {
    try {
      resolvedUrl = await withTimeout(
        resolveYtdlpStream(videoId),
        10000,
        "yt-dlp"
      );
    } catch (err: any) {
      errors.push(err);
      AudioLogger.warn("yt-dlp", `yt-dlp resolver failed/timed out for ${videoId}. Trying fallback ytdl-core...`);
    }
  }

  // 4. Try @distube/ytdl-core (Tertiary fallback) with a 3.5s timeout
  if (!resolvedUrl) {
    try {
      resolvedUrl = await withTimeout(
        resolveYtdlStream(videoId),
        3500,
        "ytdl-core"
      );
    } catch (err: any) {
      errors.push(err);
      AudioLogger.warn("ytdl-core", `ytdl-core fallback failed/timed out for ${videoId}. Trying fallback Piped...`);
    }
  }

  // 4. Try Piped (Final fallback)
  if (!resolvedUrl) {
    try {
      resolvedUrl = await resolvePipedStream(videoId);
    } catch (err: any) {
      errors.push(err);
      AudioLogger.error("Piped", `Piped fallback failed for ${videoId}`);
    }
  }

  // If we resolved a URL, cache it and return it
  if (resolvedUrl) {
    try {
      await AudioCache.set(videoId, isLive, resolvedUrl);
    } catch (err) {
      // Log cache write error, but don't fail the request
      AudioLogger.warn("Cache", `Failed to write cache for ${videoId}`, err);
    }
    return resolvedUrl;
  }

  // If all attempts failed, throw a consolidated error
  const consolidatedError = new AudioResolveError(
    `Failed to resolve direct audio URL for video ${videoId} after trying all resolvers.`,
    errors
  );
  throw consolidatedError;
}
