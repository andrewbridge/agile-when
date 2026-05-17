import { mkdir, cp, writeFile, readFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { fetchRates, computeStats, hasTomorrowEvening } from './rates.mjs';
import { fetchPredictedWithFallback, normalisePredicted, mergeRates } from './predicted.mjs';
import { generateSummaries, generateWeekSummary } from './summary.mjs';
import { appliances } from '../src/services/appliances.mjs';
import { generateCandidates } from '../src/services/recommend.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'src');
const DIST = resolve(ROOT, process.env.DIST_DIR || 'dist');

const PRODUCT = process.env.PRODUCT_CODE || 'AGILE-24-10-01';
const REGION = process.env.REGION_CODE || 'J';
const REGION_NAME = process.env.REGION_NAME || 'South East England';
const MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v3.2';
const API_KEY = process.env.OPENROUTER_API_KEY;
const DRY_RUN = process.env.BUILD_DRY_RUN === '1';
const NO_CACHE = process.argv.slice(2).includes('--no-cache') || process.env.NO_CACHE === '1' || process.env.NO_CACHE === 'true';
const CACHE_URL = process.env.CACHE_URL || 'https://andrewbridge.github.io/agile-when/data.json';
const PREDICT_DISABLE = process.env.PREDICT_DISABLE === '1';

function log(...a) { console.log('[build]', ...a); }
function warn(...a) { console.warn('[build]', ...a); }

async function setStepOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  await appendFile(file, `${name}=${value}\n`);
}

async function isAlreadyGeneratedToday() {
  try {
    const res = await fetch(CACHE_URL, { cache: 'no-store' });
    if (!res.ok) {
      warn(`Cache check: ${CACHE_URL} returned HTTP ${res.status}`);
      return false;
    }
    const cached = await res.json();
    const generatedAt = cached?.generatedAt;
    if (typeof generatedAt !== 'string') return false;
    const cachedDay = generatedAt.slice(0, 10);
    const todayDay = new Date().toISOString().slice(0, 10);
    log(`Cache check: remote generatedAt=${generatedAt} (day ${cachedDay}); today=${todayDay}`);
    return cachedDay === todayDay;
  } catch (err) {
    warn('Cache check failed:', err.message);
    return false;
  }
}

async function main() {
  if (NO_CACHE) {
    log('Cache check skipped (--no-cache)');
  } else if (await isAlreadyGeneratedToday()) {
    log('data.json already generated today — skipping build. Pass --no-cache to force.');
    await setStepOutput('skip', 'true');
    return;
  }
  await setStepOutput('skip', 'false');

  const generatedAt = new Date().toISOString();
  const periodFrom = new Date(Date.now() - 60 * 60_000).toISOString();
  const periodTo = new Date(Date.now() + 36 * 3600_000).toISOString();

  let rates;
  if (DRY_RUN) {
    log('Dry run: generating fixture rates');
    rates = generateFixtureRates();
  } else {
    log(`Fetching rates ${PRODUCT} ${REGION} from ${periodFrom} to ${periodTo}`);
    rates = await fetchRates({ product: PRODUCT, region: REGION, periodFrom, periodTo });
    log(`Got ${rates.length} rate slots`);
    if (!hasTomorrowEvening(rates)) {
      warn('Tomorrow evening rates missing — exiting without deploy.');
      process.exit(1);
    }
  }

  const stats = computeStats(rates);
  log('Stats:', stats);

  const candidates = generateCandidates(appliances, rates);
  for (const [k, list] of Object.entries(candidates)) {
    log(`${k}: ${list.length} candidates`);
  }

  let predictedSlots = [];
  let forecastCreatedAt = null;
  let forecastError = null;
  if (DRY_RUN) {
    predictedSlots = generateFixturePredictedSlots(rates);
    forecastCreatedAt = new Date().toISOString();
    log(`Dry run: generated ${predictedSlots.length} fixture predicted slots`);
  } else if (PREDICT_DISABLE) {
    log('Predicted rates disabled (PREDICT_DISABLE=1)');
  } else {
    try {
      const raw = await fetchPredictedWithFallback({ region: REGION, days: 7 });
      const normalised = normalisePredicted(raw);
      predictedSlots = normalised.slots;
      forecastCreatedAt = normalised.forecastCreatedAt;
      log(`Got ${predictedSlots.length} predicted slots (forecast created ${forecastCreatedAt})`);
    } catch (err) {
      forecastError = err.message;
      warn('AgilePredict fetch failed:', err.message);
    }
  }

  const mergedRates = mergeRates(rates, predictedSlots);
  const weekStats = computeStats(mergedRates);
  const predictedSavings = computePredictedSavings(appliances, candidates, mergedRates, new Date(generatedAt).getTime());
  log(`Predicted savings: ${predictedSavings.length} alert(s)`);

  let summaries = null;
  let weekSummary = null;
  let summaryModel = null;
  if (DRY_RUN || !API_KEY) {
    log('Skipping summaries (dry run or no key)');
  } else {
    const [summariesResult, weekResult] = await Promise.allSettled([
      generateSummaries({ rates, stats, generatedAt, apiKey: API_KEY, model: MODEL }),
      generateWeekSummary({ rates, predictedRates: predictedSlots, forecastCreatedAt, realStats: stats, weekStats, generatedAt, apiKey: API_KEY, model: MODEL }),
    ]);
    if (summariesResult.status === 'fulfilled') {
      summaries = summariesResult.value;
      summaryModel = MODEL;
      log('Summaries generated');
    } else {
      warn('Summary generation failed:', summariesResult.reason.message);
    }
    if (weekResult.status === 'fulfilled') {
      weekSummary = weekResult.value;
      summaryModel = MODEL;
      log('Week summary generated');
    } else {
      warn('Week summary generation failed:', weekResult.reason.message);
    }
  }

  const payload = {
    generatedAt,
    region: { code: REGION, name: REGION_NAME },
    product: PRODUCT,
    rates: mergedRates,
    candidates,
    predictedSavings,
    forecast: {
      source: 'agilepredict',
      createdAt: forecastCreatedAt,
      days: 7,
      slotCount: predictedSlots.length,
      error: forecastError ?? null,
    },
    summaries,
    weekSummary,
    summaryModel,
    stats,
  };

  await mkdir(DIST, { recursive: true });
  await cp(SRC, DIST, { recursive: true });

  const version = generatedAt.replace(/[-:]/g, '').replace(/\..*/, '');
  const swPath = resolve(DIST, 'sw.js');
  const sw = await readFile(swPath, 'utf8');
  await writeFile(swPath, sw.replaceAll('%VERSION%', version));
  log(`Stamped sw.js with version ${version}`);

  await writeFile(resolve(DIST, 'data.json'), JSON.stringify(payload));
  log(`Wrote ${resolve(DIST, 'data.json')}`);
}

