/**
 * RateLimiter Module for DC Ultimate Search Engine
 * Enforces rate limiting delays between automated page fetches to respect server traffic limits
 */

export class RateLimiter {
  constructor(delayMs = 250) {
    this.delayMs = delayMs;
    this.lastExecutionTime = 0;
  }

  /**
   * Wait until rate limiter token is available
   * @returns {Promise<void>}
   */
  async acquire() {
    const now = Date.now();
    const elapsed = now - this.lastExecutionTime;

    if (elapsed < this.delayMs) {
      const waitTime = this.delayMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastExecutionTime = Date.now();
  }

  setDelay(delayMs) {
    if (typeof delayMs === 'number' && delayMs >= 0) {
      this.delayMs = delayMs;
    }
  }
}

export const rateLimiter = new RateLimiter();
