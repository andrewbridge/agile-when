import { css } from '../utilities/css.mjs';
import { ukTime, ukDayKey, ukDateLabel, ukDayName, currentSlotStart } from '../services/time.mjs';
import { formatPence } from '../utilities/format.mjs';

const styles = {
  wrap: css`
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 0.5rem 0.75rem 0.75rem;
  `,
  heading: css`
    font-size: 0.85rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.4rem 0.25rem;
  `,
  daySection: css`
    margin-top: 0.5rem;
  `,
  dayLabel: css`
    font-size: 0.85rem;
    font-weight: 600;
    color: #6b7280;
    margin: 0.4rem 0.25rem 0.3rem;
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(95px, 1fr));
    gap: 0.25rem;
  `,
  slot: css`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.35rem 0.5rem;
    border-radius: 0.4rem;
    background: #f9fafb;
    font-variant-numeric: tabular-nums;
    border: 1px solid transparent;
  `,
  slotTime: css`
    font-size: 0.75rem;
    color: #6b7280;
  `,
  slotPence: css`
    font-size: 0.95rem;
    font-weight: 600;
    color: #111827;
  `,
  slotCurrent: css`
    background: #fef3c7;
    border-color: #f59e0b;
  `,
  slotNegative: css`
    background: #dbeafe;
    color: #1e3a8a;
    & > * { color: #1e3a8a; }
  `,
  slotCheap: css`
    background: #d1fae5;
    color: #065f46;
    & > * { color: #065f46; }
  `,
  slotPeak: css`
    background: #fee2e2;
    color: #991b1b;
    & > * { color: #991b1b; }
  `,
  slotPredicted: css`
    opacity: 0.5;
    border-style: dashed;
    border-color: #9ca3af;
    background-image: repeating-linear-gradient(
      45deg, transparent, transparent 5px,
      rgba(0,0,0,0.04) 5px, rgba(0,0,0,0.04) 10px);
  `,
  headingRow: css`
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  `,
  forecastCredit: css`
    font-size: 0.75rem;
    font-weight: 400;
    color: #9ca3af;
    text-transform: none;
    letter-spacing: 0;
    text-align: right;
    & > summary {
      cursor: pointer;
      list-style-position: inside;
    }
  `,
  forecastSources: css`
    margin-top: 0.25rem;
    max-width: 18rem;
    line-height: 1.4;
    & a {
      color: #6b7280;
      text-decoration: underline;
    }
  `,
};

export default {
  name: 'RateTable',
  props: ['rates', 'now'],
  computed: {
    currentSlotMs() {
      return currentSlotStart(this.now).getTime();
    },
    upcomingRates() {
      return this.rates.filter((r) => new Date(r.to).getTime() > this.now.getTime());
    },
    hasPredicted() {
      return this.upcomingRates.some((r) => r.predicted);
    },
    days() {
      const groups = new Map();
      for (const r of this.upcomingRates) {
        const d = new Date(r.from);
        const key = ukDayKey(d);
        if (!groups.has(key)) groups.set(key, { label: this.dayLabel(d), rates: [] });
        groups.get(key).rates.push(r);
      }
      return [...groups.values()];
    },
  },
  methods: {
    dayLabel(date) {
      const today = ukDayKey(this.now);
      const tomorrowDate = new Date(this.now.getTime() + 24 * 3600_000);
      const tomorrow = ukDayKey(tomorrowDate);
      const k = ukDayKey(date);
      if (k === today) return `Today (${ukDayName(date)} ${ukDateLabel(date)})`;
      if (k === tomorrow) return `Tomorrow (${ukDayName(date)} ${ukDateLabel(date)})`;
      return `${ukDayName(date)} ${ukDateLabel(date)}`;
    },
    slotClasses(rate) {
      const fromMs = new Date(rate.from).getTime();
      const classes = [styles.slot];
      const isCurrent = fromMs === this.currentSlotMs;
      if (rate.pence < 0) classes.push(styles.slotNegative);
      else if (rate.pence > 30) classes.push(styles.slotPeak);
      else if (rate.pence < 15) classes.push(styles.slotCheap);
      if (isCurrent) classes.push(styles.slotCurrent);
      if (rate.predicted) classes.push(styles.slotPredicted);
      return classes;
    },
    slotTime(rate) {
      return ukTime(new Date(rate.from));
    },
    formatPence,
  },
  template: `
    <section :class="styles.wrap">
      <div :class="styles.headingRow">
        <div :class="styles.heading">Rates</div>
        <details v-if="hasPredicted" :class="styles.forecastCredit">
          <summary>Faded = forecast</summary>
          <div :class="styles.forecastSources">
            Forecast prices are averaged from
            <a href="https://agilepredict.com" target="_blank" rel="noopener">AgilePredict</a>,
            <a href="https://agileforecast.co.uk" target="_blank" rel="noopener">AgileForecast</a>
            and <a href="https://x2r.uk" target="_blank" rel="noopener">X2R</a>.
          </div>
        </details>
      </div>
      <div v-for="d in days" :key="d.label" :class="styles.daySection">
        <div :class="styles.dayLabel">{{ d.label }}</div>
        <div :class="styles.grid">
          <div v-for="r in d.rates" :key="r.from" :class="slotClasses(r)" :title="r.predicted ? 'Forecast' : null">
            <span :class="styles.slotTime">{{ slotTime(r) }}</span>
            <span :class="styles.slotPence">{{ formatPence(r.pence) }}</span>
          </div>
        </div>
      </div>
    </section>
  `,
  data: () => ({ styles }),
};
