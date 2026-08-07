const BASE = 'https://api.octopus.energy';

export async function fetchRates({ product, region, periodFrom, periodTo }) {
  const tariffCode = `E-1R-${product}-${region}`;
  const url = new URL(`${BASE}/v1/products/${product}/electricity-tariffs/${tariffCode}/standard-unit-rates/`);
  url.searchParams.set('period_from', periodFrom);
  url.searchParams.set('period_to', periodTo);
  url.searchParams.set('page_size', '1500');
  url.searchParams.set('order_by', 'period');

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Octopus API ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return json.results.map((r) => ({
    from: r.valid_from,
    to: r.valid_to,
    pence: r.value_inc_vat,
  })).sort((a, b) => new Date(a.from) - new Date(b.from));
}

export function computeStats(rates) {
  if (rates.length === 0) {
    return { minPence: null, maxPence: null, avgPence: null, below15pCount: 0, negativeCount: 0 };
  }
  let min = Infinity, max = -Infinity, sum = 0, below = 0, neg = 0;
  for (const r of rates) {
    if (r.pence < min) min = r.pence;
    if (r.pence > max) max = r.pence;
    sum += r.pence;
    if (r.pence < 15) below++;
    if (r.pence < 0) neg++;
  }
  return {
    minPence: Math.round(min * 100) / 100,
    maxPence: Math.round(max * 100) / 100,
    avgPence: Math.round((sum / rates.length) * 100) / 100,
    below15pCount: below,
    negativeCount: neg,
  };
}

// How far real (non-forecast) rate data reaches, as epoch ms; 0 when there is
// none. Accepts either a fresh fetchRates result or the merged `rates` array
// from a published data.json, where forecast slots carry `predicted: true`.
export function lastRealSlotEnd(rates) {
  if (!Array.isArray(rates)) return 0;
  let last = 0;
  for (const r of rates) {
    if (r?.predicted) continue;
    const ms = new Date(r?.to).getTime();
    if (Number.isFinite(ms) && ms > last) last = ms;
  }
  return last;
}

const iso = (ms) => new Date(ms).toISOString();

// Decide whether a freshly fetched set of rates is worth publishing, by asking
// whether it reaches further than what the live site already has.
//
// Octopus publishes each day's Agile rates in an afternoon window, so "has
// anything new landed?" is the only question the scheduled runs can usefully
// retry on. Asking instead for a specific calendar day (as this build used to)
// fails for hours at a stretch through no fault of the build — every run
// between midnight and the publication window is demanding data that cannot
// exist yet.
export function decideBuild({ force, publishedOk, publishedEndMs, fetchedEndMs, nowMs }) {
  if (!fetchedEndMs) {
    // Not "nothing new" but "nothing at all" — a real breakage worth failing on,
    // and never something to overwrite good published data with.
    return { build: false, fatal: true, reason: 'Octopus returned no usable rate data' };
  }
  if (force) {
    return { build: true, reason: 'Forced build — freshness gate skipped' };
  }
  if (!publishedOk) {
    return { build: true, reason: 'No published data.json to compare against — building' };
  }
  if (fetchedEndMs > publishedEndMs) {
    return { build: true, reason: `Coverage extended: live data ends ${iso(publishedEndMs)}, fetched data ends ${iso(fetchedEndMs)}` };
  }
  if (publishedEndMs <= nowMs) {
    return { build: true, reason: `Live data is exhausted (ends ${iso(publishedEndMs)}) — rebuilding rather than leaving the site stale` };
  }
  return { build: false, reason: `No newer rate data — live data already covers to ${iso(publishedEndMs)}` };
}
