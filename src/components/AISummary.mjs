import { css } from '../utilities/css.mjs';
import { ukHourFractional } from '../services/time.mjs';
import { pickNearestAnchor } from '../services/anchors.mjs';

const styles = {
  wrap: css`
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  `,
  heading: css`
    font-size: 0.85rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  body: css`
    line-height: 1.5;
    color: #111827;
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

export default {
  name: 'AISummary',
  props: ['summaries', 'summaryModel', 'now'],
  computed: {
    selectedAnchor() {
      return pickNearestAnchor(ukHourFractional(this.now));
    },
    text() {
      if (!this.summaries) return null;
      const candidate = this.summaries[this.selectedAnchor.key];
      return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
    },
  },
  template: `
    <section :class="styles.wrap">
      <div :class="styles.heading">Summary</div>
      <template v-if="text">
        <div :class="styles.body">{{ text }}</div>
        <div :class="styles.credit" v-if="summaryModel">via {{ summaryModel }}</div>
      </template>
      <div :class="styles.unavailable" v-else>AI summary unavailable.</div>
    </section>
  `,
  data: () => ({ styles }),
};
