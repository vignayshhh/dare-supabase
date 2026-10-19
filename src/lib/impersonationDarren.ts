// 🎯 Darren prompts for the Impersonation Event.
//
// Darren acts as the host, not a player — he occasionally nudges the
// impersonator to stay believable and the target to dig for the truth. These
// are purely for fun. Local/curated for now; the signature is shaped so it can
// later defer to the Darren brain / Claude API without changing callers.

import type { ImpersonationMessageRole } from "@/middleware/services/impersonation.service";

export interface ImpersonationDarrenContext {
  /** Display name of the person being impersonated (e.g. "Rahul"). */
  impersonatedName: string;
  /** Display name of the target detective (e.g. "Priya"). */
  targetName: string;
}

const IMPERSONATOR_PROMPTS = (ctx: ImpersonationDarrenContext): string[] => [
  `Use ${ctx.impersonatedName}'s favourite phrase before the next clue.`,
  `Make ${ctx.targetName} ask "Are you okay?"`,
  `Drop a tiny inside joke only ${ctx.impersonatedName} would know.`,
  `Match ${ctx.impersonatedName}'s punctuation — they never use full stops, right?`,
  `Compliment ${ctx.targetName} the way ${ctx.impersonatedName} would.`,
  `Bring up a memory. Keep it vague enough to survive a follow-up.`,
  `Type a little slower. You're sounding too eager to prove yourself.`,
];

const TARGET_PROMPTS = (ctx: ImpersonationDarrenContext): string[] => [
  `Ask a question only ${ctx.impersonatedName} and you would know.`,
  `They're slipping. Pay attention to their wording.`,
  `Bring up something from last week and watch how they react.`,
  `Ask about a nickname. Fakes always fumble the nickname.`,
  `Change the subject suddenly — see if they keep up like ${ctx.impersonatedName} would.`,
  `Notice the rhythm. Does this feel like ${ctx.impersonatedName}?`,
];

/**
 * Deterministically pick a prompt for the given audience. Pass an increasing
 * `seed` (e.g. a counter or timestamp-derived index) to walk through prompts
 * without immediate repeats.
 */
export function nextImpersonationPrompt(
  audience: ImpersonationMessageRole,
  ctx: ImpersonationDarrenContext,
  seed: number,
): string {
  const pool =
    audience === "impersonator"
      ? IMPERSONATOR_PROMPTS(ctx)
      : TARGET_PROMPTS(ctx);
  const index = ((Math.floor(seed) % pool.length) + pool.length) % pool.length;
  return pool[index];
}
