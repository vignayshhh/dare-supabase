import {
  calculateAuraChange,
  DARE_STREAK_REWARDS,
  INITIAL_AURA,
  LIKE_MILESTONE_REWARDS,
  normalizeAuraBalance,
} from "../auraPolicy";

describe("Aura policy", () => {
  it("starts missing balances at 100", () => {
    expect(normalizeAuraBalance(undefined)).toBe(INITIAL_AURA);
  });

  it("adds positive Aura to current and lifetime", () => {
    expect(calculateAuraChange(100, 100, 200)).toEqual({
      appliedAmount: 200,
      currentAura: 300,
      lifetimeAura: 300,
    });
  });

  it("deducts only current Aura", () => {
    expect(calculateAuraChange(420, 900, -100)).toEqual({
      appliedAmount: -100,
      currentAura: 320,
      lifetimeAura: 900,
    });
  });

  it("clamps current Aura at zero without reducing lifetime", () => {
    expect(calculateAuraChange(40, 700, -100)).toEqual({
      appliedAmount: -40,
      currentAura: 0,
      lifetimeAura: 700,
    });
  });

  it("contains only the approved like and streak milestone rewards", () => {
    expect(LIKE_MILESTONE_REWARDS).toEqual({ 25: 100, 50: 200, 100: 500 });
    expect(DARE_STREAK_REWARDS).toEqual({ 3: 100, 7: 200, 30: 500 });
  });
});
