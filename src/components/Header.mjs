import { css } from '../utilities/css.mjs';
import { ukTime, ukDateLabel } from '../services/time.mjs';

const styles = {
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.85rem;
    color: #4b5563;
  `,
  title: css`
    font-weight: 600;
    color: #111827;
    font-size: 1rem;
  `,
  badge: css`
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: #eef2ff;
    color: #3730a3;
    font-size: 0.75rem;
    font-weight: 500;
    margin-left: 0.5rem;
  `,
  meta: css`
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  `,
};

export default {
  name: 'AppHeader',
  props: ['region', 'generatedAt', 'lastSlotEnd'],
  computed: {
    generatedLabel() {
      if (!this.generatedAt) return '—';
      const d = new Date(this.generatedAt);
      return `${ukDateLabel(d)} ${ukTime(d)}`;
    },
    coverageLabel() {
      if (!this.lastSlotEnd) return '—';
      const d = new Date(this.lastSlotEnd);
      return `${ukDateLabel(d)} ${ukTime(d)}`;
    },
  },
  template: `
    <header :class="styles.header">
      <div>
        <span :class="styles.title">Agile when?</span>
        <span :class="styles.badge" v-if="region">{{ region.name }} ({{ region.code }})</span>
      </div>
      <div :class="styles.meta">
        <span>Updated {{ generatedLabel }}</span>
        <span>Covers to {{ coverageLabel }}</span>
      </div>
    </header>
  `,
  data: () => ({ styles }),
};
