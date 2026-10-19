"use client";

import { Avatar } from "../ui/Avatar";

/* ────────────────────────────────────────────────────────────
   Court Stickman — avatar head + limb bars.
   Geometry mirrors PartyStickman (birthday/PartyRoom.tsx) so the
   character language is consistent across the app.
   Palette matches the shared circle palette.
──────────────────────────────────────────────────────────── */

export const COURT_PALETTE = [
  "#4ade80",
  "#38bdf8",
  "#fb7185",
  "#facc15",
  "#c084fc",
] as const;

export type CourtStickmanProps = {
  name: string;
  /** role caption under the name (e.g. "accuser", "witness") */
  role?: string;
  avatarUrl?: string;
  userId?: string;
  username?: string;
  /** explicit accent color; falls back to palette via colorSeed */
  color?: string;
  colorSeed?: number;
  /** mood emoji floating by the head */
  mood?: string;
  /** head diameter in px (avatar size) */
  size?: number;
  /** glow + scale when this character is the active speaker */
  active?: boolean;
  /** slumped arms (used for the accused / sentenced) */
  defeated?: boolean;
  className?: string;
};

export function CourtStickman({
  name,
  role,
  avatarUrl,
  userId,
  username,
  color,
  colorSeed = 0,
  mood,
  size = 32,
  active = false,
  defeated = false,
  className = "",
}: CourtStickmanProps) {
  const accent = color || COURT_PALETTE[colorSeed % COURT_PALETTE.length];

  return (
    <div
      className={`court-stickman relative flex flex-col items-center transition-transform duration-300 ${
        active ? "scale-110" : ""
      } ${className}`}
    >
      {mood && (
        <span className="absolute -right-1 -top-1 z-20 text-[14px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
          {mood}
        </span>
      )}

      <div className="court-stickman-inner relative flex flex-col items-center">
        {/* head = avatar in colored ring */}
        <div
          className="relative rounded-full p-[2px] shadow-[0_12px_22px_rgba(0,0,0,0.34)]"
          style={{
            background: accent,
            boxShadow: active
              ? `0 0 0 2px ${accent}, 0 0 26px 4px ${accent}66`
              : undefined,
          }}
        >
          <Avatar
            src={avatarUrl}
            alt={name}
            fallbackText={name.charAt(0)}
            size={size}
            userId={userId}
            username={username}
            disableRealtime
          />
        </div>

        {/* body: spine + 2 arms + 2 legs (PartyStickman geometry) */}
        <div className="relative mt-[-1px] h-10 w-10">
          <span className="absolute left-1/2 top-0 h-[22px] w-[3px] -translate-x-1/2 rounded-full bg-white/78" />
          <span
            className={`absolute left-[7px] top-[8px] h-[3px] w-[16px] origin-right rounded-full bg-white/72 ${
              defeated ? "rotate-[10deg]" : "rotate-[-30deg]"
            }`}
          />
          <span
            className={`absolute right-[7px] top-[8px] h-[3px] w-[16px] origin-left rounded-full bg-white/72 ${
              defeated ? "rotate-[-10deg]" : "rotate-[30deg]"
            }`}
          />
          <span className="absolute bottom-[2px] left-[13px] h-[3px] w-[17px] origin-left rotate-[54deg] rounded-full bg-white/72" />
          <span className="absolute bottom-[2px] right-[13px] h-[3px] w-[17px] origin-right rotate-[-54deg] rounded-full bg-white/72" />
        </div>
      </div>

      <div className="mt-[-3px] max-w-[72px] truncate rounded-full border border-white/8 bg-black/45 px-2 py-0.5 text-[9px] font-black text-white shadow-[0_8px_18px_rgba(0,0,0,0.26)]">
        {name}
      </div>
      {role && (
        <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-white/45">
          {role}
        </span>
      )}
    </div>
  );
}

export default CourtStickman;
