"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CakeSlice,
  Crown,
  Heart,
  Music2,
  PartyPopper,
  Sparkles,
  Volume2,
  VolumeX,
  WandSparkles,
} from "lucide-react";
import {
  birthdayRoomService,
  type BirthdayDrop,
  type BirthdayPartyAction,
  type BirthdayPartyPresence,
  type BirthdayPartySnapshot,
  type BirthdayRoom,
} from "@/middleware/services/birthday-room.service";
import { Avatar } from "../ui/Avatar";

type PartyRoomUser = {
  id: string;
  username?: string;
  displayName?: string;
  avatar?: string;
};

type PartyAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

const PARTY_MUSIC_TRACK = {
  url: "/audio/party-room-music.mp3",
};
const PARTY_MUSIC_VOLUME = 0.72;
const PARTY_STAGE_BOUNDS = {
  minX: 8,
  maxX: 92,
  minY: 16,
  maxY: 86,
};
const HELD_BALLOON_OFFSET = { x: 4.8, y: 2.4 };
const DARREN_BALLOON_OFFSET = { x: 4.4, y: 1.8 };
const HELD_CAKE_OFFSET = { x: 4, y: -7 };
const CAKE_STATION = { x: 50, y: 53 };
const DARREN_GIFT_DISTANCE = 9;
const CAKE_PICKUP_DISTANCE = 12;
const CAKE_HIT_DISTANCE = 6.8;
const PARTY_VENUE_VARIANT_COUNT = 10;

const PARTY_VENUES = [
  {
    key: "lounge",
    label: "Premium lounge",
    accent: "#38bdf8",
    warm: "#facc15",
    pop: "#fb7185",
    wall: "#181210",
    floor: "#050707",
    decor: "lounge",
  },
  {
    key: "garden",
    label: "Garden terrace",
    accent: "#4ade80",
    warm: "#facc15",
    pop: "#38bdf8",
    wall: "#101b13",
    floor: "#03100a",
    decor: "garden",
  },
  {
    key: "arcade",
    label: "Neon arcade",
    accent: "#c084fc",
    warm: "#38bdf8",
    pop: "#fb7185",
    wall: "#161124",
    floor: "#06030d",
    decor: "arcade",
  },
  {
    key: "ballroom",
    label: "Royal ballroom",
    accent: "#facc15",
    warm: "#fb7185",
    pop: "#c084fc",
    wall: "#20130c",
    floor: "#090604",
    decor: "ballroom",
  },
  {
    key: "cabana",
    label: "Beach cabana",
    accent: "#38bdf8",
    warm: "#facc15",
    pop: "#4ade80",
    wall: "#10202a",
    floor: "#061014",
    decor: "cabana",
  },
  {
    key: "premiere",
    label: "Movie premiere",
    accent: "#fb7185",
    warm: "#facc15",
    pop: "#ffffff",
    wall: "#1f0c12",
    floor: "#090407",
    decor: "premiere",
  },
  {
    key: "rooftop",
    label: "Rooftop club",
    accent: "#22d3ee",
    warm: "#a78bfa",
    pop: "#4ade80",
    wall: "#07151e",
    floor: "#03070a",
    decor: "rooftop",
  },
  {
    key: "candy",
    label: "Candy party",
    accent: "#fb7185",
    warm: "#facc15",
    pop: "#38bdf8",
    wall: "#23111b",
    floor: "#10060c",
    decor: "candy",
  },
  {
    key: "space",
    label: "Space disco",
    accent: "#a78bfa",
    warm: "#38bdf8",
    pop: "#facc15",
    wall: "#0c1024",
    floor: "#02030a",
    decor: "space",
  },
  {
    key: "courtyard",
    label: "Palace courtyard",
    accent: "#4ade80",
    warm: "#facc15",
    pop: "#fb7185",
    wall: "#12160f",
    floor: "#050805",
    decor: "courtyard",
  },
] as const;

type PartyBalloonToy = {
  id: "left" | "right";
  color: string;
  glow: string;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  status: "stage" | "held" | "given";
};

type CakeProjectile = {
  id: string;
  x: number;
  y: number;
  rotation: number;
};

type CakeSplatter = {
  id: string;
  x: number;
  y: number;
  createdAt: number;
};

type DarrenPrankPose = {
  x: number;
  y: number;
  action: BirthdayPartyAction;
  accessory?: BirthdayPartyPresence["accessory"];
};

const partyActions: Array<{
  id: Exclude<BirthdayPartyAction, "idle">;
  label: string;
  Icon: typeof Sparkles;
  accent: string;
}> = [
  { id: "dance", label: "Dance", Icon: Music2, accent: "#4ade80" },
  { id: "dance_groove", label: "Groove", Icon: Sparkles, accent: "#38bdf8" },
  { id: "dance_spin", label: "Spin", Icon: WandSparkles, accent: "#c084fc" },
  { id: "dance_hype", label: "Hype", Icon: Sparkles, accent: "#facc15" },
  { id: "dance_slide", label: "Slide", Icon: WandSparkles, accent: "#fb7185" },
  { id: "dance_rave", label: "Rave", Icon: Music2, accent: "#22d3ee" },
  { id: "wave", label: "Wave", Icon: WandSparkles, accent: "#38bdf8" },
  { id: "confetti", label: "Confetti", Icon: PartyPopper, accent: "#facc15" },
  { id: "hearts", label: "Hearts", Icon: Heart, accent: "#f472b6" },
];

const createMockPartyGuest = (
  input: Omit<BirthdayPartyPresence, "joinedAtMs" | "updatedAtMs" | "actionExpiresAtMs">,
): BirthdayPartyPresence => {
  const now = Date.now();
  return {
    ...input,
    joinedAtMs: now,
    updatedAtMs: now,
    actionExpiresAtMs: now + 60_000,
  };
};

const darrenPartyGuest: BirthdayPartyPresence = {
  userId: "party-mock-darren",
  username: "darren",
  displayName: "Darren",
  avatarUrl: "",
  x: 64,
  y: 58,
  targetX: 64,
  targetY: 58,
  action: "dance",
  accessory: "glasses",
  isBirthdayUser: false,
  colorSeed: 18,
  joinedAtMs: Date.now(),
  updatedAtMs: Date.now(),
};

function getDarrenPartyGuest(
  musicOn: boolean,
  nowMs: number,
  prankPose?: DarrenPrankPose | null,
): BirthdayPartyPresence {
  if (prankPose) {
    return {
      ...darrenPartyGuest,
      x: prankPose.x,
      y: prankPose.y,
      targetX: prankPose.x,
      targetY: prankPose.y,
      action: prankPose.action,
      accessory: prankPose.accessory ?? "cake",
      updatedAtMs: nowMs,
      actionExpiresAtMs: undefined,
    };
  }

  const sway = nowMs / 1000;

  return {
    ...darrenPartyGuest,
    x: 64 + Math.sin(sway * 1.3) * 1.8,
    y: 58 + Math.cos(sway * 1.1) * 1.2,
    targetX: musicOn ? 64 + Math.sin(sway * 1.3) * 3.2 : 64,
    targetY: musicOn ? 58 + Math.cos(sway * 1.1) * 2.2 : 58,
    action: musicOn ? "dance_groove" : "dance",
    updatedAtMs: nowMs,
    actionExpiresAtMs: undefined,
  };
}

function randomStagePoint() {
  return {
    x: 12 + Math.round(Math.random() * 76),
    y: 18 + Math.round(Math.random() * 66),
  };
}

function clampStagePoint(point: { x: number; y: number }) {
  return {
    x: Math.min(PARTY_STAGE_BOUNDS.maxX, Math.max(PARTY_STAGE_BOUNDS.minX, point.x)),
    y: Math.min(PARTY_STAGE_BOUNDS.maxY, Math.max(PARTY_STAGE_BOUNDS.minY, point.y)),
  };
}

function stageDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getAccessoryForAction(
  action: Exclude<BirthdayPartyAction, "idle">,
  isBirthdayUser: boolean,
) {
  if (isBirthdayUser) return "crown";
  if (action === "balloon") return "balloon";
  if (action === "cake") return "cake";
  if (action === "hearts") return "glow";
  if (action === "dance" || action.startsWith("dance_")) return "glasses";
  return "hat";
}

