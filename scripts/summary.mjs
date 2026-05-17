import { SUMMARY_ANCHORS, SUMMARY_ANCHOR_KEYS } from '../src/services/anchors.mjs';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt({ rates, predictedRates, forecastCreatedAt, stats, generatedAt }) {
  const rateLines = rates.map((r) => `${r.from} ${r.pence.toFixed(2)}p`).join('\n');
  const anchorList = SUMMARY_ANCHORS
    .map((a) => `- "${a.key}" — for someone reading at ${a.label} UK time`)
    .join('\n');

  const forecastBlock = predictedRates?.length
    ? `\nForecast (AgilePredict ML model, generated ${forecastCreatedAt}, expected values only — treat as indicative):
${predictedRates.slice(0, 7 * 48).map((r) => `${r.from} ~${r.pence.toFixed(2)}p`).join('\n')}

These are predictions, not Octopus-published rates. Accuracy degrades past ~3 days.
If a materially cheaper window (>= 5p below the cheapest published slot above) appears within 1–3 days of the forecast, you may mention that deferring non-urgent loads could be worthwhile — but make clear it is a forecast, not a confirmed rate.\n`
    : '';

  return `You are an electricity-price assistant for someone on the UK Octopus Agile tariff in South East England (DNO J).

The user wants a clear forward-looking steer: given the rates ahead, is it worth conserving energy and holding off, or should they go ahead and use what they need? They are not interested in commentary about rates that have already passed.

Generated at: ${generatedAt}
Stats:
- min: ${stats.minPence}p, max: ${stats.maxPence}p, avg: ${stats.avgPence}p
- slots below 15p: ${stats.below15pCount}
- negative slots: ${stats.negativeCount}

Half-hourly rates (UTC, pence/kWh inc VAT):
${rateLines}
${forecastBlock}
Write FOUR short summaries (2-3 sentences each, plain English, no markdown), one per anchor:
${anchorList}

For each summary:
- Consider ONLY rates from that anchor time onwards. Do not mention or describe any rate that has already passed before the anchor.
- Lead with a clear hold-off-or-go-ahead steer for the hours ahead.
- Call out the cheapest upcoming window worth waiting for (with UK time and pence) and any peaks to avoid.
- Do NOT use phrases like "as of HH:MM", "the current rate is", "right now", or "at the moment". Write it as forward-looking advice, not a status update.

Reply with ONLY a JSON object using the anchor keys, no commentary, no markdown fences:
{${SUMMARY_ANCHOR_KEYS.map((k) => `"${k}":"..."`).join(',')}}`;
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

export async function generateSummaries({ rates, stats, generatedAt, apiKey, model }) {
  const body = {
    model,
    messages: [
      { role: 'user', content: buildPrompt({ rates, stats, generatedAt }) },
    ],
    temperature: 0.3,
  };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/andrewbridge/agile-when',
      'X-Title': 'agile-when',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenRouter');
  const parsed = parseJsonReply(content);
  for (const k of SUMMARY_ANCHOR_KEYS) {
    if (typeof parsed[k] !== 'string') throw new Error(`Missing summary key: ${k}`);
  }
  return parsed;
}
