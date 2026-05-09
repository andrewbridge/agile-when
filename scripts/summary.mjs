import { SUMMARY_ANCHORS, SUMMARY_ANCHOR_KEYS } from '../src/services/anchors.mjs';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt({ rates, stats, generatedAt }) {
  const rateLines = rates.map((r) => `${r.from} ${r.pence.toFixed(2)}p`).join('\n');
  const anchorList = SUMMARY_ANCHORS
    .map((a) => `- "${a.key}" — written at ${a.label} UK time`)
    .join('\n');
  return `You are an electricity-price assistant for someone on the UK Octopus Agile tariff in South East England (DNO J).

Generated at: ${generatedAt}
Stats:
- min: ${stats.minPence}p, max: ${stats.maxPence}p, avg: ${stats.avgPence}p
- slots below 15p: ${stats.below15pCount}
- negative slots: ${stats.negativeCount}

Half-hourly rates (UTC, pence/kWh inc VAT):
${rateLines}

Write FOUR short summaries (2-3 sentences each, plain English, no markdown). Each summary must be written as if you are producing it AT its specific anchor UK time, describing the situation as of that moment: what rates are doing right now, the cheapest upcoming slot worth waiting for, and any peaks to avoid in the hours ahead. Mention specific UK times (Europe/London) and pence values. Do NOT reference rates that are already in the past from the anchor's perspective.

Anchors:
${anchorList}

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