function PartyRoomStyles() {
  return (
    <style>{`
      @keyframes partyGlow {
        0%, 100% { opacity: 0.45; transform: scale(0.96); }
        50% { opacity: 1; transform: scale(1.04); }
      }
      @keyframes partyBars {
        0%, 100% { transform: scaleY(0.34); }
        50% { transform: scaleY(1); }
      }
      @keyframes partyMusicButtonPulse {
        0%, 100% { box-shadow: 0 0 0 rgba(250,204,21,0), 0 14px 34px rgba(250,204,21,0.18); }
        50% { box-shadow: 0 0 26px rgba(250,204,21,0.34), 0 18px 42px rgba(251,113,133,0.2); }
      }
      @keyframes partyIdle {
        0%, 100% { transform: translateY(0) rotate(-1deg); }
        50% { transform: translateY(-3px) rotate(1deg); }
      }
      @keyframes partyWalkMove {
        0%, 100% { transform: translateY(0) rotate(-3deg); }
        25% { transform: translateY(-2px) rotate(4deg); }
        50% { transform: translateY(1px) rotate(2deg); }
        75% { transform: translateY(-2px) rotate(-4deg); }
      }
      @keyframes partyWalkLeftArm {
        0%, 100% { transform: rotate(-58deg); }
        50% { transform: rotate(28deg); }
      }
      @keyframes partyWalkRightArm {
        0%, 100% { transform: rotate(34deg); }
        50% { transform: rotate(116deg); }
      }
      @keyframes partyWalkLeftLeg {
        0%, 100% { transform: rotate(90deg); }
        50% { transform: rotate(28deg); }
      }
      @keyframes partyWalkRightLeg {
        0%, 100% { transform: rotate(-28deg); }
        50% { transform: rotate(-92deg); }
      }
      @keyframes partyDance {
        0%, 100% { transform: translateY(0) rotate(-7deg); }
        25% { transform: translateY(-6px) rotate(7deg); }
        50% { transform: translateY(1px) rotate(-4deg); }
        75% { transform: translateY(-5px) rotate(9deg); }
      }
      @keyframes partyGroove {
        0%, 100% { transform: translateX(-2px) translateY(0) rotate(-9deg); }
        25% { transform: translateX(4px) translateY(-3px) rotate(8deg); }
        50% { transform: translateX(-4px) translateY(-1px) rotate(-6deg); }
        75% { transform: translateX(3px) translateY(-4px) rotate(10deg); }
      }
      @keyframes partySpinMove {
        0% { transform: translateY(0) rotate(-10deg) scale(1); }
        33% { transform: translateY(-4px) rotate(120deg) scale(1.03); }
        66% { transform: translateY(0) rotate(240deg) scale(0.99); }
        100% { transform: translateY(-3px) rotate(350deg) scale(1.02); }
      }
      @keyframes partyHypeMove {
        0%, 100% { transform: translateX(0) translateY(0) rotate(-5deg) scale(1); }
        20% { transform: translateX(-4px) translateY(-5px) rotate(8deg) scale(1.04); }
        42% { transform: translateX(4px) translateY(0) rotate(-10deg) scale(0.98); }
        64% { transform: translateX(-3px) translateY(-7px) rotate(12deg) scale(1.05); }
        82% { transform: translateX(3px) translateY(-2px) rotate(-7deg) scale(1.01); }
      }
      @keyframes partyHypeLeftArm {
        0%, 100% { transform: rotate(-126deg); }
        20% { transform: rotate(-24deg); }
        44% { transform: rotate(-148deg); }
        66% { transform: rotate(-18deg); }
        84% { transform: rotate(-112deg); }
      }
      @keyframes partyHypeRightArm {
        0%, 100% { transform: rotate(126deg); }
        20% { transform: rotate(20deg); }
        44% { transform: rotate(148deg); }
        66% { transform: rotate(18deg); }
        84% { transform: rotate(116deg); }
      }
      @keyframes partySlideMove {
        0%, 100% { transform: translateX(-6px) translateY(0) skewX(-7deg) rotate(-3deg) scale(1); }
        24% { transform: translateX(7px) translateY(-2px) skewX(8deg) rotate(4deg) scale(1.02); }
        48% { transform: translateX(3px) translateY(-5px) skewX(-4deg) rotate(-8deg) scale(1.04); }
        72% { transform: translateX(-8px) translateY(-1px) skewX(9deg) rotate(5deg) scale(0.99); }
      }
      @keyframes partySlideLeftArm {
        0%, 100% { transform: rotate(-72deg); }
        32% { transform: rotate(-118deg); }
        64% { transform: rotate(-44deg); }
      }
      @keyframes partySlideRightArm {
        0%, 100% { transform: rotate(18deg); }
        32% { transform: rotate(86deg); }
        64% { transform: rotate(132deg); }
      }
      @keyframes partyRaveMove {
        0%, 100% { transform: translateY(0) rotate(0deg) scale(1); }
        20% { transform: translateY(-8px) rotate(-6deg) scale(1.05); }
        40% { transform: translateY(1px) rotate(7deg) scale(0.97); }
        60% { transform: translateY(-10px) rotate(-4deg) scale(1.06); }
        80% { transform: translateY(-2px) rotate(5deg) scale(1.01); }
      }
      @keyframes partyRaveLeftArm {
        0%, 100% { transform: rotate(-32deg); }
        28% { transform: rotate(-150deg); }
        52% { transform: rotate(-18deg); }
        78% { transform: rotate(-138deg); }
      }
      @keyframes partyRaveRightArm {
        0%, 100% { transform: rotate(32deg); }
        28% { transform: rotate(150deg); }
        52% { transform: rotate(18deg); }
        78% { transform: rotate(138deg); }
      }
      @keyframes partyMusicJitter {
        0% { filter: saturate(1); transform: translateX(-50%) rotate(0deg) scale(1); }
        25% { filter: saturate(1.26); transform: translateX(calc(-50% - 1px)) rotate(94deg) scale(1.035); }
        50% { filter: saturate(1.08); transform: translateX(-50%) rotate(178deg) scale(0.99); }
        75% { filter: saturate(1.32); transform: translateX(calc(-50% + 1px)) rotate(274deg) scale(1.025); }
        100% { filter: saturate(1); transform: translateX(-50%) rotate(360deg) scale(1); }
      }
      @keyframes partyCakeBeat {
        0%, 100% { transform: translateX(-50%) translateY(-50%) scale(1); }
        50% { transform: translateX(-50%) translateY(calc(-50% - 2px)) scale(1.025); }
      }
      @keyframes partyRoomTinyShake {
        0%, 100% { background-position: 0 0, 0 0, 0 0, 0 0; }
        50% { background-position: 2px 0, -2px 1px, 0 0, 0 0; }
      }
      @keyframes partyDiscoWash {
        0%, 100% {
          opacity: 0.48;
          background:
            radial-gradient(circle at 50% 20%, rgba(250,204,21,0.44), transparent 28%),
            radial-gradient(circle at 20% 42%, rgba(74,222,128,0.34), transparent 34%),
            linear-gradient(180deg, rgba(250,204,21,0.2), rgba(74,222,128,0.16), rgba(0,0,0,0));
        }
        25% {
          opacity: 0.56;
          background:
            radial-gradient(circle at 52% 18%, rgba(251,113,133,0.5), transparent 30%),
            radial-gradient(circle at 82% 38%, rgba(192,132,252,0.38), transparent 34%),
            linear-gradient(180deg, rgba(251,113,133,0.22), rgba(192,132,252,0.18), rgba(0,0,0,0));
        }
        50% {
          opacity: 0.54;
          background:
            radial-gradient(circle at 48% 22%, rgba(56,189,248,0.52), transparent 31%),
            radial-gradient(circle at 22% 62%, rgba(14,165,233,0.36), transparent 36%),
            linear-gradient(180deg, rgba(56,189,248,0.24), rgba(14,165,233,0.16), rgba(0,0,0,0));
        }
        75% {
          opacity: 0.58;
          background:
            radial-gradient(circle at 50% 18%, rgba(192,132,252,0.48), transparent 29%),
            radial-gradient(circle at 76% 58%, rgba(248,113,113,0.34), transparent 36%),
            linear-gradient(180deg, rgba(192,132,252,0.24), rgba(248,113,113,0.16), rgba(0,0,0,0));
        }
      }
      @keyframes partyDiscoHaloShift {
        0%, 100% {
          opacity: 0.72;
          background: radial-gradient(circle, rgba(250,204,21,0.5), rgba(74,222,128,0.2) 42%, transparent 72%);
          transform: translateX(-50%) scale(0.92);
        }
        25% {
          opacity: 0.9;
          background: radial-gradient(circle, rgba(251,113,133,0.58), rgba(192,132,252,0.24) 44%, transparent 74%);
          transform: translateX(-50%) scale(1.08);
        }
        50% {
          opacity: 0.88;
          background: radial-gradient(circle, rgba(56,189,248,0.58), rgba(14,165,233,0.24) 44%, transparent 74%);
          transform: translateX(-50%) scale(1.02);
        }
        75% {
          opacity: 0.92;
          background: radial-gradient(circle, rgba(192,132,252,0.58), rgba(248,113,113,0.24) 44%, transparent 74%);
          transform: translateX(-50%) scale(1.14);
        }
      }
      @keyframes partyWave {
        0%, 100% { transform: rotate(-16deg); }
        50% { transform: rotate(38deg); }
      }
      @keyframes partyFloat {
        0% { transform: translateY(24px) scale(0.7); opacity: 0; }
        18% { opacity: 1; }
        100% { transform: translateY(-72px) scale(1.05); opacity: 0; }
      }
      @keyframes partyDarrenBonk {
        0%, 100% { transform: translateY(0) rotate(0deg) scale(1); filter: drop-shadow(0 0 0 rgba(251,113,133,0)); }
        10% { transform: translateX(-8px) translateY(-4px) rotate(-18deg) scale(1.12,0.9); filter: drop-shadow(0 0 20px rgba(251,113,133,0.68)); }
        24% { transform: translateX(7px) translateY(3px) rotate(16deg) scale(0.92,1.12); }
        42% { transform: translateX(-5px) translateY(-8px) rotate(-10deg) scale(1.08); }
        62% { transform: translateX(4px) translateY(1px) rotate(8deg) scale(0.98); }
        80% { transform: translateX(-2px) translateY(-2px) rotate(-4deg) scale(1.03); }
      }
      @keyframes partyCakeSplatterPop {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
        12% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
      }
      @keyframes partyCakeCrumbBreak {
        0% { opacity: 0; transform: translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(0.55); }
        14% { opacity: 1; }
        74% { opacity: 0.92; }
        100% { opacity: 0; transform: translate(-50%, -50%) translate(var(--crumb-x), var(--crumb-y)) rotate(var(--crumb-rotate)) scale(0.82); }
      }
      @keyframes partyCakeProjectileSpin {
        0% { transform: translate(-50%, -50%) rotate(0deg) scale(0.94); }
        100% { transform: translate(-50%, -50%) rotate(720deg) scale(1.06); }
      }
      @keyframes partyGivenBalloonPulse {
        0%, 100% { transform: translate(-50%, -100%) rotate(-3deg); }
        50% { transform: translate(-50%, calc(-100% - 8px)) rotate(3deg); }
      }
      @keyframes partyRoomLightSweep {
        0%, 100% { opacity: 0.24; transform: translateX(-18%) rotate(-18deg); }
        50% { opacity: 0.58; transform: translateX(18%) rotate(18deg); }
      }
      @keyframes partyDiscoSpin {
        0% { transform: translateX(-50%) rotate(0deg); }
        100% { transform: translateX(-50%) rotate(360deg); }
      }
      @keyframes partyBalloonBob {
        0%, 100% { transform: translateY(0) rotate(-2deg); }
        50% { transform: translateY(-8px) rotate(2deg); }
      }
      @keyframes partyBalloonJitter {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(-2deg) scale(1); }
        18% { transform: translate3d(-2px, -4px, 0) rotate(3deg) scale(1.02); }
        36% { transform: translate3d(2px, -7px, 0) rotate(-4deg) scale(0.99); }
        58% { transform: translate3d(-1px, -3px, 0) rotate(4deg) scale(1.03); }
        78% { transform: translate3d(2px, -6px, 0) rotate(-2deg) scale(1); }
      }
      @keyframes partyFloorPulse {
        0%, 100% { opacity: 0.32; }
        50% { opacity: 0.78; }
      }
      .party-room-stage {
        --party-energy: 0.34;
        background:
          radial-gradient(circle at 50% 18%, rgba(250,204,21,calc(var(--party-energy) * 0.28)), transparent 22%),
          radial-gradient(circle at 14% 24%, rgba(251,113,133,calc(var(--party-energy) * 0.24)), transparent 26%),
          radial-gradient(circle at 86% 22%, rgba(56,189,248,calc(var(--party-energy) * 0.24)), transparent 28%),
          linear-gradient(180deg, #15100f 0%, #101716 44%, #050707 100%);
      }
      .party-room-stage.party-room-venue-on {
        background:
          radial-gradient(circle at 50% 10%, color-mix(in srgb, var(--venue-warm) 22%, transparent), transparent 22%),
          radial-gradient(circle at 22% 34%, color-mix(in srgb, var(--venue-accent) 16%, transparent), transparent 30%),
          radial-gradient(circle at 82% 30%, color-mix(in srgb, var(--venue-pop) 14%, transparent), transparent 32%),
          linear-gradient(180deg, var(--venue-wall) 0%, #111816 46%, var(--venue-floor) 100%);
      }
      .party-venue-wall {
        background:
          radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--venue-warm) 16%, transparent), transparent 48%),
          linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px),
          linear-gradient(180deg, rgba(255,255,255,0.035) 1px, transparent 1px),
          linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.08));
        background-size: 100% 100%, 64px 64px, 64px 64px, 100% 100%;
      }
      .party-venue-lounge {
        background:
          radial-gradient(circle at 18% 18%, color-mix(in srgb, var(--venue-accent) 18%, transparent), transparent 32%),
          linear-gradient(180deg, rgba(16,24,20,0.92), rgba(4,8,7,0.94));
        box-shadow: 0 24px 58px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.07);
      }
      .party-venue-speaker {
        background: linear-gradient(180deg, rgba(12,18,16,0.96), rgba(2,6,5,0.98));
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 38px rgba(0,0,0,0.38);
      }
      .party-venue-bar {
        background:
          linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0)),
          linear-gradient(90deg, color-mix(in srgb, var(--venue-accent) 18%, transparent), color-mix(in srgb, var(--venue-warm) 14%, transparent), color-mix(in srgb, var(--venue-pop) 16%, transparent));
        box-shadow: 0 18px 44px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08);
      }
      .party-venue-arch {
        background:
          radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--venue-warm) 24%, transparent), transparent 54%),
          linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012));
      }
      .party-venue-pill {
        background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02));
        box-shadow: 0 14px 30px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.1);
      }
      .party-room-stage.party-room-music-on {
        animation: partyRoomTinyShake 0.72s steps(2, end) infinite;
      }
      .party-room-disco-wash {
        mix-blend-mode: screen;
        opacity: 0;
        pointer-events: none;
        transition: opacity 220ms ease;
        will-change: background, opacity;
      }
      .party-room-stage.party-room-music-on .party-room-disco-wash {
        animation: partyDiscoWash 10s steps(1, end) infinite;
      }
      .party-room-disco-halo {
        opacity: 0;
        pointer-events: none;
        will-change: background, opacity, transform;
      }
      .party-room-stage.party-room-music-on .party-room-disco-halo {
        animation: partyDiscoHaloShift 10s steps(1, end) infinite;
      }
      .party-room-stage::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px),
          linear-gradient(180deg, rgba(255,255,255,0.028) 1px, transparent 1px);
        background-size: 28px 28px;
        mask-image: linear-gradient(180deg, rgba(0,0,0,0.75), transparent 74%);
        pointer-events: none;
      }
      .party-room-stage::after {
        content: "";
        position: absolute;
        left: -12%;
        right: -12%;
        bottom: -18%;
        height: 50%;
        background:
          linear-gradient(90deg, rgba(74,222,128,0.12) 0 12.5%, rgba(56,189,248,0.14) 12.5% 25%, rgba(251,113,133,0.13) 25% 37.5%, rgba(250,204,21,0.14) 37.5% 50%, rgba(74,222,128,0.12) 50% 62.5%, rgba(56,189,248,0.14) 62.5% 75%, rgba(251,113,133,0.13) 75% 87.5%, rgba(250,204,21,0.14) 87.5% 100%),
          linear-gradient(180deg, rgba(255,255,255,0.12), rgba(0,0,0,0.14));
        background-size: 96px 100%, 100% 100%;
        border-radius: 50% 50% 0 0;
        box-shadow: inset 0 26px 48px rgba(255,255,255,0.055), 0 -18px 60px rgba(0,0,0,0.36);
        transform: perspective(210px) rotateX(54deg);
        transform-origin: bottom center;
        opacity: calc(0.62 + var(--party-energy) * 0.28);
        pointer-events: none;
      }
      .party-room-disco {
        animation: partyDiscoSpin 9s linear infinite;
        background:
          linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px),
          linear-gradient(180deg, rgba(255,255,255,0.24) 1px, transparent 1px),
          radial-gradient(circle at 35% 25%, #ffffff, #facc15 18%, #38bdf8 44%, #111827 72%);
        background-size: 8px 8px, 8px 8px, 100% 100%;
      }
      .party-room-stage.party-room-music-on .party-room-disco {
        animation: partyMusicJitter 1.08s linear infinite;
        box-shadow: 0 0 42px rgba(250,204,21,0.48), 0 0 64px rgba(56,189,248,0.18);
      }
      .party-room-stage.party-room-music-on .party-room-center-cake {
        animation: partyCakeBeat 0.68s ease-in-out infinite;
      }
      .party-room-light {
        animation: partyRoomLightSweep 4.8s ease-in-out infinite;
        mix-blend-mode: screen;
      }
      .party-room-balloon {
        animation: partyBalloonBob 3.6s ease-in-out infinite;
      }
      .party-room-toy-balloon {
        touch-action: none;
        cursor: pointer;
        transition: left 180ms ease, top 180ms ease, transform 180ms ease, opacity 180ms ease;
        animation: partyBalloonBob 3.6s ease-in-out infinite;
      }
      .party-room-toy-balloon:hover {
        transform: translate(-50%, -88%) scale(1.05);
      }
      .party-room-held-balloon {
        transition: left 80ms linear, top 80ms linear;
        animation: partyBalloonBob 2.8s ease-in-out infinite;
      }
      .party-room-given-balloon {
        animation: partyGivenBalloonPulse 2.8s ease-in-out infinite;
      }
      .party-darren-hit .party-stickman-inner {
        animation: partyDarrenBonk 0.92s cubic-bezier(0.2, 0.9, 0.2, 1) both;
      }
      .party-darren-hit .party-arm-left {
        transform: rotate(-160deg) !important;
      }
      .party-darren-hit .party-arm-right {
        transform: rotate(158deg) !important;
      }
      .party-darren-hit .party-leg-left {
        transform: rotate(118deg) !important;
      }
      .party-darren-hit .party-leg-right {
        transform: rotate(-118deg) !important;
      }
      .party-cake-projectile {
        animation: partyCakeProjectileSpin 0.74s linear infinite;
      }
      .party-cake-splatter {
        animation: partyCakeSplatterPop 1.5s ease-out forwards;
      }
      .party-cake-crumb {
        animation: partyCakeCrumbBreak 1.15s cubic-bezier(0.16, 0.84, 0.28, 1) forwards;
      }
      .party-room-stage.party-room-music-on .party-room-balloon {
        animation: partyBalloonJitter 0.7s ease-in-out infinite;
        will-change: transform;
      }
      .party-room-floor-tile {
        animation: partyFloorPulse 1.8s ease-in-out infinite;
      }
      .party-room-spotlight {
        animation: partyGlow 2.8s ease-in-out infinite;
      }
      .party-music-bar {
        transform-origin: bottom;
        animation: partyBars 0.9s ease-in-out infinite;
      }
      .party-music-toggle-on {
        animation: partyMusicButtonPulse 1.15s ease-in-out infinite;
      }
      .party-stickman {
        transition: left 0.72s cubic-bezier(0.2, 0.82, 0.24, 1), top 0.72s cubic-bezier(0.2, 0.82, 0.24, 1);
        will-change: left, top;
      }
      .party-stickman-inner {
        animation: partyIdle 2.6s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="dance"] {
        animation: partyDance 0.62s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="walk"] {
        animation: partyWalkMove 0.42s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="walk"] .party-arm-left {
        animation: partyWalkLeftArm 0.42s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="walk"] .party-arm-right {
        animation: partyWalkRightArm 0.42s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="walk"] .party-leg-left {
        animation: partyWalkLeftLeg 0.42s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="walk"] .party-leg-right {
        animation: partyWalkRightLeg 0.42s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="dance_groove"] {
        animation: partyGroove 0.54s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="dance_spin"] {
        animation: partySpinMove 0.82s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="dance_hype"] {
        animation: partyHypeMove 0.64s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="dance_hype"] .party-arm-left {
        animation: partyHypeLeftArm 0.64s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="dance_hype"] .party-arm-right {
        animation: partyHypeRightArm 0.64s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="dance_slide"] {
        animation: partySlideMove 0.72s cubic-bezier(0.22, 0.88, 0.28, 1) infinite;
      }
      .party-stickman-inner[data-action="dance_slide"] .party-arm-left {
        animation: partySlideLeftArm 0.72s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="dance_slide"] .party-arm-right {
        animation: partySlideRightArm 0.72s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="dance_rave"] {
        animation: partyRaveMove 0.5s cubic-bezier(0.2, 0.9, 0.2, 1) infinite;
      }
      .party-stickman-inner[data-action="dance_rave"] .party-arm-left {
        animation: partyRaveLeftArm 0.5s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="dance_rave"] .party-arm-right {
        animation: partyRaveRightArm 0.5s ease-in-out infinite;
      }
      .party-stickman-inner[data-action="wave"] .party-arm-right,
      .party-stickman-inner[data-action="confetti"] .party-arm-right,
      .party-stickman-inner[data-action="hearts"] .party-arm-right,
      .party-stickman-inner[data-action="balloon"] .party-arm-right {
        animation: partyWave 0.72s ease-in-out infinite;
      }
      .party-floater {
        animation: partyFloat 2.4s ease-out infinite;
      }
    `}</style>
  );
}