function generateFixturePredictedSlots(realRates) {
  const slots = [];
  const slot = 30 * 60_000;
  // Start just after the last real rate slot
  const lastRealEnd = realRates.length
    ? new Date(realRates[realRates.length - 1].to).getTime()
    : Date.now() + 36 * 3600_000;
  for (let i = 0; i < 7 * 48; i++) {
    const from = new Date(lastRealEnd + i * slot);
    const to = new Date(from.getTime() + slot);
    const hour = from.getUTCHours() + from.getUTCMinutes() / 60;
    const dayOffset = Math.floor(i / 48);
    // Synthetic deep-cheap window 2 days out, 00:00–06:00 UTC — very negative
    // to guarantee the savings banner is visible in dry-run testing.
    const base = (dayOffset === 2 && hour >= 0 && hour < 6)
      ? -8
      : 18 + 12 * Math.sin((hour - 6) * Math.PI / 12);
    const noise = (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * 4;
    slots.push({
      from: from.toISOString(),
      to: to.toISOString(),
      pence: Math.round((base + noise) * 100) / 100,
      predicted: true,
    });
  }
  return slots;
}

function computePredictedSavings(appliancesObj, realCandidates, mergedRates, generatedAtMs) {
  const predictedFromSet = new Set(
    mergedRates.filter((r) => r.predicted).map((r) => r.from)
  );
  if (predictedFromSet.size === 0) return [];

  const savings = [];
  for (const [key, app] of Object.entries(appliancesObj)) {
    const realList = realCandidates[key] || [];
    const modeFilter = (c) => app.showAllModesInRecommendation || c.mode === app.defaultMode;
    const realFiltered = realList.filter(modeFilter);
    if (realFiltered.length === 0) continue;
    const realMin = Math.min(...realFiltered.map((c) => c.cost));

    const mergedList = generateCandidates({ [key]: app }, mergedRates)[key] || [];
    const predictedCandidates = mergedList
      .filter(modeFilter)
      .filter((c) => predictedFromSet.has(c.start));
    if (predictedCandidates.length === 0) continue;
    predictedCandidates.sort((a, b) => a.cost - b.cost);
    const predictedBest = predictedCandidates[0];

    const saving = realMin - predictedBest.cost;
    if (saving >= 10) {
      const daysAhead = Math.floor(
        (Date.parse(predictedBest.start) - generatedAtMs) / 86_400_000
      );
      savings.push({
        applianceId: key,
        name: app.name,
        savingPence: Math.round(saving * 10) / 10,
        daysAhead,
        startIso: predictedBest.start,
        mode: predictedBest.mode,
      });
    }
  }
  savings.sort((a, b) => b.savingPence - a.savingPence);
  return savings;
}

function generateFixtureRates() {
  const rates = [];
  const slot = 30 * 60_000;
  const now = new Date();
  const start = new Date(Math.floor(now.getTime() / slot) * slot - 2 * 3600_000);
  for (let i = 0; i < 96; i++) {
    const from = new Date(start.getTime() + i * slot);
    const to = new Date(from.getTime() + slot);
    const hour = from.getUTCHours() + from.getUTCMinutes() / 60;
    const base = 18 + 12 * Math.sin((hour - 6) * Math.PI / 12);
    const noise = (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * 4;
    let pence = base + noise;
    if (i % 31 === 7) pence = -2.5;
    rates.push({ from: from.toISOString(), to: to.toISOString(), pence: Math.round(pence * 100) / 100 });
  }
  return rates;
}

main().catch((err) => {
  console.error('[build] fatal:', err);
  process.exit(1);
});
