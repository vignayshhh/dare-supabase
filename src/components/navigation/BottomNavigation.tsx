"use client";

import { useEffect, useRef, useState } from "react";
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
  const [showCreateInHomeSlot, setShowCreateInHomeSlot] = useState(false);
  const [showCenterChooser, setShowCenterChooser] = useState(false);
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setShowCreateInHomeSlot((current) => !current);
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const sync = () => setIsAppModalOpen(Boolean(document.querySelector(".app-modal-backdrop")));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCenterPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setShowCenterChooser(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(8);
      }
    }, 520);
  };

  const handleCenterPointerUp = () => {
    clearLongPressTimer();
  };

  const handleCenterClick = (onClick: () => void) => (event: React.MouseEvent<HTMLButtonElement>) => {
    if (longPressTriggeredRef.current) {
      event.preventDefault();
      longPressTriggeredRef.current = false;
      return;
    }

    onClick();
  };

  const chooseCenterAction = (action: "create" | "home") => {
    setShowCenterChooser(false);
    if (action === "create") {
      setShowCreateInHomeSlot(true);
      onCreateClick();
      return;
    }

    setShowCreateInHomeSlot(false);
    onScreenChange("feed");
  };

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
  const visibleItems = [...leftItems, ...rightItems];

  const renderNavButton = (item: NavItem) => {
    const Icon = item.icon;
    const isHomeSlot = item.id === "feed";
    const showCreate = isHomeSlot && showCreateInHomeSlot;
    const clickAction = showCreate ? onCreateClick : item.onClick;

    return (
      <button
        key={item.id}
        onClick={isHomeSlot ? handleCenterClick(clickAction) : clickAction}
        onPointerDown={isHomeSlot ? handleCenterPointerDown : undefined}
        onPointerUp={isHomeSlot ? handleCenterPointerUp : undefined}
        onPointerCancel={isHomeSlot ? handleCenterPointerUp : undefined}
        onPointerLeave={isHomeSlot ? handleCenterPointerUp : undefined}
        onContextMenu={isHomeSlot ? (event) => event.preventDefault() : undefined}
        className="app-pressable flex min-w-0 items-center justify-center px-1 py-1"
        aria-label={showCreate ? "Create" : item.label}
        aria-haspopup={isHomeSlot ? "dialog" : undefined}
        aria-expanded={isHomeSlot ? showCenterChooser : undefined}
      >
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 ${
            item.isActive
              ? "bg-white shadow-[0_10px_28px_rgba(255,255,255,0.18),inset_0_1px_0_rgba(255,255,255,0.72)]"
            : "bg-black/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
          }`}
        >
          {isHomeSlot ? (
            <span className="relative flex h-5 w-5 items-center justify-center">
              <Home
                size={20}
                strokeWidth={item.isActive ? 2.2 : 1.8}
                className={`absolute transition-all duration-500 ease-out ${
                  item.isActive ? "text-black" : "text-white/48"
                } ${
                  showCreate
                    ? "scale-75 opacity-0 blur-[1px]"
                    : "scale-100 opacity-100 blur-0"
                }`}
              />
              <Plus
                size={21}
                strokeWidth={2.5}
                className={`absolute transition-all duration-500 ease-out ${
                  item.isActive ? "text-black" : "text-white/72"
                } ${
                  showCreate
                    ? "scale-100 opacity-100 blur-0"
                    : "scale-75 opacity-0 blur-[1px]"
                }`}
              />
            </span>
          ) : (
            <Icon
              size={20}
              strokeWidth={item.isActive ? 2.2 : 1.8}
              className={item.isActive ? "text-black" : "text-white/48"}
            />
          )}
        </div>
      </button>
    );
  };

  return (
    <div
      className="app-bottom-nav app-bottom-nav-motion fixed bottom-0 left-0 right-0 z-[9999] flex justify-center"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))", pointerEvents: "none" }}
    >
      <div
        className="relative mx-3 flex w-full items-center overflow-visible rounded-[28px] border border-white/[0.07]"
        style={{
          pointerEvents: isAppModalOpen ? "none" : "auto",
          background:
            "linear-gradient(180deg, rgba(20,20,20,0.97) 0%, rgba(5,5,5,0.99) 100%)",
          backdropFilter: "blur(48px)",
          WebkitBackdropFilter: "blur(48px)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(255,255,255,0.03), 0 24px 64px rgba(0,0,0,0.58), 0 8px 28px rgba(0,0,0,0.38)",
          paddingTop: "10px",
          paddingBottom: "9px",
          paddingLeft: "6px",
          paddingRight: "6px",
        }}
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />

        {showCenterChooser && (
          <div
            role="dialog"
            aria-label="Choose center action"
            className="absolute bottom-[calc(100%+12px)] left-1/2 z-10 w-[min(290px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl border border-white/[0.1] bg-[#111]/95 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
          >
            <p className="px-1 pb-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/48">
              Choose center action
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => chooseCenterAction("create")}
                className="app-pressable flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-2.5 text-xs font-bold text-black"
              >
                <Plus size={16} strokeWidth={2.6} />
                Create
              </button>
              <button
                type="button"
                onClick={() => chooseCenterAction("home")}
                className="app-pressable flex items-center justify-center gap-2 rounded-xl bg-white/[0.08] px-3 py-2.5 text-xs font-bold text-white"
              >
                <Home size={16} strokeWidth={2.2} />
                Home
              </button>
            </div>
          </div>
        )}

        <div
          className="grid w-full items-center"
          style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
        >
          {visibleItems.map(renderNavButton)}
        </div>
      </div>
    </div>
  );
}
