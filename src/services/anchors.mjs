export const SUMMARY_ANCHORS = [
  { key: 'morning',   hour: 7,  label: '07:00' },
  { key: 'midday',    hour: 13, label: '13:00' },
  { key: 'evening',   hour: 19, label: '19:00' },
  { key: 'lateNight', hour: 23, label: '23:00' },
];

export const SUMMARY_ANCHOR_KEYS = SUMMARY_ANCHORS.map((a) => a.key);

export function pickNearestAnchor(currentHour) {
  let best = SUMMARY_ANCHORS[0];
  let bestDist = Infinity;
  let bestForward = Infinity;
  for (const a of SUMMARY_ANCHORS) {
    const raw = Math.abs(a.hour - currentHour);
    const dist = Math.min(raw, 24 - raw);
    const forward = (a.hour - currentHour + 24) % 24;
    if (dist < bestDist || (dist === bestDist && forward < bestForward)) {
      bestDist = dist;
      bestForward = forward;
      best = a;
    }
  }
  return best;
}
