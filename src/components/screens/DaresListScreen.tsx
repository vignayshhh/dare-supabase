import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Target } from "lucide-react";
import type { DarePost } from "../../middleware/adapters/data-adapters";
import { DareCard } from "./MainScreen";
import { useContentStore } from "../../stores/useContentStore";

interface DaresListScreenProps {
  userId?: string;
  onBack: () => void;
  darePosts?: DarePost[];
  loading?: boolean;
  onSelectDare?: (dare: DarePost) => void;
  initialDareId?: string;
  titleName?: string;
}

function isUserInvolved(dare: DarePost, userId?: string) {
  if (!userId) return true;
  if (!dare.challengerId && !dare.receiverId) return true;
  return dare.challengerId === userId || dare.receiverId === userId;
}

export function DaresListScreen({
  userId,
  onBack,
  darePosts = [],
  loading = false,
  onSelectDare,
  initialDareId,
  titleName,
}: DaresListScreenProps) {
  const voteOnDare = useContentStore((s) => s.voteOnDare);
  const handleVoteClick = (dare: DarePost) => {
    onSelectDare?.(dare);
  };
  const handleVote = (dareId: string, vote: "real" | "fake") => {
    void voteOnDare(dareId, vote);
  };
  const filteredDares = [...darePosts]
    .filter((dare) => isUserInvolved(dare, userId))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const involvedName =
    titleName ||
    filteredDares.find((dare) => dare.challengerId === userId)?.challenger
      .nickname ||
    filteredDares.find((dare) => dare.receiverId === userId)?.receiver
      .nickname ||
    "User";
  const headerTitle = `${involvedName.replace(/^@/, "")}'s dares`;

  const reelContainerRef = useRef<HTMLDivElement | null>(null);
  const [activeReelIndex, setActiveReelIndex] = useState(0);

  useEffect(() => {
    const container = reelContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const slideHeight = container.clientHeight;
      if (!slideHeight) return;
      const idx = Math.round(container.scrollTop / slideHeight);
      setActiveReelIndex(idx);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener("scroll", handleScroll);
  }, [filteredDares.length]);

  // Scroll to the initially selected dare on mount
  useEffect(() => {
    if (loading || !initialDareId) return;
    const container = reelContainerRef.current;
    if (!container) return;
    const targetIndex = filteredDares.findIndex((d) => d.id === initialDareId);
    if (targetIndex < 0) return;
    const slideHeight = container.clientHeight;
    if (!slideHeight) return;
    container.scrollTo({ top: targetIndex * slideHeight, behavior: "auto" });
    setActiveReelIndex(targetIndex);
  }, [initialDareId, loading, filteredDares.length]);

  return (
    <div
      style={{
        height: "100dvh",
        background:
          "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.14), transparent 34%), linear-gradient(180deg, #060806 0%, #030403 100%)",
        fontFamily:
          "var(--font-ui)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box",
        paddingBottom:
          "calc(var(--bottom-nav-total-height, 82px) + var(--safe-area-bottom) + 8px)",
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .profile-dares-list-reel .dare-cover-capsule {
          transform: translateY(78px) !important;
          width: min(92vw, 360px) !important;
          max-width: min(92vw, 360px) !important;
        }
        .profile-dares-list-reel .dare-liquid-capsule {
          width: 100% !important;
          max-width: 100% !important;
          justify-content: center !important;
          gap: 7px !important;
          padding: 0 10px !important;
          box-sizing: border-box !important;
        }
        .profile-dares-list-reel .dare-liquid-capsule button {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          min-width: 0 !important;
          max-width: 58px !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
          flex: 0 1 58px !important;
          text-align: center !important;
          line-height: 1 !important;
          margin-top: 0 !important;
        }
        .profile-dares-list-reel .dare-liquid-capsule .dare-capsule-dared-label {
          flex: 0 0 auto !important;
          font-size: 14px !important;
          letter-spacing: 0.04em !important;
        }
        .profile-dares-list-reel .dare-liquid-capsule [style*="min-width: 48px"] {
          min-width: 42px !important;
          width: 42px !important;
          height: 42px !important;
          flex: 0 0 42px !important;
        }
        .profile-dares-list-reel .dare-cover-challenge {
          transform: translateY(78px) !important;
        }
        .profile-dares-list-reel .dare-cover-kicker,
        .profile-dares-list-reel .dare-cover-copy {
          transform: translateY(0) !important;
        }
        .profile-dares-list-reel .dare-cover-slide > div[style*="bottom: calc(78px"] {
          bottom: calc(18px + var(--safe-area-bottom)) !important;
        }
        .profile-dares-list-reel div[style*="top: calc(100% - 100px"] {
          top: calc(100% - 28px - var(--safe-area-bottom)) !important;
        }
        .profile-dares-list-reel div[style*="padding: 0px 14px calc(95px"] {
          padding-bottom: calc(14px + var(--safe-area-bottom)) !important;
        }
        .profile-dares-list-reel .dare-real-btn,
        .profile-dares-list-reel .dare-fake-btn {
          transform: translateY(54px) !important;
        }
        .profile-dares-list-reel .dare-real-btn,
        .profile-dares-list-reel .dare-fake-btn {
          margin-top: 54px !important;
        }
        .profile-dares-list-reel button[style*="width: 80%"] {
          transform: translateY(54px) !important;
        }
      `}</style>

      <div
        style={{
          flexShrink: 0,
          padding: "calc(var(--safe-area-top) + 10px) 14px 10px",
          zIndex: 20,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background:
            "linear-gradient(180deg, rgba(8,14,10,0.98), rgba(5,8,6,0.92))",
          boxShadow: "0 18px 42px rgba(0,0,0,0.34)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "42px minmax(0, 1fr) 52px",
            alignItems: "center",
            gap: "10px",
            minHeight: "46px",
          }}
        >
        <button
          onClick={onBack}
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "15px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.055)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:
              "0 16px 36px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
          aria-label="Back to profile"
        >
          <ArrowLeft size={20} />
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "9px",
            minHeight: "42px",
            minWidth: 0,
            padding: "0 6px",
          }}
        >
          <Target size={18} color="#4ade80" />
          <span
            style={{
              color: "#fff",
              fontSize: "15px",
              fontWeight: 950,
              margin: 0,
              letterSpacing: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {headerTitle}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "52px",
            height: "42px",
            borderRadius: "15px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          {filteredDares.length > 0 && (
            <span
              style={{
                color: "rgba(255,255,255,0.62)",
                fontSize: "12px",
                fontWeight: 950,
              }}
            >
              {activeReelIndex + 1} / {filteredDares.length}
            </span>
          )}
        </div>
        </div>
      </div>

      {loading ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              border: "3px solid rgba(74,222,128,0.15)",
              borderTopColor: "#4ade80",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            Loading dares...
          </span>
        </div>
      ) : filteredDares.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <Target
            size={36}
            color="rgba(255,255,255,0.12)"
            style={{ margin: "0 auto 14px" }}
          />
          <p
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: "15px",
              fontWeight: 600,
              margin: "0 0 4px",
            }}
          >
            No dares yet
          </p>
          <p
            style={{
              color: "rgba(255,255,255,0.2)",
              fontSize: "13px",
              margin: 0,
            }}
          >
            Dares you take part in will appear here
          </p>
        </div>
      ) : (
        <div
          ref={reelContainerRef}
          className="profile-dares-list-reel"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "scroll",
            overflowX: "hidden",
            scrollSnapType: "y mandatory",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "none",
            touchAction: "pan-y",
            contain: "layout paint style",
            willChange: "scroll-position",
          }}
        >
          {filteredDares.map((dare, index) => (
            <div
              key={dare.id}
              data-reel-index={String(index)}
              style={{
                height: "100%",
                minHeight: "100%",
                scrollSnapAlign: "start",
                scrollSnapStop: "always",
                overflow: "hidden",
              }}
            >
              <DareCard
                dare={dare}
                reelMode
                isActive={activeReelIndex === index}
                onVoteClick={handleVoteClick}
                onVote={handleVote}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
