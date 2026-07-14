/**
 * Base error for all audio resolver failures.
 */
export class AudioResolveError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = "AudioResolveError";
    Object.setPrototypeOf(this, AudioResolveError.prototype);
  }
}

/**
 * Error thrown by the YouTube/YouTubei resolver component.
 */
export class YouTubeResolverError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = "YouTubeResolverError";
    Object.setPrototypeOf(this, YouTubeResolverError.prototype);
  }
}

/**
 * Error thrown by the Piped API resolver component.
 */
export class PipedError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = "PipedError";
    Object.setPrototypeOf(this, PipedError.prototype);
  }
}

/**
 * Error thrown by the caching layer.
 */
export class CacheError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = "CacheError";
    Object.setPrototypeOf(this, CacheError.prototype);
  }
}
