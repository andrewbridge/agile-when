import { css } from '../utilities/css.mjs';
import { pickRecommendations } from '../services/recommend.mjs';
import { ukHour } from '../services/time.mjs';
import { formatPounds, formatStartTimeWithDay, formatPence } from '../utilities/format.mjs';

const styles = {
  card: css`
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
  `,
  name: css`
    font-size: 1.1rem;
    font-weight: 600;
    color: #111827;
  `,
  row: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 0.75rem;
    align-items: baseline;
    line-height: 1.4;
  `,
  rowBest: css`
    font-size: 1.05rem;
  `,
  left: css`
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.4rem;
    row-gap: 0.15rem;
    overflow-wrap: anywhere;
  `,
  right: css`
    text-align: right;
    white-space: nowrap;
  `,
  star: css`
    color: #f59e0b;
    font-weight: 600;
    margin-right: 0.25rem;
  `,
  label: css`
    color: #6b7280;
    font-size: 0.85rem;
    font-weight: 500;
  `,
  mode: css`
    font-weight: 600;
    color: #111827;
  `,
  cost: css`
    color: #047857;
    font-weight: 600;
  `,
  costSecondary: css`
    color: #047857;
  `,
  avg: css`
    display: block;
    color: #9ca3af;
    font-size: 0.78rem;
    margin-top: 0.1rem;
  `,
  empty: css`
    color: #6b7280;
    font-style: italic;
    font-size: 0.9rem;
  `,
};

export default {
  name: 'ApplianceCard',
  props: ['appliance', 'candidates', 'now'],
  computed: {
    recommendations() {
      if (!this.candidates || this.candidates.length === 0) return null;
      return pickRecommendations(this.candidates, this.appliance, this.now.getTime(), ukHour);
    },
    nowMs() { return this.now.getTime(); },
  },
  methods: {
    formatPounds,
    formatStartTimeWithDay,
    formatPence,
  },
  template: `
    <div :class="styles.card">
      <div :class="styles.name">{{ appliance.name }}</div>
      <template v-if="recommendations">
        <div :class="[styles.row, styles.rowBest]">
          <div :class="styles.left">
            <span :class="styles.label"><span :class="styles.star">★</span>Best</span>
            <span :class="styles.mode">{{ recommendations.overall.mode }}</span>
            <span>at {{ formatStartTimeWithDay(recommendations.overall.start, nowMs) }}</span>
          </div>
          <div :class="styles.right">
            <span :class="styles.cost">{{ formatPounds(recommendations.overall.cost) }}</span>
            <span :class="styles.avg">avg {{ formatPence(recommendations.overall.avgPerKwh) }}/kWh</span>
          </div>
        </div>
        <div :class="styles.row" v-if="recommendations.alternative">
          <div :class="styles.left">
            <span :class="styles.label">{{ recommendations.alternativeBucket }}</span>
            <span :class="styles.mode">{{ recommendations.alternative.mode }}</span>
            <span>at {{ formatStartTimeWithDay(recommendations.alternative.start, nowMs) }}</span>
          </div>
          <div :class="styles.right">
            <span :class="styles.costSecondary">{{ formatPounds(recommendations.alternative.cost) }}</span>
          </div>
        </div>
      </template>
      <div :class="styles.empty" v-else>
        No upcoming runs in available data.
      </div>
    </div>
  `,
  data: () => ({ styles }),
};
