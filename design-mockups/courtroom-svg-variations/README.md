# Courtroom Screen — SVG UI Concept Variations

UI-only concepts for the **Friendship Court** screen (`src/components/screens/FriendshipCourtScreen.tsx`).
All concepts reuse the app's character language: **stickman with avatar head** — a circle avatar in a
colored accent ring + rounded-bar spine/arms/legs (`src/components/court/CourtStickman.tsx`), with pose
variants (arms raised = objecting, slumped = accused/defeated, hand up = sworn in, pointing = accusing).

Each file is a full 390×844 phone screen. Open in a browser or drop into Figma.

---

## Color scheme analysis (from the codebase)

### Dark base (design-system.css + court screen)
| Token | Value | Use |
|---|---|---|
| Background | `#0b0f0a → #0a0d0b → #050705` | green-tinted near-black vertical gradient |
| Surface | `rgba(255,255,255,0.04)` | glass cards/inputs |
| Border | `rgba(255,255,255,0.08)` | hairlines |
| Muted text | `#7c8a80`, `#5b6b60` | captions, placeholders |

### Court role palette (`COURT_PALETTE`)
| Color | Hex | Meaning in court |
|---|---|---|
| Green | `#4ade80 → #22c55e` | primary CTA — SLAM, statement drop, "not guilty" affirm |
| Rose | `#fb7185` (`#fda4af` text) | prosecution / accuser / GUILTY |
| Sky | `#38bdf8` (`#7dd3fc` text) | defense / accused / NOT GUILTY |
| Gold | `#facc15` (`#fde68a` text) | judge, bench, verdict, ceremony |
| Purple | `#c084fc` (`#e9d5ff` text) | witnesses / wildcard seed |

The rose-vs-sky opposition with gold as the neutral authority is the strongest asset of the current
screen — every concept keeps it. Green stays reserved for the one action you can take (SLAM/vote),
matching the rest of the app where green = primary action.

### Light "pop-social" theme (`html[data-dare-theme="pop-social"]`)
Cream `#fff8ef → #f2fff8 → #eef9ff` canvas, mint `#23d98e`, coral `#ff5f7e`, cyan `#21c7e8`,
sunshine `#ffd84d`, purple `#a78bfa`, ink text `#17211d`. White sticker-cards with colored 2px borders.

---

## The concepts

| # | File | Idea |
|---|---|---|
| 01 | `01-verdict-noir.svg` | **Refinement of the current theme.** Spotlight stage, phase rail chips, gold bench, rose/sky podiums with objecting + slumped stickmen, tug-of-war verdict meter with gold needle, reaction pills, sealed-statement composer with green SLAM. |
| 02 | `02-pop-court.svg` | **Light pop-social skin.** Cream canvas, confetti, sticker-style tilted cards, judge with wig curls, "OBJECTION!" speech bubble, votes as a donut (8:6), TEAM ACCUSE vs TEAM DEFEND podiums. |
| 03 | `03-neon-tribunal.svg` | **VS battle mode.** Diagonal rose/sky arena split with dashed gold frontier, big VS badge, fighting-stance accuser vs shield-bearing accused, hero verdict tug-of-war with 🔥 frontline marker, betting-style vote buttons, live argument feed. |
| 04 | `04-golden-gavel.svg` | **Prestige drama.** Purple velvet + gold trim, curtains, tall ornate bench with laurel-crowned judge, scales-of-friendship as the verdict centerpiece (heavier pan dips), sworn-in witness stand, CONDEMN / GRANT MERCY verdict actions. |
| 05 | `05-tabloid-trial.svg` | **Breaking-news meme energy.** Headline banner, paper "courtroom sketch" panel with halftone dots and ink-stroke stickmen, HIM! accusation burst, public-opinion poll bars, gold hot-take ticker, witness "SUBPOENA" queue, PUBLISH composer. |
| 06 | `06-stadium-court.svg` | **Spectator arena.** Trial in a center ring, judge elevated, betting-odds chips (1.4x vs 2.1x), curved gallery rows of mini circle-headed fans in palette colors, floating crowd emoji, reaction bar, BACK GUILTY / BACK INNOCENT / HYPE IT footer. |

## Reusable ideas regardless of theme
- **Tug-of-war verdict meter** (01, 03) reads much faster than the current text tally and creates live drama as votes shift.
- **Pose = state**: arms up (speaking/objecting), slumped (accused), hand raised (sworn witness), pointing (accusation) — zero-cost storytelling with the existing stickman geometry.
- **Reaction pills under the stage** (01, 06) give spectators something to do while it's not their turn.
- **Phase rail** (01) makes the trial flow (Opening → Verdict) visible at all times instead of only in the subtitle.
