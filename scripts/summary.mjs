const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt({ rates, stats, generatedAt }) {
  const rateLines = rates.map((r) => `${r.from} ${r.pence.toFixed(2)}p`).join('\n');
  return `You are an electricity-price assistant for someone on the UK Octopus Agile tariff in South East England (DNO J).

Generated at: ${generatedAt}
Stats:
- min: ${stats.minPence}p, max: ${stats.maxPence}p, avg: ${stats.avgPence}p
- slots below 15p: ${stats.below15pCount}
- negative slots: ${stats.negativeCount}

Half-hourly rates (UTC, pence/kWh inc VAT):
${rateLines}

Write four short summaries (2-3 sentences each, plain English, no markdown). For each summary, call out: (a) whether rates are good/bad/normal, (b) any negative-rate or very-cheap slots worth waiting for, (c) any peaks to avoid. UK times please (London).

Slices:
- "now": next few hours
- "next6h": next 6 hours
- "overnight": 00:00-08:00 UK time of the next overnight period
- "tomorrowMorning": 08:00-12:00 UK time tomorrow

Reply with ONLY a JSON object, no commentary, no markdown fences:
{"now":"...","next6h":"...","overnight":"...","tomorrowMorning":"..."}`;
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
  for (const k of ['now', 'next6h', 'overnight', 'tomorrowMorning']) {
    if (typeof parsed[k] !== 'string') throw new Error(`Missing summary key: ${k}`);
  }
  return parsed;
}
