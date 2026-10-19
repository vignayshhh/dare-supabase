"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { CourtStickman } from "../court/CourtStickman";

function DareAuthCast({ mode }: { mode: "signin" | "signup" }) {
  const joining = mode === "signup";

  return (
    <div className={`auth-cast auth-cast--${mode}`} aria-hidden="true">
      <div className="auth-cast-orbit auth-cast-orbit--left" />
      <div className="auth-cast-orbit auth-cast-orbit--right" />
      <CourtStickman
        name={joining ? "you" : "dare"}
        role={joining ? "main character" : "your crew"}
        color={joining ? "#fb7185" : "#67e8f9"}
        mood={joining ? "✦" : "!"}
        size={50}
        active
      />
      <div className="auth-cast-friend auth-cast-friend--left">
        <CourtStickman name="mika" color="#facc15" size={27} />
      </div>
      <div className="auth-cast-friend auth-cast-friend--right">
        <CourtStickman name="rio" color="#5eead4" size={27} />
      </div>
    </div>
  );
}

type AuthAction =
  | {
      type: "signin";
      email: string;
      password: string;
    }
  | {
      type: "signup";
      email: string;
      password: string;
      username: string;
      displayName: string;
    };

export function AuthScreen({
  onLogin,
  onContinueAsGuest,
}: {
  onLogin: (action: AuthAction) => Promise<{
    requiresEmailConfirmation?: boolean;
  } | void>;
  onContinueAsGuest?: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!email || !email.includes("@")) {
      errors.email = "Please enter a valid email address";
    }

    if (!password || (mode === "signup" ? password.length < 12 : false)) {
      errors.password =
        mode === "signup"
          ? "Password must be at least 12 characters"
          : "Password is required";
    }

    if (mode === "signup") {
      if (!username || username.trim().length < 3) {
        errors.username = "Username must be at least 3 characters";
      } else if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
        errors.username =
          "Username can only contain letters, numbers, and underscores";
      }

      if (!nickname || nickname.trim().length < 2) {
        errors.nickname = "Display name must be at least 2 characters";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitAuthForm = async () => {
    console.log(
      "submitAuthForm called, mode:",
      mode,
      "isSubmitting:",
      isSubmitting,
    );
    if (isSubmitting) return;

    setError(null);
    setStatusMessage(
      mode === "signin" ? "Signing in..." : "Creating account...",
    );

    if (!validateForm()) {
      console.log("Form validation failed", fieldErrors);
      setStatusMessage(null);
      return;
    }

    console.log("Form validation passed, setting isSubmitting to true");
    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        console.log("Calling onLogin for signup");
        const result = await onLogin({
          type: "signup",
          email: email.trim(),
          password,
          username: username.trim(),
          displayName: nickname.trim(),
        });
        if (result?.requiresEmailConfirmation) {
          setStatusMessage(
            "Account created. Check your email to verify it, then sign in.",
          );
          setIsSubmitting(false);
          return;
        }
      } else {
        console.log("Calling onLogin for signin");
        await onLogin({
          type: "signin",
          email: email.trim(),
          password,
        });
      }
    } catch (submitError) {
      console.warn(
        "Authentication failed:",
        submitError instanceof Error ? submitError.message : submitError,
      );
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Authentication failed.",
      );
      setStatusMessage(null);
      setIsSubmitting(false);
      return;
    }

    setStatusMessage("Success. Finishing sign-in...");
  };

  const handleButtonClick = () => {
    console.log("Button click handler called");
    void submitAuthForm();
  };

  const handleModeToggle = () => {
    if (isSubmitting) return;
    setMode(mode === "signin" ? "signup" : "signin");
    setFieldErrors({});
    setError(null);
    setStatusMessage(null);
  };

  return (
    <div className={`auth-screen auth-screen--${mode} app-viewport safe-area-top safe-area-bottom relative flex min-h-0 flex-col overflow-hidden bg-[#090909] px-4 py-5 text-white`}>
      <div className="auth-atmosphere pointer-events-none absolute inset-0" />
      <div className="auth-grid pointer-events-none absolute inset-0" />

      <div className="auth-shell relative z-10 mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">
        <header className="auth-hero text-center">
          <div className="auth-hero-mark"><DareAuthCast mode={mode} /></div>
          <p className="auth-kicker">
            {mode === "signin" ? "Your crew is waiting" : "Start your Dare era"}
          </p>
          <h1 className="auth-title">
            {mode === "signin" ? "Back in the" : "Get in the"} <span>room.</span>
          </h1>
          <p className="auth-subtitle">
            {mode === "signin"
              ? "Pick up conversations, dares, and stories exactly where you left them."
              : "Build your profile first. Your people and every bold opinion come next."
            }
          </p>
          <div className="auth-ritual" aria-label="How Dare works">
            <span><i>01</i> pick a side</span>
            <span><i>02</i> make a move</span>
            <span><i>03</i> own the story</span>
          </div>
        </header>

        <div className="auth-panel mt-6">
          <div className="auth-panel-heading">
            <span>{mode === "signin" ? "01 / return" : "01 / claim your spot"}</span>
            <b>{mode === "signin" ? "Welcome home" : "Make it yours"}</b>
          </div>
          <div className="auth-mode-switch">
            <button
              type="button"
              onClick={() => {
                if (mode !== "signin") handleModeToggle();
              }}
              disabled={isSubmitting}
              className={mode === "signin" ? "is-active" : ""}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                if (mode !== "signup") handleModeToggle();
              }}
              disabled={isSubmitting}
              className={mode === "signup" ? "is-active" : ""}
            >
              Sign up
            </button>
          </div>

          {error && (
            <div className="auth-alert auth-alert-error">
              <p>{error}</p>
            </div>
          )}

          {statusMessage && !error && (
            <div className="auth-alert auth-alert-status">
              <p>{statusMessage}</p>
            </div>
          )}

          <form
            className="auth-form mt-5 w-full space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              handleButtonClick();
            }}
          >
            {mode === "signup" && (
              <>
                <label className="auth-field">
                  <span>your @</span>
                <div className="auth-input-wrap">
                  <User size={18} className="auth-input-icon" />
                  <input
                    type="text"
                    name="username"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => {
                      setUsername(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, ""),
                      );
                      if (fieldErrors.username) {
                        setFieldErrors((prev) => ({ ...prev, username: "" }));
                      }
                    }}
                    className="auth-input"
                    autoComplete="username"
                    disabled={isSubmitting}
                    minLength={3}
                    maxLength={20}
                  />
                </div>
                </label>
                {fieldErrors.username && (
                  <p className="auth-field-error">{fieldErrors.username}</p>
                )}

                <label className="auth-field">
                  <span>display name</span>
                <div className="auth-input-wrap">
                  <User size={18} className="auth-input-icon" />
                  <input
                    type="text"
                    name="nickname"
                    placeholder="Display name"
                    value={nickname}
                    onChange={(e) => {
                      setNickname(e.target.value);
                      if (fieldErrors.nickname) {
                        setFieldErrors((prev) => ({ ...prev, nickname: "" }));
                      }
                    }}
                    className="auth-input"
                    autoComplete="nickname"
                    disabled={isSubmitting}
                    minLength={2}
                  />
                </div>
                </label>
                {fieldErrors.nickname && (
                  <p className="auth-field-error">{fieldErrors.nickname}</p>
                )}
              </>
            )}

            <label className="auth-field">
              <span>email</span>
            <div className="auth-input-wrap">
              <Mail size={18} className="auth-input-icon" />
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: "" }));
                  }
                }}
                className="auth-input"
                autoComplete="email"
                disabled={isSubmitting}
              />
            </div>
            </label>
            {fieldErrors.email && (
              <p className="auth-field-error">{fieldErrors.email}</p>
            )}

            <label className="auth-field">
              <span>{mode === "signup" ? "make a password" : "password"}</span>
            <div className="auth-input-wrap">
              <Lock size={18} className="auth-input-icon" />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: "" }));
                  }
                }}
                className="auth-input"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                disabled={isSubmitting}
                minLength={mode === "signin" ? 1 : 12}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="auth-icon-button"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            </label>
            {fieldErrors.password && (
              <p className="auth-field-error">{fieldErrors.password}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="auth-primary-button"
              aria-label={mode === "signin" ? "Sign in" : "Create account"}
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-[#031008] border-t-transparent animate-spin" />
                  {mode === "signin" ? "Signing in" : "Creating account"}
                </>
              ) : mode === "signin" ? (
                "Enter Dare"
              ) : (
                "Create my profile"
              )}
            </button>

            {onContinueAsGuest ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onContinueAsGuest}
                className="auth-secondary-button"
              >
                Peek around as guest
              </button>
            ) : null}
          </form>
        </div>

        <p className="auth-footer-copy">
          Private sign-in. Your profile starts with you.
        </p>
      </div>
    </div>
  );
}
