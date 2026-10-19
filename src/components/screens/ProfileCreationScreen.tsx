"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Camera,
  Check,
  ChevronRight,
  FileText,
  Globe2,
  Lock,
  Shield,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { CourtStickman } from "../court/CourtStickman";

interface ProfileData {
  bio: string;
  avatar: File | null;
  is18Plus: boolean;
  privacyMode: "public" | "friends" | "private";
  notifications: {
    challenges: boolean;
    messages: boolean;
    friendRequests: boolean;
  };
}

const privacyOptions = [
  {
    value: "public",
    label: "Public",
    desc: "People can find you and send challenges.",
    Icon: Globe2,
  },
  {
    value: "friends",
    label: "Friends",
    desc: "Keep activity tighter with people you know.",
    Icon: Users,
  },
  {
    value: "private",
    label: "Private",
    desc: "Stay low-key while you settle in.",
    Icon: Lock,
  },
] as const;

const notificationOptions = [
  {
    key: "challenges",
    label: "Dare invites",
    desc: "When someone sends a dare or truth.",
  },
  {
    key: "messages",
    label: "Messages",
    desc: "When friends start a conversation.",
  },
  {
    key: "friendRequests",
    label: "Friend requests",
    desc: "When someone wants to connect.",
  },
] as const;

const ONBOARDING_BEATS = [
  { label: "your opening scene", note: "give your people something to recognize", color: "#67e8f9" },
  { label: "set your boundaries", note: "you call the vibe around your profile", color: "#facc15" },
  { label: "you are in", note: "your feed, your crew, your next move", color: "#fb7185" },
] as const;

function OnboardingGuide({ step, name }: { step: number; name: string }) {
  const beat = ONBOARDING_BEATS[step - 1] ?? ONBOARDING_BEATS[0];
  return (
    <aside className="onboarding-guide" aria-label="Onboarding progress">
      <div className="onboarding-guide-copy">
        <span>chapter 0{step}</span>
        <strong>{beat.label}</strong>
        <p>{beat.note}</p>
      </div>
      <div className="onboarding-guide-cast" aria-hidden="true">
        <CourtStickman name={name} role="you" color={beat.color} mood={step === 3 ? "✦" : ""} size={29} active />
        <CourtStickman name="crew" color="#5eead4" size={20} />
      </div>
    </aside>
  );
}

