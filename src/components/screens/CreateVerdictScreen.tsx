"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  Image as ImageIcon,
  Send,
  Video,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useVerdictsStore } from "@/stores/useVerdictsStore";
import {
  buildLocalMediaPreview,
  type LocalMediaPreview,
  uploadOptimizedMedia,
} from "@/utils/mediaUpload";
import type { VerdictMediaType, VerdictScope } from "@/types/verdict";

const TOPICS = [
  "Memes",
  "Movies",
  "Sports",
  "Gaming",
  "AI",
  "Technology",
  "Anime",
  "Music",
  "Celebrities",
  "College Life",
  "Relationships",
  "Food",
  "Travel",
  "Fashion",
];

interface MediaItem extends LocalMediaPreview {
  id: string;
}

export function CreateVerdictScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated?: () => void;
}) {
  const { user } = useAuthStore();
  const { createVerdict, creating } = useVerdictsStore();
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [choiceOne, setChoiceOne] = useState("Yes");
  const [choiceTwo, setChoiceTwo] = useState("No");
  const [scope, setScope] = useState<VerdictScope>("friends");
  const [topic, setTopic] = useState("Memes");
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);

  const cleanupPreviews = () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
  };

  const canCreate =
    Boolean(file && media && question.trim() && choiceOne.trim() && choiceTwo.trim()) &&
    !creating &&
    !preparing &&
    !uploading;

  const pickFile = () => fileInputRef.current?.click();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    try {
      setPreparing(true);
      const preview = await buildLocalMediaPreview(selected, "verdict");
      cleanupPreviews();
      previewUrlsRef.current = [preview.url];
      if (preview.thumbnail?.startsWith("blob:")) {
        previewUrlsRef.current.push(preview.thumbnail);
      }
      setFile(selected);
      setMedia({ ...preview, id: `${Date.now()}` });
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to prepare this media.",
      );
    } finally {
      setPreparing(false);
    }
  };

  const removeMedia = () => {
    cleanupPreviews();
    setFile(null);
    setMedia(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = async () => {
    if (!canCreate || !file || !media || !user?.id) return;
    try {
      setUploading(true);
      const uploaded = await uploadOptimizedMedia({
        source: file,
        userId: user.id,
        context: "verdict",
        fileName: file.name,
      });
      await createVerdict({
        question: question.trim(),
        description: description.trim(),
        choiceOneText: choiceOne.trim(),
        choiceTwoText: choiceTwo.trim(),
        mediaUrl: uploaded.url,
        mediaType:
          uploaded.mediaKind === "video"
            ? "VIDEO"
            : file.type === "image/gif"
              ? "GIF"
              : ("PHOTO" as VerdictMediaType),
        scope,
        topic: scope === "topics" ? topic : null,
      });
      cleanupPreviews();
      onCreated?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create verdict.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="screen-container create-verdict-screen relative overflow-hidden bg-[#0a0a0a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(56,189,248,0.1),transparent_34%),radial-gradient(circle_at_86%_16%,rgba(192,132,252,0.08),transparent_30%),linear-gradient(180deg,#141414_0%,#0e0e0e_52%,#0a0a0a_100%)]" />

      <header className="relative z-10 border-b border-white/8 px-4 pb-4 pt-[calc(var(--safe-area-top)+14px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] text-white/80"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="text-[12px] font-black uppercase tracking-[0.16em] text-[#86efac]">
              New section
            </div>
            <h1 className="m-0 text-[26px] font-black leading-none tracking-[-0.04em]">
              Create Verdict
            </h1>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto px-4 pb-[calc(116px+var(--safe-area-bottom))] pt-5">
        <div className="mx-auto max-w-2xl space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {!media ? (
            <button
              type="button"
              onClick={pickFile}
              className="flex min-h-[220px] w-full items-center justify-center rounded-[30px] border border-[#4ade80]/18 bg-[linear-gradient(145deg,rgba(22,27,22,0.98),rgba(8,10,8,0.99))] p-6 text-center shadow-[0_24px_72px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.055)]"
            >
              <div>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] border border-[#4ade80]/22 bg-[#4ade80]/12 text-[#86efac]">
                  <Camera size={28} />
                </div>
                <div className="text-[18px] font-black">
                  {preparing ? "Preparing..." : "Upload photo, video, or GIF"}
                </div>
                <div className="mt-1 text-sm font-semibold text-white/40">
                  The media is the verdict.
                </div>
              </div>
            </button>
          ) : (
            <div className="overflow-hidden rounded-[30px] border border-white/10 bg-black shadow-[0_24px_72px_rgba(0,0,0,0.34)]">
              <div className="relative">
                {media.type === "video" ? (
                  <video
                    src={media.url}
                    className="max-h-[48dvh] w-full object-contain"
                    controls
                    playsInline
                  />
                ) : (
                  <img
                    src={media.url}
                    alt="Verdict media"
                    className="max-h-[48dvh] w-full object-contain"
                  />
                )}
                <button
                  type="button"
                  onClick={removeMedia}
                  className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/58 text-white backdrop-blur-md"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex items-center gap-3 border-t border-white/8 bg-white/[0.035] p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/12 text-[#86efac]">
                  {media.type === "video" ? <Video size={21} /> : <ImageIcon size={21} />}
                </div>
                <div>
                  <div className="font-black text-white">
                    {media.type === "video" ? "Video selected" : "Image selected"}
                  </div>
                  <div className="text-sm font-bold text-white/38">
                    {media.sizeLabel}
                  </div>
                </div>
              </div>
            </div>
          )}

          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
            <label className="mb-2 block text-[12px] font-black uppercase tracking-[0.14em] text-[#86efac]">
              One-line question
            </label>
            <input
              value={question}
              onChange={(event) =>
                setQuestion(event.target.value.replace(/\r?\n/g, "").slice(0, 90))
              }
              placeholder="Keep the haircut?"
              maxLength={90}
              className="w-full bg-transparent text-[22px] font-black leading-tight tracking-[-0.03em] text-white outline-none placeholder:text-white/24"
            />
            <div className="mt-2 text-right text-[11px] font-bold text-white/30">
              {question.length}/90
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
            <label className="mb-2 block text-[12px] font-black uppercase tracking-[0.14em] text-white/38">
              Description for detail room
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, 2000))}
              placeholder="Add the context people see after tapping the media..."
              rows={4}
              className="w-full resize-none bg-transparent text-[15px] font-semibold leading-relaxed text-white outline-none placeholder:text-white/24"
            />
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
            <label className="mb-3 block text-[12px] font-black uppercase tracking-[0.14em] text-[#86efac]">
              Choice buttons
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={choiceOne}
                onChange={(event) => setChoiceOne(event.target.value.slice(0, 28))}
                placeholder="Keep"
                className="rounded-[20px] border border-[#4ade80]/22 bg-[#4ade80]/10 px-4 py-4 text-center text-[16px] font-black text-white outline-none"
              />
              <input
                value={choiceTwo}
                onChange={(event) => setChoiceTwo(event.target.value.slice(0, 28))}
                placeholder="Change"
                className="rounded-[20px] border border-white/10 bg-white/[0.045] px-4 py-4 text-center text-[16px] font-black text-white outline-none"
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
            <label className="mb-3 block text-[12px] font-black uppercase tracking-[0.14em] text-white/38">
              Audience
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["friends", "topics"] as VerdictScope[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setScope(item)}
                  className={`rounded-[18px] border px-4 py-3 text-sm font-black capitalize ${
                    scope === item
                      ? "border-[#4ade80]/35 bg-[#4ade80]/14 text-[#86efac]"
                      : "border-white/8 bg-white/[0.035] text-white/44"
                  }`}
                >
                  {scope === item && <Check className="mr-1 inline" size={14} />}
                  {item}
                </button>
              ))}
            </div>
            {scope === "topics" && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {TOPICS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTopic(item)}
                    className={`shrink-0 rounded-full border px-3 py-2 text-[12px] font-black ${
                      topic === item
                        ? "border-[#4ade80]/35 bg-[#4ade80]/14 text-[#86efac]"
                        : "border-white/8 bg-white/[0.035] text-white/42"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/8 bg-[#0a0a0a]/94 px-4 pb-[calc(16px+var(--safe-area-bottom))] pt-4 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canCreate}
            className="flex w-full items-center justify-center gap-2 rounded-[20px] bg-[#fb7185] py-4 font-black text-[#18070d] shadow-[0_16px_42px_rgba(251,113,133,0.24)] disabled:opacity-45"
          >
            {uploading || creating ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                Publishing...
              </>
            ) : (
              <>
                <Send size={19} />
                Post Verdict
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