function PartyAccessory({ guest }: { guest: BirthdayPartyPresence }) {
  if (guest.accessory === "crown") {
    return (
      <div className="absolute -top-4 left-1/2 z-20 -translate-x-1/2 text-[#facc15]">
        <Crown size={18} fill="rgba(250,204,21,0.26)" />
      </div>
    );
  }

  if (guest.accessory === "glasses") {
    return (
      <div className="pointer-events-none absolute left-1/2 top-[12px] z-20 flex -translate-x-1/2 gap-[3px]">
        <span className="h-[7px] w-[8px] rounded-full border border-black/70 bg-black/30" />
        <span className="h-[7px] w-[8px] rounded-full border border-black/70 bg-black/30" />
      </div>
    );
  }

  if (guest.accessory === "balloon") {
    return (
      <div className="absolute -right-4 -top-7 z-10">
        <div className="h-8 w-6 rounded-full bg-[#a78bfa] shadow-[0_0_18px_rgba(167,139,250,0.45)]" />
        <div className="mx-auto h-8 w-px bg-white/45" />
      </div>
    );
  }

  if (guest.accessory === "cake") {
    return (
      <div className="absolute -right-4 top-9 z-20 rotate-[-12deg]">
        <CakePiece className="h-5 w-7" />
      </div>
    );
  }

  if (guest.accessory === "glow") {
    return (
      <div className="absolute left-1/2 top-1/2 -z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f472b6]/20 blur-md" />
    );
  }

  return (
    <div className="absolute -top-4 left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-x-[8px] border-b-[18px] border-x-transparent border-b-[#fb7185]" />
  );
}

