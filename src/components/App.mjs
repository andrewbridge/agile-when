import { css } from '../utilities/css.mjs';
import { store } from '../services/data.mjs';
import { appliances, applianceOrder } from '../services/appliances.mjs';
import Header from './Header.mjs';
import ApplianceCard from './ApplianceCard.mjs';
import AISummary from './AISummary.mjs';
import RateTable from './RateTable.mjs';

const styles = {
  shell: css`
    max-width: 960px;
    margin: 0 auto;
    padding: 0 0 2rem;
  `,
  body: css`
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  `,
  cards: css`
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr;
    @media (min-width: 720px) {
      grid-template-columns: 1fr 1fr;
    }
  `,
  loading: css`
    padding: 2rem;
    text-align: center;
    color: #6b7280;
  `,
  error: css`
    padding: 1rem;
    background: #fee2e2;
    color: #991b1b;
    border-radius: 0.5rem;
  `,
  staleBanner: css`
    background: #fef3c7;
    color: #92400e;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.85rem;
  `,
};

export default {
  name: 'App',
  components: { AppHeader: Header, ApplianceCard, AISummary, RateTable },
  computed: {
    data() { return store.data; },
    loaded() { return store.loaded; },
    error() { return store.error; },
    now() { return store.now; },
    lastSlotEnd() {
      if (!this.data?.rates?.length) return null;
      return this.data.rates[this.data.rates.length - 1].to;
    },
    appliancesList() {
      return applianceOrder.map((key) => ({
        key,
        appliance: appliances[key],
        candidates: this.data?.candidates?.[key] || [],
      }));
    },
    isStale() {
      if (!this.data?.generatedAt) return false;
      const ageMs = this.now.getTime() - new Date(this.data.generatedAt).getTime();
      return ageMs > 14 * 3600_000;
    },
  },
  template: `
    <div :class="styles.shell">
      <AppHeader v-if="data" :region="data.region" :generated-at="data.generatedAt" :last-slot-end="lastSlotEnd" />
      <div :class="styles.body">
        <div v-if="!loaded" :class="styles.loading">Loading…</div>
        <div v-else-if="error" :class="styles.error">Couldn't load data: {{ error }}</div>
        <template v-else-if="data">
          <div v-if="isStale" :class="styles.staleBanner">
            Data is more than 14 hours old. Refresh the page for the latest rates.
          </div>
          <div :class="styles.cards">
            <ApplianceCard
              v-for="item in appliancesList"
              :key="item.key"
              :appliance="item.appliance"
              :candidates="item.candidates"
              :now="now"
            />
          </div>
          <AISummary :summaries="data.summaries" :summary-model="data.summaryModel" :now="now" />
          <RateTable :rates="data.rates" :now="now" />
        </template>
      </div>
    </div>
  `,
  data: () => ({ styles }),
};
