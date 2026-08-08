// How the build should treat the data generation step.
//
//   reuse        Skip generation entirely and redeploy the currently published
//                data.json alongside the new code. No Octopus, no forecast
//                sources, no OpenRouter — so a code deploy is fast and cannot
//                be blocked by an upstream outage.
//   regenerate   Always regenerate, whatever the freshness gate says. For when
//                a code change touches the generation code itself.
//   conditional  Run the freshness gate and only rebuild if there is new rate
//                data. This is what the scheduled runs use.
export const DATA_MODES = ['reuse', 'regenerate', 'conditional'];

const DATA_FLAG = '--data=';

export function resolveDataMode(argv = [], env = {}) {
  const flag = argv.find((a) => a.startsWith(DATA_FLAG));
  const explicit = flag !== undefined ? flag.slice(DATA_FLAG.length) : env.DATA_MODE;
  if (explicit !== undefined) {
    if (!DATA_MODES.includes(explicit)) {
      throw new Error(`Unknown data mode ${JSON.stringify(explicit)} — expected one of: ${DATA_MODES.join(', ')}`);
    }
    return explicit;
  }
  // Flags from before the modes existed; both meant "ignore the freshness gate".
  if (argv.includes('--force') || argv.includes('--no-cache')
    || env.FORCE === '1' || env.FORCE === 'true'
    || env.NO_CACHE === '1' || env.NO_CACHE === 'true') {
    return 'regenerate';
  }
  return 'conditional';
}
