"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  X,
  Image as ImageIcon,
  Video,
  Music,
  Send,
  Plus,
  Camera,
  AtSign,
  Images,
  Sparkles,
} from "lucide-react";
import "@/styles/design-system.css";
import { Avatar } from "../ui/Avatar";
import { usePostsStore } from "../../stores/usePostsStore";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import {
  buildLocalMediaPreview,
  type LocalMediaPreview,
  uploadOptimizedMedia,
} from "@/utils/mediaUpload";
import {
  CAROUSEL_TEMPLATES,
  formatTemplateDate,
  renderTemplateImage,
  renderTemplatePreviewUrl,
} from "@/utils/carouselTemplates";

const MAX_CAROUSEL = 10;

interface MediaItem extends LocalMediaPreview {
  id: string;
  file: File;
}

interface Friend {
  id: string;
  name: string;
  username: string;
  avatar: string;
}

interface CreateFeedPostScreenProps {
  onBack: () => void;
}

export function CreateFeedPostScreen({ onBack }: CreateFeedPostScreenProps) {
  const [caption, setCaption] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [isPreparingMedia, setIsPreparingMedia] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [coverTitle, setCoverTitle] = useState("");
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState<string | null>(
    null,
  );
  const templatePreviewUrlRef = useRef<string | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const handedOffToFeedRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const singleInputRef = useRef<HTMLInputElement>(null);
  const {
    createPost,
    beginPendingUpload,
    updatePendingUpload,
    failPendingUpload,
    completePendingUpload,
  } = usePostsStore();
  const { user } = useAuthStore();

  const mockFriends: Friend[] = [];

  useEffect(() => {
    return () => {
      if (!handedOffToFeedRef.current) {
        objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      }
    };
  }, []);

  const addObjectUrls = (urls: string[]) => {
    objectUrlsRef.current.push(...urls);
  };

  const isCarousel = mediaItems.length > 1;
  const isImageOnly = mediaItems.every((m) => m.type === "image");
  // Templates apply to image carousels only.
  const canUseTemplates = isCarousel && isImageOnly;
  const activeTemplate = canUseTemplates ? templateId : null;

  // Live template preview of the current slide (half-res canvas render).
  useEffect(() => {
    const item = mediaItems[previewIndex];
    if (!activeTemplate || !item || item.type !== "image") {
      if (templatePreviewUrlRef.current) {
        URL.revokeObjectURL(templatePreviewUrlRef.current);
        templatePreviewUrlRef.current = null;
      }
      setTemplatePreviewUrl(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const url = await renderTemplatePreviewUrl(item.file, {
          templateId: activeTemplate,
          role: previewIndex === 0 ? "cover" : "slide",
          title: coverTitle,
          username: user?.username || user?.displayName || "us",
          date: formatTemplateDate(),
          index: previewIndex,
          total: mediaItems.length,
        });
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (templatePreviewUrlRef.current)
          URL.revokeObjectURL(templatePreviewUrlRef.current);
        templatePreviewUrlRef.current = url;
        setTemplatePreviewUrl(url);
      } catch {
        if (!cancelled) setTemplatePreviewUrl(null);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeTemplate,
    previewIndex,
    coverTitle,
    mediaItems,
    user?.username,
    user?.displayName,
  ]);

  useEffect(() => {
    return () => {
      if (templatePreviewUrlRef.current)
        URL.revokeObjectURL(templatePreviewUrlRef.current);
    };
  }, []);

  const handleAddImages = () => {
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
      imageInputRef.current.click();
    }
  };

  const handleSingleFile = () => {
    if (singleInputRef.current) {
      singleInputRef.current.value = "";
      singleInputRef.current.click();
    }
  };

  const handleImageInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = MAX_CAROUSEL - mediaItems.length;
    const toAdd = files.slice(0, remaining);

    try {
      setIsPreparingMedia(true);
      const newItems = await Promise.all(
        toAdd.map(async (file) => {
          const preview = await buildLocalMediaPreview(file, "feed");
          addObjectUrls([
            preview.url,
            ...(preview.thumbnail?.startsWith("blob:")
              ? [preview.thumbnail]
              : []),
          ]);
          return { ...preview, id: `${Date.now()}-${Math.random()}`, file };
        }),
      );
      setMediaItems((prev) => {
        const updated = [...prev, ...newItems];
        setPreviewIndex(updated.length - 1);
        return updated;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to prepare image.");
    } finally {
      setIsPreparingMedia(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleSingleInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsPreparingMedia(true);
      const preview = await buildLocalMediaPreview(file, "feed");
      addObjectUrls([
        preview.url,
        ...(preview.thumbnail?.startsWith("blob:") ? [preview.thumbnail] : []),
      ]);
      const item: MediaItem = { ...preview, id: `${Date.now()}`, file };
      setMediaItems([item]);
      setPreviewIndex(0);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to prepare file.");
    } finally {
      setIsPreparingMedia(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleRemoveItem = (id: string) => {
    setMediaItems((prev) => {
      const next = prev.filter((m) => m.id !== id);
      setPreviewIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
      return next;
    });
  };

  const toggleFriend = (friendId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId],
    );
  };

  const handleTagInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTagInput(value);
    if (value.endsWith("@")) setShowFriendPicker(true);
  };

  const selectFriend = (friend: Friend) => {
    if (!selectedFriends.includes(friend.id))
      setSelectedFriends((prev) => [...prev, friend.id]);
    setTagInput("");
    setShowFriendPicker(false);
  };

  const handleCreatePost = async () => {
    const trimmedCaption = caption.trim();
    if (!trimmedCaption) {
      alert("Please add a caption before posting.");
      return;
    }
    if (!user?.id) {
      alert("Please log in to create posts.");
      return;
    }

    try {
      const pendingUploadId = `pending-${Date.now()}`;
      beginPendingUpload({
        id: pendingUploadId,
        caption: trimmedCaption,
        previewUrl: mediaItems[0]?.thumbnail || mediaItems[0]?.url,
        mediaType: mediaItems[0]?.type,
      });
      // Return to feed immediately. Upload continues through the store.
      handedOffToFeedRef.current = true;
      onBack();
      setIsUploadingMedia(true);
      setUploadProgress(0);

      if (mediaItems.length === 0) {
        await createPost({
          content: trimmedCaption,
          taggedFriends: selectedFriends,
        });
      } else if (
        isCarousel ||
        (mediaItems.length === 1 && mediaItems[0].type === "image")
      ) {
        const uploaded = await Promise.all(
          mediaItems.map(async (item, idx) => {
            // Bake the aesthetic template into the pixels before upload —
            // the feed renders plain media_urls, so styling must ship in-image.
            const source = activeTemplate
              ? await renderTemplateImage(item.file, {
                  templateId: activeTemplate,
                  role: idx === 0 ? "cover" : "slide",
                  title: coverTitle,
                  username: user.username || user.displayName || "us",
                  date: formatTemplateDate(),
                  index: idx,
                  total: mediaItems.length,
                })
              : item.file;
            const result = await uploadOptimizedMedia({
              source,
              userId: user.id,
              context: "feed",
              fileName: activeTemplate
                ? `${item.file.name.replace(/\.[^.]+$/, "")}-template.jpg`
                : item.file.name,
            });
            setUploadProgress(
              Math.round(((idx + 1) / mediaItems.length) * 100),
            );
            updatePendingUpload(
              Math.round(((idx + 1) / mediaItems.length) * 90),
            );
            return result.url;
          }),
        );
        await createPost({
          content: trimmedCaption,
          media_urls: uploaded,
          taggedFriends: selectedFriends,
        });
      } else {
        const item = mediaItems[0];
        const uploaded = await uploadOptimizedMedia({
          source: item.file,
          userId: user.id,
          context: "feed",
          fileName: item.file.name,
        });
        updatePendingUpload(90);
        await createPost({
          content: trimmedCaption,
          media: {
            type: item.type,
            url: uploaded.url,
            thumbnail: item.thumbnail,
            duration: item.duration,
          },
          taggedFriends: selectedFriends,
        });
      }
      updatePendingUpload(100);
      completePendingUpload();
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    } catch (error) {
      failPendingUpload(
        error instanceof Error ? error.message : "Failed to create post.",
      );
      alert(
        error instanceof Error
          ? `Failed to create post: ${error.message}`
          : "Failed to create post.",
      );
    } finally {
      setIsUploadingMedia(false);
      setUploadProgress(0);
    }
  };

  const selectedFriendsData = mockFriends.filter((f) =>
    selectedFriends.includes(f.id),
  );
  // The feed store's `loading` flag also covers feed bootstrap/refreshes. It
  // must not block the composer: users should be able to pick media while the
  // feed is still loading in the background.
  const isBusy = isPreparingMedia || isUploadingMedia;
  const activeItem = mediaItems[previewIndex] ?? null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0d0d0d] text-white">
      <div className="sticky top-0 z-30 border-b border-white/6 bg-[linear-gradient(180deg,rgba(13,13,13,0.98),rgba(13,13,13,0.88))] px-4 pb-4 pt-[calc(var(--safe-area-top)+16px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] text-white/80 transition-colors hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[25px] font-black leading-none tracking-[-0.04em] text-white">
              Create Post
            </h1>
          </div>
          {mediaItems.length > 0 && (
            <span className="text-xs font-bold text-white/40">
              {mediaItems.length}/{MAX_CAROUSEL}
            </span>
          )}
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-[calc(124px+var(--safe-area-bottom))] pt-5">
        {/* ── Media zone ── */}
        {mediaItems.length === 0 ? (
          <div className="mb-6 grid grid-cols-2 gap-3">
            <button
              onClick={handleAddImages}
              disabled={isBusy}
              className="group relative flex min-h-[140px] flex-col items-center justify-center gap-3 overflow-hidden rounded-[26px] border border-white/10 bg-[#181818] p-5 transition-all duration-200 hover:border-[#4ade80]/30 hover:bg-[#1e1e1e] disabled:opacity-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80] transition-transform duration-200 group-hover:scale-105">
                <Images size={22} />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-black text-white">
                  {isPreparingMedia ? "Preparing..." : "Add Photos"}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-white/35">
                  Up to {MAX_CAROUSEL} images
                </p>
              </div>
            </button>
            <button
              onClick={handleSingleFile}
              disabled={isBusy}
              className="group relative flex min-h-[140px] flex-col items-center justify-center gap-3 overflow-hidden rounded-[26px] border border-white/10 bg-[#181818] p-5 transition-all duration-200 hover:border-white/20 hover:bg-[#1e1e1e] disabled:opacity-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/14 bg-white/[0.06] text-white/60 transition-transform duration-200 group-hover:scale-105">
                <Camera size={22} />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-black text-white">Single File</p>
                <p className="mt-0.5 text-[11px] font-semibold text-white/35">
                  Photo, video, or audio
                </p>
              </div>
            </button>
          </div>
        ) : (
          <div className="mb-6">
            {/* Main preview */}
            <div
              className="relative overflow-hidden rounded-[26px]"
              style={{ height: "clamp(260px, 50svh, 460px)" }}
            >
              {activeItem?.type === "image" ? (
                <>
                  <img
                    src={
                      activeTemplate && templatePreviewUrl
                        ? templatePreviewUrl
                        : activeItem.url
                    }
                    alt={`Image ${previewIndex + 1}`}
                    className={`h-full w-full ${
                      activeTemplate && templatePreviewUrl
                        ? "bg-[#141414] object-contain"
                        : "object-cover"
                    }`}
                  />
                  {activeTemplate && (
                    <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full border border-[#4ade80]/30 bg-black/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#4ade80] backdrop-blur-sm">
                      <Sparkles size={10} />
                      {previewIndex === 0 ? "Cover" : `Slide ${previewIndex + 1}`}
                    </div>
                  )}
                </>
              ) : activeItem?.type === "video" ? (
                <div className="flex h-full w-full items-center justify-center bg-[#1a1a1a]">
                  <img
                    src={activeItem.thumbnail || activeItem.url}
                    alt="Video"
                    className="h-full w-full object-cover opacity-60"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-full bg-white/90 p-5 shadow-lg">
                      <Video size={34} className="text-black" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#1a1a1a]">
                  <div className="text-center">
                    <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4ade80] to-[#22c55e]">
                      <Music size={36} className="text-black" />
                    </div>
                    <p className="font-semibold text-white">Audio File</p>
                  </div>
                </div>
              )}

              {/* Slide counter badge */}
              {mediaItems.length > 1 && (
                <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
                  {previewIndex + 1} / {mediaItems.length}
                </div>
              )}

              {/* Remove current */}
              <button
                onClick={() => handleRemoveItem(activeItem!.id)}
                className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-red-500/70"
              >
                <X size={14} />
              </button>
            </div>

            {/* Thumbnail strip */}
            {mediaItems.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {mediaItems.map((item, idx) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setPreviewIndex(idx)}
                    onKeyDown={(e) => e.key === "Enter" && setPreviewIndex(idx)}
                    className={`relative shrink-0 cursor-pointer overflow-hidden rounded-xl transition-all duration-150 ${
                      idx === previewIndex
                        ? "ring-2 ring-[#4ade80] ring-offset-1 ring-offset-[#0d0d0d]"
                        : "opacity-55 hover:opacity-80"
                    }`}
                    style={{ width: 56, height: 56 }}
                  >
                    {item.type === "image" ? (
                      <img
                        src={item.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : item.type === "video" ? (
                      <div className="flex h-full w-full items-center justify-center bg-[#222]">
                        <Video size={18} className="text-white/60" />
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#222]">
                        <Music size={18} className="text-[#4ade80]" />
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveItem(item.id);
                      }}
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black text-white ring-1 ring-white/20"
                    >
                      <X size={8} />
                    </button>
                  </div>
                ))}

                {/* Add more button */}
                {isImageOnly && mediaItems.length < MAX_CAROUSEL && (
                  <button
                    onClick={handleAddImages}
                    disabled={isBusy}
                    className="flex shrink-0 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/[0.04] text-white/40 transition-colors hover:border-[#4ade80]/40 hover:text-[#4ade80] disabled:opacity-40"
                    style={{ width: 56, height: 56 }}
                  >
                    <Plus size={18} />
                  </button>
                )}
              </div>
            )}

            {/* Single item footer — add more images or clear */}
            {mediaItems.length === 1 && mediaItems[0].type === "image" && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleAddImages}
                  disabled={isBusy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#4ade80]/25 bg-[#4ade80]/[0.05] py-2.5 text-[13px] font-bold text-[#4ade80] transition-colors hover:bg-[#4ade80]/10 disabled:opacity-40"
                >
                  <Plus size={14} />
                  Add more photos
                </button>
                <button
                  onClick={() => {
                    setMediaItems([]);
                    setPreviewIndex(0);
                  }}
                  className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-[13px] font-bold text-white/50 transition-colors hover:text-white"
                >
                  Clear
                </button>
              </div>
            )}

            {/* ── Aesthetic carousel templates ── */}
            {canUseTemplates && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={13} className="text-[#4ade80]" />
                    <span className="text-[11px] font-black uppercase tracking-[0.14em] text-white/60">
                      Aesthetic templates
                    </span>
                  </div>
                  {templateId && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#4ade80]/70">
                      Baked into every slide
                    </span>
                  )}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  <button
                    onClick={() => setTemplateId(null)}
                    className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 transition-all duration-150 ${
                      templateId === null
                        ? "border-[#4ade80]/60 bg-white/[0.07] ring-1 ring-[#4ade80]/40"
                        : "border-white/10 bg-white/[0.03] opacity-70 hover:opacity-100"
                    }`}
                    style={{ width: 84, height: 100 }}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-dashed border-white/25 text-white/40">
                      <X size={14} />
                    </div>
                    <span className="text-[11px] font-black text-white">
                      None
                    </span>
                    <span className="text-[9px] font-semibold text-white/35">
                      original pics
                    </span>
                  </button>
                  {CAROUSEL_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() =>
                        setTemplateId((cur) => (cur === t.id ? null : t.id))
                      }
                      className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 transition-all duration-150 ${
                        templateId === t.id
                          ? "border-[#4ade80]/60 bg-white/[0.07] ring-1 ring-[#4ade80]/40"
                          : "border-white/10 bg-white/[0.03] opacity-70 hover:opacity-100"
                      }`}
                      style={{ width: 84, height: 100 }}
                    >
                      <div
                        className="relative h-9 w-9 overflow-hidden rounded-xl border border-white/15"
                        style={{ background: t.swatch.bg }}
                      >
                        <div
                          className="absolute inset-x-1.5 top-1.5 h-4 rounded-[5px]"
                          style={{ background: t.swatch.accent, opacity: 0.85 }}
                        />
                        <div
                          className="absolute inset-x-1.5 bottom-1.5 h-1 rounded-full"
                          style={{ background: t.swatch.fg, opacity: 0.7 }}
                        />
                      </div>
                      <span className="text-[11px] font-black text-white">
                        {t.name}
                      </span>
                      <span className="text-[9px] font-semibold text-white/35">
                        {t.tagline}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Cover title — printed on the first slide */}
                {templateId && (
                  <div className="mt-2 rounded-[20px] border border-[#4ade80]/20 bg-[#4ade80]/[0.05] px-4 py-3">
                    <div className="flex items-center">
                      <Sparkles size={16} className="mr-3 text-[#4ade80]" />
                      <input
                        type="text"
                        value={coverTitle}
                        onChange={(e) => setCoverTitle(e.target.value)}
                        maxLength={48}
                        placeholder="Cover title (e.g. summer dump ☀)"
                        className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-white placeholder:text-white/30 focus:outline-none"
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] font-semibold text-white/35">
                      Shows big on your first pic · other pics get matching
                      frames + page numbers
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Upload progress bar */}
            {isUploadingMedia && mediaItems.length > 1 && (
              <div
                className="mt-3 overflow-hidden rounded-full bg-white/10"
                style={{ height: 3 }}
              >
                <div
                  className="h-full bg-[#4ade80] transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageInputChange}
          className="hidden"
        />
        <input
          ref={singleInputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple={false}
          onChange={handleSingleInputChange}
          className="hidden"
        />

        {/* Caption */}
        <div className="mb-4">
          <div className="rounded-[24px] border border-white/10 bg-[#181818] p-4">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption..."
              className="w-full resize-none bg-transparent text-[16px] font-semibold text-white placeholder:text-white/30 focus:outline-none"
              rows={caption.length > 100 ? 3 : caption.length > 50 ? 2 : 1}
              style={{ minHeight: "40px" }}
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.12em]">
              <span
                className={caption.trim() ? "text-[#86efac]" : "text-red-300"}
              >
                Caption required
              </span>
              <span className="text-white/30">
                {caption.trim().length} chars
              </span>
            </div>
          </div>
        </div>

        {/* Tag friends */}
        <div className="mb-6">
          <div className="rounded-[24px] border border-white/10 bg-[#181818] p-4">
            <div className="flex items-center">
              <AtSign size={20} className="mr-3 text-[#4ade80]" />
              <input
                type="text"
                value={tagInput}
                onChange={handleTagInput}
                placeholder="Tag friends..."
                className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-white placeholder:text-white/30 focus:outline-none"
              />
            </div>
          </div>
          <div className="relative">
            {showFriendPicker && (
              <div className="absolute left-0 right-0 top-full z-10 mt-2 max-h-48 overflow-y-auto rounded-[22px] border border-white/10 bg-[#181818] shadow-[0_24px_54px_rgba(0,0,0,0.42)]">
                {mockFriends.map((friend) => (
                  <button
                    key={friend.id}
                    onClick={() => selectFriend(friend)}
                    className="flex w-full items-center space-x-3 border-b border-white/6 p-3 transition-colors last:border-b-0 hover:bg-white/[0.045]"
                  >
                    <Avatar
                      src={friend.avatar}
                      alt={friend.name}
                      size="sm"
                      username={friend.username}
                    />
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-white">
                        {friend.name}
                      </p>
                      <p className="text-xs text-[#94a3b8]">
                        {friend.username}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedFriendsData.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedFriendsData.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center space-x-2 rounded-full border border-[#4ade80]/24 bg-[#4ade80]/10 px-3 py-1"
                >
                  <Avatar
                    src={friend.avatar}
                    alt={friend.name}
                    size="xs"
                    username={friend.username}
                  />
                  <span className="text-sm text-white">{friend.name}</span>
                  <button
                    onClick={() => toggleFriend(friend.id)}
                    className="text-white/42 transition-colors hover:text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Post button */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/8 bg-[linear-gradient(180deg,rgba(13,13,13,0.82),rgba(13,13,13,0.98))] px-4 pb-[calc(16px+var(--safe-area-bottom))] pt-4 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={handleCreatePost}
            disabled={!caption.trim() || isBusy}
            className="flex w-full items-center justify-center space-x-2 rounded-[20px] bg-gradient-to-r from-[#4ade80] to-[#22c55e] py-4 font-black text-black shadow-[0_16px_42px_rgba(74,222,128,0.22)] transition-all duration-200 enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {isBusy ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                <span>
                  {isUploadingMedia
                    ? mediaItems.length > 1
                      ? `Uploading ${uploadProgress}%`
                      : "Uploading..."
                    : "Preparing..."}
                </span>
              </>
            ) : (
              <>
                <Send size={20} />
                <span>
                  Post
                  {mediaItems.length > 1
                    ? ` · ${mediaItems.length} photos`
                    : ""}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
