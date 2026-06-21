"use client";

import { BadgeCheck, Flame, Home, LucideIcon, Plus, Scale, Users } from "lucide-react";

type Screen =
  | "truth"
  | "main"
  | "dares"
  | "profile"
  | "feed"
  | "verdicts"
  | "circle";
type PrimaryScreen = Exclude<Screen, "verdicts" | "circle">;

interface BottomNavigationProps {
  currentScreen: Screen;
  onScreenChange: (screen: PrimaryScreen) => void;
  onCreateClick: () => void;
  onVerdictsClick?: () => void;
  onCircleClick?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  isActive: boolean;
}

export function BottomNavigation({
  currentScreen,
  onScreenChange,
  onCreateClick,
  onVerdictsClick,
  onCircleClick,
}: BottomNavigationProps) {
  const leftItems: NavItem[] = [
    {
      id: "truth",
      label: "Feed",
      icon: BadgeCheck,
      onClick: () => onScreenChange("truth"),
      isActive: currentScreen === "truth",
    },
    {
      id: "main",
      label: "Dares",
      icon: Flame,
      onClick: () => onScreenChange("main"),
      isActive: currentScreen === "main",
    },
  ];

  const rightItems: NavItem[] = [
    {
      id: "feed",
      label: "Home",
      icon: Home,
      onClick: () => onScreenChange("feed"),
      isActive: currentScreen === "feed",
    },
  ];
  if (onVerdictsClick) {
    rightItems.push({
      id: "verdicts",
      label: "Verdicts",
      icon: Scale,
      onClick: onVerdictsClick,
      isActive: currentScreen === "verdicts",
    });
  }
  if (onCircleClick) {
    rightItems.push({
      id: "circle",
      label: "Circle",
      icon: Users,
      onClick: onCircleClick,
      isActive: currentScreen === "circle",
    });
  }

  return (
    <div
      className="app-bottom-nav app-bottom-nav-motion fixed bottom-0 left-0 right-0 z-[9999] flex justify-center"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))", pointerEvents: "none" }}
    >
      <div
        className="relative mx-3 flex w-full items-center overflow-hidden rounded-[28px] border border-white/[0.07]"
        style={{
          pointerEvents: "auto",
          background: "linear-gradient(180deg, rgba(14,27,17,0.97) 0%, rgba(4,9,5,0.99) 100%)",
          backdropFilter: "blur(48px)",
          WebkitBackdropFilter: "blur(48px)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 64px rgba(0,0,0,0.55), 0 8px 28px rgba(0,0,0,0.35)",
          paddingTop: "9px",
          paddingBottom: "9px",
          paddingLeft: "6px",
          paddingRight: "6px",
        }}
      >
        {/* Top shine */}
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />

        {/* Left group */}
        <div className="flex flex-1 items-center justify-around">
          {leftItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                className="app-pressable flex items-center justify-center px-2 py-1"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 ${
                    item.isActive ? "bg-[#4ade80]/[0.12]" : ""
                  }`}
                >
                  <Icon
                    size={20}
                    strokeWidth={item.isActive ? 2.2 : 1.8}
                    className={item.isActive ? "text-[#4ade80]" : "text-white/40"}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Center Plus — fixed width so it stays truly centered */}
        <div className="flex w-[68px] shrink-0 items-center justify-center">
          <button
            onClick={onCreateClick}
            className="nav-plus-btn app-pressable flex h-[44px] w-[44px] items-center justify-center rounded-full"
            style={{
              background: "linear-gradient(145deg, #55ea8e 0%, #1db954 100%)",
              boxShadow:
                "0 0 0 1px rgba(74,222,128,0.22), 0 12px 32px rgba(74,222,128,0.42), 0 4px 14px rgba(0,0,0,0.55)",
            }}
          >
            <Plus size={20} strokeWidth={2.6} className="text-[#011508]" />
          </button>
        </div>

        {/* Right group */}
        <div className="flex flex-1 items-center justify-around">
          {rightItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                className="app-pressable flex items-center justify-center px-2 py-1"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 ${
                    item.isActive ? "bg-[#4ade80]/[0.12]" : ""
                  }`}
                >
                  <Icon
                    size={20}
                    strokeWidth={item.isActive ? 2.2 : 1.8}
                    className={item.isActive ? "text-[#4ade80]" : "text-white/40"}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
