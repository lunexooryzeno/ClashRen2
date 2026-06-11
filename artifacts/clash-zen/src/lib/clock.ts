type Listener = () => void;

const listeners = new Set<Listener>();
let tickerId: ReturnType<typeof setInterval> | null = null;

function startTicker() {
  if (tickerId !== null) return;
  tickerId = setInterval(() => {
    listeners.forEach(fn => fn());
  }, 1000);
}

function stopTicker() {
  if (tickerId !== null && listeners.size === 0) {
    clearInterval(tickerId);
    tickerId = null;
  }
}

export function subscribeToSecondTick(fn: Listener): () => void {
  listeners.add(fn);
  startTicker();
  return () => {
    listeners.delete(fn);
    stopTicker();
  };
}
