"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Target,
  Upload,
  X,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import {
  communityChallengeService,
  type CustomCommunityChallengeDraft,
} from "../../middleware/services/community-challenge.service";
import { uploadOptimizedMedia } from "../../utils/mediaUpload";
import type { CommunityChallenge } from "./communityChallengeData";

const durationOptions = [1, 3, 5, 7, 10, 14, 30];

export function CreateCommunityDareScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated?: (challenge: CommunityChallenge) => void;
}) {
  const user = useAuthStore((state) => state.user);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canCreate = useMemo(
    () =>
      title.trim().length >= 4 &&
      description.trim().length >= 12 &&
      durationDays >= 1 &&
      !isSubmitting,
    [description, durationDays, isSubmitting, title],
  );

  const handleThumbnailChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setThumbnailFile(file);
    if (thumbnailPreview) {
      URL.revokeObjectURL(thumbnailPreview);
    }
    setThumbnailPreview(file ? URL.createObjectURL(file) : "");
  };

  const clearThumbnail = () => {
    if (thumbnailPreview) {
      URL.revokeObjectURL(thumbnailPreview);
    }
    setThumbnailPreview("");
    setThumbnailFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCreate = async () => {
    if (!user?.id || !canCreate) return;

    setIsSubmitting(true);
    setError("");

    try {
      let thumbnailUrl = "";
      if (thumbnailFile) {
        const upload = await uploadOptimizedMedia({
          source: thumbnailFile,
          userId: user.id,
          context: "challenge-room-proof",
          mediaKind: "image",
        });
        thumbnailUrl = upload.url;
      }

      const draft: CustomCommunityChallengeDraft = {
        title,
        description,
        durationDays,
        thumbnailUrl,
      };
      const result = await communityChallengeService.createCustomChallenge(
        draft,
        {
          id: user.id,
          username: user.username,
          displayName: user.displayName || user.username,
          avatar: user.avatar || "",
        },
      );

      if (!result.success) {
        setError(result.error);
        return;
      }

      onCreated?.(result.challenge);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to start this community dare.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="screen-container create-community-dare-screen"
      style={{
        background:
          "radial-gradient(circle at 50% -12%, rgba(251,113,133,0.17), transparent 34%), radial-gradient(circle at 12% 18%, rgba(56,189,248,0.12), transparent 28%), linear-gradient(180deg,#141414 0%,#0e0e0e 52%,#0a0a0a 100%)",
      }}
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4"
        style={{
          paddingTop: "calc(var(--safe-area-top) + 14px)",
          paddingBottom: "calc(var(--safe-area-bottom) + 26px)",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
        }}
      >
        <div className="mx-auto max-w-[430px]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.045] text-[#94a3b8] shadow-[0_14px_34px_rgba(0,0,0,0.28)]"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#86efac]">
                Community Dare
              </p>
              <h1 className="mt-1 truncate text-[22px] font-black leading-none text-white">
                Start a run
              </h1>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-[#4ade80]/18 bg-[#4ade80]/10 text-[#86efac]">
              <Sparkles size={19} />
            </div>
          </div>

          <section className="overflow-hidden rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,18,0.98),rgba(7,10,8,0.99))] shadow-[0_28px_80px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.055)]">
            <div className="relative min-h-[220px] overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(56,189,248,0.2),transparent_24%),radial-gradient(circle_at_82%_22%,rgba(192,132,252,0.18),transparent_25%),repeating-linear-gradient(120deg,rgba(255,255,255,0.045)_0_1px,transparent_1px_17px),linear-gradient(145deg,rgba(14,17,25,0.98),rgba(10,10,12,1)_54%,rgba(13,20,30,0.94))]" />
              {thumbnailPreview ? (
                <img
                  src={thumbnailPreview}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-28 w-28 items-center justify-center rounded-[36px] border border-[#fb7185]/20 bg-black/24 text-[52px] font-black text-[#fda4af] shadow-[0_24px_70px_rgba(0,0,0,0.36),0_0_60px_rgba(251,113,133,0.16),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
                    D
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.22)_42%,rgba(3,4,3,0.82)_100%)]" />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-black/42 px-4 text-[12px] font-black uppercase tracking-[0.1em] text-white shadow-[0_14px_34px_rgba(0,0,0,0.34)] backdrop-blur-md"
                >
                  <Upload size={16} className="text-[#86efac]" />
                  {thumbnailPreview ? "Change thumbnail" : "Add thumbnail"}
                </button>
                {thumbnailPreview && (
                  <button
                    type="button"
                    onClick={clearThumbnail}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/42 text-white/80 backdrop-blur-md"
                    aria-label="Remove thumbnail"
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleThumbnailChange}
              />
            </div>

            <div className="space-y-4 p-4">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#86efac]">
                  <Target size={14} />
                  Dare title
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={90}
                  placeholder="Post one unfiltered selfie"
                  className="w-full rounded-[22px] border border-white/8 bg-white/[0.045] px-4 py-4 text-[16px] font-black text-white outline-none placeholder:text-[#64748b] focus:border-[#4ade80]/38"
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#86efac]">
                  <ImageIcon size={14} />
                  Dare description
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={700}
                  rows={5}
                  placeholder="Explain what friends need to do and what proof they should upload."
                  className="w-full resize-none rounded-[22px] border border-white/8 bg-white/[0.045] px-4 py-4 text-[15px] font-bold leading-relaxed text-white outline-none placeholder:text-[#64748b] focus:border-[#4ade80]/38"
                />
              </label>

              <div>
                <span className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#86efac]">
                  <CalendarDays size={14} />
                  Duration
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {durationOptions.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setDurationDays(days)}
                      className={`min-h-[44px] rounded-full border px-2 text-[13px] font-black transition-all ${
                        durationDays === days
                          ? "border-[#fb7185]/50 bg-[#fb7185] text-[#18070d] shadow-[0_12px_28px_rgba(251,113,133,0.26)]"
                          : "border-white/8 bg-white/[0.04] text-[#cbd5e1]"
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="rounded-[18px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate}
                className={`flex min-h-[58px] w-full items-center justify-center gap-2 rounded-full px-5 text-[15px] font-black uppercase tracking-[0.08em] transition-transform active:scale-[0.98] ${
                  canCreate
                    ? "bg-[linear-gradient(135deg,#fb7185,#f43f5e)] text-[#18070d] shadow-[0_20px_48px_rgba(251,113,133,0.32)]"
                    : "border border-white/8 bg-white/[0.04] text-[#64748b]"
                }`}
              >
                {isSubmitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Check size={18} />
                )}
                Create
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
