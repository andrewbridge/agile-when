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

export function hasTomorrowEvening(rates) {
  if (rates.length === 0) return false;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const now = new Date();
  const tomorrowUk = new Date(now.getTime() + 24 * 3600_000);
  const partsOf = (d) => {
    const o = {};
    for (const p of fmt.formatToParts(d)) if (p.type !== 'literal') o[p.type] = p.value;
    return o;
  };
  const tp = partsOf(tomorrowUk);
  // Look for a slot whose UK-local time is tomorrow at 22:30 or later.
  return rates.some((r) => {
    const p = partsOf(new Date(r.from));
    if (p.year !== tp.year || p.month !== tp.month || p.day !== tp.day) return false;
    const h = parseInt(p.hour, 10);
    const m = parseInt(p.minute, 10);
    return h * 60 + m >= 22 * 60 + 30;
  });
}
