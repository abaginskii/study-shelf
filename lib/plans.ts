/** Published product limits. Billing is intentionally not enabled yet. */
export const PLAN = { name: 'Полка', priceRub: 399, periodDays: 30, aiPeriod: 100 } as const;
export const PILOT_LIMITS = {
  materials: 100,
  storageBytes: 300 * 1024 * 1024,
  aiDaily: 15,
  aiPeriod: PLAN.aiPeriod,
  topics: 200,
  chats: 30,
  uploadBytes: 60 * 1024 * 1024,
  aiFileBytes: 20 * 1024 * 1024,
  chatQuestions: 20,
  chatAnswers: 40,
  assessmentsPerMaterial: 80,
} as const;
export const AI_PERIOD_MS = PLAN.periodDays * 86400000;
