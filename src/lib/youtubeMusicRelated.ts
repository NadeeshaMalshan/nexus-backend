import { searchSongsRobust } from "./ytmSearchService";
import { formatDuration } from "./format";
import { getYTMusic } from "./ytmClient";

const RETRIES = 2;
const RETRY_DELAY_MS = 400;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSuggestionsWithRetry(videoId: string): Promise<any[]> {
  for (let i = 0; i <= RETRIES; i++) {
    try {
      if (!videoId) return [];
      const ytmusic = await getYTMusic();
      const suggestions = await ytmusic.getUpNexts(videoId);

      if (suggestions && suggestions.length > 0) {
        return suggestions.map((item: any) => {
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
          
          if (typeof (item as any).duration === 'number') {
            durationSec = (item as any).duration;
            formattedDuration = formatDuration(durationSec);
          } else if ((item as any).duration && typeof (item as any).duration === 'object') {
            durationSec = (item as any).duration.totalSeconds || 0;
            formattedDuration = (item as any).duration.label || formatDuration(durationSec);
          } else if (typeof (item as any).duration === 'string') {
            formattedDuration = (item as any).duration;
            const parts = formattedDuration.split(':');
            if (parts.length === 2) durationSec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
            else if (parts.length === 3) durationSec = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
          }

          return {
            youtubeId: item.videoId,
            title: item.title || item.name || "Unknown Title",
            artist: artistName,               
            duration: formattedDuration,      
            thumbnail: item.thumbnails?.[item.thumbnails.length - 1]?.url || item.thumbnail?.url || item.thumbnail || "",
          };
        });
      }
    } catch (err: any) {
      const status = err?.response?.status || err?.status;
      console.warn(`[youtubeMusicRelated] Attempt ${i + 1} failed for ${videoId} (Status: ${status}):`, err?.message || err);
      
      if (status === 400) {
        console.warn("[youtubeMusicRelated] 400 Bad Request - returning empty array to prevent blocking.");
        return [];
      }

      if (i < RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }
  return [];
}

export async function getRelatedTracksRobust(videoId: string): Promise<any[]> {
  if (!videoId?.trim()) return [];

  const suggestions = await fetchSuggestionsWithRetry(videoId.trim());
  if (suggestions.length > 0) return suggestions;

  console.warn("[youtubeMusicRelated] Falling back to trending search for:", videoId);
  try {
    const fallback = await searchSongsRobust("trending hits");
    return fallback || [];
  } catch {
    return [];
  }
}
