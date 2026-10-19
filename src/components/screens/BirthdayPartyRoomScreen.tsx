"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import {
  birthdayRoomService,
  type BirthdayDrop,
  type BirthdayRoom,
} from "@/middleware/services/birthday-room.service";
import { PartyRoom } from "@/components/birthday/PartyRoom";

function PartyScreenStyles() {
  return (
    <style>{`
      .party-room-screen {
        background:
          radial-gradient(circle at 50% -10%, rgba(250,204,21,0.22), transparent 34%),
          radial-gradient(circle at 10% 12%, rgba(251,113,133,0.22), transparent 28%),
          radial-gradient(circle at 92% 18%, rgba(56,189,248,0.2), transparent 28%),
          linear-gradient(180deg, #050707 0%, #08100c 44%, #030404 100%);
      }
      @keyframes partyBackdropFloat {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0.42; }
        50% { transform: translate3d(0, -12px, 0) rotate(4deg); opacity: 0.78; }
      }
      @keyframes partyLaserSweep {
        0% { transform: translateX(-45%) rotate(-16deg); opacity: 0; }
        18% { opacity: 0.46; }
        62% { opacity: 0.14; }
        100% { transform: translateX(45%) rotate(16deg); opacity: 0; }
      }
      .party-backdrop-confetti span {
        position: absolute;
        width: 5px;
        height: 14px;
        border-radius: 999px;
        animation: partyBackdropFloat 4.8s ease-in-out infinite;
      }
      .party-laser {
        animation: partyLaserSweep 6.2s ease-in-out infinite;
      }
    `}</style>
  );
}

export function BirthdayPartyRoomScreen({
  onBack,
  initialRoom,
  initialDrops = [],
}: {
  onBack: () => void;
  initialRoom?: BirthdayRoom | null;
  initialDrops?: BirthdayDrop[];
}) {
  const { user } = useAuthStore();
  const [room, setRoom] = useState<BirthdayRoom | null>(initialRoom ?? null);
  const [drops, setDrops] = useState<BirthdayDrop[]>(initialDrops);

  useEffect(() => {
    if (!user?.id) return;

    const nextRoom = initialRoom || birthdayRoomService.buildRoomForUser(user as any);
    setRoom(nextRoom);
    setDrops(initialDrops);

    if (nextRoom.birthdayUserId === user.id) {
      birthdayRoomService.ensureRoom(nextRoom).catch((roomError) => {
        console.warn("Party room will run in preview mode:", roomError);
      });
    }

    if (initialRoom) {
      return () => undefined;
    }

    return birthdayRoomService.subscribeToDrops(
      nextRoom.id,
      setDrops,
      () => undefined,
    );
  }, [initialDrops, initialRoom, user]);

  const roomActive = room?.status === "active" || room?.status === "preview";

  return (
    <div className="screen-container party-room-screen relative flex flex-col overflow-hidden">
      <PartyScreenStyles />
      <div className="party-laser pointer-events-none absolute left-[-18%] top-[13%] h-24 w-[136%] bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.18),rgba(56,189,248,0.12),transparent)] blur-xl" />
      <div className="party-laser pointer-events-none absolute left-[-22%] top-[31%] h-20 w-[140%] bg-[linear-gradient(90deg,transparent,rgba(251,113,133,0.16),rgba(250,204,21,0.12),transparent)] blur-xl [animation-delay:1.8s]" />
      <div className="party-backdrop-confetti pointer-events-none absolute inset-0 overflow-hidden">
        {[8, 18, 31, 44, 57, 69, 82, 93].map((left, index) => (
          <span
            key={left}
            style={{
              left: `${left}%`,
              top: `${8 + (index % 4) * 18}%`,
              background: ["#4ade80", "#38bdf8", "#fb7185", "#facc15"][
                index % 4
              ],
              animationDelay: `${index * 0.36}s`,
            }}
          />
        ))}
      </div>

      <PartyRoom
        room={room}
        user={user}
        drops={drops}
        roomActive={roomActive}
        layout="screen"
        onBack={onBack}
      />
    </div>
  );
}
