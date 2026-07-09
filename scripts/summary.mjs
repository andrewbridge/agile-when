import { SUMMARY_ANCHORS, SUMMARY_ANCHOR_KEYS } from '../src/services/anchors.mjs';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const HEADERS = (apiKey) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${apiKey}`,
  'HTTP-Referer': 'https://github.com/andrewbridge/agile-when',
  'X-Title': 'agile-when',
});

function buildPrompt({ rates, stats, generatedAt }) {
  const rateLines = rates.map((r) => `${r.from} ${r.pence.toFixed(2)}p`).join('\n');
  const anchorList = SUMMARY_ANCHORS
    .map((a) => `- "${a.key}" — for someone reading at ${a.label} UK time`)
    .join('\n');

  return `You are an electricity-price assistant for someone on the UK Octopus Agile tariff in South East England (DNO J).

The user wants a clear forward-looking steer for the next 24 hours: given the published rates ahead, is it worth conserving energy and holding off, or should they go ahead and use what they need? They are not interested in commentary about rates that have already passed.

Generated at: ${generatedAt}
Stats (next 24 hours, published Octopus rates only):
- min: ${stats.minPence}p, max: ${stats.maxPence}p, avg: ${stats.avgPence}p
- slots below 15p: ${stats.below15pCount}
- negative slots: ${stats.negativeCount}

Half-hourly rates (UTC, pence/kWh inc VAT):
${rateLines}

Write FOUR short summaries (2-3 sentences each, plain English, no markdown), one per anchor:
${anchorList}

For each summary:
- Consider ONLY rates from that anchor time onwards. Do not mention or describe any rate that has already passed before the anchor.
- Lead with a clear hold-off-or-go-ahead steer for the hours ahead.
- Call out the cheapest upcoming window worth waiting for (with UK time and pence) and any peaks to avoid.
- Do NOT use phrases like "as of HH:MM", "the current rate is", "right now", or "at the moment". Write it as forward-looking advice, not a status update.
- Do NOT reference anything beyond the next 24 hours.

Reply with ONLY a JSON object using the anchor keys, no commentary, no markdown fences:
{${SUMMARY_ANCHOR_KEYS.map((k) => `"${k}":"..."`).join(',')}}`;
}

function buildWeekPrompt({ rates, predictedRates, forecastCreatedAt, realStats, weekStats, generatedAt }) {
  const realRateLines = rates.map((r) => `${r.from} ${r.pence.toFixed(2)}p`).join('\n');
  const predictedRateLines = predictedRates.slice(0, 7 * 48)
    .map((r) => `${r.from} ~${r.pence.toFixed(2)}p`).join('\n');

  return `You are an electricity-price assistant for someone on the UK Octopus Agile tariff in South East England (DNO J).

The user's question is: "Is there a materially cheaper period coming up in the next 7 days that would be worth waiting for, or should I just use electricity at the best window available in the next 24 hours?"

Generated at: ${generatedAt}

Published Octopus rates for the next 24 hours (UTC, pence/kWh inc VAT):
${realRateLines}
Next-24-hour stats: min ${realStats.minPence}p, max ${realStats.maxPence}p, avg ${realStats.avgPence}p

Averaged 7-day price forecast (generated ${forecastCreatedAt}, indicative only — accuracy degrades past ~3 days, treat as a guide not a guarantee):
${predictedRateLines}
7-day stats (real + forecast combined): min ${weekStats.minPence}p, max ${weekStats.maxPence}p, avg ${weekStats.avgPence}p

Write a single short paragraph (2-3 sentences, plain English, no markdown).
- Lead with a clear wait-or-go-ahead steer.
- If a materially cheaper period appears in the forecast (>= 5p below today's cheapest published slot), name the approximate day and pence range directly, without hedging.
- If no materially cheaper period exists in the forecast, say so briefly.
- Do NOT use phrases like "right now", "at the moment", or "currently". Write it as forward-looking advice.
- Do NOT add disclaimers about the data being a forecast or about prediction accuracy. The card the user sees is already labelled as a forecast, so phrases like "keep in mind this is a forecast", "not a guaranteed rate", "subject to change", "this is just a prediction" are noise. Write directly — "cheaper rates around 5p arrive Tuesday morning" — not "keep in mind this is a forecast, but cheaper rates may arrive Tuesday".`;
}

function parseJsonReply(text) {
  let s = text.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in reply');
  return JSON.parse(s.slice(start, end + 1));
}

async function callOpenRouter({ prompt, apiKey, model }) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: HEADERS(apiKey),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenRouter');
  return content;
}

export async function generateSummaries({ rates, stats, generatedAt, apiKey, model }) {
  const content = await callOpenRouter({ prompt: buildPrompt({ rates, stats, generatedAt }), apiKey, model });
  const parsed = parseJsonReply(content);
  for (const k of SUMMARY_ANCHOR_KEYS) {
    if (typeof parsed[k] !== 'string') throw new Error(`Missing summary key: ${k}`);
  }
  return parsed;
}

export async function generateWeekSummary({ rates, predictedRates, forecastCreatedAt, realStats, weekStats, generatedAt, apiKey, model }) {
  const content = await callOpenRouter({
    prompt: buildWeekPrompt({ rates, predictedRates, forecastCreatedAt, realStats, weekStats, generatedAt }),
    apiKey,
    model,
  });
  return content.trim();
}
