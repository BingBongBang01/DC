/**
 * Decoupled EventBus Core Module for DC Ultimate
 */
import { logger } from './logger.js';

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event topic
   * @param {string} event Event name
   * @param {Function} handler Listener function
   * @returns {Function} Unsubscribe callback
   */
  on(event, handler) {
    if (typeof handler !== 'function') {
      logger.warn(`EventBus: Handler for event '${event}' is not a function`);
      return () => {};
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event).add(handler);

    return () => this.off(event, handler);
  }

  /**
   * Subscribe to an event topic for a single execution
   * @param {string} event Event name
   * @param {Function} handler Listener function
   */
  once(event, handler) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      handler.apply(this, args);
    };
    return this.on(event, wrapper);
  }

  /**
   * Unsubscribe from an event topic
   * @param {string} event Event name
   * @param {Function} handler Listener function
   */
  off(event, handler) {
    if (this.listeners.has(event)) {
      const set = this.listeners.get(event);
      set.delete(handler);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Publish an event asynchronously to all subscribers with error handling isolation
   * @param {string} event Event name
   * @param {*} data Data payload
   */
  async emit(event, data) {
    const handlers = this.listeners.get(event);
    const wildcardHandlers = this.listeners.get('*');

    const allHandlers = [];
    if (handlers) allHandlers.push(...handlers);
    if (wildcardHandlers) allHandlers.push(...wildcardHandlers);

    if (allHandlers.length === 0) return;

    const promises = allHandlers.map(async (handler) => {
      try {
        await handler(data, event);
      } catch (err) {
        logger.error(`EventBus listener error on event '${event}':`, err);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Clear all listeners or listeners for a specific event
   * @param {string} [event] Optional event name
   */
  clear(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export const eventBus = new EventBus();
