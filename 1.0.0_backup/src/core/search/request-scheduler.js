/**
 * RequestScheduler Module for DC Ultimate Search Engine
 * Manages request queues, cancellation signals, retries with exponential backoff, and timeouts
 */
import { rateLimiter } from './rate-limiter.js';
import { logger } from '../logger.js';

export class RequestScheduler {
  constructor() {
    this.activeAbortController = null;
  }

  createCancellationSignal() {
    this.cancel();
    this.activeAbortController = new AbortController();
    return this.activeAbortController.signal;
  }

  cancel() {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      logger.info('RequestScheduler: Active collection cancelled by user.');
    }
  }

  /**
   * Fetch a single page URL with rate limiting and retry mechanism
   * @param {string} url Target URL
   * @param {AbortSignal} [signal] Optional abort signal
   * @param {number} [retries=2] Max retries
   * @returns {Promise<string>} Raw HTML string
   */
  async fetchPage(url, signal = null, retries = 2) {
    let attempt = 0;

    while (attempt <= retries) {
      let timedOut = false; // 이번 시도가 타임아웃으로 실패했는지 추적

      try {
        if (signal && signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError');
        }

        await rateLimiter.acquire();

        if (signal && signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError');
        }

        const fetchSignal = signal || (this.activeAbortController ? this.activeAbortController.signal : null);

        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => {
          timedOut = true; // 사용자 취소가 아니라 타임아웃임을 표시
          timeoutController.abort();
        }, 10000);

        const onUserAbort = () => {
          // 사용자 취소는 timedOut을 건드리지 않음
          timeoutController.abort();
        };
        if (fetchSignal) {
          fetchSignal.addEventListener('abort', onUserAbort);
        }

        let response;
        try {
          response = await fetch(url, { signal: timeoutController.signal });
        } finally {
          clearTimeout(timeoutId);
          if (fetchSignal) {
            fetchSignal.removeEventListener('abort', onUserAbort);
          }
        }

        if (!response.ok) {
          throw new Error(`HTTP Error status: ${response.status}`);
        }

        const html = await response.text();
        return html;
      } catch (err) {
        const isUserAbort = err.name === 'AbortError' && !timedOut;
        const isTimeout = err.name === 'AbortError' && timedOut;

        if (isUserAbort) {
          // 사용자가 명시적으로 취소 — 재시도 없이 즉시 던짐
          throw err;
        }

        if (isTimeout) {
          // 타임아웃은 일반 오류로 취급하여 재시도 로직으로 흘러가게 함
          logger.warn(`RequestScheduler: Request timed out for ${url} (attempt ${attempt + 1})`);
          err = new Error(`Request timed out after 10s: ${url}`);
        }

        attempt++;
        if (attempt > retries) {
          logger.error(`RequestScheduler: Failed to fetch ${url} after ${retries} retries:`, err);
          throw err;
        }

        const backoffMs = attempt * 500;
        logger.warn(`RequestScheduler: Fetch error for ${url}. Retrying in ${backoffMs}ms... (Attempt ${attempt}/${retries})`);

        await new Promise((resolve, reject) => {
          let timerId;
          const abortHandler = () => {
            clearTimeout(timerId);
            reject(new DOMException('Aborted by user', 'AbortError'));
          };

          if (signal && signal.aborted) {
            abortHandler();
            return;
          }

          if (signal) {
            signal.addEventListener('abort', abortHandler, { once: true });
          }

          timerId = setTimeout(() => {
            if (signal) signal.removeEventListener('abort', abortHandler);
            resolve();
          }, backoffMs);
        });
      }
    }

    throw new Error(`Failed to fetch ${url}`);
  }
}

export const requestScheduler = new RequestScheduler();
