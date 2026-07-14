/**
 * Structured logger for the Audio Resolver subsystem.
 */
export class AudioLogger {
  static info(context: string, message: string, ...args: any[]): void {
    console.log(`[AudioResolver] [${context}] INFO: ${message}`, ...args);
  }

  static warn(context: string, message: string, ...args: any[]): void {
    console.warn(`[AudioResolver] [${context}] WARN: ${message}`, ...args);
  }

  static error(context: string, message: string, ...args: any[]): void {
    console.error(`[AudioResolver] [${context}] ERROR: ${message}`, ...args);
  }
}
