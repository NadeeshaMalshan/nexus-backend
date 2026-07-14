import { chooseFormat, getInfo } from "@distube/ytdl-core";
import type ytdl from "@distube/ytdl-core";
import play from "play-dl";
import redis from "./redis";
import axios from "axios";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type PlayerClients = NonNullable<Parameters<typeof getInfo>[1]>["playerClients"];

function cookieHeader(): Record<string, string> {
  const raw = process.env.YOUTUBE_COOKIE?.trim();
  if (!raw) return {};
  return { Cookie: raw };
}

function baseRequestOptions() {
  return {
    headers: {
      "User-Agent": CHROME_UA,
      "Accept-Language": "en-US,en;q=0.9",
      ...cookieHeader(),
    },
  };
}

export function getYtdlSharedOptions(playerClients?: PlayerClients) {
  const opts: Parameters<typeof getInfo>[1] = {
    requestOptions: baseRequestOptions(),
  };
  if (playerClients?.length) opts.playerClients = playerClients;
  return opts;
}

function pickFormatUrl(formats: ytdl.videoFormat[]): string | null {
  if (!formats?.length) return null;

  const tryChoose = (opts: ytdl.chooseFormatOptions) => {
    try {
      const f = chooseFormat(formats, opts);
      if (f?.url) return f.url;
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

const CLIENT_STRATEGIES: (PlayerClients | undefined)[] = [
  undefined,
  ["ANDROID", "IOS", "WEB", "WEB_EMBEDDED", "TV"],
  ["IOS", "ANDROID", "TV"],
  ["WEB", "ANDROID", "IOS"],
];

export async function getYoutubeInfoWithRetry(videoUrl: string) {
  let last: unknown;
  for (const clients of CLIENT_STRATEGIES) {
    try {
      return await getInfo(videoUrl, getYtdlSharedOptions(clients));
    } catch (e) {
      last = e;
    }
  }
  console.warn("[youtubeDirectAudioUrl] getInfo (all clients):", last instanceof Error ? last.message : last);
  throw last instanceof Error ? last : new Error(String(last));
}

export async function getYoutubeDirectAudioUrl(videoId: string, isLive: boolean = false): Promise<string | null> {
  const cacheKey = `audiourl:${videoId}:${isLive}`;

  if (redis) {
    try {
      const cached = await redis.get<string>(cacheKey);
      if (cached) {
        console.log(`[youtubeDirectAudioUrl] Serving cached URL for ${videoId} from Redis`);
        return cached;
      }
    } catch (err) {
      console.error("[youtubeDirectAudioUrl] Redis read error:", err);
    }
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let resolvedUrl: string | null = null;

  try {
    const info = await getYoutubeInfoWithRetry(videoUrl);
    const url = pickFormatUrl(info.formats);
    if (url) resolvedUrl = url;
  } catch {
    /* all ytdl strategies failed or unusable */
  }

  if (!resolvedUrl) {
    try {
      const stream = await play.stream(videoUrl, { quality: isLive ? 0 : 2 });
      const url =
        stream && typeof stream === "object" && stream !== null && "url" in stream
          ? String((stream as unknown as { url: string }).url)
          : "";
      if (url) resolvedUrl = url;
    } catch (e) {
      console.warn("[youtubeDirectAudioUrl] play-dl:", e instanceof Error ? e.message : e);
    }
  }

  if (!resolvedUrl) {
    const piped = await getPipedAudioUrl(videoId);
    if (piped) resolvedUrl = piped;
  }

  if (resolvedUrl && redis) {
    try {
      await redis.set(cacheKey, resolvedUrl, { ex: 7200 });
      console.log(`[youtubeDirectAudioUrl] Saved URL for ${videoId} to Redis cache`);
    } catch (err) {
      console.error("[youtubeDirectAudioUrl] Redis write error:", err);
    }
  }

  return resolvedUrl;
}

type PipedStreamsResponse = { audioStreams?: Array<{ url?: string; bitrate?: number; mimeType?: string }> };

export async function getPipedAudioUrl(videoId: string): Promise<string | null> {
  const raw = process.env.PIPED_API_BASE_URL?.trim();
  if (raw?.toLowerCase() === "off" || raw === "0") return null;

  const bases = raw
    ? [raw.replace(/\/+$/, "")]
    : [
        "https://pipedapi.projectsegfau.lt",
        "https://pipedapi.swish.moe",
        "https://pipedapi.sugoi.host",
        "https://piped-api.kuoushi.com",
        "https://pipedapi.kavin.rocks"
      ];

  for (const base of bases) {
    try {
      const response = await axios.get<PipedStreamsResponse>(`${base}/streams/${encodeURIComponent(videoId)}`, {
        timeout: 6000,
        headers: {
          Accept: "application/json",
          "User-Agent": CHROME_UA,
        },
      });

      const streams = response.data?.audioStreams;
      if (!Array.isArray(streams) || streams.length === 0) continue;

      const withUrl = streams.filter((s): s is typeof s & { url: string } => typeof s.url === "string" && s.url.length > 0);
      if (withUrl.length === 0) continue;

      withUrl.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      console.log(`[youtubeDirectAudioUrl] Got stream URL from Piped instance: ${base}`);
      return withUrl[0].url;
    } catch (e) {
      console.warn(`[youtubeDirectAudioUrl] Piped instance ${base} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}
