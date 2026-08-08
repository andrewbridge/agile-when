import { mkdir, cp, writeFile, readFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { fetchRates, computeStats, lastRealSlotEnd, decideBuild, coverageHoursAhead } from './rates.mjs';
import { resolveDataMode } from './options.mjs';
import { fetchAllPredicted, mergeRates } from './predicted.mjs';
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
const MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash';
const API_KEY = process.env.OPENROUTER_API_KEY;
const DRY_RUN = process.env.BUILD_DRY_RUN === '1';
const ARGV = process.argv.slice(2);
// Set by the final scheduled run of the day, so a publication window that
// passed without any new rates still fails loudly instead of skipping forever.
const LAST_ATTEMPT = process.env.LAST_ATTEMPT === '1' || process.env.LAST_ATTEMPT === 'true';
const CACHE_URL = process.env.CACHE_URL || 'https://andrewbridge.github.io/agile-when/data.json';
const PREDICT_DISABLE = process.env.PREDICT_DISABLE === '1';

function log(...a) { console.log('[build]', ...a); }
function warn(...a) { console.warn('[build]', ...a); }

async function setStepOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  await appendFile(file, `${name}=${value}\n`);
}

// Read the currently deployed data.json so the build can tell whether it has
// anything new to offer. A failure here is not fatal — we just lose the ability
// to compare, and decideBuild errs towards building.
async function readPublished() {
  try {
    const res = await fetch(CACHE_URL, { cache: 'no-store' });
    if (!res.ok) {
      warn(`Published data check: ${CACHE_URL} returned HTTP ${res.status}`);
      return { ok: false };
    }
    const cached = await res.json();
    const lastRealEndMs = lastRealSlotEnd(cached?.rates);
    log(`Published data: generatedAt=${cached?.generatedAt ?? 'unknown'}, real rates cover to ${lastRealEndMs ? new Date(lastRealEndMs).toISOString() : 'nothing'}`);
    return { ok: true, generatedAt: cached?.generatedAt ?? null, lastRealEndMs };
  } catch (err) {
    warn('Published data check failed:', err.message);
    return { ok: false };
  }
}

