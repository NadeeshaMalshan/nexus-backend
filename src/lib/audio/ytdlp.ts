import { spawn } from "child_process";
import { AudioLogger } from "./logger";
import { YouTubeResolverError } from "./errors";

/**
 * Resolves a direct audio stream URL using yt-dlp.
 * @param videoId The YouTube video ID.
 * @returns Direct Googlevideo stream URL.
 */
export async function resolveYtdlpStream(videoId: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    AudioLogger.info("yt-dlp", `Resolving via yt-dlp for ${videoId}...`);

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const args = ["-f", "bestaudio", "-g", "--no-playlist", url];

    const child = spawn("yt-dlp", args);

    let stdoutData = "";
    let stderrData = "";
    let isFinished = false;

    const timeout = setTimeout(() => {
      if (isFinished) return;
      isFinished = true;
      AudioLogger.error("yt-dlp", `yt-dlp resolution timed out after 10s for ${videoId}`);
      try {
        child.kill("SIGKILL");
      } catch (e) {
        // ignore
      }
      reject(
        new YouTubeResolverError(
          `yt-dlp resolution timed out after 10 seconds for video ${videoId}`
        )
      );
    }, 10000);

    child.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    child.on("error", (err) => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timeout);
      AudioLogger.error("yt-dlp", `Failed to spawn yt-dlp for ${videoId}: ${err.message}`);
      reject(
        new YouTubeResolverError(
          `Failed to spawn yt-dlp process for video ${videoId}`,
          err
        )
      );
    });

    child.on("close", (code) => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timeout);

      if (code !== 0) {
        AudioLogger.error(
          "yt-dlp",
          `yt-dlp exited with code ${code} for ${videoId}. Stderr: ${stderrData.trim()}`
        );
        reject(
          new YouTubeResolverError(
            `yt-dlp exited with code ${code} for video ${videoId}. Stderr: ${stderrData.trim()}`
          )
        );
        return;
      }

      const streamUrl = stdoutData.trim();
      if (!streamUrl) {
        AudioLogger.error("yt-dlp", `yt-dlp returned empty stream URL for ${videoId}`);
        reject(
          new YouTubeResolverError(
            `yt-dlp returned an empty stream URL for video ${videoId}`
          )
        );
        return;
      }

      AudioLogger.info("yt-dlp", `Successfully resolved stream for ${videoId}.`);
      resolve(streamUrl);
    });
  });
}
