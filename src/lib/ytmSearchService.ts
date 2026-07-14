import { getYTMusic } from "./ytmClient";
import { formatDuration } from "./format";

const RETRY_DELAY_MS = 300;
const RETRIES = 2;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function searchWithRetry(
  query: string,
  type: "songs" | "videos" | "albums" = "songs"
): Promise<any[]> {
  let lastErr: unknown;
  for (let i = 0; i <= RETRIES; i++) {
    try {
      const ytmusic = await getYTMusic();
      const results =
        type === "songs"
          ? await ytmusic.searchSongs(query)
          : type === "videos"
            ? await ytmusic.searchVideos(query)
            : await (ytmusic as any).searchAlbums(query);
      if (results && results.length > 0) return results.map(mapYTMToMusicVideo);
    } catch (err) {
      lastErr = err;
      if (i < RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }
  console.warn("[ytmSearchService] ytmusic.search failed after retries:", lastErr);
  return [];
}

function mapYTMToMusicVideo(item: any) {
  let artistName = "Unknown Artist";
  if (item.artists) {
    if (Array.isArray(item.artists)) {
      artistName = item.artists.map((a: any) => typeof a === 'string' ? a : (a.name || "Unknown Artist")).join(", ");
    } else if (typeof item.artists === 'object') {
      artistName = item.artists.name || "Unknown Artist";
    } else if (typeof item.artists === 'string') {
      artistName = item.artists;
    }
  } else if (item.artist) {
    if (typeof item.artist === 'object') {
      artistName = item.artist.name || "Unknown Artist";
    } else if (typeof item.artist === 'string') {
      artistName = item.artist;
    }
  }

  let durationSec = 0;
  let formattedDuration = "0:00";
  
  if (typeof item.duration === 'number') {
    durationSec = item.duration;
    formattedDuration = formatDuration(durationSec);
  } else if (item.duration && typeof item.duration === 'object') {
    durationSec = item.duration.totalSeconds || 0;
    formattedDuration = item.duration.label || formatDuration(durationSec);
  } else if (typeof item.duration === 'string') {
    formattedDuration = item.duration;
    const parts = formattedDuration.split(':');
    if (parts.length === 2) {
      durationSec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (parts.length === 3) {
      durationSec = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
  }

  return {
    videoId: item.videoId,
    title: item.name || item.title || "Unknown Title",
    artist: artistName,
    duration: formattedDuration,
    thumbnail: item.thumbnails?.[item.thumbnails.length - 1]?.url || item.thumbnail?.url || item.thumbnail || "",
  };
}

export async function searchSongsRobust(query: string): Promise<any[]> {
  if (!query?.trim()) return [];

  const full = await searchWithRetry(query.trim());
  if (full.length >= 3) return full;

  const stripped = query
    .replace(/\(feat\.?.*?\)/gi, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (stripped !== query.trim()) {
    const clean = await searchWithRetry(stripped);
    if (clean.length >= 3) return clean;
  }

  const words = stripped.split(/\s+/).slice(0, 3).join(" ");
  if (words !== stripped) {
    const short = await searchWithRetry(words);
    if (short.length > 0) return short;
  }

  return full.length > 0 ? full : [];
}

export async function searchVideosRobust(query: string): Promise<any[]> {
  if (!query?.trim()) return [];
  const res = await searchWithRetry(query, "videos");
  return res || [];
}

export async function searchAlbumsRobust(query: string): Promise<any[]> {
  if (!query?.trim()) return [];

  const full = await searchWithRetry(query.trim(), "albums");
  if (full.length >= 3) return full;

  const stripped = query
    .replace(/\(feat\.?.*?\)/gi, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (stripped !== query.trim()) {
    const clean = await searchWithRetry(stripped, "albums");
    if (clean.length >= 3) return clean;
  }

  const words = stripped.split(/\s+/).slice(0, 3).join(" ");
  if (words !== stripped) {
    const short = await searchWithRetry(words, "albums");
    if (short.length > 0) return short;
  }

  return full.length > 0 ? full : [];
}

export async function searchArtistsRobust(query: string): Promise<any[]> {
  if (!query?.trim()) return [];
  try {
    const ytmusic = await getYTMusic();
    const results = await ytmusic.searchArtists(query);
    return results.map((a: any) => ({
      type: "ARTIST",
      id: a.artistId,
      name: a.name,
      thumbnail: a.thumbnails?.[a.thumbnails.length - 1]?.url || "",
    }));
  } catch (err) {
    console.error("[ytmSearchService] searchArtists failed:", err);
    return [];
  }
}

export async function searchPlaylistsRobust(query: string): Promise<any[]> {
  if (!query?.trim()) return [];
  try {
    const ytmusic = await getYTMusic();
    const results = await ytmusic.searchPlaylists(query);
    return results.map((p: any) => ({
      type: "PLAYLIST",
      id: p.playlistId,
      title: p.name,
      author: p.author || "YouTube Music",
      thumbnail: p.thumbnails?.[p.thumbnails.length - 1]?.url || "",
    }));
  } catch (err) {
    console.error("[ytmSearchService] searchPlaylists failed:", err);
    return [];
  }
}
