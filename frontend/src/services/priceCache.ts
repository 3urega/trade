const PREFIX = 'price_cache_';
const MAX_ENTRIES = 300;

export function loadPriceBuffer(symbol: string): Map<number, number> {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${symbol}`);
    if (!raw) return new Map();
    const entries: [number, number][] = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export function savePriceBuffer(symbol: string, buffer: Map<number, number>): void {
  try {
    let entries = Array.from(buffer.entries());
    if (entries.length > MAX_ENTRIES) {
      entries = entries.sort((a, b) => a[0] - b[0]).slice(-MAX_ENTRIES);
    }
    sessionStorage.setItem(`${PREFIX}${symbol}`, JSON.stringify(entries));
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}
