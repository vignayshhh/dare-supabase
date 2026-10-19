"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createUuid } from "@/utils/uuid";

export type MediaUploadContext =
  | "avatar"
  | "feed"
  | "verdict"
  | "story"
  | "dare-proof"
  | "challenge-room-proof"
  | "community-dare-thumbnail"
  | "birthday-room"
  | "messages";
export type MediaKind = "image" | "video" | "audio";

interface ImageOptimizationSettings {
  maxDimension: number;
  quality: number;
  preferredType: "image/webp" | "image/jpeg" | "image/png";
}

interface MediaConstraints {
  maxInputBytes: number;
  allowedKinds: MediaKind[];
  image?: ImageOptimizationSettings;
}

interface UploadOptimizedMediaParams {
  source: Blob | File;
  userId: string;
  context: MediaUploadContext;
  fileName?: string;
  mediaKind?: MediaKind;
}

export interface UploadedMediaAsset {
  url: string;
  contentType: string;
  size: number;
  mediaKind: MediaKind;
  bucket?: string;
  objectPath?: string;
  assetId?: string;
}

export interface LocalMediaPreview {
  type: MediaKind;
  url: string;
  thumbnail?: string;
  duration?: string;
  sizeLabel: string;
}

const MB = 1024 * 1024;

const CONTEXT_CONSTRAINTS: Record<MediaUploadContext, MediaConstraints> = {
  avatar: {
    maxInputBytes: 10 * MB,
    allowedKinds: ["image"],
    image: {
      maxDimension: 1200,
      quality: 0.9,
      preferredType: "image/webp",
    },
  },
  feed: {
    maxInputBytes: 100 * MB,
    allowedKinds: ["image", "video", "audio"],
    image: {
      maxDimension: 2160,
      quality: 0.86,
      preferredType: "image/webp",
    },
  },
  verdict: {
    maxInputBytes: 100 * MB,
    allowedKinds: ["image", "video"],
    image: {
      maxDimension: 2160,
      quality: 0.86,
      preferredType: "image/webp",
    },
  },
  story: {
    maxInputBytes: 100 * MB,
    allowedKinds: ["image", "video"],
    image: {
      maxDimension: 1920,
      quality: 0.86,
      preferredType: "image/webp",
    },
  },
  "dare-proof": {
    maxInputBytes: 100 * MB,
    allowedKinds: ["image", "video", "audio"],
    image: {
      maxDimension: 1920,
      quality: 0.84,
      preferredType: "image/webp",
    },
  },
  "challenge-room-proof": {
    maxInputBytes: 100 * MB,
    allowedKinds: ["image", "video"],
    image: {
      maxDimension: 1920,
      quality: 0.84,
      preferredType: "image/webp",
    },
  },
  "community-dare-thumbnail": {
    maxInputBytes: 10 * MB,
    allowedKinds: ["image"],
    image: {
      maxDimension: 1600,
      quality: 0.86,
      preferredType: "image/webp",
    },
  },
  "birthday-room": {
    maxInputBytes: 100 * MB,
    allowedKinds: ["image", "video", "audio"],
    image: {
      maxDimension: 1920,
      quality: 0.86,
      preferredType: "image/webp",
    },
  },
  messages: {
    maxInputBytes: 100 * MB,
    allowedKinds: ["image", "video"],
    image: {
      maxDimension: 1920,
      quality: 0.86,
      preferredType: "image/webp",
    },
  },
};

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
};

const inferMediaKind = (source: Blob | File, explicitKind?: MediaKind) => {
  if (explicitKind) return explicitKind;
  const mimeType = source.type || "";

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";

  throw new Error("Unsupported file type");
};

const BLOCKED_CONTENT_TYPES = new Set(["image/svg+xml"]);

// SECURITY FIX: Magic numbers for file signature validation
const MAGIC_NUMBERS: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/jpg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
  "video/mp4": [0x00, 0x00, 0x00],
  "video/webm": [0x1a, 0x45, 0xdf, 0xa3],
  "video/quicktime": [0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70],
};

/**
 * SECURITY FIX: Validate file signature (magic numbers) to prevent file type spoofing
 */
async function validateFileSignature(
  file: Blob | File,
  expectedType: string,
): Promise<boolean> {
  try {
    const buffer = await file.slice(0, 16).arrayBuffer();
    const header = new Uint8Array(buffer);
    const expected = MAGIC_NUMBERS[expectedType];

    if (!expected) {
      // If no magic number defined, allow the type (for less common types)
      return true;
    }

    // Check if the file header matches the expected magic number
    for (let i = 0; i < expected.length; i++) {
      if (header[i] !== expected[i]) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("File signature validation failed:", error);
    return false; // Fail safe: reject if validation fails
  }
}

const getConstraints = (context: MediaUploadContext) =>
  CONTEXT_CONSTRAINTS[context];

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
};

