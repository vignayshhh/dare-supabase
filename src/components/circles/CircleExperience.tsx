"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ChevronDown,
  Copy,
  Link,
  Plus,
  Settings,
  X,
} from "lucide-react";
import { useCirclesStore } from "@/stores/useCirclesStore";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import {
  circlesService,
  type Circle,
  type CircleInvitation,
  type CircleInvitePreview,
} from "@/middleware/services/circles.service";
import { StickmanBody } from "./StickmanBody";
import "./circles.css";
import { CircleHistory } from "./CircleHistory";

const avatars = ["🪩", "🫶", "🍒", "🛸", "🌻", "🎧", "🦋", "⚡"];
const colors = ["#4ade80", "#38bdf8", "#fb7185", "#facc15", "#c084fc"];
const pendingKey = "dare-pending-circle-invite";

export function CaptureCircleInvitation() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const invite = url.searchParams.get("circleInvite");
    if (invite && /^[a-f0-9]{48}$/.test(invite)) {
      sessionStorage.setItem(pendingKey, invite);
      url.searchParams.delete("circleInvite");
      window.history.replaceState(null, "", url);
    }
  }, []);
  return null;
}

export function CircleGate({
  userId,
  children,
  onEnter,
}: {
  userId: string;
  children: ReactNode;
  onEnter?: () => void;
}) {
  const {
    load,
    ready,
    error,
    activeId,
    circles,
    pickerOpen,
    showPicker,
    userId: loadedUserId,
  } = useCirclesStore();
  const [pending, setPending] = useState(() =>
    typeof window === "undefined"
      ? ""
      : sessionStorage.getItem(pendingKey) || "",
  );
  useEffect(() => {
    void load(userId);
  }, [load, userId]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load(userId);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, userId]);
  if (!ready || loadedUserId !== userId)
    return (
      <main className="circles-screen">
        <p className="circles-eyebrow">Your people. Your worlds.</p>
        <h1>
          Finding your
          <br />
          Circles.
        </h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="circles-primary"
              onClick={() => void load(userId)}
            >
              Try again
            </button>
          </>
        ) : (
          <div className="circles-skeleton" aria-label="Loading Circles" />
        )}
      </main>
    );
  if (!activeId || pickerOpen || pending)
    return (
      <CirclePicker
        onEnter={onEnter}
        pending={pending}
        onDismissInvite={() => {
          sessionStorage.removeItem(pendingKey);
          setPending("");
        }}
      />
    );
  return <>{children}</>;
}

