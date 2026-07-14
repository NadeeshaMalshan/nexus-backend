import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { searchSongsRobust, searchVideosRobust, searchAlbumsRobust, searchArtistsRobust, searchPlaylistsRobust } from "./lib/ytmSearchService";
import { getYoutubeDirectAudioUrl } from "./lib/youtubeDirectAudioUrl";
import { getRelatedTracksRobust } from "./lib/youtubeMusicRelated";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 1. Health check endpoint
app.get("/api/ping", (req, res) => {
  res.json({ status: "ok", message: "pong" });
});

// 2. Music Search Endpoint
app.get("/api/search", async (req, res) => {
  const query = req.query.q as string;
  if (!query) {
    res.status(400).json({ error: "Missing query parameter 'q'" });
    return;
  }

  try {
    const songs = await searchSongsRobust(query);
    res.json(songs);
  } catch (error: any) {
    console.error(`[Express] Search error for query "${query}":`, error);
    res.status(500).json({ error: error.message || "Failed to search songs" });
  }
});

// 3. Audio Streaming URL Endpoint
app.get("/api/get-audio-url", async (req, res) => {
  const videoId = req.query.videoId as string;
  const isLive = req.query.isLive === "true";

  if (!videoId) {
    res.status(400).json({ error: "Missing parameter 'videoId'" });
    return;
  }

  try {
    const url = await getYoutubeDirectAudioUrl(videoId, isLive);
    if (!url) {
      res.status(404).json({ error: "Direct audio stream URL not found" });
      return;
    }
    res.json({ url });
  } catch (error: any) {
    console.error(`[Express] Audio URL extraction failed for video ${videoId}:`, error);
    res.status(500).json({ error: error.message || "Extraction failed" });
  }
});

// 4. SSE AI Recommendations Endpoint
app.post("/api/recommendations", async (req, res) => {
  const { prompt, recentTrackId } = req.body;

  // Set headers for Server-Sent Events (SSE)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendStatus = (status: string) => {
    res.write(`data: ${JSON.stringify({ status })}\n\n`);
  };
  const sendResult = (result: any) => {
    res.write(`data: ${JSON.stringify({ result })}\n\n`);
  };
  const sendError = (error: string) => {
    res.write(`data: ${JSON.stringify({ error })}\n\n`);
  };

  try {
    sendStatus("Initializing quantum neural weights...");

    if (recentTrackId) {
      sendStatus("Scouting the Grid database...");
      console.log(`[Express] Fetching related tracks for: ${recentTrackId}`);
      const related = await getRelatedTracksRobust(recentTrackId);
      const recommendations = related.map((t: any) => ({
        youtubeId: t.youtubeId,
        title: t.title,
        artist: t.artist,
        thumbnail: t.thumbnail || t.thumbnailUrl,
        duration: t.duration,
        reason: "Related to playing track"
      }));

      sendStatus("Polishing final setlist...");
      sendResult({
        title: "More songs like current song",
        description: "Recommended tracks similar to the current song",
        cover_url: recommendations[0]?.thumbnail || "",
        recommendations
      });
      res.end();
      return;
    }

    sendStatus("Analyzing taste profile...");
    
    // We don't have NextAuth tokens directly on client Express requests here, so call HF space directly
    sendStatus("Scouting the Grid database...");
    const backendBaseUrl = process.env.PYTHON_AI_BACKEND_URL || "https://nadeeshamalshan-nexusai.hf.space";
    const pythonEndpoint = `${backendBaseUrl}/api/recommendations`;

    console.log(`[Express] Calling Python AI Backend at: ${pythonEndpoint}`);

    const pythonRes = await axios.post(pythonEndpoint, {
      user_id: "default_user",
      prompt: prompt || "Personalized Mix",
      raw_history: []
    });

    const data = pythonRes.data;
    
    sendStatus("Synthesizing melodic sequences...");
    let recommendations: any[] = [];

    if (data.queries && data.queries.length > 0) {
      sendStatus("Structuring neural flow...");
      const seenIds = new Set<string>();
      for (const q of data.queries) {
        if (recommendations.length >= 20) break;
        try {
          const results = await searchSongsRobust(q);
          for (const item of results) {
            if (item.videoId && !seenIds.has(item.videoId)) {
              seenIds.add(item.videoId);
              recommendations.push({
                youtubeId: item.videoId,
                title: item.title,
                artist: item.artist,
                thumbnail: item.thumbnail,
                reason: "AI Taste Prediction"
              });
              if (recommendations.length >= 20) break;
            }
          }
        } catch (err) {
          console.error(`[Express] Search failed for query "${q}":`, err);
        }
      }
    }

    if (recommendations.length === 0) {
      sendError("No playable tracks found on YouTube Music. Please try a different query.");
      res.end();
      return;
    }

    sendStatus("Polishing final setlist...");
    sendResult({
      title: data.title,
      description: data.description,
      cover_url: data.cover_url,
      taste_vibe: data.taste_vibe,
      recommendations
    });
    res.end();
  } catch (error: any) {
    console.error("[Express Recommendations Proxy] Error:", error);
    sendError(error.message || "AI backend error");
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`[Express Backend] Server running on port ${PORT}`);
});
