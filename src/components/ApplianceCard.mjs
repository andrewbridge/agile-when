import { css } from '../utilities/css.mjs';
import { pickRecommendations, pickBestPerMode } from '../services/recommend.mjs';
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
  header: css`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  `,
  name: css`
    font-size: 1.1rem;
    font-weight: 600;
    color: #111827;
  `,
  modesButton: css`
    flex: none;
    appearance: none;
    border: 1px solid #e5e7eb;
    background: #f9fafb;
    color: #4b5563;
    border-radius: 0.5rem;
    padding: 0.2rem 0.5rem;
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    white-space: nowrap;
    &:hover {
      background: #f3f4f6;
      color: #111827;
    }
  `,
  dialog: css`
    border: none;
    border-radius: 0.75rem;
    padding: 0;
    width: min(28rem, calc(100vw - 2rem));
    box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    color: #111827;
    &::backdrop {
      background: rgba(17, 24, 39, 0.45);
    }
  `,
  dialogHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #f0f1f3;
  `,
  dialogTitle: css`
    font-size: 1rem;
    font-weight: 600;
  `,
  dialogClose: css`
    appearance: none;
    border: none;
    background: transparent;
    color: #6b7280;
    font-size: 1.4rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 0.25rem;
    &:hover { color: #111827; }
  `,
  dialogBody: css`
    padding: 0.5rem 1.25rem 1.25rem;
    display: flex;
    flex-direction: column;
  `,
  modeRow: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 0.75rem;
    align-items: baseline;
    padding: 0.6rem 0;
    border-bottom: 1px solid #f3f4f6;
    &:last-child { border-bottom: none; }
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
    modeBestTimes() {
      if (!this.candidates || this.candidates.length === 0) return [];
      return pickBestPerMode(this.candidates, this.appliance, this.nowMs);
    },
    hasMultipleModes() {
      return (this.appliance.modes?.length || 0) > 1;
    },
  },
  methods: {
    formatPounds,
    formatStartTimeWithDay,
    formatPence,
    openModes() {
      this.$refs.modesDialog?.showModal();
    },
    closeModes() {
      this.$refs.modesDialog?.close();
    },
  },
  template: `
    <div :class="styles.card">
      <div :class="styles.header">
        <div :class="styles.name">{{ appliance.name }}</div>
        <button
          v-if="hasMultipleModes && modeBestTimes.length"
          type="button"
          :class="styles.modesButton"
          @click="openModes"
          :aria-label="'Compare best times for each ' + appliance.name + ' mode'"
        >☰ Modes</button>
      </div>
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

      <dialog ref="modesDialog" :class="styles.dialog" @click="$event.target === $refs.modesDialog && closeModes()">
        <div :class="styles.dialogHeader">
          <div :class="styles.dialogTitle">{{ appliance.name }} — best time per mode</div>
          <button type="button" :class="styles.dialogClose" @click="closeModes" aria-label="Close">×</button>
        </div>
        <div :class="styles.dialogBody">
          <div :class="styles.modeRow" v-for="(item, index) in modeBestTimes" :key="item.mode">
            <div :class="styles.left">
              <span v-if="index === 0" :class="styles.star">★</span>
              <span :class="styles.mode">{{ item.mode }}</span>
              <span>at {{ formatStartTimeWithDay(item.start, nowMs) }}</span>
            </div>
            <div :class="styles.right">
              <span :class="styles.cost">{{ formatPounds(item.cost) }}</span>
              <span :class="styles.avg">avg {{ formatPence(item.avgPerKwh) }}/kWh</span>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  `,
  data: () => ({ styles }),
};