export const validateMediaSelection = async (
  source: Blob | File,
  context: MediaUploadContext,
  explicitKind?: MediaKind,
) => {
  if (BLOCKED_CONTENT_TYPES.has(source.type)) {
    return {
      valid: false,
      error: "This file type is not allowed.",
    };
  }

  const constraints = getConstraints(context);
  const mediaKind = inferMediaKind(source, explicitKind);

  if (!constraints.allowedKinds.includes(mediaKind)) {
    return {
      valid: false,
      error:
        context === "avatar"
          ? "Please upload an image for your avatar."
          : "This file type is not supported here.",
    };
  }

  if (source.size > constraints.maxInputBytes) {
    return {
      valid: false,
      error: `File is too large. Max allowed size is ${formatBytes(
        constraints.maxInputBytes,
      )}.`,
    };
  }

  // SECURITY FIX: Validate file signature to prevent type spoofing
  if (source.type && !(await validateFileSignature(source, source.type))) {
    return {
      valid: false,
      error:
        "File type does not match the actual file content. Please upload a valid file.",
    };
  }

  return { valid: true, mediaKind };
};

const getImageOutputType = (
  sourceType: string,
  preferredType: ImageOptimizationSettings["preferredType"],
) => {
  // WebP preserves alpha and is materially smaller for suitable PNGs.
  // Animated formats remain untouched by optimizeImage above.
  if (sourceType === "image/png") return preferredType;
  if (sourceType === "image/webp") return "image/webp";
  return preferredType;
};

const toSafeFileName = (fileName: string, fallbackExtension: string) => {
  const baseName =
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "upload";

  return `${baseName}.${fallbackExtension}`;
};

const makeStoragePath = (
  context: MediaUploadContext,
  userId: string,
  fileName: string,
) => {
  const folder =
    context === "avatar"
      ? "avatars"
      : context === "feed"
        ? "feed-media"
        : context === "verdict"
          ? "verdict-media"
          : context === "story"
            ? "stories"
            : context === "dare-proof"
              ? "dare-proofs"
            : context === "challenge-room-proof"
              ? "dare-proofs"
              : context === "community-dare-thumbnail"
                ? "community-dare-thumbnails"
                : context === "birthday-room"
                  ? "birthday-room-media"
                  : "messages";

  // SECURITY FIX: Use crypto.randomUUID() instead of Math.random() for cryptographically secure random values
  // Fallback for browsers that don't support crypto.randomUUID() (e.g., older mobile browsers)
  const randomSuffix = createUuid().split("-")[0];
  return `${folder}/${userId}/${Date.now()}-${randomSuffix}-${fileName}`;
};

const blobToObjectUrl = (blob: Blob) => URL.createObjectURL(blob);

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to process the selected image"));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });

const loadImageFromBlob = (blob: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = blobToObjectUrl(blob);
    const image = new window.Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read image"));
    };

    image.src = objectUrl;
  });

const optimizeImage = async (
  source: Blob | File,
  settings: ImageOptimizationSettings,
  fileName = "image",
) => {
  if (source.type === "image/gif") {
    return {
      blob: source,
      fileName: toSafeFileName(
        fileName,
        EXTENSION_BY_CONTENT_TYPE[source.type] || "bin",
      ),
      contentType: source.type || "application/octet-stream",
    };
  }

  const image = await loadImageFromBlob(source);
  const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale =
    largestSide > settings.maxDimension
      ? settings.maxDimension / largestSide
      : 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare image upload");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const outputType = getImageOutputType(source.type, settings.preferredType);
  const optimizedBlob = await canvasToBlob(
    canvas,
    outputType,
    outputType === "image/png" ? undefined : settings.quality,
  );

  // Avoid increasing bytes when no resize was required. When resizing was
  // required, the bounded dimensions are the stronger constraint.
  if (scale === 1 && optimizedBlob.size >= source.size) {
    return {
      blob: source,
      fileName: toSafeFileName(
        fileName,
        EXTENSION_BY_CONTENT_TYPE[source.type] || "bin",
      ),
      contentType: source.type || "application/octet-stream",
    };
  }

  return {
    blob: optimizedBlob,
    fileName: toSafeFileName(
      fileName,
      EXTENSION_BY_CONTENT_TYPE[outputType] || "jpg",
    ),
    contentType: outputType,
  };
};

