import React, { useState, useEffect } from "react";
import { useAvatarStore, getAggressiveAvatar } from "../../stores/avatarStore";
import { useUserAvatar } from "../../hooks/useUserAvatar";

export const isPlaceholderAvatarUrl = (src?: string | null) =>
  !src || /\/default-avatar\.(?:png|svg)(?:[?#].*)?$/i.test(src.trim());

export function DefaultAvatarArtwork({
  className = "",
  label = "Default profile avatar",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center overflow-hidden bg-[#101611] ${className}`}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="dare-avatar-bg" x1="12" y1="8" x2="88" y2="94">
            <stop stopColor="#FACC15" />
            <stop offset="0.52" stopColor="#4ADE80" />
            <stop offset="1" stopColor="#38BDF8" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" rx="28" fill="#0B100C" />
        <path d="M-8 76C17 51 29 87 53 67s39-7 55-26v67H-8Z" fill="url(#dare-avatar-bg)" opacity=".28" />
        <circle cx="50" cy="42" r="25" fill="#111713" stroke="#F8FAFC" strokeWidth="4" />
        <circle cx="41" cy="39" r="3.5" fill="#FACC15" />
        <circle cx="59" cy="39" r="3.5" fill="#FACC15" />
        <path d="M39 53c7 6 16 6 23-1" fill="none" stroke="#F8FAFC" strokeWidth="4" strokeLinecap="round" />
        <path d="M50 68v22M50 76 31 88m19-12 19 12" fill="none" stroke="#F8FAFC" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m78 17 2.4 5.3L86 25l-5.6 2.2L78 33l-2.3-5.8L70 25l5.7-2.7Z" fill="#FB7185" />
      </svg>
    </div>
  );
}

/** Abstract placeholder for stickman heads; avoids nesting another stickman. */
export function DefaultStickmanHeadArtwork({
  className = "",
  label = "Default stickman head",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center overflow-hidden bg-[#101611] ${className}`}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
        <rect width="100" height="100" rx="30" fill="#101611" />
        <circle cx="40" cy="45" r="4" fill="#FACC15" />
        <circle cx="60" cy="45" r="4" fill="#FACC15" />
        <path d="M37 59c7 7 19 7 26 0" fill="none" stroke="#F8FAFC" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | number;
  className?: string;
  style?: React.CSSProperties;
  fallbackText?: string;
  onClick?: () => void;
  clickable?: boolean;
  showStatus?: boolean;
  status?: "online" | "offline" | "story";
  borderColor?: string;
  userId?: string;
  username?: string;
  disableRealtime?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  size,
  username,
  userId,
  disableRealtime = false,
  className = "",
  style,
  onClick,
  showStatus = false,
  status = "offline",
  fallbackText,
  clickable = false,
}) => {
  const AVATAR_SCALE = 0.94;
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Use real-time avatar subscription for other users when userId is provided
  // This ensures avatars update in real-time when other users change their profile picture
  const realtimeUserId = disableRealtime ? undefined : userId;
  const { avatar: realTimeAvatar } = useUserAvatar(realtimeUserId);

  // Subscribe to avatar store so this component re-renders when avatars update.
  // Without this, using getState() alone can leave stale avatars on screen.
  useAvatarStore((state) => state.globalAvatar);
  useAvatarStore((state) => state.currentUserId);
  useAvatarStore((state) => state.currentUsername);
  useAvatarStore((state) => (userId ? state.userAvatars[userId] : ""));

  // Get aggressive avatar from store - prioritize real-time avatar for other users
  const finalSrc = getAggressiveAvatar(
    realTimeAvatar || src,
    "",
    userId,
    username,
  );
  const usableSrc = isPlaceholderAvatarUrl(finalSrc) ? "" : finalSrc;

  useEffect(() => {
    setImageError(false);
    setIsLoading(Boolean(usableSrc));
  }, [usableSrc]);

  // Size classes mapping
  const sizeClasses = {
    xs: "w-[22px] h-[22px] text-xs",
    sm: "w-[30px] h-[30px] text-xs",
    md: "w-[45px] h-[45px] text-sm",
    lg: "w-[60px] h-[60px] text-base",
    xl: "w-[75px] h-[75px] text-lg",
    "2xl": "w-[90px] h-[90px] text-xl",
  };

  const resolvedSize = size || "md";
  const presetSize =
    typeof resolvedSize === "number" ? null : resolvedSize;
  const numericSize = typeof resolvedSize === "number" ? resolvedSize : null;
  const scaledNumericSize =
    numericSize !== null ? Math.round(numericSize * AVATAR_SCALE) : null;
  const resolvedSizeClasses = presetSize ? sizeClasses[presetSize] : "";
  const textSize =
    scaledNumericSize !== null
      ? Math.max(12, Math.round(scaledNumericSize * 0.35))
      : undefined;

  // Generate fallback text from alt or provided text
  const getFallbackText = () => {
    if (fallbackText) return fallbackText.charAt(0).toUpperCase();
    if (alt && alt !== "User Avatar") return alt.charAt(0).toUpperCase();
    return "U";
  };

  // Handle image load error
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImageError(true);
    setIsLoading(false);
  };

  // Handle image load success
  const handleImageLoad = () => {
    setImageError(false);
    setIsLoading(false);
  };

  const baseClasses = `
    ${resolvedSizeClasses}
    rounded-full
    flex items-center justify-center
    font-semibold
    transition-all duration-200
    ${clickable ? "cursor-pointer" : ""}
    ${className}
  `;

  // Always relative so the absolute fallback + status indicator work
  const containerClasses = `${baseClasses} relative overflow-hidden`;

  // Status indicator styles
  const getStatusStyles = () => {
    if (!showStatus) return null;

    const statusSizeMap = {
      xs: "w-2 h-2",
      sm: "w-2.5 h-2.5",
      md: "w-3 h-3",
      lg: "w-3.5 h-3.5",
      xl: "w-4 h-4",
      "2xl": "w-5 h-5",
    };

    const statusColors = {
      online: "bg-green-500",
      offline: "bg-gray-400",
      story: "bg-gradient-to-tr from-yellow-400 to-pink-500",
    };

    return (
      <div
        className={`
          absolute bottom-0 right-0
          ${statusSizeMap[presetSize || "md"]}
          ${statusColors[status]}
          rounded-full
          border-2
          ${presetSize === "xs" || presetSize === "sm" ? "border-gray-900" : "border-black"}
        `}
      />
    );
  };

  // NORMAL RENDERING: Use proper logic with fallback
  // Always show fallback when there's no src, on error, OR while loading
  const showFallback = !usableSrc || imageError || isLoading;

  return (
    <div
      className={containerClasses}
      onClick={onClick}
      style={{
        width: scaledNumericSize ?? undefined,
        height: scaledNumericSize ?? undefined,
        fontSize: textSize,
        ...style,
      }}
    >
      {/* Fallback: visible when no src, error, or still loading */}
      {showFallback && (
        <div className={`${resolvedSizeClasses} absolute inset-0 overflow-hidden rounded-full border-2 border-[#4ade80] text-white`}>
          <DefaultAvatarArtwork label={`${alt || "User"} default avatar`} />
          <span className="sr-only select-none">{getFallbackText()}</span>
        </div>
      )}
      {/* Image: render when we have a src and no error; hidden until loaded */}
      {usableSrc && !imageError && (
        <img
          src={usableSrc}
          alt={alt}
          className="absolute inset-0 w-full h-full rounded-full object-cover"
          onError={handleImageError}
          onLoad={handleImageLoad}
          style={{
            display: isLoading ? "none" : "block",
            objectFit: "cover",
          }}
        />
      )}
      {getStatusStyles()}
    </div>
  );
};
