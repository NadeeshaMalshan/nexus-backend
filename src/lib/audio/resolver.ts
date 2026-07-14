import { AudioCache } from "./cache";
import { YouTubeiClient } from "./youtubei";
import { resolveYtdlStream } from "./ytdl";
import { resolvePipedStream } from "./piped";
import { AudioLogger } from "./logger";
import { AudioResolveError } from "./errors";

/**
 * Resolves a direct audio stream URL for a YouTube video.
 * Uses a tiered strategy:
 * 1. Redis Cache lookup
 * 2. youtubei.js (primary stream resolver)
 * 3. @distube/ytdl-core (fallback stream resolver)
 * 4. Piped API instances (final fallback)
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

  // 2. Try youtubei.js (Primary)
  try {
    resolvedUrl = await YouTubeiClient.resolveStream(videoId);
  } catch (err: any) {
    errors.push(err);
    AudioLogger.warn("YouTube", `youtubei.js resolver failed for ${videoId}. Trying fallback ytdl-core...`);
  }

  // 3. Try @distube/ytdl-core (Secondary fallback)
  if (!resolvedUrl) {
    try {
      resolvedUrl = await resolveYtdlStream(videoId);
    } catch (err: any) {
      errors.push(err);
      AudioLogger.warn("ytdl-core", `ytdl-core fallback failed for ${videoId}. Trying fallback Piped...`);
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
