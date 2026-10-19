"use client";
import { useState } from "react";
import type { StickmanStatusId } from "@/services/stickmanStatusService";
import "./stickman.css";
export function StickmanBody({
  label,
  avatar,
  statusId,
  color,
  compact = false,
  animate = true,
}: {
  label: string;
  avatar?: string;
  statusId: StickmanStatusId;
  color: string;
  compact?: boolean;
  animate?: boolean;
}) {
  const [failedAvatarSrc, setFailedAvatarSrc] = useState<string | null>(null);
  const avatarSrc = typeof avatar === "string" ? avatar.trim() : "";
  const showAvatar = Boolean(avatarSrc) && avatarSrc !== failedAvatarSrc;

  return (
    <div
      className={`chat-stickman-motion relative flex flex-col items-center ${compact ? "is-compact" : ""}`}
      data-status={statusId}
      data-animated={animate}
      aria-hidden="true"
    >
      <div
        className="chat-stickman-head flex items-center justify-center overflow-hidden rounded-full border-2 bg-[#101611] font-black text-white"
        style={{ borderColor: color }}
      >
        {showAvatar ? (
          <img
            src={avatarSrc}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setFailedAvatarSrc(avatarSrc)}
          />
        ) : compact ? (
          <span className="chat-stickman-face" />
        ) : (
          label.slice(0, 2).toUpperCase()
        )}
      </div>
      <div className="chat-stickman-body relative mt-[-1px]">
        <span className="chat-stickman-spine absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-white/80" />
        <span className="chat-presence-arm chat-presence-arm-left absolute origin-right rounded-full bg-white/75" />
        <span className="chat-presence-arm chat-presence-arm-right absolute origin-left rounded-full bg-white/75" />
        <span className="chat-presence-leg chat-presence-leg-left absolute origin-left rounded-full bg-white/75" />
        <span className="chat-presence-leg chat-presence-leg-right absolute origin-right rounded-full bg-white/75" />
      </div>
    </div>
  );
}
