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
      { name: '40° Cotton', durationMinutes: 165, kwh: 0.85, distribution: [0.70, 0.20, 0.10] },
      { name: 'Quick 30',   durationMinutes:  30, kwh: 0.40, distribution: [0.70, 0.20, 0.10] },
    ],
    defaultMode: '40° Cotton',
    showAllModesInRecommendation: false,
  },
};

export const applianceOrder = ['dishwasher', 'washingMachine'];
