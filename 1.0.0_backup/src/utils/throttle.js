/**
 * Creates a throttled version of a function that only invokes `func` at most once
 * per every `limit` milliseconds.
 * 
 * @param {Function} func Function to throttle
 * @param {number} limit Interval in milliseconds
 * @returns {Function} Throttled function with cancel method
 */
export function throttle(func, limit = 100) {
  let inThrottle = false;
  let lastFunc = null;
  let lastRan = 0;

  const throttled = function (...args) {
    const context = this;
    const now = Date.now();

    if (!inThrottle) {
      func.apply(context, args);
      lastRan = now;
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastFunc) {
          lastFunc();
          lastFunc = null;
        }
      }, limit);
    } else {
      lastFunc = () => {
        if (Date.now() - lastRan >= limit) {
          func.apply(context, args);
          lastRan = Date.now();
        }
      };
    }
  };

  throttled.cancel = function () {
    inThrottle = false;
    lastFunc = null;
    lastRan = 0;
  };

  return throttled;
}
