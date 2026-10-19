export const INITIAL_AURA = 100;

export const LIKE_MILESTONE_REWARDS: Readonly<Record<number, number>> = {
  25: 100,
  50: 200,
  100: 500,
};

export const DARE_STREAK_REWARDS: Readonly<Record<number, number>> = {
  3: 100,
  7: 200,
  30: 500,
};

export function normalizeAuraBalance(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : INITIAL_AURA;
}

export function calculateAuraChange(
  currentValue: unknown,
  lifetimeValue: unknown,
  requestedAmount: number,
) {
  const currentAura = normalizeAuraBalance(currentValue);
  const lifetimeAura = Math.max(
    currentAura,
    normalizeAuraBalance(lifetimeValue),
  );
  const requested = Math.trunc(requestedAmount);
  const nextCurrentAura = Math.max(0, currentAura + requested);
  const appliedAmount = nextCurrentAura - currentAura;
  const nextLifetimeAura =
    lifetimeAura + (appliedAmount > 0 ? appliedAmount : 0);
  return {
    appliedAmount,
    currentAura: nextCurrentAura,
    lifetimeAura: nextLifetimeAura,
  };
}
