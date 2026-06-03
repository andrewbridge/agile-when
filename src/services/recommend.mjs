const SLOT_MS = 30 * 60_000;

function integrateDistribution(t1, t2, distribution) {
  const thirds = [
    [0, 1 / 3, distribution[0]],
    [1 / 3, 2 / 3, distribution[1]],
    [2 / 3, 1, distribution[2]],
  ];
  let total = 0;
  for (const [a, b, frac] of thirds) {
    const lo = Math.max(t1, a);
    const hi = Math.min(t2, b);
    if (hi > lo) total += frac * (hi - lo) / (b - a);
  }
  return total;
}

export function cycleCost(startMs, durationMinutes, kwh, distribution, ratesByStartMs) {
  const totalMs = durationMinutes * 60_000;
  const endMs = startMs + totalMs;
  let cost = 0;
  let segStart = startMs;
  while (segStart < endMs) {
    const slotStart = Math.floor(segStart / SLOT_MS) * SLOT_MS;
    const slotEnd = slotStart + SLOT_MS;
    const segEnd = Math.min(slotEnd, endMs);
    const t1 = (segStart - startMs) / totalMs;
    const t2 = (segEnd - startMs) / totalMs;
    const segKwh = kwh * integrateDistribution(t1, t2, distribution);
    const pence = ratesByStartMs.get(slotStart);
    if (pence === undefined) return null;
    cost += segKwh * pence;
    segStart = segEnd;
  }
  return cost;
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

export function generateCandidates(appliancesObj, rates) {
  const ratesByStartMs = new Map();
  for (const r of rates) ratesByStartMs.set(new Date(r.from).getTime(), r.pence);
  const slotStarts = [...ratesByStartMs.keys()].sort((a, b) => a - b);
  const lastEndMs = Math.max(...rates.map((r) => new Date(r.to).getTime()));

  const result = {};
  for (const [key, app] of Object.entries(appliancesObj)) {
    const list = [];
    for (const mode of app.modes) {
      const totalMs = mode.durationMinutes * 60_000;
      for (const startMs of slotStarts) {
        if (startMs + totalMs > lastEndMs) continue;
        const cost = cycleCost(startMs, mode.durationMinutes, mode.kwh, mode.distribution, ratesByStartMs);
        if (cost == null) continue;
        list.push({
          mode: mode.name,
          start: new Date(startMs).toISOString(),
          cost: round2(cost),
          avgPerKwh: round1(cost / mode.kwh),
        });
      }
    }
    result[key] = list;
  }
  return result;
}

export function pickBestPerMode(candidates, app, nowMs) {
  const eligible = candidates.filter((c) => new Date(c.start).getTime() >= nowMs);
  const result = [];
  for (const mode of app.modes) {
    const forMode = eligible.filter((c) => c.mode === mode.name);
    if (forMode.length === 0) continue;
    const best = forMode.reduce((a, b) => (b.cost < a.cost ? b : a));
    result.push(best);
  }
  result.sort((a, b) => a.cost - b.cost);
  return result;
}

export function pickRecommendations(candidates, app, nowMs, ukHourFn) {
  const eligible = candidates.filter((c) => new Date(c.start).getTime() >= nowMs);
  const filteredByMode = app.showAllModesInRecommendation
    ? eligible
    : eligible.filter((c) => c.mode === app.defaultMode);
  if (filteredByMode.length === 0) return null;

  const byCost = [...filteredByMode].sort((a, b) => a.cost - b.cost);
  const overall = byCost[0];

  const overnight = byCost.find((c) => {
    const h = ukHourFn(new Date(c.start));
    return h >= 0 && h < 8;
  });
  const daytime = byCost.find((c) => {
    const h = ukHourFn(new Date(c.start));
    return h >= 8;
  });

  const overallIsOvernight = overnight && overnight.start === overall.start;
  const alternative = overallIsOvernight ? daytime : overnight;

  return {
    overall,
    alternative: alternative && alternative.start !== overall.start ? alternative : null,
    alternativeBucket: overallIsOvernight ? 'Daytime' : 'Overnight',
  };
}
