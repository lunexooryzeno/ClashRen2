const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

export function getCached(url: string): string | undefined {
  return cache.get(url);
}

export function preloadImage(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);

  const inflight = inFlight.get(url);
  if (inflight) return inflight;

  const p = fetch(url, { credentials: "include" })
    .then(r => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.blob();
    })
    .then(blob => {
      const objectUrl = URL.createObjectURL(blob);
      cache.set(url, objectUrl);
      inFlight.delete(url);
      return objectUrl;
    })
    .catch(err => {
      inFlight.delete(url);
      throw err;
    });

  inFlight.set(url, p);
  return p;
}
