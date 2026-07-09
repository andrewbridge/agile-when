const AGILEPREDICT_BASE = 'https://agilepredict.com/api';
const AGILEPREDICT_FALLBACK_BASE = 'https://prices.fly.dev/api';
const AGILEFORECAST_BASE = 'https://agileforecast.co.uk/api';
const X2R_BASE = 'https://api.x2r.uk/agile';

const SLOT_MS = 30 * 60_000;

// --- AgilePredict (agilepredict.com, with prices.fly.dev fallback) -----------

async function fetchAgilePredictRaw({ region, days, baseUrl }) {
  const url = `${baseUrl}/${region}?days=${days}&high_low=True`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`AgilePredict ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchAgilePredict({ region, days = 7 }) {
  let raw;
  try {
    raw = await fetchAgilePredictRaw({ region, days, baseUrl: AGILEPREDICT_BASE });
  } catch (primaryErr) {
    try {
      raw = await fetchAgilePredictRaw({ region, days, baseUrl: AGILEPREDICT_FALLBACK_BASE });
    } catch {
      throw primaryErr;
    }
  }
  return normalisePredicted(raw);
}

// --- AgileForecast (agileforecast.co.uk) — agilepredict-compatible shape -----

export async function fetchAgileForecast({ region, days = 7 }) {
  const url = `${AGILEFORECAST_BASE}/${region}/?days=${days}&high_low=false`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`AgileForecast ${res.status}: ${await res.text()}`);
  return normalisePredicted(await res.json());
}

// Shared parser for the agilepredict.com response shape (also used by AgileForecast):
// [{ created_at, prices: [{ date_time, agile_pred }] }]
export function normalisePredicted(raw) {
  const forecast = Array.isArray(raw) ? raw[0] : raw;
  if (!forecast || typeof forecast !== 'object') {
    throw new Error(`Unexpected response shape: ${JSON.stringify(raw).slice(0, 100)}`);
  }
  const forecastCreatedAt = forecast.created_at ?? null;
  const prices = forecast.prices;
  if (!Array.isArray(prices)) {
    throw new Error(`No prices array. Keys: ${Object.keys(forecast).join(', ')}`);
  }
  const slots = buildSlots(prices, (entry) => ({
    fromMs: new Date(entry.date_time).getTime(),
    pence: Number(entry.agile_pred),
  }));
  return { createdAt: forecastCreatedAt, slots };
}

// --- X2R (api.x2r.uk) — { forecast_at, prices: { forecast: [{ date, price }] } } --

export async function fetchX2R({ region }) {
  const url = `${X2R_BASE}/${region}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`X2R ${res.status}: ${await res.text()}`);
  return normaliseX2R(await res.json());
}

export function normaliseX2R(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Unexpected response shape: ${JSON.stringify(raw).slice(0, 100)}`);
  }
  const forecast = raw.prices?.forecast;
  if (!Array.isArray(forecast)) {
    throw new Error(`No prices.forecast array. Keys: ${Object.keys(raw).join(', ')}`);
  }
  const slots = buildSlots(forecast, (entry) => ({
    fromMs: new Date(entry.date).getTime(),
    pence: Number(entry.price),
  }));
  return { createdAt: raw.forecast_at ?? null, slots };
}

// --- shared slot building + averaging ----------------------------------------

function buildSlots(entries, pick) {
  const slots = [];
  for (const entry of entries) {
    const { fromMs, pence } = pick(entry);
    if (!isFinite(fromMs) || !isFinite(pence)) continue;
    slots.push({
      from: new Date(fromMs).toISOString(),
      to: new Date(fromMs + SLOT_MS).toISOString(),
      pence: Math.round(pence * 100) / 100,
      predicted: true,
    });
  }
  slots.sort((a, b) => new Date(a.from) - new Date(b.from));
  return slots;
}

// Average the predicted price per half-hour slot across whichever source slot
// arrays contain that slot. Slots are keyed by their start epoch (ms) so sources
// using different time zones (X2R is London-local, the others UTC) still align.
export function averagePredicted(sourceSlotArrays, { days = 7 } = {}) {
  const cutoffMs = Date.now() + days * 24 * 3600_000;
  const buckets = new Map();
  for (const slots of sourceSlotArrays) {
    if (!Array.isArray(slots)) continue;
    for (const slot of slots) {
      const fromMs = new Date(slot.from).getTime();
      if (!isFinite(fromMs) || fromMs > cutoffMs) continue;
      let bucket = buckets.get(fromMs);
      if (!bucket) {
        bucket = { from: slot.from, to: slot.to, sum: 0, count: 0 };
        buckets.set(fromMs, bucket);
      }
      bucket.sum += slot.pence;
      bucket.count += 1;
    }
  }
  const averaged = [...buckets.values()].map((b) => ({
    from: b.from,
    to: b.to,
    pence: Math.round((b.sum / b.count) * 100) / 100,
    predicted: true,
  }));
  averaged.sort((a, b) => new Date(a.from) - new Date(b.from));
  return averaged;
}

// Fetch all three forecast sources in parallel and average the ones that
// responded. Returns per-source outcomes so the build can log failures (with
// the full HTTP status + body) and record which sources contributed.
export async function fetchAllPredicted({ region, days = 7 }) {
  const providers = [
    { name: 'AgilePredict', run: () => fetchAgilePredict({ region, days }) },
    { name: 'AgileForecast', run: () => fetchAgileForecast({ region, days }) },
    { name: 'X2R', run: () => fetchX2R({ region }) },
  ];

  const settled = await Promise.allSettled(providers.map((p) => p.run()));

  const sources = [];
  const sourceSlotArrays = [];
  let createdAt = null;
  settled.forEach((result, i) => {
    const name = providers[i].name;
    if (result.status === 'fulfilled') {
      const { slots, createdAt: sourceCreatedAt } = result.value;
      sourceSlotArrays.push(slots);
      if (!createdAt && sourceCreatedAt) createdAt = sourceCreatedAt;
      sources.push({ name, ok: true, slotCount: slots.length, error: null });
    } else {
      const error = result.reason?.message || String(result.reason);
      sources.push({ name, ok: false, slotCount: 0, error });
    }
  });

  const slots = averagePredicted(sourceSlotArrays, { days });
  return { slots, createdAt, sources };
}

export function mergeRates(realRates, predictedSlots) {
  if (realRates.length === 0) {
    return [...predictedSlots].sort((a, b) => new Date(a.from) - new Date(b.from));
  }
  const lastRealEndMs = Math.max(...realRates.map((r) => new Date(r.to).getTime()));
  const merged = [
    ...realRates,
    ...predictedSlots.filter((s) => new Date(s.from).getTime() >= lastRealEndMs),
  ];
  merged.sort((a, b) => new Date(a.from) - new Date(b.from));
  return merged;
}
