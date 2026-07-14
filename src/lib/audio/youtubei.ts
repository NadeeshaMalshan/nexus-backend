import { Innertube } from "youtubei.js";
import { AudioLogger } from "./logger";
import { YouTubeResolverError } from "./errors";

export class YouTubeiClient {
  private static instance: Innertube | null = null;
  private static initPromise: Promise<Innertube> | null = null;

  /**
   * Returns the initialized Innertube client singleton instance.
   */
  static async getInstance(): Promise<Innertube> {
    if (this.instance) {
      return this.instance;
    }

    if (!this.initPromise) {
      AudioLogger.info("YouTube", "Initializing Innertube client singleton...");
      this.initPromise = Innertube.create()
        .then((client) => {
          this.instance = client;
          AudioLogger.info("YouTube", "Innertube client singleton initialized successfully");
          return client;
        })
        .catch((err) => {
          this.initPromise = null;
          AudioLogger.error("YouTube", "Failed to initialize Innertube client", err);
          throw new YouTubeResolverError("Failed to initialize youtubei.js client", err);
        });
    }

    return this.initPromise;
  }

  /**
   * Fetches video details, selects the best audio format, and deciphers the stream URL.
   */
  static async resolveStream(videoId: string): Promise<string | null> {
    try {
      const yt = await this.getInstance();
      AudioLogger.info("YouTube", `Fetching video info via youtubei.js for ${videoId}...`);
      const info = await yt.getInfo(videoId);
      
      AudioLogger.info("YouTube", `Choosing best audio format for ${videoId}...`);
      const format = info.chooseFormat({ type: "audio", quality: "best" });
      
      if (!format) {
        AudioLogger.warn("YouTube", `No audio format found for ${videoId}`);
        return null;
      }

      AudioLogger.info("YouTube", `Deciphering audio stream URL for ${videoId}...`);
      const url = await format.decipher(yt.session.player);
      if (url) {
        AudioLogger.info("YouTube", `Successfully resolved audio stream URL via youtubei.js for ${videoId}`);
        return url;
      }
      return null;
    } catch (err: any) {
      AudioLogger.error("YouTube", `youtubei.js failed resolving ${videoId}`, err);
      throw new YouTubeResolverError(`youtubei.js failed to resolve ${videoId}`, err);
    }
  }
}
