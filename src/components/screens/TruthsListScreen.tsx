import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";
import type { TruthPost } from "../../middleware/adapters/data-adapters";
import { SwipeableTruthCard } from "./MainScreen";
import { useContentStore } from "../../stores/useContentStore";
import { useTruthInteractionStore } from "../../stores/useTruthInteractionStore";

interface TruthsListScreenProps {
  userId?: string;
  onBack: () => void;
  truthPosts?: TruthPost[];
  loading?: boolean;
  onSelectTruth?: (truth: TruthPost) => void;
  initialTruthId?: string;
  titleName?: string;
}

function isUserInvolved(truth: TruthPost, userId?: string) {
  if (!userId) return true;
  if (!truth.challengerId && !truth.receiverId) return true;
  return truth.challengerId === userId || truth.receiverId === userId;
}

export function TruthsListScreen({
  userId,
  onBack,
  truthPosts = [],
  loading = false,
  onSelectTruth,
  initialTruthId,
}: TruthsListScreenProps) {
  const voteOnTruth = useContentStore((s) => s.voteOnTruth);
  const recordVote = useTruthInteractionStore((s) => s.recordVote);
  const [currentTruthIndex, setCurrentTruthIndex] = useState(0);
  const isTruthScrollingRef = useRef(false);

  const filteredTruths = [...truthPosts]
    .filter((truth) => isUserInvolved(truth, userId))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const currentTruthIndexRef = useRef(0);
  const scrollSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    currentTruthIndexRef.current = currentTruthIndex;
  }, [currentTruthIndex]);

  // Scroll to initial card on mount
  useEffect(() => {
    if (!initialTruthId || loading) return;
    const container = scrollRef.current;
    const targetIndex = filteredTruths.findIndex(
      (truth) => truth.id === initialTruthId,
    );
    if (!container || targetIndex < 0) return;

    setCurrentTruthIndex(targetIndex);
    currentTruthIndexRef.current = targetIndex;
    container.scrollTo({
      top: container.clientHeight * targetIndex,
      behavior: "auto",
    });
  }, [initialTruthId, loading, filteredTruths.length]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || loading) return;

    let frameId = 0;
    const pauseTruthMotionForScroll = () => {
      if (!isTruthScrollingRef.current) {
        isTruthScrollingRef.current = true;
        container.classList.add("truth-reel-is-scrolling");
      }
      if (scrollSettleTimerRef.current) {
        clearTimeout(scrollSettleTimerRef.current);
      }
      scrollSettleTimerRef.current = setTimeout(() => {
        isTruthScrollingRef.current = false;
        container.classList.remove("truth-reel-is-scrolling");
        scrollSettleTimerRef.current = null;
      }, 180);
    };

    const handleScroll = () => {
      pauseTruthMotionForScroll();

      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        const slideHeight = container.clientHeight;
        if (!slideHeight) return;

        const nextIndex = Math.min(
          Math.max(0, filteredTruths.length - 1),
          Math.max(0, Math.round(container.scrollTop / slideHeight)),
        );
        if (nextIndex === currentTruthIndexRef.current) return;
        currentTruthIndexRef.current = nextIndex;
        setCurrentTruthIndex(nextIndex);
      });
    };

    const handleTouchStart = () => pauseTruthMotionForScroll();

    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("scroll", handleScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
      if (scrollSettleTimerRef.current) {
        clearTimeout(scrollSettleTimerRef.current);
        scrollSettleTimerRef.current = null;
      }
      if (isTruthScrollingRef.current) {
        isTruthScrollingRef.current = false;
      }
      container.classList.remove("truth-reel-is-scrolling");
    };
  }, [filteredTruths.length, loading]);

  const handleVoteClick = (post: TruthPost, choice: "truth" | "lie") => {
    if (userId) {
      recordVote(post.id, userId, choice.toUpperCase() as "TRUTH" | "LIE");
    }
    void voteOnTruth(post.id, choice);
  };

  const handleOpenVoteModal = (post: TruthPost) => {
    onSelectTruth?.(post);
  };

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
        position: "relative",
        paddingBottom: "calc(80px + var(--safe-area-bottom))",
        boxSizing: "border-box",
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <button
        onClick={onBack}
        aria-label="Back to profile"
        style={{
          position: "absolute",
          top: "calc(var(--safe-area-top) + 12px)",
          left: "14px",
          zIndex: 30,
          width: "42px",
          height: "42px",
          borderRadius: "15px",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(6,10,8,0.58)",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow:
            "0 16px 36px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.08)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <ArrowLeft size={20} />
      </button>

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
            Loading truths...
          </span>
        </div>
      ) : filteredTruths.length === 0 ? (
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
          <MessageSquare
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
            No truths yet
          </p>
          <p
            style={{
              color: "rgba(255,255,255,0.2)",
              fontSize: "13px",
              margin: 0,
            }}
          >
            Truths you take part in will appear here
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            scrollSnapType: "y mandatory",
            scrollBehavior: "auto",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            touchAction: "pan-y",
            contain: "layout paint style",
            willChange: "scroll-position",
          }}
        >
          {filteredTruths.map((truth, index) => (
            <div
              key={truth.id}
              ref={(el) => {
                cardRefs.current[truth.id] = el;
              }}
              style={{
                position: "relative",
                height: "100%",
                minHeight: "100%",
                scrollSnapAlign: "start",
                scrollSnapStop: "always",
                overflow: "hidden",
                contain: "layout paint style",
                contentVisibility: "auto",
                containIntrinsicSize: "100dvh",
                transform: "translateZ(0)",
                backfaceVisibility: "hidden",
              }}
            >
              <SwipeableTruthCard
                post={truth}
                onVoteClick={handleVoteClick}
                onOpenVoteModal={handleOpenVoteModal}
                cardIndex={0}
                currentIndex={0}
                isDragging={false}
                isCurrentCard={index === currentTruthIndex}
                lockInternalScroll
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