export function ProfileCreationScreen({
  onComplete,
  onBack,
}: {
  onComplete: (profileData: ProfileData) => void;
  onBack: () => void;
}) {
  const { user, updateProfile, uploadAvatar, completeProfileCreation } =
    useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileData, setProfileData] = useState<ProfileData>({
    bio: "",
    avatar: null,
    is18Plus: user?.is_18_plus ?? true,
    privacyMode: "public",
    notifications: {
      challenges: true,
      messages: true,
      friendRequests: true,
    },
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const totalSteps = 3;

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setAvatarPreview(result);
        setProfileData((prev) => ({ ...prev, avatar: file }));
      };
      reader.readAsDataURL(file);
    }
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      return profileData.bio.length <= 200;
    }

    if (step === 2) {
      return profileData.is18Plus;
    }

    return true;
  };

  const handleNext = async () => {
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
    } else {
      await handleComplete();
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      if (profileData.avatar) {
        const avatarResult = await uploadAvatar(profileData.avatar);
        if (!avatarResult.success) {
          throw new Error(avatarResult.error || "Failed to upload avatar");
        }
      }

      const updates: {
        bio: string;
        visibility: "PUBLIC" | "PRIVATE";
        is_18_plus: boolean;
        notificationPreferences: ProfileData["notifications"];
      } = {
        bio: profileData.bio,
        visibility:
          profileData.privacyMode === "public" ? "PUBLIC" : "PRIVATE",
        is_18_plus: profileData.is18Plus,
        notificationPreferences: profileData.notifications,
      };

      const result = await updateProfile(updates);

      if (result.success) {
        await completeProfileCreation();
        onComplete(profileData);
      } else {
        alert(result.error || "Failed to update profile");
      }
    } catch (error) {
      console.error("Profile creation error:", error);
      alert("Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepHeader = ({
    eyebrow,
    title,
    subtitle,
    Icon,
  }: {
    eyebrow: string;
    title: string;
    subtitle: string;
    Icon: typeof Camera;
  }) => (
    <div className="mb-5 text-center">
      <div className="onboarding-icon-wrap mx-auto mb-4">
        <Icon size={30} strokeWidth={2.5} />
      </div>
      <p className="mb-2 text-[11px] font-black uppercase text-[#86efac]">
        {eyebrow}
      </p>
      <h2 className="text-[26px] font-black leading-[1.05] text-white">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-[280px] text-[14px] font-semibold leading-snug text-[#94a3b8]">
        {subtitle}
      </p>
    </div>
  );

  const renderAvatar = (size: "large" | "summary" = "large") => {
    const isLarge = size === "large";
    return (
      <div
        className={`relative mx-auto ${isLarge ? "h-[132px] w-[132px]" : "h-16 w-16"} shrink-0`}
      >
        <div
          className={`${isLarge ? "h-[132px] w-[132px] p-[3px]" : "h-16 w-16 p-[2px]"} rounded-full bg-[linear-gradient(135deg,#4ade80,#38bdf8)] shadow-[0_18px_44px_rgba(0,0,0,0.36),0_0_28px_rgba(74,222,128,0.12)]`}
        >
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-[#07100b] bg-[linear-gradient(180deg,rgba(21,27,21,0.98),rgba(7,10,8,0.98))]">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Avatar preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <User
                size={isLarge ? 46 : 28}
                strokeWidth={1.9}
                className="text-[#64748b]"
              />
            )}
          </div>
        </div>
        {isLarge && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-1 right-1 flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-[#07100b] bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-black shadow-[0_12px_28px_rgba(74,222,128,0.32)]"
            aria-label="Choose profile photo"
          >
            <Camera size={19} strokeWidth={2.8} />
          </button>
        )}
      </div>
    );
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="onboarding-step">
            <div className="mb-5 grid grid-cols-[1fr_auto] items-end gap-4">
              <div className="min-w-0 text-left">
                <p className="mb-2 text-[11px] font-black uppercase text-[#86efac]">
                  Your profile
                </p>
                <h2 className="text-[29px] font-black leading-[0.98] text-white">
                  Choose your look
                </h2>
                <p className="mt-2 max-w-[230px] text-[13.5px] font-semibold leading-snug text-[#94a3b8]">
                  Make the first impression friends see before the dare starts.
                </p>
              </div>
              <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[22px] border border-[#4ade80]/18 bg-[#4ade80]/10 text-[#86efac] shadow-[0_14px_34px_rgba(74,222,128,0.1)]">
                <Camera size={24} strokeWidth={2.5} />
              </div>
            </div>

            <div className="onboarding-look-panel onboarding-shine">
              <div className="relative z-10">
                <div className="flex items-start gap-4">
                  <div className="pt-1">{renderAvatar("large")}</div>

                  <div className="min-w-0 flex-1 pt-2">
                    <div className="mb-3 inline-flex rounded-full border border-[#4ade80]/18 bg-[#4ade80]/10 px-3 py-1 text-[10px] font-black uppercase text-[#86efac]">
                      Profile card
                    </div>
                    <p className="truncate text-[18px] font-black leading-tight text-white">
                      {user?.displayName || "Your name"}
                    </p>
                    <p className="mt-1 truncate text-[12.5px] font-bold text-[#94a3b8]">
                      @{user?.username || "username"}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-[18px] border border-white/8 bg-white/[0.035] px-3 py-2">
                        <p className="text-[16px] font-black leading-none text-white">
                          0
                        </p>
                        <p className="mt-1 text-[9.5px] font-black uppercase text-[#64748b]">
                          Dares
                        </p>
                      </div>
                      <div className="rounded-[18px] border border-white/8 bg-white/[0.035] px-3 py-2">
                        <p className="text-[16px] font-black leading-none text-white">
                          0
                        </p>
                        <p className="mt-1 text-[9.5px] font-black uppercase text-[#64748b]">
                          Truths
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-[#4ade80]/22 bg-[#4ade80]/10 px-4 text-[14px] font-black text-[#bbf7d0] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                >
                  <Camera size={17} strokeWidth={2.5} />
                  {avatarPreview ? "Change photo" : "Add photo"}
                </button>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[#94a3b8]">
                      <FileText size={16} />
                      <span className="text-[12px] font-black uppercase">
                        Bio
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-[#64748b]">
                      {profileData.bio.length}/200
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-white/8 bg-black/22 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <textarea
                      placeholder="Make it short, funny, mysterious..."
                      value={profileData.bio}
                      onChange={(event) =>
                        setProfileData((prev) => ({
                          ...prev,
                          bio: event.target.value,
                        }))
                      }
                      className="onboarding-textarea"
                      maxLength={200}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="onboarding-step">
            {renderStepHeader({
              eyebrow: "Safety setup",
              title: "Set your boundaries",
              subtitle:
                "Confirm age consent and choose how visible your profile should be.",
              Icon: Shield,
            })}

            <div className="space-y-3">
              <button
                type="button"
                onClick={() =>
                  setProfileData((prev) => ({
                    ...prev,
                    is18Plus: !prev.is18Plus,
                  }))
                }
                className={`onboarding-choice w-full ${
                  profileData.is18Plus
                    ? "border-[#4ade80]/28 bg-[#4ade80]/10"
                    : "border-red-400/25 bg-red-500/10"
                }`}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.045] text-[#86efac]">
                  <Shield size={21} />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-[15px] font-black text-white">
                    I am 18 years or older
                  </p>
                  <p className="mt-1 text-[12.5px] font-semibold leading-snug text-[#94a3b8]">
                    Required before you can join truth and dare challenges.
                  </p>
                </div>
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                    profileData.is18Plus
                      ? "border-[#4ade80] bg-[#4ade80] text-black"
                      : "border-red-300/40 bg-red-500/10 text-red-200"
                  }`}
                >
                  {profileData.is18Plus && <Check size={16} strokeWidth={3} />}
                </span>
              </button>

              {!profileData.is18Plus && (
                <div className="rounded-[22px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-[12px] font-bold leading-snug text-red-200">
                  Please confirm the age consent to continue.
                </div>
              )}

              <div className="onboarding-panel p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase text-[#86efac]">
                      Profile visibility
                    </p>
                    <p className="mt-1 text-[14px] font-black text-white">
                      Who can find you?
                    </p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-[#4ade80]/18 bg-[#4ade80]/10 text-[#86efac]">
                    <Sparkles size={18} />
                  </div>
                </div>

                <div className="space-y-2.5">
                  {privacyOptions.map(({ value, label, desc, Icon }) => {
                    const active = profileData.privacyMode === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setProfileData((prev) => ({
                            ...prev,
                            privacyMode: value,
                          }))
                        }
                        className={`onboarding-choice w-full ${
                          active
                            ? "border-[#4ade80]/28 bg-[#4ade80]/10"
                            : "border-white/8 bg-white/[0.035]"
                        }`}
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border ${
                            active
                              ? "border-[#4ade80]/22 bg-[#4ade80]/12 text-[#86efac]"
                              : "border-white/8 bg-black/20 text-[#94a3b8]"
                          }`}
                        >
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <p className="text-[14px] font-black text-white">
                            {label}
                          </p>
                          <p className="mt-0.5 text-[12px] font-semibold leading-snug text-[#94a3b8]">
                            {desc}
                          </p>
                        </div>
                        <span
                          className={`h-5 w-5 shrink-0 rounded-full border ${
                            active
                              ? "border-[#4ade80] bg-[#4ade80] shadow-[0_0_16px_rgba(74,222,128,0.24)]"
                              : "border-white/18 bg-black/20"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="onboarding-panel p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Bell size={17} className="text-[#86efac]" />
                  <p className="text-[14px] font-black text-white">
                    Notifications
                  </p>
                </div>

                <div className="space-y-2.5">
                  {notificationOptions.map((notification) => {
                    const enabled =
                      profileData.notifications[notification.key];
                    return (
                      <button
                        key={notification.key}
                        type="button"
                        onClick={() =>
                          setProfileData((prev) => ({
                            ...prev,
                            notifications: {
                              ...prev.notifications,
                              [notification.key]: !enabled,
                            },
                          }))
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-white/[0.035] px-3.5 py-3 text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-black text-white">
                            {notification.label}
                          </p>
                          <p className="mt-0.5 text-[12px] font-semibold leading-snug text-[#94a3b8]">
                            {notification.desc}
                          </p>
                        </div>
                        <span
                          className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
                            enabled
                              ? "border-[#4ade80]/30 bg-[#4ade80]"
                              : "border-white/10 bg-[#1b201b]"
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-[0_6px_14px_rgba(0,0,0,0.25)] transition-transform ${
                              enabled
                                ? "translate-x-[22px]"
                                : "translate-x-1"
                            }`}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="onboarding-step">
            {renderStepHeader({
              eyebrow: "Ready",
              title: "Profile locked in",
              subtitle:
                "One tap and you are ready for friends, truths, and dares.",
              Icon: Check,
            })}

            <div className="onboarding-panel onboarding-shine p-5">
              <div className="relative z-10">
                <div className="flex min-h-[92px] items-center gap-4 rounded-[26px] border border-white/8 bg-black/18 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  {renderAvatar("summary")}
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 inline-flex rounded-full border border-[#4ade80]/18 bg-[#4ade80]/10 px-2.5 py-0.5 text-[9.5px] font-black uppercase text-[#86efac]">
                      Ready
                    </p>
                    <p className="truncate text-[19px] font-black leading-tight text-white">
                      {user?.displayName || "Welcome"}
                    </p>
                    <p className="mt-1 truncate text-[13px] font-bold text-[#94a3b8]">
                      @{user?.username || "username"}
                    </p>
                  </div>
                  <div className="h-10 w-1 shrink-0 rounded-full bg-[linear-gradient(180deg,#4ade80,#38bdf8)] shadow-[0_0_18px_rgba(74,222,128,0.2)]" />
                </div>

                {profileData.bio && (
                  <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-3.5">
                    <p className="mb-1 text-[11px] font-black uppercase text-[#86efac]">
                      Bio
                    </p>
                    <p className="text-[13px] font-semibold leading-snug text-[#e2e8f0]">
                      {profileData.bio}
                    </p>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div className="rounded-[22px] border border-white/8 bg-white/[0.035] p-3.5">
                    <Shield size={17} className="mb-2 text-[#86efac]" />
                    <p className="text-[11px] font-black uppercase text-[#64748b]">
                      Consent
                    </p>
                    <p className="mt-1 text-[14px] font-black text-white">
                      Verified
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-white/8 bg-white/[0.035] p-3.5">
                    <Sparkles size={17} className="mb-2 text-[#86efac]" />
                    <p className="text-[11px] font-black uppercase text-[#64748b]">
                      Visibility
                    </p>
                    <p className="mt-1 text-[14px] font-black capitalize text-white">
                      {profileData.privacyMode}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-[#4ade80]/18 bg-[#4ade80]/10 px-4 py-3">
                  <p className="text-[13px] font-bold leading-snug text-[#bbf7d0]">
                    You are set. The app will open with your profile ready for
                    the dare feed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const currentStepValid = validateStep(currentStep);

  return (
    <div className="screen-container onboarding-screen flex flex-col">
      <style>{`
        .onboarding-screen {
          background:
            radial-gradient(circle at 8% 7%, rgba(103,232,249,0.1), transparent 28%),
            radial-gradient(circle at 92% 18%, rgba(251,113,133,0.08), transparent 26%),
            linear-gradient(180deg, #111111 0%, #090909 48%, #050505 100%);
          font-family: var(--font-ui);
          color: #fff;
          min-height: 100dvh;
          max-height: 100dvh;
          overflow: hidden;
        }
        .onboarding-panel {
          position: relative;
          overflow: hidden;
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, #171717, #101010);
          box-shadow:
            0 24px 70px rgba(0,0,0,0.42),
            inset 0 1px 0 rgba(255,255,255,0.05);
          backdrop-filter: blur(18px);
        }
        .onboarding-panel::before {
          content: "";
          position: absolute;
          inset: 0 32px auto;
          height: 1px;
          background: linear-gradient(90deg, rgba(74,222,128,0), rgba(74,222,128,0.78), rgba(14,165,233,0.45), rgba(74,222,128,0));
          pointer-events: none;
        }
        .onboarding-look-panel {
          position: relative;
          overflow: hidden;
          border-radius: 32px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, #1a1a1a, #101010);
          padding: 18px;
          box-shadow:
            0 26px 76px rgba(0,0,0,0.46),
            inset 0 1px 0 rgba(255,255,255,0.055);
          backdrop-filter: blur(18px);
        }
        .onboarding-look-panel::before {
          content: "";
          position: absolute;
          inset: 0 32px auto;
          height: 1px;
          background: linear-gradient(90deg, rgba(74,222,128,0), rgba(74,222,128,0.82), rgba(14,165,233,0.46), rgba(74,222,128,0));
          pointer-events: none;
        }
        .onboarding-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.11), transparent);
          animation: onboardingSweep 7s ease-in-out infinite;
          pointer-events: none;
        }
        .onboarding-icon-wrap {
          display: flex;
          height: 70px;
          width: 70px;
          align-items: center;
          justify-content: center;
          border-radius: 26px;
          border: 1px solid rgba(74,222,128,0.22);
          background: linear-gradient(180deg, rgba(74,222,128,0.14), rgba(255,255,255,0.035));
          color: #86efac;
          box-shadow: 0 18px 48px rgba(74,222,128,0.12), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .onboarding-choice {
          display: flex;
          align-items: center;
          gap: 12px;
          border-radius: 24px;
          padding: 12px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
          transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
        }
        .onboarding-choice:active {
          transform: scale(0.99);
        }
        .onboarding-textarea {
          min-height: 96px;
          width: 100%;
          resize: none;
          border: 0;
          background: transparent;
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.45;
          outline: none;
        }
        .onboarding-textarea::placeholder {
          color: #64748b;
        }
        .onboarding-step {
          animation: onboardingFloatIn 0.46s cubic-bezier(.22,1,.36,1) both;
        }
        @keyframes onboardingFloatIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes onboardingSweep {
          0% { transform: translateX(-120%); }
          38% { transform: translateX(120%); }
          100% { transform: translateX(120%); }
        }
        .onboarding-guide {
          display: flex;
          min-height: 94px;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin: 2px 2px 18px;
          padding: 12px 14px 11px 16px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 25px;
          background: linear-gradient(135deg, rgba(255,255,255,.07), rgba(255,255,255,.025));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.055);
        }
        .onboarding-guide-copy { min-width: 0; }
        .onboarding-guide-copy span { display:block; color:#67e8f9; font-size:9px; font-weight:900; letter-spacing:.18em; text-transform:uppercase; }
        .onboarding-guide-copy strong { display:block; margin-top:4px; color:#fff; font-size:17px; font-weight:950; letter-spacing:-.045em; line-height:1; }
        .onboarding-guide-copy p { max-width:210px; margin:5px 0 0; color:#a3a3a3; font-size:11px; font-weight:700; line-height:1.25; }
        .onboarding-guide-cast { display:flex; align-items:flex-end; gap:2px; min-width:86px; justify-content:flex-end; transform:translateY(6px); }
        .onboarding-guide-cast .court-stickman:first-child { animation:onboardingGuideBounce 3.2s ease-in-out infinite; }
        .onboarding-guide-cast .court-stickman:last-child { animation:onboardingGuideBounce 3.2s ease-in-out -.9s infinite; filter:brightness(.82); }
        .onboarding-screen [class*="text-[#86efac"] { color:#67e8f9 !important; }
        .onboarding-screen [class*="border-[#4ade80"] { border-color:rgba(103,232,249,.34) !important; }
        .onboarding-screen [class*="bg-[#4ade80"] { background-color:rgba(103,232,249,.13) !important; }
        .onboarding-screen [class*="text-[#bbf7d0"] { color:#d5f8ff !important; }
        .onboarding-screen .onboarding-panel::before,
        .onboarding-screen .onboarding-look-panel::before { background:linear-gradient(90deg,transparent,rgba(103,232,249,.78),rgba(250,204,21,.65),transparent); }
        .onboarding-screen .onboarding-icon-wrap { border-color:rgba(103,232,249,.28); background:#111; color:#67e8f9; }
        .onboarding-screen .onboarding-choice:hover { transform:translateY(-1px); border-color:rgba(103,232,249,.48) !important; background:rgba(255,255,255,.065) !important; }
        .onboarding-screen .onboarding-primary-cta { min-height:56px; border-radius:17px; }
        @keyframes onboardingGuideBounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
        @media (max-width: 380px) {
          .onboarding-panel {
            border-radius: 26px;
          }
          .onboarding-look-panel {
            border-radius: 28px;
            padding: 15px;
          }
          .onboarding-choice {
            border-radius: 22px;
            gap: 10px;
            padding: 11px;
          }
        }
      `}</style>

      <div
        className="shrink-0 px-4"
        style={{ paddingTop: "calc(var(--safe-area-top) + 12px)" }}
      >
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 pb-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_18px_44px_rgba(0,0,0,0.32)]"
            aria-label="Back"
          >
            <ArrowLeft size={21} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="onboarding-progress-label text-center text-[11px] font-black uppercase text-[#86efac]">
              Make your entrance · {currentStep}/{totalSteps}
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
              {Array.from({ length: totalSteps }, (_, index) => (
                <div
                  key={index}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index + 1 <= currentStep
                      ? "w-8 bg-[#67e8f9] shadow-[0_0_16px_rgba(103,232,249,0.28)]"
                      : "w-2 bg-white/12"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="onboarding-header-stickman flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.04] text-[#4ade80] shadow-[0_18px_44px_rgba(0,0,0,0.32)]">
            <CourtStickman name={user?.displayName || "You"} role="new here" color="#facc15" size={18} />
          </div>
        </div>
      </div>

      <div
        className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4"
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
        }}
      >
        <div className="mx-auto max-w-md pb-2">
          <OnboardingGuide step={currentStep} name={user?.displayName || "you"} />
          {renderStepContent()}
        </div>
      </div>

      <div
        className="shrink-0 border-t border-white/8 bg-[#050805]/88 px-4 pt-2.5 backdrop-blur-xl"
        style={{ paddingBottom: "calc(var(--safe-area-bottom) + 10px)" }}
      >
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={handleNext}
            disabled={!currentStepValid || isLoading}
            className="onboarding-primary-cta flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#f8fafc] px-5 text-[14px] font-black text-black shadow-[0_14px_32px_rgba(0,0,0,0.34)] transition-all hover:-translate-y-0.5 active:translate-y-px disabled:bg-[#202020] disabled:text-[#737373] disabled:shadow-none"
          >
            {isLoading ? (
              "Saving..."
            ) : currentStep === totalSteps ? (
              <>
                Complete Profile
                <ChevronRight size={18} />
              </>
            ) : (
              <>
                Continue
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
