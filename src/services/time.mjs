const UK_TZ = 'Europe/London';

const partsCache = new Map();
function ukParts(date) {
  const key = date.getTime();
  const cached = partsCache.get(key);
  if (cached) return cached;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  parts.hour = parts.hour === '24' ? '00' : parts.hour;
  if (partsCache.size > 500) partsCache.clear();
  partsCache.set(key, parts);
  return parts;
}

export function ukHour(date) {
  return parseInt(ukParts(date).hour, 10);
}

export function ukHourFractional(date) {
  const p = ukParts(date);
  return parseInt(p.hour, 10) + parseInt(p.minute, 10) / 60;
}

export function ukDateLabel(date) {
  const p = ukParts(date);
  return `${p.day}/${p.month}`;
}

export function ukTime(date) {
  const p = ukParts(date);
  return `${p.hour}:${p.minute}`;
}

export function ukDayKey(date) {
  const p = ukParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function nextHalfHourBoundary(now = new Date()) {
  const ms = now.getTime();
  const slot = 30 * 60_000;
  return new Date(Math.floor(ms / slot) * slot + slot);
}

export function currentSlotStart(now = new Date()) {
  const ms = now.getTime();
  const slot = 30 * 60_000;
  return new Date(Math.floor(ms / slot) * slot);
}
