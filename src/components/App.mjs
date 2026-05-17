import { css } from '../utilities/css.mjs';
import { store } from '../services/data.mjs';
import { appliances, applianceOrder } from '../services/appliances.mjs';
import { ukDateLabel, ukHour } from '../services/time.mjs';
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
  forecastBanner: css`
    background: #dbeafe;
    color: #1e3a8a;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.85rem;
  `,
  forecastList: css`
    margin: 0.25rem 0 0 1.1rem;
    padding: 0;
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
      // Only warn after 7pm UK time if the data wasn't generated today (UK date).
      if (ukHour(this.now) < 19) return false;
      return ukDateLabel(new Date(this.data.generatedAt)) !== ukDateLabel(this.now);
    },
    predictedSavings() {
      return this.data?.predictedSavings || [];
    },
  },
  methods: {
    daysLabel(n) {
      if (n <= 0) return 'today';
      if (n === 1) return 'tomorrow';
      return `in ${n} days`;
    },
    formatDay(iso) {
      return ukDateLabel(new Date(iso));
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
            Today's rates haven't loaded yet. Refresh the page to check for the latest data.
          </div>
          <div v-if="predictedSavings.length" :class="styles.forecastBanner">
            <strong>Cheaper windows forecast ahead</strong>
            <ul :class="styles.forecastList">
              <li v-for="s in predictedSavings" :key="s.applianceId">
                {{ s.name }} — save ~{{ s.savingPence }}p {{ daysLabel(s.daysAhead) }} ({{ formatDay(s.startIso) }}, forecast)
              </li>
            </ul>
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
