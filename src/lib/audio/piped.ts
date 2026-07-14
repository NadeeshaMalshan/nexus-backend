import axios from "axios";
import { AudioLogger } from "./logger";
import { PipedError } from "./errors";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type PipedStreamsResponse = {
  audioStreams?: Array<{ url?: string; bitrate?: number; mimeType?: string }>;
};

/**
 * Fallback to query Piped instances for direct stream URLs.
 */
export async function resolvePipedStream(videoId: string): Promise<string | null> {
  const raw = process.env.PIPED_API_BASE_URL?.trim();
  if (raw?.toLowerCase() === "off" || raw === "0") {
    AudioLogger.info("Piped", "Piped fallback is disabled via PIPED_API_BASE_URL");
    return null;
  }

  const bases = raw
    ? [raw.replace(/\/+$/, "")]
    : [
        "https://pipedapi.projectsegfau.lt",
        "https://pipedapi.swish.moe",
        "https://pipedapi.sugoi.host",
        "https://piped-api.kuoushi.com",
        "https://pipedapi.kavin.rocks"
      ];

  let lastError: unknown = null;

  for (const base of bases) {
    try {
      AudioLogger.info("Piped", `Requesting stream info from Piped instance: ${base} for ${videoId}`);
      const response = await axios.get<PipedStreamsResponse>(
        `${base}/streams/${encodeURIComponent(videoId)}`,
        {
          timeout: 5000, // Explicit timeout to prevent hanging requests
          headers: {
            Accept: "application/json",
            "User-Agent": CHROME_UA,
          },
        }
      );

      const streams = response.data?.audioStreams;
      if (!Array.isArray(streams) || streams.length === 0) {
        AudioLogger.warn("Piped", `No audio streams returned by Piped instance: ${base}`);
        continue;
      }

      const withUrl = streams.filter(
        (s): s is typeof s & { url: string } => typeof s.url === "string" && s.url.length > 0
      );
      if (withUrl.length === 0) {
        AudioLogger.warn("Piped", `Streams list had no valid URLs from Piped instance: ${base}`);
        continue;
      }

      // Sort by highest bitrate
      withUrl.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const url = withUrl[0].url;
      AudioLogger.info("Piped", `Successfully resolved audio stream URL from Piped instance: ${base}`);
      return url;
    } catch (e: any) {
      lastError = e;
      AudioLogger.warn(
        "Piped",
        `Piped instance ${base} failed for ${videoId}: ${e instanceof Error ? e.message : e}`
      );
    }
  }

  throw new PipedError(`All Piped instances failed to resolve audio stream for video ${videoId}`, lastError);
}