function CirclePicker({
  pending,
  onDismissInvite,
  onEnter,
}: {
  pending: string;
  onDismissInvite: () => void;
  onEnter?: () => void;
}) {
  const { circles, activeId, userId, select, load, showPicker } =
    useCirclesStore();
  const [view, setView] = useState<"pick" | "create" | "join">(
    pending ? "join" : "pick",
  );
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(avatars[0]);
  const [secret, setSecret] = useState(pending);
  const [preview, setPreview] = useState<CircleInvitePreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(Boolean(pending));
  useEffect(() => {
    if (!pending) return;
    let alive = true;
    circlesService
      .preview(pending)
      .then((p) => {
        if (alive) setPreview(p);
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Invitation unavailable");
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [pending]);
  const owned = circles.filter((c) => c.ownerId === userId);
  const joined = circles.filter((c) => c.ownerId !== userId);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };
  const enter = async (id: string) => {
    await select(id);
    onDismissInvite();
    onEnter?.();
  };
  return (
    <main className="circles-screen">
      <div className="circles-top">
        <span className="circles-wordmark">
          dare<span>.</span>
        </span>
        {(activeId || view !== "pick") && (
          <button
            className="circles-icon"
            aria-label="Back"
            onClick={() => {
              if (view !== "pick") {
                setView("pick");
                setPreview(null);
                onDismissInvite();
              } else showPicker(false);
            }}
          >
            <X size={22} />
          </button>
        )}
      </div>
      <p className="circles-eyebrow">Small circles. Big lore.</p>
      <h1>
        {view === "create" ? (
          <>
            Make it
            <br />
            <em>your world.</em>
          </>
        ) : view === "join" ? (
          <>
            You’re
            <br />
            <em>invited.</em>
          </>
        ) : (
          <>
            Who’s your
            <br />
            <em>world today?</em>
          </>
        )}
      </h1>
      {view === "pick" && (
        <>
          <p className="circles-subtitle">
            Different people. Different sides of you.
            <br />
            One place to be all of them.
          </p>
          <div className="circles-slots">
            {Array.from({ length: Math.max(3, owned.length) }, (_, i) =>
              owned[i] ? (
                <CircleSlot
                  key={owned[i].id}
                  circle={owned[i]}
                  onClick={() => enter(owned[i].id)}
                />
              ) : (
                <button
                  className="circles-slot circles-slot-empty"
                  key={i}
                  onClick={() => setView("create")}
                >
                  <span className="circles-orb">
                    <Plus size={26} />
                  </span>
                  <strong>Create a Circle</strong>
                  <span>Room for your people</span>
                </button>
              ),
            )}
          </div>
          {joined.length > 0 && (
            <>
              <h2>
                More of your worlds <span>{joined.length}</span>
              </h2>
              <div className="circles-slots">
                {joined.map((c) => (
                  <CircleSlot
                    key={c.id}
                    circle={c}
                    onClick={() => enter(c.id)}
                  />
                ))}
              </div>
            </>
          )}
          <button className="circles-secondary" onClick={() => setView("join")}>
            <Link size={17} /> Got an invite? Join a Circle
          </button>
          <p className="circles-footnote">
            Create up to 3. Join as many as you like.
          </p>
        </>
      )}
      {view === "create" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const id = await circlesService.create(name, avatar);
              await load(userId!);
              await enter(id);
            });
          }}
        >
          <div className="circles-avatar-preview">{avatar}</div>
          <div className="circles-avatar-options" aria-label="Circle avatar">
            {avatars.map((a) => (
              <button
                type="button"
                aria-label={`Choose ${a}`}
                aria-pressed={avatar === a}
                key={a}
                onClick={() => setAvatar(a)}
              >
                {a}
              </button>
            ))}
          </div>
          <label className="circles-label" htmlFor="circle-name">
            What do your people call themselves?
          </label>
          <input
            id="circle-name"
            autoFocus
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The after-hours club"
            required
          />
          <p className="circles-subtitle">
            Private from the first post. Invite your people next.
          </p>
          <button
            className="circles-primary"
            disabled={busy || !name.trim() || owned.length >= 3}
          >
            {busy ? "Making room…" : "Create our Circle"}
            <ArrowRight size={18} />
          </button>
        </form>
      )}
      {view === "join" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (preview) {
                const id = await circlesService.accept(secret);
                await load(userId!);
                enter(id);
              } else setPreview(await circlesService.preview(secret));
            });
          }}
        >
          {preview ? (
            <div className="circles-invite-preview">
              <div className="circles-avatar-preview">{preview.avatar}</div>
              <h2>{preview.name}</h2>
              <p>
                {preview.inviter} invited you · {preview.memberCount} members
              </p>
              <p>
                {preview.alreadyMember
                  ? "You’re already part of this Circle."
                  : "Join to see what your people are up to."}
              </p>
            </div>
          ) : (
            <>
              <label className="circles-label" htmlFor="circle-code">
                Your six-digit invitation code
              </label>
              <input
                id="circle-code"
                autoFocus
                inputMode="numeric"
                value={secret}
                maxLength={48}
                onChange={(e) => {
                  setSecret(e.target.value.trim());
                  setPreview(null);
                }}
                placeholder="000000"
                required
              />
              <p className="circles-subtitle">
                We’ll show you the Circle before you join.
              </p>
            </>
          )}
          <button className="circles-primary" disabled={busy || !secret}>
            {busy
              ? "One moment…"
              : preview
                ? preview.alreadyMember
                  ? "Enter Circle"
                  : "Accept invitation"
                : "Find my people"}
            <ArrowRight size={18} />
          </button>
        </form>
      )}
      {error && (
        <p className="circles-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
function CircleSlot({
  circle,
  onClick,
}: {
  circle: Circle;
  onClick: () => void;
}) {
  return (
    <button className="circles-slot" onClick={onClick}>
      <span className="circles-orb">{circle.avatar}</span>
      <strong>{circle.name}</strong>
      <span>
        {circle.members.length}{" "}
        {circle.members.length === 1 ? "person" : "people"} · private
      </span>
      <span className="circles-mini-members">
        {circle.members.slice(0, 3).map((m, i) => (
          <span key={m.id} style={{ borderColor: colors[i] }}>
            {m.avatar ? (
              <img src={m.avatar} alt={m.name} />
            ) : (
              m.name.slice(0, 1)
            )}
          </span>
        ))}
      </span>
    </button>
  );
}

export function CircleMembersScreen({
  onOpenJail,
  onCreatePost,
  onCreateDare,
  onCreatePrediction,
}: {
  onOpenJail?: () => void;
  onCreatePost?: () => void;
  onCreateDare?: () => void;
  onCreatePrediction?: () => void;
}) {
  const { user } = useAuthStore();
  const { circles, activeId, load, showPicker } = useCirclesStore();
  const circle = circles.find((c) => c.id === activeId);
  const [settings, setSettings] = useState(false);
  const [invites, setInvites] = useState<CircleInvitation[]>([]);
  const [invite, setInvite] = useState<CircleInvitation | null>(null);
  const [message, setMessage] = useState(
    "Our group belongs here. Come join us on Dare!",
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(circle?.name || "");
  const owner = circle?.ownerId === user?.id;
  const canInvite = owner || circle?.invitePermission === "members";
  useEffect(() => {
    if (circle && canInvite)
      circlesService
        .invitations(circle.id)
        .then(setInvites)
        .catch(() => {});
  }, [circle, canInvite]);
  if (!circle || !user) return null;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      await load(user.id);
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Could not complete that. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const inviteUrl = invite
    ? `${window.location.origin}/?circleInvite=${invite.token}`
    : "";
  const shareText = `${message.trim()}\n${inviteUrl}`;
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied. Send it to your people.");
    } catch {
      setNotice("Copy unavailable. Select the invitation link below.");
    }
  };
  return (
    <main className="circles-screen circles-members">
      <div className="circles-top">
        <button className="circles-tag" onClick={() => showPicker(true)}>
          Your worlds <ChevronDown size={14} />
        </button>
        <button
          className="circles-icon"
          aria-label={settings ? "Close settings" : "Circle settings"}
          onClick={() => setSettings(!settings)}
        >
          {settings ? <X /> : <Settings size={20} />}
        </button>
      </div>
      <div className="circles-group-hero">
        <span className="circles-hero-avatar">{circle.avatar}</span>
        <p className="circles-eyebrow">The group chat, with a life.</p>
        <h1>{circle.name}</h1>
        <p className="circles-subtitle">
          {circle.members.length} people · private · all yours
        </p>
      </div>
      {!settings && (
        <>
          <div className="circles-people">
            {circle.members.map((m, i) => (
              <div key={m.id}>
                <StickmanBody
                  label={m.name}
                  avatar={m.avatar}
                  statusId="chilling"
                  color={colors[i % colors.length]}
                />
                <strong>{m.id === user.id ? "You" : m.name}</strong>
                <span>
                  {m.id === circle.ownerId ? "Circle owner" : "In the Circle"}
                </span>
              </div>
            ))}
          </div>
          {circle.members.length === 1 && (
            <div className="circles-empty">
              <h2>Your Circle starts here.</h2>
              <p>
                The inside jokes need an audience.
                <br />
                Bring your favourite people.
              </p>
            </div>
          )}
          {canInvite ? (
            <button
              className="circles-primary"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setInvite(await circlesService.invite(circle.id)),
                )
              }
            >
              <Plus size={20} />
              {busy ? "Getting your invite…" : "Invite your people"}
            </button>
          ) : (
            <p className="circles-footnote">
              Your Circle owner can invite new members.
            </p>
          )}
          {invite && (
            <section className="circles-invite-panel">
              <h2>A little invite. A whole world.</h2>
              <label className="circles-label" htmlFor="circle-invite-message">
                Make it sound like you
              </label>
              <textarea
                id="circle-invite-message"
                value={message}
                maxLength={500}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="circles-footnote">Your link stays attached.</p>
              <input
                aria-label="Invitation link"
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.target.select()}
              />
              <div className="circles-actions">
                <button
                  className="circles-secondary"
                  onClick={() => void copy(inviteUrl)}
                >
                  <Copy size={16} />
                  Copy link
                </button>
                <button
                  className="circles-secondary"
                  onClick={() => void copy(invite.code)}
                >
                  Code: {invite.code}
                </button>
              </div>
              <a
                className="circles-primary"
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noreferrer"
              >
                Send on WhatsApp <ArrowRight size={18} />
              </a>
              <button
                className="circles-secondary"
                onClick={async () => {
                  try {
                    if (navigator.share)
                      await navigator.share({
                        title: circle.name,
                        text: message,
                        url: inviteUrl,
                      });
                    else await copy(shareText);
                  } catch (e) {
                    if (!(e instanceof Error && e.name === "AbortError"))
                      setNotice("Sharing unavailable. Copy the link instead.");
                  }
                }}
              >
                Share another way
              </button>
              <p className="circles-footnote">
                Expires {new Date(invite.expiresAt).toLocaleDateString()} · up
                to {invite.maxUses} joins
              </p>
            </section>
          )}
          {invites.some(
            (i) =>
              !i.revoked &&
              new Date(i.expiresAt).getTime() > Date.now() &&
              i.uses < i.maxUses,
          ) && (
            <section>
              <h2>Open invitations</h2>
              <p className="circles-subtitle">
                Invites aren’t members until they accept.
              </p>
              {invites
                .filter(
                  (i) =>
                    !i.revoked &&
                    new Date(i.expiresAt).getTime() > Date.now() &&
                    i.uses < i.maxUses,
                )
                .map((i) => (
                  <div className="circles-member-row" key={i.id}>
                    <div>
                      <strong>{i.code}</strong>
                      <p>
                        {i.uses} joined · expires{" "}
                        {new Date(i.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await circlesService.revoke(i.id);
                          if (invite?.id === i.id) setInvite(null);
                        })
                      }
                    >
                      Revoke
                    </button>
                  </div>
                ))}
            </section>
          )}
        </>
      )}
      {!settings && onOpenJail && <button className="circles-primary" onClick={onOpenJail}>Circle Jail ? votes & verdicts</button>}
      {!settings && (
        <CircleHistory
          circle={circle}
          userId={user.id}
          onCreatePost={onCreatePost}
          onCreateDare={onCreateDare}
          onCreatePrediction={onCreatePrediction}
        />
      )}
      {settings && (
        <section>
          <h2>Keep it your kind of close.</h2>
          {owner && (
            <>
              <div className="circles-avatar-options">
                {avatars.map((a) => (
                  <button
                    type="button"
                    key={a}
                    disabled={busy}
                    aria-label={`Use ${a} as Circle avatar`}
                    aria-pressed={circle.avatar === a}
                    onClick={() =>
                      void run(() =>
                        circlesService.manage(circle.id, "avatar", a),
                      )
                    }
                  >
                    {a}
                  </button>
                ))}
              </div>
              <label className="circles-label" htmlFor="circle-rename">
                Circle name
              </label>
              <input
                id="circle-rename"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                className="circles-secondary"
                disabled={busy || !name.trim()}
                onClick={() =>
                  void run(async () => {
                    await circlesService.manage(circle.id, "rename", name);
                    setNotice("Name updated.");
                  })
                }
              >
                Save name
              </button>
              <label className="circles-label" htmlFor="circle-permission">
                Who can invite?
              </label>
              <select
                id="circle-permission"
                value={circle.invitePermission}
                disabled={busy}
                onChange={(e) =>
                  void run(() =>
                    circlesService.manage(
                      circle.id,
                      "invite_permission",
                      e.target.value,
                    ),
                  )
                }
              >
                <option value="owner">Only the owner</option>
                <option value="members">Everyone in this Circle</option>
              </select>
            </>
          )}
          <h2>
            Our people <span>{circle.members.length}</span>
          </h2>
          {circle.members.map((m) => (
            <div className="circles-member-row" key={m.id}>
              <div>
                <strong>{m.name}</strong>
                <p>{m.id === circle.ownerId ? "Owner" : "Member"}</p>
              </div>
              {owner && m.id !== user.id && (
                <div className="circles-actions">
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Make ${m.name} owner? You will lose owner controls.`,
                        )
                      )
                        void run(() =>
                          circlesService.manage(circle.id, "transfer", m.id),
                        );
                    }}
                  >
                    Make owner
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${m.name} from ${circle.name}? They will lose access.`,
                        )
                      )
                        void run(() =>
                          circlesService.manage(circle.id, "remove", m.id),
                        );
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
          <button
            className="circles-secondary circles-danger"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  owner
                    ? `Archive ${circle.name}? Everyone will lose access. Shared content is retained.`
                    : `Leave ${circle.name}? You will lose access and need a fresh invitation to return.`,
                )
              )
                void run(() =>
                  circlesService.manage(circle.id, owner ? "delete" : "leave"),
                );
            }}
          >
            {owner ? "Archive Circle" : "Leave Circle"}
          </button>
        </section>
      )}
      {notice && (
        <p role="status" className="circles-notice">
          {notice}
        </p>
      )}
    </main>
  );
}
