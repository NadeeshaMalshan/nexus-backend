import { AudioLogger } from "./logger";
import { YouTubeResolverError } from "./errors";

const { loadYoutubei } = require("./youtubei-loader");

export class YouTubeiClient {
  private static instance: any = null;
  private static initPromise: Promise<any> | null = null;

  /**
   * Returns the initialized Innertube client singleton instance.
   */
  static async getInstance(): Promise<any> {
    if (this.instance) {
      return this.instance;
    }

    if (!this.initPromise) {
      AudioLogger.info("YouTube", "Initializing Innertube client singleton...");
      this.initPromise = (async () => {
        try {
          const { Innertube, UniversalCache } = await loadYoutubei();
          const client = await Innertube.create({
            cache: new UniversalCache(false)
          });
          this.instance = client;
          AudioLogger.info("YouTube", "Innertube client singleton initialized successfully");
          return client;
        } catch (err: any) {
          this.initPromise = null;
          AudioLogger.error("YouTube", "Failed to initialize Innertube client", err);
          throw new YouTubeResolverError("Failed to initialize youtubei.js client", err);
        }
      })();
    }

    return this.initPromise;
  }

  /**
   * Fetches video details, selects the best audio format, and deciphers the stream URL.
   */
  static async resolveStream(videoId: string): Promise<string | null> {
    const clients = ["IOS", "TV", "ANDROID", "WEB", "MWEB"] as const;
    let lastError: any = null;

    for (const clientName of clients) {
      try {
        const yt = await this.getInstance();
        AudioLogger.info("YouTube", `[Fallback Diagnostic] Selected client: ${clientName}. Session player exists: ${!!yt.session?.player}`);
        AudioLogger.info("YouTube", `Fetching video info via youtubei.js for ${videoId} using client ${clientName}...`);
        const info = await yt.getInfo(videoId, { client: clientName as any });
        
        AudioLogger.info("YouTube", `Client ${clientName} playabilityStatus: ${JSON.stringify(info.playability_status)}`);
        AudioLogger.info("YouTube", `Client ${clientName} streamingData exists: ${!!info.streaming_data}`);

        if (!info.streaming_data) {
          AudioLogger.warn("YouTube", `Client ${clientName} returned no streamingData for ${videoId}`);
          continue;
        }

        AudioLogger.info("YouTube", `Choosing best audio format for ${videoId}...`);
        const format = info.chooseFormat({ type: "audio", quality: "best" });
        
        if (!format) {
          AudioLogger.warn("YouTube", `No audio format found for ${videoId} using client ${clientName}`);
          continue;
        }

        AudioLogger.info("YouTube", `Format direct URL exists before decipher: ${!!format.url} (length: ${format.url ? format.url.length : 0})`);
        AudioLogger.info("YouTube", `Deciphering audio stream URL for ${videoId} (calling decipher)...`);
        
        const url = await format.decipher(yt.session.player);
        AudioLogger.info("YouTube", `Deciphered URL result length: ${url ? url.length : 0}`);
        
        if (url) {
          AudioLogger.info("YouTube", `Successfully resolved audio stream URL via youtubei.js (${clientName}) for ${videoId}`);
          return url;
        }
      } catch (err: any) {
        AudioLogger.error("YouTube", `youtubei.js client ${clientName} failed for ${videoId} with exception: ${err?.stack || err?.message || err}`);
        lastError = err;
      }
    }

    throw new YouTubeResolverError(`youtubei.js failed to resolve ${videoId} after trying all clients`, lastError);
  }
}
