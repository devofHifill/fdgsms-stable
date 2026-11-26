// singleFlight → wrap an async function so calls never overlap.
//
// The workers run on setInterval. If one run takes longer than the interval
// (slow LLM calls, slow Twilio), the next tick would start a second run over
// the same pending work. A call made while a run is still in progress is
// skipped (resolves to undefined) instead of starting in parallel.
export function singleFlight(fn) {
  let running = false;

  const wrapped = async (...args) => {
    if (running) return undefined;
    running = true;
    try {
      return await fn(...args);
    } finally {
      running = false;
    }
  };

  wrapped.isRunning = () => running;
  return wrapped;
}
