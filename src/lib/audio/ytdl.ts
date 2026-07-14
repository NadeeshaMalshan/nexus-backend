import ytdl from "@distube/ytdl-core";
import { AudioLogger } from "./logger";
import { YouTubeResolverError } from "./errors";

const { chooseFormat, getInfo } = ytdl;

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type PlayerClients = NonNullable<Parameters<typeof getInfo>[1]>["playerClients"];

function baseRequestOptions() {
  return {
    headers: {
      "User-Agent": CHROME_UA,
      "Accept-Language": "en-US,en;q=0.9",
    },
  };
}

export function getYtdlSharedOptions(playerClients?: PlayerClients) {
  const opts: Parameters<typeof getInfo>[1] = {
    requestOptions: baseRequestOptions(),
  };
  if (playerClients?.length) {
    opts.playerClients = playerClients;
  }
  return opts;
}

function pickFormatUrl(formats: ytdl.videoFormat[]): string | null {
  if (!formats?.length) {
    return null;
  }

  const tryChoose = (opts: ytdl.chooseFormatOptions) => {
    try {
      const f = chooseFormat(formats, opts);
      if (f?.url) {
        return f.url;
      }
    } catch {
      /* next */
    }
    return null;
  };

  return (
    tryChoose({ quality: "highestaudio", filter: "audioonly" }) ||
    tryChoose({ quality: "highestaudio", filter: "audio" }) ||
    (() => {
      const sorted = [...formats].filter((f) => f?.url && f.hasAudio);
      sorted.sort((a, b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0));
      return sorted[0]?.url ?? null;
    })()
  );
}

// Simplified client strategies (trying default and then Android/IOS/TV fallback)
const CLIENT_STRATEGIES: (PlayerClients | undefined)[] = [
  undefined,
  ["ANDROID", "IOS", "TV"],
];

/**
 * Resolves direct audio stream URL using ytdl-core with simplified clients list.
 */
export async function resolveYtdlStream(videoId: string): Promise<string | null> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let lastError: unknown;

  for (const clients of CLIENT_STRATEGIES) {
    try {
      AudioLogger.info(
        "ytdl-core",
        `Trying to resolve stream info for ${videoId} using ytdl-core (clients: ${
          clients ? clients.join(", ") : "default"
        })...`
      );
      const info = await getInfo(videoUrl, getYtdlSharedOptions(clients));
      const url = pickFormatUrl(info.formats);
      if (url) {
        AudioLogger.info("ytdl-core", `Successfully resolved direct audio stream URL via ytdl-core for ${videoId}`);
        return url;
      }
    } catch (e: any) {
      lastError = e;
      AudioLogger.warn(
        "ytdl-core",
        `ytdl-core attempt failed for ${videoId} (clients: ${
          clients ? clients.join(", ") : "default"
        }): ${e instanceof Error ? e.message : e}`
      );
    }
  }

  throw new YouTubeResolverError(
    `@distube/ytdl-core failed to resolve audio stream for video ${videoId}`,
    lastError
  );
}