const uploadBlobToStorage = async (
  storagePath: string,
  blob: Blob,
  contentType: string,
) => {
  const bucket = storagePath.startsWith("avatars/") ? "avatars" : storagePath.startsWith("stories/") ? "story-media" : storagePath.startsWith("messages/") ? "chat-media" : storagePath.startsWith("dare-proofs/") ? "dare-proofs" : "post-media";
  const client = getSupabaseBrowserClient();
  const { error } = await client.storage.from(bucket).upload(storagePath, blob, { contentType, cacheControl: "31536000", upsert: false });
  if (error) throw error;
  const { data, error: signedError } = await client.storage.from(bucket).createSignedUrl(storagePath, 60 * 60);
  if (signedError || !data?.signedUrl) throw signedError ?? new Error("Could not create media URL");
  return { signedUrl: data.signedUrl, bucket, objectPath: storagePath };
};

export const uploadOptimizedMedia = async ({
  source,
  userId,
  context,
  fileName,
  mediaKind,
}: UploadOptimizedMediaParams): Promise<UploadedMediaAsset> => {
  const validation = await validateMediaSelection(source, context, mediaKind);
  if (!validation.valid || !validation.mediaKind) {
    throw new Error(validation.error || "Invalid file selection");
  }

  const resolvedKind = validation.mediaKind;
  const resolvedFileName =
    fileName ||
    (source instanceof File && source.name) ||
    `${resolvedKind}-${Date.now()}`;

  let blobToUpload = source;
  let contentType = source.type || "application/octet-stream";
  let safeFileName = resolvedFileName;

  if (resolvedKind === "image") {
    const imageSettings = getConstraints(context).image;
    if (!imageSettings) {
      throw new Error("Image upload is not configured");
    }

    const optimized = await optimizeImage(
      source,
      imageSettings,
      resolvedFileName,
    );
    blobToUpload = optimized.blob;
    contentType = optimized.contentType;
    safeFileName = optimized.fileName;
  } else {
    const extension =
      EXTENSION_BY_CONTENT_TYPE[contentType] ||
      resolvedFileName.split(".").pop() ||
      "bin";
    safeFileName = toSafeFileName(resolvedFileName, extension);
  }

  const storagePath = makeStoragePath(context, userId, safeFileName);
  const uploaded = await uploadBlobToStorage(storagePath, blobToUpload, contentType);

  // Register only newly created objects. A failed registry write must not turn a
  // successful user upload into a broken upload; cleanup remains reportable.
  let assetId: string | undefined;
  try {
    const { data } = await getSupabaseBrowserClient()
      .from("media_assets")
      .insert({
        owner_id: userId,
        bucket: uploaded.bucket,
        object_path: uploaded.objectPath,
        role: "primary",
        state: "uploaded_unattached",
      })
      .select("id")
      .maybeSingle();
    assetId = data?.id;
  } catch {
    // The object remains usable. The maintenance report can identify untracked
    // historical objects; no automatic deletion is attempted for them.
  }

  return {
    url: uploaded.signedUrl,
    contentType,
    size: blobToUpload.size,
    mediaKind: resolvedKind,
    bucket: uploaded.bucket,
    objectPath: uploaded.objectPath,
    assetId,
  };
};

const loadVideoElement = (source: Blob | File) =>
  new Promise<HTMLVideoElement>((resolve, reject) => {
    const objectUrl = blobToObjectUrl(source);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      resolve(video);
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read video"));
    };

    video.src = objectUrl;
  });

const formatDuration = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

export const generateVideoThumbnail = async (source: Blob | File) => {
  const video = await loadVideoElement(source);

  try {
    await new Promise<void>((resolve, reject) => {
      const targetTime = Math.min(Math.max(video.duration * 0.15, 0.1), 2);

      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };

      video.addEventListener("seeked", onSeeked, { once: true });

      try {
        video.currentTime = targetTime;
      } catch (error) {
        reject(error);
      }
    });

    const maxWidth = 960;
    const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Unable to build video thumbnail");
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const thumbnailBlob = await canvasToBlob(canvas, "image/jpeg", 0.82);
    return {
      thumbnailUrl: blobToObjectUrl(thumbnailBlob),
      duration: formatDuration(video.duration || 0),
    };
  } finally {
    URL.revokeObjectURL(video.src);
  }
};

export const buildLocalMediaPreview = async (
  file: File,
  context: MediaUploadContext,
): Promise<LocalMediaPreview> => {
  const validation = await validateMediaSelection(file, context);
  if (!validation.valid || !validation.mediaKind) {
    throw new Error(validation.error || "Invalid file");
  }

  const mediaKind = validation.mediaKind;
  const objectUrl = blobToObjectUrl(file);

  if (mediaKind === "video") {
    const { thumbnailUrl, duration } = await generateVideoThumbnail(file);
    return {
      type: mediaKind,
      url: objectUrl,
      thumbnail: thumbnailUrl,
      duration,
      sizeLabel: formatBytes(file.size),
    };
  }

  return {
    type: mediaKind,
    url: objectUrl,
    sizeLabel: formatBytes(file.size),
  };
};
