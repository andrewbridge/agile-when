import { css } from '../utilities/css.mjs';
import { ukHour } from '../services/time.mjs';

const styles = {
  wrap: css`
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  `,
  heading: css`
    font-size: 0.85rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  block: css`
    line-height: 1.5;
    color: #111827;
  `,
  blockLabel: css`
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-right: 0.4rem;
  `,
  unavailable: css`
    color: #6b7280;
    font-style: italic;
  `,
  credit: css`
    color: #9ca3af;
    font-size: 0.75rem;
    margin-top: 0.2rem;
  `,
};

const KEY_LABELS = {
  now: 'Now',
  next6h: 'Next 6h',
  overnight: 'Overnight',
  tomorrowMorning: 'Tomorrow morning',
};

export default {
  name: 'AISummary',
  props: ['summaries', 'summaryModel', 'now'],
  computed: {
    selectedKeys() {
      const h = ukHour(this.now);
      if (h >= 6 && h < 12) return ['tomorrowMorning', 'next6h'];
      if (h >= 12 && h < 18) return ['now', 'next6h'];
      if (h >= 18 && h < 24) return ['now', 'overnight'];
      return ['now'];
    },
    blocks() {
      if (!this.summaries) return [];
      return this.selectedKeys
        .map((k) => ({ key: k, label: KEY_LABELS[k], text: this.summaries[k] }))
        .filter((b) => typeof b.text === 'string' && b.text.length > 0);
    },
  },
  template: `
    <section :class="styles.wrap">
      <div :class="styles.heading">Summary</div>
      <template v-if="blocks.length">
        <div v-for="b in blocks" :key="b.key" :class="styles.block">
          <span :class="styles.blockLabel">{{ b.label }}</span>{{ b.text }}
        </div>
        <div :class="styles.credit" v-if="summaryModel">via {{ summaryModel }}</div>
      </template>
      <div :class="styles.unavailable" v-else>AI summary unavailable.</div>
    </section>
  `,
  data: () => ({ styles }),
};
