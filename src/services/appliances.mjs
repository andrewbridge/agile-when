export const appliances = {
  dishwasher: {
    name: 'Dishwasher',
    modes: [
      { name: 'Eco',     durationMinutes: 225, kwh: 0.90, distribution: [0.60, 0.25, 0.15] },
      { name: 'Auto',    durationMinutes: 135, kwh: 0.95, distribution: [0.60, 0.25, 0.15] },
      { name: 'Express', durationMinutes:  60, kwh: 1.10, distribution: [0.60, 0.25, 0.15] },
    ],
    defaultMode: 'Eco',
    showAllModesInRecommendation: true,
  },
  washingMachine: {
    name: 'Washing machine',
    modes: [
      { name: 'Mixed',      durationMinutes: 150, kwh: 0.80, distribution: [0.75, 0.10, 0.15] },
      { name: '20min 3kg',  durationMinutes:  20, kwh: 0.25, distribution: [0.75, 0.10, 0.15] },
    ],
    defaultMode: 'Mixed',
    showAllModesInRecommendation: false,
  },
};

export const applianceOrder = ['dishwasher', 'washingMachine'];
