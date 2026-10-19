"use client";
import { InteractionReceipt } from "./InteractionReceipt";
import { useEffect, useState } from "react";
import { ArrowLeft, Calendar, Plus } from "lucide-react";
import {
  circlesService,
  type Circle,
  type CircleEvent,
  type CircleMemory,
  type CircleEventMessage,
} from "@/middleware/services/circles.service";
import { setActiveEventId } from "@/lib/circleContext";

export function CircleHistory({
  circle,
  userId,
  onCreatePost,
  onCreateDare,
  onCreatePrediction,
}: {
  circle: Circle;
  userId: string;
  onCreatePost?: () => void;
  onCreateDare?: () => void;
  onCreatePrediction?: () => void;
}) {
  const [tab, setTab] = useState<"events" | "memories">("events");
  const [events, setEvents] = useState<CircleEvent[]>([]);
  const [memories, setMemories] = useState<CircleMemory[]>([]);
  const [selected, setSelected] = useState<CircleEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [messages, setMessages] = useState<CircleEventMessage[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const [e, m] = await Promise.all([
      circlesService.events(circle.id),
      circlesService.memories(circle.id, selected?.id),
    ]);
    setEvents(e);
    setMemories(m);
  };
  useEffect(() => {
    let alive = true;
    Promise.all([
      circlesService.events(circle.id),
      circlesService.memories(circle.id, selected?.id),
    ])
      .then(([e, m]) => {
        if (alive) {
          setEvents(e);
          setMemories(m);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [circle.id, selected?.id]);
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const refresh = () =>
      circlesService
        .eventMessages(selected.id)
        .then((m) => {
          if (alive) setMessages(m);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [selected]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="circle-history">
      <div className="circles-actions">
        <button
          className="circles-secondary"
          aria-pressed={tab === "events"}
          onClick={() => {
            setTab("events");
            setSelected(null);
            setActiveEventId(null);
          }}
        >
          Events
        </button>
        <button
          className="circles-secondary"
          aria-pressed={tab === "memories"}
          onClick={() => {
            setTab("memories");
            setSelected(null);
            setActiveEventId(null);
          }}
        >
          Memories
        </button>
      </div>
      {tab === "events" && !selected && (
        <>
          <h2>Plans become stories.</h2>
          {events.length === 0 && (
            <p className="circles-subtitle">
              The first hangout starts with a plan.
            </p>
          )}
          {events.map((e) => (
            <button
              className="circles-event"
              key={e.id}
              onClick={() => {
                setSelected(e);
                setActiveEventId(e.id);
              }}
            >
              <Calendar size={24} />
              <span>
                <strong>{e.name}</strong>
                <small>
                  {e.completedAt
                    ? "In the memory book"
                    : e.startsAt
                      ? new Date(e.startsAt).toLocaleString()
                      : "Whenever you’re ready"}
                </small>
              </span>
            </button>
          ))}
          <button
            className="circles-secondary"
            onClick={() => setCreating(!creating)}
          >
            <Plus size={17} />
            Make a plan
          </button>
          {creating && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await circlesService.createEvent(
                    circle.id,
                    userId,
                    name,
                    date ? new Date(date).toISOString() : null,
                  );
                  setCreating(false);
                  setName("");
                });
              }}
            >
              <label className="circles-label" htmlFor="event-name">
                What’s happening?
              </label>
              <input
                id="event-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="Friday, no excuses"
                required
              />
              <label className="circles-label" htmlFor="event-date">
                When? (optional)
              </label>
              <input
                id="event-date"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <button
                className="circles-primary"
                disabled={busy || !name.trim()}
              >
                Create Event
              </button>
            </form>
          )}
        </>
      )}
      {selected && (
        <>
          <button
            className="circles-secondary"
            onClick={() => {
              setSelected(null);
              setActiveEventId(null);
            }}
          >
            <ArrowLeft size={16} />
            All Events
          </button>
          <h2>{selected.name}</h2>
          <p className="circles-subtitle">
            Everything shared here stays with this Event and {circle.name}.
          </p>
          {onCreatePost && (
            <button
              className="circles-primary"
              onClick={() => {
                setActiveEventId(selected.id);
                onCreatePost();
              }}
            >
              Share a photo or video
            </button>
          )}
          {onCreateDare && (
            <button
              className="circles-secondary"
              onClick={() => {
                setActiveEventId(selected.id);
                onCreateDare();
              }}
            >
              Start an Event Dare
            </button>
          )}
          {onCreatePrediction && (
            <button
              className="circles-secondary"
              onClick={() => {
                setActiveEventId(selected.id);
                onCreatePrediction();
              }}
            >
              Make a prediction
            </button>
          )}
          {selected.creatorId === userId && !selected.completedAt && (
            <button
              className="circles-secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await circlesService.completeEvent(selected.id);
                  setSelected({
                    ...selected,
                    completedAt: new Date().toISOString(),
                  });
                })
              }
            >
              Save Event to Memories
            </button>
          )}
        </>
      )}
      {(tab === "memories" || selected) && (
        <>
          <h2>{selected ? "The story so far." : "Our memory book."}</h2>
          {memories.length === 0 && (
            <p className="circles-subtitle">
              The good stuff will collect here. Shared posts, completed Dares,
              resolved predictions—and all your little legends.
            </p>
          )}
          {[
            ...new Set(
              memories.map((m) => new Date(m.createdAt).getFullYear()),
            ),
          ].map((year) => (
            <div key={year}>
              <p className="circles-eyebrow">
                {year} · {circle.name} yearbook
              </p>
              <div className="circles-memory-grid">
                {memories
                  .filter((m) => new Date(m.createdAt).getFullYear() === year)
                  .map((m) => (
                    <article key={m.id}>
                      {m.mediaUrl && (
                        <img
                          src={m.mediaUrl}
                          alt="Shared memory"
                          loading="lazy"
                        />
                      )}
                      <small>{m.kind}</small>
                      <p>{m.title}</p>
                      {m.sourceTable && <InteractionReceipt id={m.id} table={m.sourceTable} />}
                      <time>{new Date(m.createdAt).toLocaleDateString()}</time>
                    </article>
                  ))}
              </div>
            </div>
          ))}
        </>
      )}
      {selected && (
        <section>
          <h2>The Event chat</h2>
          {messages.length === 0 && (
            <p className="circles-subtitle">First word is yours.</p>
          )}
          {messages.map((m) => (
            <article
              className="circles-chat-message"
              key={m.id}
              data-own={m.senderId === userId}
            >
              <small>
                {circle.members.find((p) => p.id === m.senderId)?.name ||
                  "Former member"}
              </small>
              <p>{m.body}</p>
            </article>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await circlesService.sendEventMessage(selected.id, message);
                setMessage("");
                setMessages(await circlesService.eventMessages(selected.id));
              });
            }}
          >
            <label className="circles-label" htmlFor="event-message">
              Message your people
            </label>
            <input
              id="event-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              required
              placeholder="What?s the plan?"
            />
            <button
              className="circles-primary"
              disabled={busy || !message.trim()}
            >
              Send
            </button>
          </form>
        </section>
      )}
      {error && (
        <p className="circles-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
