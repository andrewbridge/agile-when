const PRIMARY_BASE = 'https://agilepredict.com/api';
const FALLBACK_BASE = 'https://prices.fly.dev/api';

export async function fetchPredicted({ region, days = 7, baseUrl = PRIMARY_BASE }) {
  const url = `${baseUrl}/${region}?days=${days}&high_low=True`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`AgilePredict ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchPredictedWithFallback({ region, days = 7 }) {
  try {
    return await fetchPredicted({ region, days, baseUrl: PRIMARY_BASE });
  } catch (primaryErr) {
    try {
      return await fetchPredicted({ region, days, baseUrl: FALLBACK_BASE });
    } catch {
      throw primaryErr;
    }
  }
}

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
  const SLOT_MS = 30 * 60_000;
  const slots = [];
  for (const entry of prices) {
    const fromMs = new Date(entry.date_time).getTime();
    if (!isFinite(fromMs)) continue;
    const pence = Number(entry.agile_pred);
    if (!isFinite(pence)) continue;
    slots.push({
      from: new Date(fromMs).toISOString(),
      to: new Date(fromMs + SLOT_MS).toISOString(),
      pence: Math.round(pence * 100) / 100,
      predicted: true,
    });
  }
  slots.sort((a, b) => new Date(a.from) - new Date(b.from));
  return { forecastCreatedAt, slots };
}

export function mergeRates(realRates, predictedSlots) {
  const realFromSet = new Set(realRates.map((r) => r.from));
  const merged = [
    ...realRates,
    ...predictedSlots.filter((s) => !realFromSet.has(s.from)),
  ];
  merged.sort((a, b) => new Date(a.from) - new Date(b.from));
  return merged;
}
