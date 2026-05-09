import { ukTime, ukDateLabel, ukHour } from '../services/time.mjs';

export function formatPence(pence) {
  if (pence == null) return '—';
  if (Math.abs(pence) < 1) return `${(pence).toFixed(1)}p`;
  return `${pence.toFixed(1)}p`;
}

export function formatPounds(pence) {
  if (pence == null) return '—';
  if (Math.abs(pence) < 100) return `${pence.toFixed(1)}p`;
  return `£${(pence / 100).toFixed(2)}`;
}

export function formatStartTime(isoString) {
  const d = new Date(isoString);
  return `${ukTime(d)}`;
}

export function formatStartTimeWithDay(isoString, referenceMs = Date.now()) {
  const d = new Date(isoString);
  const ref = new Date(referenceMs);
  const sameDay = d.toDateString() === ref.toDateString();
  if (sameDay) return ukTime(d);
  const tomorrow = new Date(ref.getTime() + 24 * 3600_000);
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${ukTime(d)}`;
  return `${ukDateLabel(d)} ${ukTime(d)}`;
}

export function bucketLabel(isoString) {
  const h = ukHour(new Date(isoString));
  if (h >= 0 && h < 8) return 'Overnight';
  return 'Daytime';
}
