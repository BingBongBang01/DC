/**
 * Creates a debounced version of a function that delays execution until after `wait` ms
 * have elapsed since the last time it was invoked.
 * 
 * @param {Function} func Function to debounce
 * @param {number} wait Delay in milliseconds
 * @param {boolean} [immediate=false] Execute immediately on leading edge
 * @returns {Function} Debounced function with cancel method
 */
export function debounce(func, wait = 100, immediate = false) {
  let timeout = null;

  const debounced = function (...args) {
    const context = this;
    const callNow = immediate && !timeout;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      timeout = null;
      if (!immediate) {
        func.apply(context, args);
      }
    }, wait);

    if (callNow) {
      func.apply(context, args);
    }
  };

  debounced.cancel = function () {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}