function PartyFloaters({
  action,
  energy,
}: {
  action: BirthdayPartyAction;
  energy: number;
}) {
  if (!["confetti", "hearts", "cake", "balloon"].includes(action)) return null;

  const colors =
    action === "hearts"
      ? ["#fb7185", "#f472b6", "#fecdd3"]
      : ["#4ade80", "#38bdf8", "#facc15", "#fb7185"];
  const count = action === "confetti" ? Math.min(8, 4 + Math.round(energy / 25)) : 4;

  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: count }).map((_, index) => (
        <span
          key={index}
          className={`party-floater absolute left-1/2 top-8 rounded-full ${
            action === "hearts" ? "h-2.5 w-2.5" : "h-3 w-1.5"
          }`}
          style={{
            marginLeft: `${(index - count / 2) * 6}px`,
            background: colors[index % colors.length],
            animationDelay: `${index * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

function CakePiece({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative h-6 w-8 overflow-hidden rounded-[5px_12px_6px_5px] border border-[#fed7aa]/50 bg-[linear-gradient(135deg,#fde68a_0%,#fed7aa_45%,#fb7185_46%,#f97316_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] ${className}`}
      style={{
        clipPath: "polygon(0 18%, 100% 0, 82% 100%, 0 100%)",
      }}
    >
      <span className="absolute left-0 top-[6px] h-[3px] w-full bg-white/75" />
      <span className="absolute left-0 top-[13px] h-[3px] w-full bg-[#7c2d12]/20" />
      <span className="absolute right-[5px] top-[4px] h-1.5 w-1.5 rounded-full bg-[#fb7185]" />
    </div>
  );
}

function PartyStickman({
  guest,
  energy,
  now,
  musicOn,
  isControlled = false,
  rootRef,
  isHit = false,
  hitPulse = 0,
}: {
  guest: BirthdayPartyPresence;
  energy: number;
  now: number;
  musicOn: boolean;
  isControlled?: boolean;
  rootRef?: React.Ref<HTMLDivElement>;
  isHit?: boolean;
  hitPulse?: number;
}) {
  const activeAction =
    guest.actionExpiresAtMs && guest.actionExpiresAtMs < now ? "idle" : guest.action;
  const action =
    !musicOn && (activeAction === "dance" || activeAction.startsWith("dance_"))
      ? "idle"
      : activeAction;
  const color = ["#4ade80", "#38bdf8", "#fb7185", "#facc15", "#c084fc"][
    guest.colorSeed % 5
  ];

  return (
    <div
      ref={rootRef}
      data-party-user-id={guest.userId}
      className={`party-stickman absolute z-10 flex w-[54px] -translate-x-1/2 -translate-y-1/2 flex-col items-center ${
        isHit ? "party-darren-hit" : ""
      }`}
      style={{
        left: `${guest.targetX}%`,
        top: `${guest.targetY}%`,
        transition: isControlled
          ? "none"
          : undefined,
        willChange: isControlled ? "left, top" : undefined,
      }}
    >
      <div
        key={isHit ? `hit-${hitPulse}` : "calm"}
        className="party-stickman-inner relative flex flex-col items-center"
        data-action={action}
      >
        <PartyAccessory guest={guest} />
        <PartyFloaters action={action} energy={energy} />
        <div
          className="relative rounded-full p-[2px] shadow-[0_12px_22px_rgba(0,0,0,0.34)]"
          style={{
            background: guest.isBirthdayUser
              ? "linear-gradient(135deg,#facc15,#fb7185,#4ade80)"
              : color,
          }}
        >
          <Avatar
            src={guest.avatarUrl}
            alt={guest.displayName}
            fallbackText={guest.displayName.charAt(0)}
            size={32}
            userId={guest.userId}
            username={guest.username}
            disableRealtime
          />
        </div>
        <div className="relative mt-[-1px] h-10 w-10">
          <span className="absolute left-1/2 top-0 h-[22px] w-[3px] -translate-x-1/2 rounded-full bg-white/78" />
          <span className="party-arm-left absolute left-[7px] top-[8px] h-[3px] w-[16px] origin-right rotate-[-30deg] rounded-full bg-white/72" />
          <span className="party-arm-right absolute right-[7px] top-[8px] h-[3px] w-[16px] origin-left rotate-[30deg] rounded-full bg-white/72" />
          <span className="party-leg-left absolute bottom-[2px] left-[13px] h-[3px] w-[17px] origin-left rotate-[54deg] rounded-full bg-white/72" />
          <span className="party-leg-right absolute bottom-[2px] right-[13px] h-[3px] w-[17px] origin-right rotate-[-54deg] rounded-full bg-white/72" />
        </div>
      </div>
      <div className="mt-[-5px] max-w-[68px] truncate rounded-full border border-white/8 bg-black/45 px-2 py-0.5 text-[9px] font-black text-white shadow-[0_8px_18px_rgba(0,0,0,0.26)]">
        {guest.isBirthdayUser ? "Birthday" : guest.displayName}
      </div>
    </div>
  );
}

function formatSnapshotTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PartyRoom({
  room,
  user,
  drops,
  roomActive,
  layout = "panel",
  onBack,
}: {
  room: BirthdayRoom | null;
  user: PartyRoomUser | null | undefined;
  drops: BirthdayDrop[];
  roomActive: boolean;
  layout?: "panel" | "screen";
  onBack?: () => void;
}) {
  const [presence, setPresence] = useState<BirthdayPartyPresence[]>([]);
  const [snapshots, setSnapshots] = useState<BirthdayPartySnapshot[]>([]);
  const [muted, setMuted] = useState(true);
  const [venueVariant, setVenueVariant] = useState<number | null>(0);
  const [now, setNow] = useState(() => Date.now());
  const [joystickActive, setJoystickActive] = useState(false);
  const [localSelfPresence, setLocalSelfPresence] =
    useState<BirthdayPartyPresence | null>(null);
  const [balloons, setBalloons] = useState<PartyBalloonToy[]>([
    {
      id: "left",
      color: "#fb7185",
      glow: "rgba(251,113,133,0.48)",
      x: 8,
      y: 43,
      homeX: 8,
      homeY: 43,
      status: "stage",
    },
    {
      id: "right",
      color: "#38bdf8",
      glow: "rgba(56,189,248,0.48)",
      x: 92,
      y: 40,
      homeX: 92,
      homeY: 40,
      status: "stage",
    },
  ]);
  const [heldBalloonId, setHeldBalloonId] =
    useState<PartyBalloonToy["id"] | null>(null);
  const [cakeAmmo, setCakeAmmo] = useState(0);
  const [cakeProjectiles, setCakeProjectiles] = useState<CakeProjectile[]>([]);
  const [cakeSplats, setCakeSplats] = useState<CakeSplatter[]>([]);
  const [darrenHitUntil, setDarrenHitUntil] = useState(0);
  const [darrenHitPulse, setDarrenHitPulse] = useState(0);
  const [birthdayHitUntil, setBirthdayHitUntil] = useState(0);
  const [birthdayHitPulse, setBirthdayHitPulse] = useState(0);
  const [darrenPrankPose, setDarrenPrankPose] =
    useState<DarrenPrankPose | null>(null);
  const actionGateRef = useRef(0);
  const cakeAmmoRef = useRef(0);
  const cakeThrowFrameRefs = useRef<Record<string, number>>({});
  const selfWalkingRef = useRef(false);
  const cleanupJoinRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<PartyAudioElement | null>(null);
  const audioFadeFrameRef = useRef(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const heldBalloonRef = useRef<HTMLDivElement | null>(null);
  const heldCakeRef = useRef<HTMLDivElement | null>(null);
  const selfStickmanRef = useRef<HTMLDivElement | null>(null);
  const joystickKnobRef = useRef<HTMLDivElement | null>(null);
  const visibleGuestsRef = useRef<BirthdayPartyPresence[]>([]);
  const darrenPositionRef = useRef({ x: darrenPartyGuest.targetX, y: darrenPartyGuest.targetY });
  const darrenPrankPoseRef = useRef<DarrenPrankPose | null>(null);
  const lastSnapshotRef = useRef(0);
  const lastActionSnapshotRef = useRef(0);
  const joystickRef = useRef({
    active: false,
    pointerId: -1,
    originX: 0,
    originY: 0,
    vectorX: 0,
    vectorY: 0,
    lastFrameAt: 0,
    lastWriteAt: 0,
    frameId: 0,
    wanderTimerId: 0,
    wanderFrameId: 0,
    dirty: false,
    lastManualAt: Date.now(),
    lastSyncedPosition: { x: 50, y: 62 },
    position: { x: 50, y: 62 },
  });

  const visibleGuests = useMemo(() => {
    const baseGuests = presence;
    const darrenGuest = getDarrenPartyGuest(!muted, now, darrenPrankPose);
    const existingSelf = user?.id
      ? baseGuests.find((guest) => guest.userId === user.id)
      : undefined;
    const selfGuest =
      user?.id
        ? localSelfPresence ||
          existingSelf ||
          createMockPartyGuest({
            userId: user.id,
            username: user.username || "you",
            displayName: user.displayName || user.username || "You",
            avatarUrl: user.avatar || "",
            x: joystickRef.current.position.x,
            y: joystickRef.current.position.y,
            targetX: joystickRef.current.position.x,
            targetY: joystickRef.current.position.y,
            action: "idle",
            accessory: room?.birthdayUserId === user.id ? "crown" : "hat",
            isBirthdayUser: room?.birthdayUserId === user.id,
            colorSeed: Math.abs(
              user.id
                .split("")
                .reduce((total, char) => total + char.charCodeAt(0), 0),
            ),
          })
        : undefined;
    const people = baseGuests.filter(
      (guest) =>
        guest.userId !== selfGuest?.userId &&
        guest.userId !== darrenPartyGuest.userId &&
        guest.username !== "darren",
    );
    const reservedSlots = (selfGuest ? 1 : 0) + 1;

    return [
      ...people.slice(0, Math.max(0, 18 - reservedSlots)),
      darrenGuest,
      ...(selfGuest ? [selfGuest] : []),
    ];
  }, [localSelfPresence, muted, now, presence, room?.birthdayUserId, darrenPrankPose, user]);

  const activeActionCount = visibleGuests.filter(
    (guest) => guest.action !== "idle" && (!guest.actionExpiresAtMs || guest.actionExpiresAtMs > now),
  ).length;
  const energy = Math.min(
    100,
    Math.round(
      visibleGuests.length * 10 +
        activeActionCount * 12 +
        Math.min(24, drops.length * 2),
    ),
  );
  const intensity = Math.max(0.28, energy / 100);
  const partyUnlocked =
    Boolean(room && room.status === "active") || Boolean(room?.isPreview);
  const isScreenLayout = layout === "screen";
  const venueMode = venueVariant !== null;
  const activeVenue =
    venueVariant === null ? null : PARTY_VENUES[venueVariant];
  const title =
    room?.birthdayDisplayName || user?.displayName || user?.username || "Birthday";
  const visibleSnapshots = useMemo(
    () =>
      snapshots.filter(
        (snapshot) =>
          !(
            snapshot.type === "dance" &&
            snapshot.title.toLowerCase() === "dance wave started"
          ),
      ),
    [snapshots],
  );
  const heldCake = cakeAmmo > 0;
  const darrenGuest = visibleGuests.find(
    (guest) => guest.userId === darrenPartyGuest.userId,
  );
  const darrenPosition = darrenGuest
    ? { x: darrenGuest.targetX, y: darrenGuest.targetY }
    : { x: darrenPartyGuest.targetX, y: darrenPartyGuest.targetY };
  const selfPosition = joystickRef.current.position;
  const selfPartyAction =
    localSelfPresence?.action ||
    (user?.id
      ? visibleGuests.find((guest) => guest.userId === user.id)?.action
      : undefined);
  const selfIsDancing =
    selfPartyAction === "dance" || Boolean(selfPartyAction?.startsWith("dance_"));
  const activeCakePickupDistance =
    !muted || selfIsDancing ? CAKE_PICKUP_DISTANCE + 8 : CAKE_PICKUP_DISTANCE;
  const nearCake = stageDistance(selfPosition, CAKE_STATION) <= activeCakePickupDistance;
  const heldBalloon = heldBalloonId
    ? balloons.find((balloon) => balloon.id === heldBalloonId)
    : undefined;
  const nearestStageBalloon = balloons
    .filter((balloon) => balloon.status === "stage")
    .map((balloon) => ({
      balloon,
      distance: stageDistance(selfPosition, balloon),
    }))
    .sort((a, b) => a.distance - b.distance)[0];
  const nearBalloon = Boolean(
    nearestStageBalloon && nearestStageBalloon.distance <= DARREN_GIFT_DISTANCE,
  );
  const nearDarren = stageDistance(selfPosition, darrenPosition) <= DARREN_GIFT_DISTANCE + 2;

  useEffect(() => {
    visibleGuestsRef.current = visibleGuests;
  }, [visibleGuests]);

  useEffect(() => {
    darrenPositionRef.current = darrenPosition;
  }, [darrenPosition]);

  useEffect(() => {
    darrenPrankPoseRef.current = darrenPrankPose;
  }, [darrenPrankPose]);

  const writeSelfPosition = (
    nextPosition: { x: number; y: number },
    force = false,
  ) => {
    if (!room?.id || !user?.id || !partyUnlocked) return;

    const nowMs = Date.now();
    const lastSynced = joystickRef.current.lastSyncedPosition;
    const movedDistance = Math.hypot(
      nextPosition.x - lastSynced.x,
      nextPosition.y - lastSynced.y,
    );

    if (!force) {
      if (movedDistance < 0.85 && nowMs - joystickRef.current.lastWriteAt < 1_500) {
        return;
      }
      if (nowMs - joystickRef.current.lastWriteAt < 430) return;
    }

    joystickRef.current.lastWriteAt = nowMs;
    joystickRef.current.lastSyncedPosition = nextPosition;

    void birthdayRoomService.updatePartyPresence(room.id, user.id, {
      x: nextPosition.x,
      y: nextPosition.y,
      targetX: nextPosition.x,
      targetY: nextPosition.y,
    });
  };

  const paintSelfPosition = (nextPosition: { x: number; y: number }) => {
    const element = selfStickmanRef.current;
    if (element) {
      element.style.left = `${nextPosition.x}%`;
      element.style.top = `${nextPosition.y}%`;
    }

    const heldBalloonElement = heldBalloonRef.current;
    if (heldBalloonElement) {
      heldBalloonElement.style.left = `${nextPosition.x + HELD_BALLOON_OFFSET.x}%`;
      heldBalloonElement.style.top = `${nextPosition.y + HELD_BALLOON_OFFSET.y}%`;
    }

    const heldCakeElement = heldCakeRef.current;
    if (heldCakeElement) {
      heldCakeElement.style.left = `${nextPosition.x + HELD_CAKE_OFFSET.x}%`;
      heldCakeElement.style.top = `${nextPosition.y + HELD_CAKE_OFFSET.y}%`;
    }
  };

  const setSelfPosition = (
    nextPosition: { x: number; y: number },
    write = false,
    options?: { commitReact?: boolean },
  ) => {
    if (!user?.id) return;

    const safePosition = clampStagePoint(nextPosition);
    joystickRef.current.position = safePosition;
    paintSelfPosition(safePosition);

    if (options?.commitReact !== false) {
      setLocalSelfPresence((current) => {
        const fallback = presence.find((guest) => guest.userId === user.id);
        const base =
          current ||
          fallback ||
          createMockPartyGuest({
            userId: user.id,
            username: user.username || "you",
            displayName: user.displayName || user.username || "You",
            avatarUrl: user.avatar || "",
            x: safePosition.x,
            y: safePosition.y,
            targetX: safePosition.x,
            targetY: safePosition.y,
            action: "idle",
            accessory: room?.birthdayUserId === user.id ? "crown" : "hat",
            isBirthdayUser: room?.birthdayUserId === user.id,
            colorSeed: Math.abs(
              user.id
                .split("")
                .reduce((total, char) => total + char.charCodeAt(0), 0),
            ),
          });

        return {
          ...base,
          x: safePosition.x,
          y: safePosition.y,
          targetX: safePosition.x,
          targetY: safePosition.y,
          updatedAtMs: Date.now(),
        };
      });
    }

    if (write) {
      writeSelfPosition(safePosition);
    }
  };

  const setSelfWalkingAction = (walking: boolean) => {
    if (!user?.id) return;
    if (selfWalkingRef.current === walking) return;

    selfWalkingRef.current = walking;
    setLocalSelfPresence((current) => {
      const fallback = presence.find((guest) => guest.userId === user.id);
      const base = current || fallback;
      if (!base) return current;

      if (walking) {
        return {
          ...base,
          action: "walk" as BirthdayPartyAction,
          accessory: base.accessory,
          actionExpiresAtMs: undefined,
          updatedAtMs: Date.now(),
        };
      }

      const shouldClearWalk = base.action === ("walk" as BirthdayPartyAction);
      return {
        ...base,
        action: shouldClearWalk ? "idle" : base.action,
        actionExpiresAtMs: shouldClearWalk ? undefined : base.actionExpiresAtMs,
        updatedAtMs: Date.now(),
      };
    });
  };

  const runJoystickFrame = (timestamp: number) => {
    const state = joystickRef.current;
    if (!state.active) return;

    const deltaSeconds = state.lastFrameAt
      ? Math.min(0.05, (timestamp - state.lastFrameAt) / 1000)
      : 0;
    state.lastFrameAt = timestamp;

    const speed = 48;
    const nextPosition = clampStagePoint({
      x: state.position.x + state.vectorX * speed * deltaSeconds,
      y: state.position.y + state.vectorY * speed * deltaSeconds,
    });
    state.position = nextPosition;
    state.dirty = true;
    setSelfWalkingAction(true);
    paintSelfPosition(nextPosition);
    setSelfPosition(nextPosition, false, { commitReact: false });
    writeSelfPosition(nextPosition);

    state.frameId = window.requestAnimationFrame(runJoystickFrame);
  };

  const stopWanderTween = () => {
    const state = joystickRef.current;
    if (!state.wanderFrameId) return;

    window.cancelAnimationFrame(state.wanderFrameId);
    state.wanderFrameId = 0;
  };

  const glideSelfTo = (targetPosition: { x: number; y: number }) => {
    if (!user?.id) return;

    const state = joystickRef.current;
    stopWanderTween();

    const startPosition = { ...state.position };
    const endPosition = clampStagePoint(targetPosition);
    const startedAt = performance.now();
    const durationMs = 1_450;

    const step = (timestamp: number) => {
      const currentState = joystickRef.current;
      if (currentState.active) {
        stopWanderTween();
        return;
      }

      const progress = Math.min(1, (timestamp - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextPosition = {
        x: startPosition.x + (endPosition.x - startPosition.x) * eased,
        y: startPosition.y + (endPosition.y - startPosition.y) * eased,
      };

      currentState.position = nextPosition;
      paintSelfPosition(nextPosition);
      writeSelfPosition(nextPosition);

      if (progress < 1) {
        currentState.wanderFrameId = window.requestAnimationFrame(step);
        return;
      }

      currentState.wanderFrameId = 0;
      setSelfPosition(endPosition, true);
    };

    state.wanderFrameId = window.requestAnimationFrame(step);
  };

  const startJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!user?.id || !partyUnlocked) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const state = joystickRef.current;
    stopWanderTween();
    state.active = true;
    state.pointerId = event.pointerId;
    state.originX = event.clientX;
    state.originY = event.clientY;
    state.vectorX = 0;
    state.vectorY = 0;
    state.lastFrameAt = 0;
    state.dirty = false;
    state.lastManualAt = Date.now();
    joystickKnobRef.current?.style.setProperty("transform", "translate(0px, 0px)");
    setJoystickActive(true);

    if (!state.frameId) {
      state.frameId = window.requestAnimationFrame(runJoystickFrame);
    }
  };

  const moveJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = joystickRef.current;
    if (!state.active || state.pointerId !== event.pointerId) return;

    event.preventDefault();
    const maxDistance = 27;
    const dx = event.clientX - state.originX;
    const dy = event.clientY - state.originY;
    const distance = Math.min(maxDistance, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const knobX = Math.cos(angle) * distance;
    const knobY = Math.sin(angle) * distance;

    state.vectorX = knobX / maxDistance;
    state.vectorY = knobY / maxDistance;
    joystickKnobRef.current?.style.setProperty(
      "transform",
      `translate(${knobX}px, ${knobY}px)`,
    );
  };

  const stopJoystick = (event?: React.PointerEvent<HTMLDivElement>) => {
    const state = joystickRef.current;
    if (event && state.pointerId !== event.pointerId) return;

    if (event) {
      event.preventDefault();
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    state.active = false;
    state.pointerId = -1;
    state.vectorX = 0;
    state.vectorY = 0;
    if (state.frameId) {
      window.cancelAnimationFrame(state.frameId);
      state.frameId = 0;
    }
    setSelfWalkingAction(false);
    joystickKnobRef.current?.style.setProperty("transform", "translate(0px, 0px)");
    setJoystickActive(false);
    state.lastManualAt = Date.now();
    setSelfPosition(state.position);
    writeSelfPosition(state.position, true);
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), muted ? 1000 : 320);
    return () => window.clearInterval(timer);
  }, [muted]);

  useEffect(() => {
    const selfGuest = user?.id
      ? visibleGuests.find((guest) => guest.userId === user.id)
      : undefined;

    if (selfGuest && !joystickRef.current.active) {
      joystickRef.current.position = {
        x: selfGuest.targetX,
        y: selfGuest.targetY,
      };
    }
  }, [user?.id, visibleGuests]);

  useEffect(() => {
    if (!room?.id || !user?.id || !roomActive || !partyUnlocked) return;

    let cancelled = false;
    void birthdayRoomService
      .joinPartyRoom(room, user)
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
          return;
        }
        cleanupJoinRef.current = cleanup;
      })
      .catch(() => undefined);

    const unsubscribePresence = birthdayRoomService.subscribeToPartyPresence(
      room.id,
      setPresence,
      () => undefined,
    );
    const unsubscribeSnapshots = isScreenLayout
      ? () => undefined
      : birthdayRoomService.subscribeToPartySnapshots(
          room.id,
          setSnapshots,
          () => undefined,
        );

    return () => {
      cancelled = true;
      cleanupJoinRef.current?.();
      cleanupJoinRef.current = null;
      unsubscribePresence();
      unsubscribeSnapshots();
    };
  }, [isScreenLayout, partyUnlocked, room, roomActive, user]);

  useEffect(() => {
    if (!room || !user?.id || !partyUnlocked || presence.length < 3 || energy < 70) {
      return;
    }

    const snapshotGapMs = 75_000;
    if (Date.now() - lastSnapshotRef.current < snapshotGapMs) return;

    lastSnapshotRef.current = Date.now();
    const type = energy > 86 ? "confetti" : activeActionCount >= 3 ? "dance" : "energy";
    void birthdayRoomService.recordPartySnapshot(room, {
      authorId: user.id,
      type,
      title:
        type === "confetti"
          ? "Big confetti moment"
          : type === "dance"
            ? "Everyone started moving"
            : "Room energy spiked",
      description: `${presence.length} people were live at ${formatSnapshotTime(Date.now())}.`,
      participantCount: presence.length,
      energy,
    });
  }, [activeActionCount, energy, partyUnlocked, presence.length, room, user?.id]);

  useEffect(() => {
    return () => {
      if (audioFadeFrameRef.current) {
        window.cancelAnimationFrame(audioFadeFrameRef.current);
        audioFadeFrameRef.current = 0;
      }
      Object.values(cakeThrowFrameRefs.current).forEach((frameId) => {
        window.cancelAnimationFrame(frameId);
      });
      cakeThrowFrameRefs.current = {};
      audioRef.current?.pause();
      audioRef.current = null;
      if (joystickRef.current.frameId) {
        window.cancelAnimationFrame(joystickRef.current.frameId);
        joystickRef.current.frameId = 0;
      }
      if (joystickRef.current.wanderTimerId) {
        window.clearInterval(joystickRef.current.wanderTimerId);
        joystickRef.current.wanderTimerId = 0;
      }
      if (joystickRef.current.wanderFrameId) {
        window.cancelAnimationFrame(joystickRef.current.wanderFrameId);
        joystickRef.current.wanderFrameId = 0;
      }
    };
  }, []);

  useEffect(() => {
    if (!isScreenLayout || !user?.id || !partyUnlocked) return;

    const state = joystickRef.current;
    state.wanderTimerId = window.setInterval(() => {
      const currentState = joystickRef.current;
      if (
        currentState.active ||
        Date.now() - currentState.lastManualAt < 5_000
      ) {
        return;
      }

      const nextPoint = {
        x: currentState.position.x + (Math.random() * 18 - 9),
        y: currentState.position.y + (Math.random() * 12 - 6),
      };

      glideSelfTo(nextPoint);
      currentState.lastManualAt = Date.now() - 4_000;
    }, 2_400);

    return () => {
      window.clearInterval(state.wanderTimerId);
      state.wanderTimerId = 0;
    };
  }, [isScreenLayout, partyUnlocked, user?.id]);

  const cancelAudioFade = () => {
    if (!audioFadeFrameRef.current) return;

    window.cancelAnimationFrame(audioFadeFrameRef.current);
    audioFadeFrameRef.current = 0;
  };

  const startAudio = async () => {
    cancelAudioFade();

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.volume = PARTY_MUSIC_VOLUME;
      await audioRef.current.play();
      return;
    }

    const audio = new Audio();
    audio.src = PARTY_MUSIC_TRACK.url;
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = PARTY_MUSIC_VOLUME;
    audio.setAttribute("playsinline", "true");
    audioRef.current = audio as PartyAudioElement;

    if (audioRef.current.setSinkId) {
      await audioRef.current.setSinkId("default").catch(() => undefined);
    }

    await audio.play();
  };

  const fadeOutAndStopAudio = () => {
    cancelAudioFade();

    const audio = audioRef.current;
    if (!audio) return;

    const startedAt = performance.now();
    const startVolume = audio.volume;
    const durationMs = 900;

    const step = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / durationMs);
      audio.volume = Math.max(0, startVolume * (1 - progress));

      if (progress < 1) {
        audioFadeFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      audio.pause();
      audio.currentTime = 0;
      audio.volume = PARTY_MUSIC_VOLUME;
      audioFadeFrameRef.current = 0;
    };

    audioFadeFrameRef.current = window.requestAnimationFrame(step);
  };

  const toggleMusic = () => {
    if (!muted) {
      setMuted(true);
      fadeOutAndStopAudio();
      return;
    }

    void startAudio()
      .then(() => setMuted(false))
      .catch(() => setMuted(true));
  };

  const cycleVenueBackground = () => {
    setVenueVariant((current) => {
      if (current === null) return 0;
      if (current >= PARTY_VENUE_VARIANT_COUNT - 1) return null;
      return current + 1;
    });
  };

  const sendAction = (action: Exclude<BirthdayPartyAction, "idle">) => {
    if (!room?.id || !user?.id || !partyUnlocked) return;

    const nowMs = Date.now();
    if (nowMs - actionGateRef.current < 850) return;
    actionGateRef.current = nowMs;

    const isDanceAction = action === "dance" || action.startsWith("dance_");
    const actionExpiresAtMs = isDanceAction ? undefined : nowMs + 3_600;
    const nextPoint = randomStagePoint();
    const nextAccessory = getAccessoryForAction(
      action,
      room.birthdayUserId === user.id,
    );
    const nextPosition =
      joystickRef.current.active || isScreenLayout
        ? joystickRef.current.position
        : nextPoint;

    setLocalSelfPresence((current) => {
      const fallback = presence.find((guest) => guest.userId === user.id);
      const base =
        current ||
        fallback ||
        createMockPartyGuest({
          userId: user.id,
          username: user.username || "you",
          displayName: user.displayName || user.username || "You",
          avatarUrl: user.avatar || "",
          x: nextPosition.x,
          y: nextPosition.y,
          targetX: nextPosition.x,
          targetY: nextPosition.y,
          action,
          accessory: nextAccessory,
          isBirthdayUser: room.birthdayUserId === user.id,
          colorSeed: Math.abs(
            user.id
              .split("")
              .reduce((total, char) => total + char.charCodeAt(0), 0),
          ),
        });

      return {
        ...base,
        x: nextPosition.x,
        y: nextPosition.y,
        targetX: nextPosition.x,
        targetY: nextPosition.y,
        action,
        accessory: nextAccessory,
        actionExpiresAtMs,
        updatedAtMs: nowMs,
      };
    });

    void birthdayRoomService.updatePartyPresence(room.id, user.id, {
      x: nextPosition.x,
      y: nextPosition.y,
      targetX: nextPosition.x,
      targetY: nextPosition.y,
      action,
      accessory: nextAccessory,
      actionExpiresAtMs: actionExpiresAtMs ?? null,
    });

    if (
      action === "confetti" &&
      energy > 45 &&
      nowMs - lastActionSnapshotRef.current > 30_000
    ) {
      lastActionSnapshotRef.current = nowMs;
      void birthdayRoomService.recordPartySnapshot(room, {
        authorId: user.id,
        type: "confetti",
        title: "Confetti burst",
        description: `${visibleGuests.length} people were in the room at ${formatSnapshotTime(nowMs)}.`,
        participantCount: visibleGuests.length,
        energy,
      });
    }
  };

  const pickCakeSlice = () => {
    if (!partyUnlocked) return;

    const currentPosition = joystickRef.current.position;
    const pickupDistance =
      !muted || selfIsDancing ? CAKE_PICKUP_DISTANCE + 8 : CAKE_PICKUP_DISTANCE;
    if (stageDistance(currentPosition, CAKE_STATION) > pickupDistance) {
      return;
    }

    cakeAmmoRef.current = 10;
    setCakeAmmo(10);

    if (!selfIsDancing) {
      sendAction("cake");
    }
  };

  const addCakeSplatter = (impact: { x: number; y: number }) => {
    const createdAt = Date.now();
    const splatId = `splat-${createdAt}-${Math.random().toString(36).slice(2, 7)}`;

    setCakeSplats((current) => [
      ...current.slice(-3),
      {
        id: splatId,
        x: impact.x,
        y: impact.y,
        createdAt,
      },
    ]);

    window.setTimeout(() => {
      setCakeSplats((current) =>
        current.filter((splat) => splat.id !== splatId),
      );
    }, 1_550);
  };

  const hitDarrenWithCake = (impact: { x: number; y: number }) => {
    const createdAt = Date.now();
    setDarrenHitUntil(createdAt + 1_250);
    setDarrenHitPulse((current) => current + 1);
    addCakeSplatter(impact);
  };

  const hitBirthdayUserWithCake = (impact: { x: number; y: number }) => {
    const createdAt = Date.now();
    setBirthdayHitUntil(createdAt + 1_250);
    setBirthdayHitPulse((current) => current + 1);
    addCakeSplatter(impact);
  };

  const throwCakeAtDarren = () => {
    if (cakeAmmoRef.current <= 0 || !partyUnlocked) return;

    const currentPosition = joystickRef.current.position;
    const start = clampStagePoint({
      x: currentPosition.x + HELD_CAKE_OFFSET.x,
      y: currentPosition.y + HELD_CAKE_OFFSET.y,
    });
    const target = clampStagePoint({
      x: darrenPosition.x,
      y: darrenPosition.y - 4,
    });
    const projectileId = `cake-${Date.now()}-${cakeAmmoRef.current}`;
    const startedAt = performance.now();
    const durationMs = 560 + Math.random() * 120;

    cakeAmmoRef.current = Math.max(0, cakeAmmoRef.current - 1);
    setCakeAmmo(cakeAmmoRef.current);
    setCakeProjectiles((current) => [
      ...current,
      { id: projectileId, x: start.x, y: start.y, rotation: 0 },
    ]);

    const step = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 2);
      const arc = Math.sin(progress * Math.PI) * 13;
      const next = {
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased - arc,
        rotation: progress * 720,
      };

      setCakeProjectiles((current) =>
        current.map((projectile) =>
          projectile.id === projectileId
            ? { id: projectileId, ...next }
            : projectile,
        ),
      );

      if (stageDistance(next, darrenPosition) <= CAKE_HIT_DISTANCE || progress >= 1) {
        setCakeProjectiles((current) =>
          current.filter((projectile) => projectile.id !== projectileId),
        );
        delete cakeThrowFrameRefs.current[projectileId];
        hitDarrenWithCake({
          x: darrenPosition.x,
          y: darrenPosition.y - 7,
        });
        return;
      }

      cakeThrowFrameRefs.current[projectileId] =
        window.requestAnimationFrame(step);
    };

    cakeThrowFrameRefs.current[projectileId] =
      window.requestAnimationFrame(step);
  };

  const getLiveCakeTargetPosition = (
    targetUserId: string,
    fallback: { x: number; y: number },
  ) => {
    if (targetUserId === user?.id) {
      return joystickRef.current.position;
    }

    const liveTarget = visibleGuestsRef.current.find(
      (guest) => guest.userId === targetUserId,
    );

    return liveTarget
      ? { x: liveTarget.targetX, y: liveTarget.targetY }
      : fallback;
  };

  const throwDarrenCakeAtBirthday = (
    targetUserId: string,
    fallbackTarget: { x: number; y: number },
  ) => {
    if (!partyUnlocked) return;

    const start = clampStagePoint({
      x: darrenPositionRef.current.x - 3.5,
      y: darrenPositionRef.current.y - 6.5,
    });
    const projectileId = `darren-cake-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const startedAt = performance.now();
    const durationMs = 740 + Math.random() * 120;

    setCakeProjectiles((current) => [
      ...current,
      { id: projectileId, x: start.x, y: start.y, rotation: 0 },
    ]);

    const step = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 2);
      const arc = Math.sin(progress * Math.PI) * 15;
      const liveTarget = getLiveCakeTargetPosition(targetUserId, fallbackTarget);
      const targetPoint = clampStagePoint({
        x: liveTarget.x,
        y: liveTarget.y - 5,
      });
      const next = {
        x: start.x + (targetPoint.x - start.x) * eased,
        y: start.y + (targetPoint.y - start.y) * eased - arc,
        rotation: progress * -720,
      };

      setCakeProjectiles((current) =>
        current.map((projectile) =>
          projectile.id === projectileId
            ? { id: projectileId, ...next }
            : projectile,
        ),
      );

      if (stageDistance(next, targetPoint) <= CAKE_HIT_DISTANCE || progress >= 1) {
        setCakeProjectiles((current) =>
          current.filter((projectile) => projectile.id !== projectileId),
        );
        delete cakeThrowFrameRefs.current[projectileId];
        hitBirthdayUserWithCake({
          x: targetPoint.x,
          y: targetPoint.y - 2,
        });
        return;
      }

      cakeThrowFrameRefs.current[projectileId] =
        window.requestAnimationFrame(step);
    };

    cakeThrowFrameRefs.current[projectileId] =
      window.requestAnimationFrame(step);
  };

  useEffect(() => {
    if (!roomActive || !partyUnlocked) {
      setDarrenPrankPose(null);
      return;
    }

    let cancelled = false;
    let prankTimerId = 0;
    let prankFrameId = 0;
    let pickupTimerId = 0;
    let throwTimerId = 0;
    let returnTimerId = 0;

    const setPose = (pose: DarrenPrankPose) => {
      darrenPositionRef.current = { x: pose.x, y: pose.y };
      darrenPrankPoseRef.current = pose;
      setDarrenPrankPose(pose);
    };

    const clearPrankFrame = () => {
      if (!prankFrameId) return;
      window.cancelAnimationFrame(prankFrameId);
      prankFrameId = 0;
    };

    const animateDarrenTo = (
      target: { x: number; y: number },
      durationMs: number,
      action: BirthdayPartyAction,
      accessory: BirthdayPartyPresence["accessory"],
      onDone: () => void,
    ) => {
      clearPrankFrame();
      const start = {
        x: darrenPrankPoseRef.current?.x ?? darrenPositionRef.current.x,
        y: darrenPrankPoseRef.current?.y ?? darrenPositionRef.current.y,
      };
      const startedAt = performance.now();

      const step = (timestamp: number) => {
        if (cancelled) return;

        const progress = Math.min(1, (timestamp - startedAt) / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        const wobble = Math.sin(progress * Math.PI * 2) * 0.6;
        setPose({
          x: start.x + (target.x - start.x) * eased,
          y: start.y + (target.y - start.y) * eased + wobble,
          action,
          accessory,
        });

        if (progress < 1) {
          prankFrameId = window.requestAnimationFrame(step);
          return;
        }

        prankFrameId = 0;
        onDone();
      };

      prankFrameId = window.requestAnimationFrame(step);
    };

    const schedulePrank = () => {
      if (cancelled) return;
      prankTimerId = window.setTimeout(() => {
        const guests = visibleGuestsRef.current;
        const birthdayTarget =
          guests.find(
            (guest) =>
              guest.isBirthdayUser && guest.userId !== darrenPartyGuest.userId,
          ) ||
          (user?.id
            ? guests.find((guest) => guest.userId === user.id)
            : undefined);

        if (!birthdayTarget) {
          schedulePrank();
          return;
        }

        const cakeSide = {
          x: CAKE_STATION.x + 9,
          y: CAKE_STATION.y + 7,
        };

        animateDarrenTo(
          cakeSide,
          1_450,
          "walk" as BirthdayPartyAction,
          "glasses",
          () => {
            pickupTimerId = window.setTimeout(() => {
              setPose({
                ...cakeSide,
                action: "cake",
                accessory: "cake",
              });

              throwTimerId = window.setTimeout(() => {
                const liveBirthdayTarget =
                  visibleGuestsRef.current.find(
                    (guest) =>
                      guest.userId === birthdayTarget.userId &&
                      guest.userId !== darrenPartyGuest.userId,
                  ) || birthdayTarget;

                throwDarrenCakeAtBirthday(birthdayTarget.userId, {
                  x: liveBirthdayTarget.targetX,
                  y: liveBirthdayTarget.targetY,
                });
              }, 480);
            }, 260);

            returnTimerId = window.setTimeout(() => {
              animateDarrenTo(
                { x: darrenPartyGuest.targetX, y: darrenPartyGuest.targetY },
                1_250,
                "walk" as BirthdayPartyAction,
                "glasses",
                () => {
                  darrenPrankPoseRef.current = null;
                  setDarrenPrankPose(null);
                  schedulePrank();
                },
              );
            }, 1_050);
          },
        );
      }, 9_000 + Math.random() * 11_000);
    };

    schedulePrank();

    return () => {
      cancelled = true;
      if (prankTimerId) window.clearTimeout(prankTimerId);
      if (pickupTimerId) window.clearTimeout(pickupTimerId);
      if (throwTimerId) window.clearTimeout(throwTimerId);
      if (returnTimerId) window.clearTimeout(returnTimerId);
      clearPrankFrame();
    };
  }, [partyUnlocked, roomActive, user?.id]);

  const handleCakeControlPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (!partyUnlocked || cakeAmmoRef.current <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    throwCakeAtDarren();
  };

  const handleCakeControlClick = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (cakeAmmoRef.current > 0) {
      event.preventDefault();
      return;
    }

    pickCakeSlice();
  };

  const pickBalloon = (id?: PartyBalloonToy["id"]) => {
    if (!partyUnlocked) return;

    if (heldBalloonId) {
      return;
    }

    const currentPosition = joystickRef.current.position;
    const candidate = id
      ? balloons.find((balloon) => balloon.id === id && balloon.status === "stage")
      : balloons
          .filter((balloon) => balloon.status === "stage")
          .map((balloon) => ({
            balloon,
            distance: stageDistance(currentPosition, balloon),
          }))
          .sort((a, b) => a.distance - b.distance)[0]?.balloon;

    if (!candidate) {
      return;
    }

    if (stageDistance(currentPosition, candidate) > DARREN_GIFT_DISTANCE) {
      return;
    }

    setBalloons((current) =>
      current.map((balloon) =>
        balloon.id === candidate.id
          ? {
              ...balloon,
              x: currentPosition.x + HELD_BALLOON_OFFSET.x,
              y: currentPosition.y + HELD_BALLOON_OFFSET.y,
              status: "held",
            }
          : balloon,
      ),
    );
    setHeldBalloonId(candidate.id);
    sendAction("balloon");
  };

  const handBalloonToDarren = () => {
    if (!heldBalloonId || !partyUnlocked) return;

    if (stageDistance(joystickRef.current.position, darrenPosition) > DARREN_GIFT_DISTANCE + 2) {
      return;
    }

    const deliveredId = heldBalloonId;
    setBalloons((current) =>
      current.map((balloon) =>
        balloon.id === deliveredId
          ? {
              ...balloon,
              x:
                darrenPosition.x +
                (balloon.id === "left"
                  ? -DARREN_BALLOON_OFFSET.x
                  : DARREN_BALLOON_OFFSET.x),
              y: darrenPosition.y + DARREN_BALLOON_OFFSET.y,
              status: "given",
            }
          : balloon,
      ),
    );
    setHeldBalloonId(null);
  };

  const dropHeldBalloon = () => {
    if (!heldBalloonId || !partyUnlocked) return;

    const droppedId = heldBalloonId;
    const currentPosition = joystickRef.current.position;
    const dropPoint = clampStagePoint({
      x: currentPosition.x + HELD_BALLOON_OFFSET.x,
      y: currentPosition.y + HELD_BALLOON_OFFSET.y,
    });

    setBalloons((current) =>
      current.map((balloon) =>
        balloon.id === droppedId
          ? {
              ...balloon,
              x: dropPoint.x,
              y: dropPoint.y,
              status: "stage",
            }
          : balloon,
      ),
    );
    setHeldBalloonId(null);
    setLocalSelfPresence((current) => {
      if (!current || current.action !== "balloon") return current;

      return {
        ...current,
        action: "idle",
        actionExpiresAtMs: undefined,
        updatedAtMs: Date.now(),
      };
    });
  };

  return (
    <section
      className={
        isScreenLayout
          ? "absolute inset-0 flex flex-col overflow-hidden rounded-none border-0 bg-transparent"
          : "birthday-panel mb-4 overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.97),rgba(6,9,8,0.99))] shadow-[0_24px_64px_rgba(0,0,0,0.42)]"
      }
    >
      <PartyRoomStyles />
      <div
        className={
          isScreenLayout
            ? "absolute left-3 right-3 top-3 z-40 flex items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-black/28 px-3 py-2 shadow-[0_18px_44px_rgba(0,0,0,0.34)] backdrop-blur-md"
            : "flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3"
        }
        style={
          isScreenLayout
            ? { top: "calc(var(--safe-area-top) + 10px)" }
            : undefined
        }
      >
        {isScreenLayout && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.055] text-white"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="min-w-0">
          <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-[#facc15]/20 bg-[#facc15]/10 px-2.5 py-1 text-[9px] font-black uppercase text-[#fde68a]">
            <span className="birthday-live-dot h-2 w-2 rounded-full bg-[#facc15]" />
            Party room
          </div>
          <h2
            className={`truncate font-black text-white ${
              isScreenLayout ? "text-[17px]" : "text-[20px]"
            }`}
          >
            {isScreenLayout
              ? `${title} Party`
              : partyUnlocked
                ? "Live birthday chaos"
                : "Unlocks on birthday"}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={cycleVenueBackground}
            className={`relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-[18px] border transition-all duration-300 ${
              venueMode
                ? "border-[#38bdf8]/28 bg-[#38bdf8]/14 text-[#bae6fd] shadow-[0_16px_34px_rgba(56,189,248,0.12)]"
                : "border-white/10 bg-white/[0.055] text-[#cbd5e1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            }`}
            aria-label="Change party room background"
            title={activeVenue?.label || "Original stage"}
          >
            <WandSparkles size={19} />
          </button>
          <button
            type="button"
            onClick={toggleMusic}
            className={`party-music-toggle relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-[18px] border transition-all duration-300 ${
              muted
                ? "border-white/10 bg-white/[0.055] text-[#cbd5e1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "party-music-toggle-on border-[#facc15]/35 bg-[linear-gradient(135deg,#facc15,#fb7185,#38bdf8)] text-black shadow-[0_16px_38px_rgba(250,204,21,0.24)]"
            }`}
            aria-label={muted ? "Unmute party music" : "Mute party music"}
          >
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_34%)]" />
            <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-[13px] bg-black/12">
              {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
            </span>
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`party-room-stage relative overflow-hidden ${
          !muted ? "party-room-music-on" : ""
        } ${
          activeVenue ? `party-room-venue-on party-room-venue-${activeVenue.key}` : ""
        } ${
          isScreenLayout ? "min-h-0 flex-1" : "h-[340px]"
        }`}
        style={
          {
            "--party-energy": String(intensity),
            "--venue-accent": activeVenue?.accent || "#38bdf8",
            "--venue-warm": activeVenue?.warm || "#facc15",
            "--venue-pop": activeVenue?.pop || "#fb7185",
            "--venue-wall": activeVenue?.wall || "#181210",
            "--venue-floor": activeVenue?.floor || "#050707",
          } as React.CSSProperties
        }
      >
        <div className="pointer-events-none absolute inset-0">
          {activeVenue && (
            <div className="absolute inset-0">
              <div className="party-venue-wall absolute left-0 right-0 top-0 h-[58%] border-b border-white/8" />
              <div className="party-venue-arch absolute left-1/2 top-[14%] h-[31%] w-[34%] -translate-x-1/2 rounded-t-[999px] rounded-b-[34px] border border-white/10 shadow-[0_18px_54px_rgba(0,0,0,0.24)]">
                <div className="absolute left-1/2 top-[18%] h-16 w-16 -translate-x-1/2 rounded-full border border-[#facc15]/24 bg-[#facc15]/8 shadow-[0_0_38px_rgba(250,204,21,0.18)]" />
                <div className="absolute bottom-5 left-[18%] right-[18%] h-1 rounded-full bg-white/12" />
              </div>
              <div className="absolute left-[9%] top-[21%] h-[18%] w-[18%] rounded-[28px] border border-white/8 bg-black/18 shadow-[0_16px_34px_rgba(0,0,0,0.24)]">
                <div className="absolute left-3 top-3 h-2 w-2 rounded-full bg-[#38bdf8] shadow-[0_0_18px_rgba(56,189,248,0.7)]" />
                <div className="absolute bottom-4 left-4 right-5 h-1 rounded-full bg-white/12" />
              </div>
              <div className="absolute right-[9%] top-[20%] h-[18%] w-[18%] rounded-[28px] border border-white/8 bg-black/18 shadow-[0_16px_34px_rgba(0,0,0,0.24)]">
                <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[#fb7185] shadow-[0_0_18px_rgba(251,113,133,0.7)]" />
                <div className="absolute bottom-4 left-5 right-4 h-1 rounded-full bg-white/12" />
              </div>
              <div className="party-venue-lounge absolute bottom-[76px] left-[7%] h-[76px] w-[31%] rounded-[38px] border border-white/10">
                <div className="absolute -top-4 left-[12%] h-8 w-[34%] rounded-[18px] border border-white/8 bg-[#0b1210]/86" />
                <div className="absolute -top-4 right-[12%] h-8 w-[34%] rounded-[18px] border border-white/8 bg-[#0b1210]/86" />
                <div className="absolute bottom-0 left-5 right-5 h-4 rounded-t-[18px] bg-white/[0.035]" />
              </div>
              <div className="party-venue-speaker absolute bottom-[94px] left-[2.5%] h-[88px] w-11 rounded-[20px] border border-white/10">
                <div className="mx-auto mt-3 h-7 w-7 rounded-full border border-white/12 bg-[#38bdf8]/16" />
                <div className="mx-auto mt-3 h-9 w-9 rounded-full border border-white/12 bg-[#4ade80]/12" />
              </div>
              <div className="party-venue-speaker absolute bottom-[94px] right-[2.5%] h-[88px] w-11 rounded-[20px] border border-white/10">
                <div className="mx-auto mt-3 h-7 w-7 rounded-full border border-white/12 bg-[#fb7185]/16" />
                <div className="mx-auto mt-3 h-9 w-9 rounded-full border border-white/12 bg-[#facc15]/12" />
              </div>
              <div className="party-venue-bar absolute bottom-[86px] right-[12%] h-16 w-[24%] rounded-[26px] border border-white/9">
                <div className="absolute -top-5 left-[18%] h-8 w-5 rounded-full border border-white/12 bg-[#38bdf8]/24" />
                <div className="absolute -top-7 left-[45%] h-10 w-6 rounded-full border border-white/12 bg-[#facc15]/22" />
                <div className="absolute -top-4 right-[18%] h-7 w-5 rounded-full border border-white/12 bg-[#fb7185]/22" />
                <div className="absolute bottom-3 left-4 right-4 h-1 rounded-full bg-white/13" />
              </div>
              {activeVenue.decor === "garden" && (
                <>
                  <div className="absolute bottom-[82px] left-[39%] h-20 w-10 rounded-t-full bg-[#4ade80]/14">
                    <span className="absolute bottom-0 left-1/2 h-16 w-1 -translate-x-1/2 rounded-full bg-[#4ade80]/35" />
                    <span className="absolute left-0 top-4 h-7 w-7 rounded-full bg-[#4ade80]/28" />
                    <span className="absolute right-0 top-8 h-8 w-8 rounded-full bg-[#22c55e]/24" />
                  </div>
                  <div className="absolute right-[37%] top-[22%] h-4 w-4 rounded-full bg-[#facc15]/65 shadow-[0_0_28px_rgba(250,204,21,0.7)]" />
                  <div className="absolute left-[38%] top-[24%] h-3 w-3 rounded-full bg-[#facc15]/55 shadow-[0_0_24px_rgba(250,204,21,0.62)]" />
                </>
              )}
              {activeVenue.decor === "arcade" && (
                <>
                  <div className="absolute bottom-[86px] left-[40%] h-24 w-12 rounded-[16px] border border-[#c084fc]/25 bg-[#c084fc]/14 shadow-[0_0_28px_rgba(192,132,252,0.12)]">
                    <div className="absolute left-2 right-2 top-3 h-8 rounded-[8px] bg-[#38bdf8]/22" />
                    <div className="absolute bottom-4 left-4 h-2 w-2 rounded-full bg-[#fb7185]" />
                    <div className="absolute bottom-4 right-4 h-2 w-2 rounded-full bg-[#facc15]" />
                  </div>
                  <div className="absolute bottom-[86px] right-[39%] h-20 w-11 rounded-[16px] border border-[#38bdf8]/25 bg-[#38bdf8]/12">
                    <div className="absolute left-2 right-2 top-3 h-7 rounded-[8px] bg-[#4ade80]/20" />
                  </div>
                </>
              )}
              {activeVenue.decor === "ballroom" && (
                <>
                  <div className="absolute left-[8%] top-0 h-[52%] w-12 rounded-b-full bg-[#fb7185]/12" />
                  <div className="absolute right-[8%] top-0 h-[52%] w-12 rounded-b-full bg-[#fb7185]/12" />
                  <div className="absolute left-1/2 top-[16%] h-14 w-14 -translate-x-1/2 rounded-full border border-[#facc15]/22 bg-[#facc15]/10 shadow-[0_0_34px_rgba(250,204,21,0.25)]">
                    <span className="absolute left-1/2 top-full h-8 w-px -translate-x-1/2 bg-[#facc15]/40" />
                  </div>
                </>
              )}
              {activeVenue.decor === "cabana" && (
                <>
                  <div className="absolute left-[40%] top-[19%] h-9 w-[20%] rounded-b-[18px] bg-[repeating-linear-gradient(90deg,#38bdf855_0_12px,#facc1555_12px_24px)] shadow-[0_14px_26px_rgba(0,0,0,0.22)]" />
                  <div className="absolute bottom-[82px] left-[39%] h-20 w-3 rounded-full bg-[#92400e]/60">
                    <span className="absolute -left-7 -top-5 h-10 w-10 rounded-full bg-[#4ade80]/24" />
                    <span className="absolute -right-7 -top-6 h-11 w-11 rounded-full bg-[#4ade80]/22" />
                  </div>
                </>
              )}
              {activeVenue.decor === "premiere" && (
                <>
                  <div className="absolute bottom-[52px] left-[34%] right-[34%] h-[116px] rounded-t-[32px] bg-[#ef4444]/16 shadow-[0_0_30px_rgba(239,68,68,0.16)]" />
                  <div className="absolute bottom-[82px] left-[33%] h-14 w-2 rounded-full bg-[#facc15]/62" />
                  <div className="absolute bottom-[82px] right-[33%] h-14 w-2 rounded-full bg-[#facc15]/62" />
                  <div className="absolute bottom-[125px] left-[33%] right-[33%] h-1 rounded-full bg-[#fb7185]/60" />
                </>
              )}
              {activeVenue.decor === "rooftop" && (
                <>
                  <div className="absolute left-[8%] right-[8%] top-[17%] flex h-[25%] items-end justify-between opacity-70">
                    {[24, 38, 30, 48, 34, 42, 28].map((height, index) => (
                      <span key={index} className="w-[9%] rounded-t-[10px] border border-white/8 bg-[#0f172a]/65" style={{ height }} />
                    ))}
                  </div>
                  <div className="absolute right-[35%] top-[22%] h-3 w-3 rounded-full bg-[#22d3ee] shadow-[0_0_26px_rgba(34,211,238,0.8)]" />
                </>
              )}
              {activeVenue.decor === "candy" && (
                <>
                  <div className="absolute bottom-[86px] left-[40%] h-20 w-5 rounded-full bg-[repeating-linear-gradient(45deg,#fb7185_0_7px,#fff7ed_7px_14px)] shadow-[0_12px_24px_rgba(0,0,0,0.25)]" />
                  <div className="absolute bottom-[138px] right-[39%] h-11 w-11 rounded-full border-[6px] border-[#38bdf8]/70 bg-[#facc15]/60 shadow-[0_0_24px_rgba(56,189,248,0.22)]" />
                  <div className="absolute bottom-[86px] right-[42%] h-14 w-1 rounded-full bg-white/50" />
                </>
              )}
              {activeVenue.decor === "space" && (
                <>
                  <div className="absolute left-[13%] top-[18%] h-8 w-8 rounded-full bg-[#a78bfa]/38 shadow-[0_0_28px_rgba(167,139,250,0.44)]" />
                  <div className="absolute right-[14%] top-[24%] h-12 w-12 rounded-full border border-[#38bdf8]/28 bg-[#38bdf8]/14" />
                  <div className="absolute left-[41%] top-[23%] h-1.5 w-1.5 rounded-full bg-white/80 shadow-[36px_10px_0_rgba(255,255,255,0.6),78px_-8px_0_rgba(255,255,255,0.55),120px_18px_0_rgba(255,255,255,0.48)]" />
                </>
              )}
              {activeVenue.decor === "courtyard" && (
                <>
                  <div className="absolute left-[35%] top-[18%] h-[31%] w-5 rounded-t-full border border-white/10 bg-white/[0.055]" />
                  <div className="absolute right-[35%] top-[18%] h-[31%] w-5 rounded-t-full border border-white/10 bg-white/[0.055]" />
                  <div className="absolute bottom-[82px] left-[43%] h-16 w-[14%] rounded-t-full border border-[#4ade80]/18 bg-[#4ade80]/10 shadow-[0_0_28px_rgba(74,222,128,0.12)]" />
                </>
              )}
              <div className="absolute bottom-[48px] left-[18%] right-[18%] h-[22px] rounded-[50%] bg-black/36 blur-md" />
            </div>
          )}
          <div className="party-room-disco-wash absolute inset-[-8%]" />
          <div className="party-room-light absolute left-[-24%] top-[-10%] h-[74%] w-[64%] origin-top bg-[linear-gradient(102deg,rgba(74,222,128,0.34),transparent_64%)] blur-sm" />
          <div className="party-room-light absolute right-[-24%] top-[-8%] h-[76%] w-[64%] origin-top bg-[linear-gradient(258deg,rgba(56,189,248,0.34),transparent_64%)] blur-sm [animation-delay:1.1s]" />
          <div className="party-room-light absolute left-[22%] top-[-18%] h-[68%] w-[58%] origin-top bg-[linear-gradient(180deg,rgba(251,113,133,0.22),transparent_66%)] blur-md [animation-delay:2.2s]" />

          <div className="absolute left-0 right-0 top-0 h-[42%] bg-[linear-gradient(180deg,rgba(0,0,0,0.16),transparent)]" />
          <div className="absolute left-0 right-0 top-[18%] h-px bg-white/10" />
          <div
            className={`absolute left-1/2 w-px -translate-x-1/2 bg-white/20 ${
              isScreenLayout ? "top-[102px] h-20" : "top-16 h-14"
            }`}
          />
          <div
            className={`party-room-disco-halo absolute left-1/2 h-44 w-44 -translate-x-1/2 rounded-full blur-2xl ${
              isScreenLayout ? "top-[136px]" : "top-[76px]"
            }`}
          />
          <div
            className={`party-room-disco absolute left-1/2 h-16 w-16 rounded-full border border-white/18 shadow-[0_0_34px_rgba(250,204,21,0.34)] ${
              isScreenLayout ? "top-[176px]" : "top-28"
            }`}
          />
          <div
            className={`party-room-spotlight absolute left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[#facc15]/12 blur-2xl ${
              isScreenLayout ? "top-[142px]" : "top-24"
            }`}
          />

          <div className="absolute bottom-[62px] left-4 flex h-20 w-12 flex-col items-center justify-end rounded-[16px] border border-white/8 bg-black/38 shadow-[0_12px_28px_rgba(0,0,0,0.3)]">
            <span className="mb-2 h-7 w-7 rounded-full border border-white/10 bg-[#4ade80]/24" />
            <span className="mb-3 h-4 w-4 rounded-full border border-white/10 bg-[#38bdf8]/24" />
          </div>
          <div className="absolute bottom-[62px] right-4 flex h-20 w-12 flex-col items-center justify-end rounded-[16px] border border-white/8 bg-black/38 shadow-[0_12px_28px_rgba(0,0,0,0.3)]">
            <span className="mb-2 h-7 w-7 rounded-full border border-white/10 bg-[#fb7185]/24" />
            <span className="mb-3 h-4 w-4 rounded-full border border-white/10 bg-[#facc15]/24" />
          </div>

          <div className="absolute bottom-[96px] left-1/2 flex -translate-x-1/2 gap-1.5">
            {Array.from({ length: 7 }).map((_, index) => (
              <span
                key={index}
                className="party-room-floor-tile h-5 w-5 rounded-[6px] border border-white/8"
                style={{
                  background: ["#4ade8033", "#38bdf833", "#fb718533", "#facc1533"][
                    index % 4
                  ],
                  animationDelay: `${index * 0.12}s`,
                }}
              />
            ))}
          </div>

        </div>

        {balloons.map((balloon) =>
          balloon.status === "given" ? (
            <div
              key={balloon.id}
              className="party-room-given-balloon pointer-events-none absolute z-[17] flex flex-col items-center"
              style={{
                left: `${balloon.x}%`,
                top: `${balloon.y}%`,
              }}
            >
              <div
                className="h-10 w-8 rounded-full border border-white/18"
                style={{
                  background: balloon.color,
                  boxShadow: `0 0 28px ${balloon.glow}`,
                }}
              />
              <div className="h-[104px] w-px bg-white/46" />
              <div className="-mt-1 h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_8px_rgba(255,255,255,0.32)]" />
            </div>
          ) : balloon.status === "held" ? null : (
            <button
              key={balloon.id}
              type="button"
              aria-label="Pick up balloon"
              onClick={() => pickBalloon(balloon.id)}
              className="party-room-toy-balloon absolute z-[24] flex -translate-x-1/2 -translate-y-[88%] flex-col items-center border-0 bg-transparent p-0"
              style={{
                left: `${balloon.x}%`,
                top: `${balloon.y}%`,
              }}
            >
              <span
                className="h-12 w-9 rounded-full border border-white/18"
                style={{
                  background: balloon.color,
                  boxShadow: `0 0 28px ${balloon.glow}`,
                }}
              />
              <span className="h-16 w-px bg-white/34" />
            </button>
          ),
        )}

        {heldBalloon && (
          <div
            ref={heldBalloonRef}
            className="party-room-held-balloon pointer-events-none absolute z-[34] flex -translate-x-1/2 -translate-y-full flex-col items-center"
            style={{
              left: `${selfPosition.x + HELD_BALLOON_OFFSET.x}%`,
              top: `${selfPosition.y + HELD_BALLOON_OFFSET.y}%`,
            }}
          >
            <div
              className="h-10 w-8 rounded-full border border-white/18"
              style={{
                background: heldBalloon.color,
                boxShadow: `0 0 30px ${heldBalloon.glow}`,
              }}
            />
            <div className="h-[112px] w-px bg-white/50" />
            <div className="-mt-1 h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_8px_rgba(255,255,255,0.32)]" />
          </div>
        )}

        <button
          type="button"
          onClick={pickCakeSlice}
          className={`party-room-center-cake absolute left-1/2 top-[53%] z-[16] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center border-0 bg-transparent p-0 transition-transform duration-200 ${
            nearCake ? "scale-[1.05]" : ""
          }`}
          aria-label={nearCake ? "Pick cake slice" : "Go near cake"}
        >
          <div className="relative flex h-16 w-20 items-center justify-center rounded-[22px] border border-[#facc15]/28 bg-[linear-gradient(180deg,#fde68a,#fb7185)] shadow-[0_18px_44px_rgba(251,113,133,0.28)]">
            <span className="absolute -top-5 left-1/2 h-6 w-1 -translate-x-1/2 rounded-full bg-[#facc15] shadow-[0_0_16px_rgba(250,204,21,0.9)]" />
            <span className="absolute -top-7 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[#fb7185]" />
            <CakeSlice size={34} className="text-[#3b150f]" />
          </div>
          <div className="h-7 w-28 rounded-[50%] bg-black/34 blur-sm" />
        </button>

        {heldCake && (
          <div
            ref={heldCakeRef}
            className="pointer-events-none absolute z-[28] -translate-x-1/2 -translate-y-1/2 rotate-[-14deg] drop-shadow-[0_0_18px_rgba(249,115,22,0.5)]"
            style={{
              left: `${selfPosition.x + HELD_CAKE_OFFSET.x}%`,
              top: `${selfPosition.y + HELD_CAKE_OFFSET.y}%`,
            }}
          >
            <CakePiece />
          </div>
        )}

        {cakeProjectiles.map((projectile) => (
          <div
            key={projectile.id}
            className="party-cake-projectile pointer-events-none absolute z-[36] drop-shadow-[0_0_24px_rgba(249,115,22,0.62)]"
            style={{
              left: `${projectile.x}%`,
              top: `${projectile.y}%`,
            }}
          >
            <CakePiece className="h-7 w-9" />
          </div>
        ))}

        {cakeSplats.map((splat) => (
          <div
            key={splat.id}
            className="party-cake-splatter pointer-events-none absolute z-[35] h-1 w-1"
            style={{ left: `${splat.x}%`, top: `${splat.y}%` }}
          >
            {[
              { x: "-18px", y: "-9px", rotate: "-120deg", size: "h-2.5 w-3.5", color: "#fed7aa" },
              { x: "16px", y: "-8px", rotate: "96deg", size: "h-2 w-3", color: "#fb7185" },
              { x: "-11px", y: "13px", rotate: "150deg", size: "h-2 w-2.5", color: "#facc15" },
              { x: "13px", y: "12px", rotate: "-70deg", size: "h-2.5 w-3", color: "#f97316" },
              { x: "0px", y: "-18px", rotate: "210deg", size: "h-1.5 w-2.5", color: "#fff7ed" },
              { x: "0px", y: "18px", rotate: "-180deg", size: "h-1.5 w-2", color: "#fed7aa" },
            ].map((crumb, index) => (
              <span
                key={`${splat.id}-crumb-${index}`}
                className={`party-cake-crumb absolute left-1/2 top-1/2 rounded-[5px] shadow-[0_0_12px_rgba(254,215,170,0.45)] ${crumb.size}`}
                style={
                  {
                    "--crumb-x": crumb.x,
                    "--crumb-y": crumb.y,
                    "--crumb-rotate": crumb.rotate,
                    background: crumb.color,
                    animationDelay: `${index * 0.025}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        ))}

        <div className="absolute bottom-[66px] left-5 right-5 h-[84px] rounded-[50%] border border-white/8 bg-black/18 shadow-[inset_0_18px_38px_rgba(255,255,255,0.04)]" />
        <div className="absolute bottom-5 left-4 right-4 z-10 flex h-12 items-end justify-center gap-1.5 opacity-80">
          {[0.44, 0.8, 0.58, 1, 0.68, 0.9, 0.5].map((scale, index) => (
            <span
              key={index}
              className="party-music-bar w-2 rounded-full bg-[#4ade80]/55"
              style={{
                height: `${18 + energy * 0.18}px`,
                animationDelay: `${index * 0.09}s`,
                transform: `scaleY(${scale})`,
              }}
            />
          ))}
        </div>

        {visibleGuests.map((guest) => (
          <PartyStickman
            key={guest.userId}
            guest={guest}
            energy={energy}
            now={now}
            musicOn={!muted}
            isControlled={guest.userId === user?.id}
            isHit={
              (guest.userId === darrenPartyGuest.userId && darrenHitUntil > now) ||
              (guest.isBirthdayUser && birthdayHitUntil > now)
            }
            hitPulse={
              guest.userId === darrenPartyGuest.userId
                ? darrenHitPulse
                : guest.isBirthdayUser
                  ? birthdayHitPulse
                  : 0
            }
            rootRef={guest.userId === user?.id ? selfStickmanRef : undefined}
          />
        ))}
      </div>

      {isScreenLayout && (
        <div
          role="application"
          aria-label="Move character"
          onPointerDown={startJoystick}
          onPointerMove={moveJoystick}
          onPointerUp={stopJoystick}
          onPointerCancel={stopJoystick}
          className={`absolute left-4 z-50 flex h-[96px] w-[96px] items-center justify-center rounded-full border border-white/12 bg-black/28 shadow-[0_18px_48px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md ${
            joystickActive ? "scale-[1.03]" : ""
          }`}
          style={{
            bottom: "calc(var(--safe-area-bottom) + 92px)",
            touchAction: "none",
          }}
        >
          <div className="absolute h-[62px] w-[62px] rounded-full border border-white/10 bg-white/[0.045]" />
          <div className="absolute h-px w-[72px] bg-white/10" />
          <div className="absolute h-[72px] w-px bg-white/10" />
          <div
            ref={joystickKnobRef}
            className="relative flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#4ade80,#38bdf8)] text-black shadow-[0_12px_28px_rgba(56,189,248,0.28)] transition-transform duration-75"
          >
            <span className="h-3 w-3 rounded-full bg-black/55" />
          </div>
        </div>
      )}

      <div
        className={
          isScreenLayout
            ? "absolute inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/36 px-3 py-3 shadow-[0_-16px_44px_rgba(0,0,0,0.4)] backdrop-blur-md"
            : "border-t border-white/8 px-3 py-3"
        }
        style={
          isScreenLayout
            ? { paddingBottom: "calc(var(--safe-area-bottom) + 12px)" }
            : undefined
        }
      >
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={
              heldBalloonId
                ? nearDarren
                  ? handBalloonToDarren
                  : dropHeldBalloon
                : () => pickBalloon()
            }
            disabled={!partyUnlocked}
            className={`flex min-h-[46px] shrink-0 items-center gap-2 rounded-full border px-3 text-[11px] font-black disabled:text-[#64748b] ${
              heldBalloonId
                ? nearDarren
                  ? "border-[#38bdf8]/30 bg-[#38bdf8]/16 text-[#bae6fd] shadow-[0_0_24px_rgba(56,189,248,0.14)]"
                  : "border-[#a78bfa]/26 bg-[#a78bfa]/12 text-[#ddd6fe]"
                : nearBalloon
                  ? "border-[#fb7185]/28 bg-[#fb7185]/12 text-[#fecdd3]"
                  : "border-white/8 bg-white/[0.045] text-[#cbd5e1]"
            }`}
            aria-label={
              heldBalloonId
                ? nearDarren
                  ? "Hand balloon to Darren"
                  : "Drop balloon"
                : "Pick up balloon"
            }
            title={
              heldBalloonId
                ? nearDarren
                  ? "Hand balloon to Darren"
                  : "Drop balloon"
                : "Pick balloon"
            }
          >
            <Sparkles size={15} />
            {heldBalloonId
              ? nearDarren
                ? "Hand to Darren"
                : "Drop balloon"
              : nearBalloon
                ? "Pick balloon"
                : "Balloon"}
          </button>
          <button
            type="button"
            onPointerDown={handleCakeControlPointerDown}
            onClick={handleCakeControlClick}
            disabled={!partyUnlocked}
            className={`flex min-h-[46px] shrink-0 items-center gap-2 rounded-full border px-3 text-[11px] font-black disabled:text-[#64748b] ${
              heldCake
                ? "border-[#fed7aa]/30 bg-[#f97316]/18 text-[#fed7aa] shadow-[0_0_24px_rgba(249,115,22,0.14)]"
                : nearCake
                  ? "border-[#facc15]/26 bg-[#facc15]/12 text-[#fde68a]"
                  : "border-white/8 bg-white/[0.045] text-[#cbd5e1]"
            }`}
            aria-label={heldCake ? "Throw cake at Darren" : "Pick cake slice"}
            title={heldCake ? "Throw cake" : "Pick cake"}
          >
            <CakeSlice size={15} />
            {heldCake ? `Throw cake ${cakeAmmo}` : nearCake ? "Take cake" : "Cake"}
          </button>
          {partyActions.map(({ id, label, Icon, accent }) => (
            <button
              key={id}
              type="button"
              onClick={() => sendAction(id)}
              disabled={!partyUnlocked}
              className="flex min-h-[46px] shrink-0 items-center gap-2 rounded-full border border-white/8 bg-white/[0.045] px-3 text-[11px] font-black text-white disabled:text-[#64748b]"
              style={{ color: partyUnlocked ? accent : undefined }}
              aria-label={label}
              title={label}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {visibleSnapshots.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {visibleSnapshots.slice(0, 4).map((snapshot) => (
              <div
                key={snapshot.id}
                className="min-w-[178px] rounded-[20px] border border-white/8 bg-black/22 p-3"
              >
                <p className="truncate text-[12px] font-black text-white">
                  {snapshot.title}
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-snug text-[#94a3b8]">
                  {snapshot.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
