/** Published product limits. Checkout is enabled only by server configuration. */
export const PLAN = { name: 'Полка', offerVersion: '2026-10-11', priceRub: 50, periodDays: 30, aiPeriod: 100 } as const;
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

// Owner allowances are finite so counters and JSON remain predictable.
// File sizes and assessment history retain the infrastructure limits.
export const OWNER_LIMITS = { ...PILOT_LIMITS, materials: 10000, storageBytes: 10 * 1024 ** 3,
 aiDaily: 200, aiPeriod: 6000, topics: 20000, chats: 1000, chatQuestions: 100, chatAnswers: 200 } as const;
export type UserLimits = { [K in keyof typeof PILOT_LIMITS]: number };

// orvo plus and premium (https://orvo-id.vercel.app/plus): one subscription across orvo projects.
// Numbers match what orvo ID shows people on /plus.
export const PLUS_LIMITS = { ...PILOT_LIMITS, materials: 1000, storageBytes: 2 * 1024 ** 3,
 aiDaily: 60, aiPeriod: 1200, topics: 2000, chats: 200, chatQuestions: 40, chatAnswers: 80 } as const;
export const PREMIUM_LIMITS = { ...PILOT_LIMITS, materials: 5000, storageBytes: 10 * 1024 ** 3,
 aiDaily: 200, aiPeriod: 4000, topics: 10000, chats: 600, chatQuestions: 100, chatAnswers: 200 } as const;
export type OrvoPlan = 'free' | 'plus' | 'premium';
/** Owner and orvo subscribers never hit the paid-period wall. */
export const fullAccess = (limits: UserLimits) => limits === OWNER_LIMITS || limits === PLUS_LIMITS || limits === PREMIUM_LIMITS;
