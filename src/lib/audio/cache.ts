import redis from "../redis";
import { AudioLogger } from "./logger";
import { CacheError } from "./errors";

export class AudioCache {
  private static getCacheKey(videoId: string, isLive: boolean): string {
    return `audiourl:${videoId}:${isLive}`;
  }

  /**
   * Retrieves a cached stream URL from Redis.
   */
  static async get(videoId: string, isLive: boolean): Promise<string | null> {
    if (!redis) {
      return null;
    }
    const cacheKey = this.getCacheKey(videoId, isLive);
    try {
      const cached = await redis.get<string>(cacheKey);
      if (cached) {
        AudioLogger.info("Redis", `Serving cached URL for ${videoId} from Redis`);
        return cached;
      }
    } catch (err) {
      AudioLogger.error("Redis", `Redis read error for key ${cacheKey}`, err);
      throw new CacheError(`Failed to read from cache for video ${videoId}`, err);
    }
    return null;
  }

  /**
   * Saves a resolved stream URL to Redis with a TTL of 7200 seconds (2 hours).
   */
  static async set(videoId: string, isLive: boolean, url: string, ttlSeconds = 7200): Promise<void> {
    if (!redis) {
      return;
    }
    const cacheKey = this.getCacheKey(videoId, isLive);
    try {
      await redis.set(cacheKey, url, { ex: ttlSeconds });
      AudioLogger.info("Redis", `Saved URL for ${videoId} to Redis cache`);
    } catch (err) {
      AudioLogger.error("Redis", `Redis write error for key ${cacheKey}`, err);
      throw new CacheError(`Failed to write to cache for video ${videoId}`, err);
    }
  }
}