async function main() {
  const dataMode = resolveDataMode(ARGV, process.env);
  log(`Data mode: ${dataMode}`);

  // Reuse: ship the code with the data that is already published. Nothing
  // upstream is contacted, so a code deploy cannot be blocked by an Octopus or
  // OpenRouter outage. Falling back to a full generation keeps a first-ever
  // deploy (or a Pages hiccup) from publishing a site with no data.
  if (!DRY_RUN && dataMode === 'reuse') {
    if (await redeployPublishedData()) {
      await setStepOutput('skip', 'false');
      return;
    }
    warn('Nothing to reuse — generating data instead.');
  }
  const force = dataMode === 'regenerate' || dataMode === 'reuse';

  const generatedAt = new Date().toISOString();
  const periodFrom = new Date(Date.now() - 60 * 60_000).toISOString();
  // 48h rather than 36h so a run near either edge of the publication window
  // still asks for the whole of the next delivery day; Octopus returns only
  // what exists, so over-asking costs nothing and keeps the coverage
  // comparison from under-reading.
  const periodTo = new Date(Date.now() + 48 * 3600_000).toISOString();

  let rates;
  if (DRY_RUN) {
    log('Dry run: generating fixture rates');
    rates = generateFixtureRates();
    await setStepOutput('skip', 'false');
  } else {
    log(`Fetching rates ${PRODUCT} ${REGION} from ${periodFrom} to ${periodTo}`);
    // The gate compares fetched coverage against published coverage, so both
    // are needed before deciding — fetch them together.
    const [published, fetched] = await Promise.all([
      force ? Promise.resolve({ ok: false }) : readPublished(),
      fetchRates({ product: PRODUCT, region: REGION, periodFrom, periodTo }),
    ]);
    rates = fetched;
    log(`Got ${rates.length} rate slots`);

    const decision = decideBuild({
      force,
      publishedOk: published.ok,
      publishedEndMs: published.lastRealEndMs ?? 0,
      fetchedEndMs: lastRealSlotEnd(rates),
      nowMs: Date.now(),
      lastAttempt: LAST_ATTEMPT,
    });

    if (!decision.build) {
      await setStepOutput('skip', 'true');
      if (decision.fatal || decision.alarm) {
        console.log(`::error::${decision.reason}`);
        process.exit(1);
      }
      console.log(`::notice::${decision.reason} — skipping deploy, the next scheduled run will retry.`);
      log(decision.reason);
      return;
    }
    log(decision.reason);
    await setStepOutput('skip', 'false');
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
  let forecastSources = [];
  if (DRY_RUN) {
    predictedSlots = generateFixturePredictedSlots(rates);
    forecastCreatedAt = new Date().toISOString();
    log(`Dry run: generated ${predictedSlots.length} fixture predicted slots`);
  } else if (PREDICT_DISABLE) {
    log('Predicted rates disabled (PREDICT_DISABLE=1)');
  } else {
    const result = await fetchAllPredicted({ region: REGION, days: 7 });
    predictedSlots = result.slots;
    forecastCreatedAt = result.createdAt;
    forecastSources = result.sources;
    for (const source of forecastSources) {
      if (source.ok) {
        log(`${source.name}: ${source.slotCount} forecast slots`);
      } else {
        warn(`${source.name} forecast fetch failed:`, source.error);
      }
    }
    const okSources = forecastSources.filter((s) => s.ok);
    if (okSources.length === 0) {
      forecastError = forecastSources.map((s) => `${s.name}: ${s.error}`).join(' | ');
      warn('All forecast sources failed — no predicted rates.');
    } else {
      log(`Averaged ${predictedSlots.length} predicted slots from ${okSources.length}/${forecastSources.length} source(s) (forecast created ${forecastCreatedAt})`);
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
      source: 'averaged',
      sources: forecastSources,
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

  await writeSite(JSON.stringify(payload), generatedAt);
}

// Assemble dist/: the site source, an sw.js stamped so caches bust, and the
// data.json body. Shared by the generate and reuse paths — reuse passes the
// already-published body through verbatim, but still stamps a fresh version so
// the new code actually reaches browsers.
async function writeSite(dataJson, versionSource) {
  await mkdir(DIST, { recursive: true });
  await cp(SRC, DIST, { recursive: true });

  const version = versionSource.replace(/[-:]/g, '').replace(/\..*/, '');
  const swPath = resolve(DIST, 'sw.js');
  const sw = await readFile(swPath, 'utf8');
  await writeFile(swPath, sw.replaceAll('%VERSION%', version));
  log(`Stamped sw.js with version ${version}`);

  await writeFile(resolve(DIST, 'data.json'), dataJson);
  log(`Wrote ${resolve(DIST, 'data.json')}`);
}

// Redeploy the published data.json unchanged. Returns false if there is nothing
// to reuse, so the caller can fall back to generating rather than shipping a
// site with no data at all.
async function redeployPublishedData() {
  let body;
  try {
    const res = await fetch(CACHE_URL, { cache: 'no-store' });
    if (!res.ok) {
      warn(`Cannot reuse published data: ${CACHE_URL} returned HTTP ${res.status}`);
      return false;
    }
    body = await res.text();
  } catch (err) {
    warn('Cannot reuse published data:', err.message);
    return false;
  }

  let coverageEndMs = 0;
  try {
    coverageEndMs = lastRealSlotEnd(JSON.parse(body)?.rates);
  } catch {
    warn('Published data.json is not valid JSON — regenerating instead.');
    return false;
  }
  if (!coverageEndMs) {
    warn('Published data.json has no real rates — regenerating instead.');
    return false;
  }
  const hoursAhead = coverageHoursAhead(coverageEndMs, Date.now());
  if (hoursAhead <= 0) {
    warn(`Reused data has already elapsed (ended ${new Date(coverageEndMs).toISOString()}) — deploying it anyway; the next scheduled run will refresh it.`);
  } else {
    log(`Reusing published data (covers ${hoursAhead.toFixed(1)}h ahead, to ${new Date(coverageEndMs).toISOString()})`);
  }

  await writeSite(body, new Date().toISOString());
  return true;
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
