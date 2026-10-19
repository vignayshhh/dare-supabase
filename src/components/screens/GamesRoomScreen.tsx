"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Gamepad2,
  PartyPopper,
  Split,
  Swords,
  Timer,
  Zap,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import {
  conversationGamesService,
  type ConversationGameAnswerValue,
  type ConversationGameRound,
  type ConversationGameSession,
  type ConversationGameType,
  type ThisOrThatChoice,
} from "@/middleware/services/conversation-games.service";

interface GamesRoomScreenProps {
  conversationId: string;
  currentUserId: string;
  currentUserName: string;
  participantIds: string[];
  initialSessionId?: string | null;
  otherUser: {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
  };
  onClose: () => void;
}

const ROUND_SECONDS = 10;

const THIS_OR_THAT_TEMPLATES = [
  ["Late night", "Early morning"],
  ["Delete", "Screenshot"],
  ["Show up", "Stay home"],
  ["Say it", "Leave it unsaid"],
  ["Be loved completely", "Be understood completely"],
  ["Known by many", "Known deeply by few"],
  ["Tell a hard truth", "Protect with a soft lie"],
  ["Change yourself", "Change your situation"],
  ["Be seen", "Be safe"],
  ["Need people", "Be needed"],
  ["Say the thing", "Live with not saying it"],
  ["Run from it", "Face it tonight"],
];

const GAME_CARDS: Array<{
  type: ConversationGameType;
  title: string;
  kicker: string;
  body: string;
  active: boolean;
}> = [
  {
    type: "this_or_that",
    title: "This Or That",
    kicker: "10 second instinct rounds",
    body: "Two choices. Both lock in. Match or split. The room reacts instantly.",
    active: true,
  },
  {
    type: "callback",
    title: "Callback",
    kicker: "Shared history mode",
    body: "Drop a memory and make them explain what it meant.",
    active: true,
  },
  {
    type: "agree_or_fight",
    title: "Agree Or Fight",
    kicker: "Statements with consequences",
    body: "Agree fast or defend yourself. Splits become tiny debates.",
    active: true,
  },
  {
    type: "assumptions",
    title: "Assumptions",
    kicker: "Notice something risky",
    body: "Make an assumption. They rate how true it feels.",
    active: true,
  },
  {
    type: "finish_sentence",
    title: "Finish My Sentence",
    kicker: "Half a thought, full pressure",
    body: "Start a sentence and see where they think it goes.",
    active: true,
  },
];

type OtherGameType = Exclude<ConversationGameType, "this_or_that">;

type OtherGameTemplate = {
  prompt: string;
  leftOption: string;
  rightOption: string;
  leftChoice: ConversationGameAnswerValue;
  rightChoice: ConversationGameAnswerValue;
  symbol: string;
};

const OTHER_GAME_TEMPLATES: Record<OtherGameType, OtherGameTemplate[]> = {
  callback: [
    {
      prompt: "That one moment we both pretend was normal",
      leftOption: "I remember it",
      rightOption: "I forgot it",
      leftChoice: "remember",
      rightChoice: "forgot",
      symbol: "↺",
    },
    {
      prompt: "The funniest thing that happened between us",
      leftOption: "Instant memory",
      rightOption: "Blank screen",
      leftChoice: "remember",
      rightChoice: "forgot",
      symbol: "!",
    },
    {
      prompt: "The moment that changed the vibe",
      leftOption: "I know exactly",
      rightOption: "Wait, which one?",
      leftChoice: "remember",
      rightChoice: "forgot",
      symbol: "*",
    },
  ],
  agree_or_fight: [
    {
      prompt: "One of us is way more dramatic than we admit",
      leftOption: "Agree",
      rightOption: "Fight",
      leftChoice: "agree",
      rightChoice: "fight",
      symbol: "!",
    },
    {
      prompt: "We both know who replies slower",
      leftOption: "Agree",
      rightOption: "Fight",
      leftChoice: "agree",
      rightChoice: "fight",
      symbol: "⚡",
    },
    {
      prompt: "This friendship has main-character energy",
      leftOption: "Agree",
      rightOption: "Fight",
      leftChoice: "agree",
      rightChoice: "fight",
      symbol: "★",
    },
  ],
  assumptions: [
    {
      prompt: "You act chill when you actually care a lot",
      leftOption: "Too true",
      rightOption: "Wrong",
      leftChoice: "true",
      rightChoice: "wrong",
      symbol: "?",
    },
    {
      prompt: "You notice more than you say",
      leftOption: "Too true",
      rightOption: "Wrong",
      leftChoice: "true",
      rightChoice: "wrong",
      symbol: "👀",
    },
    {
      prompt: "You are secretly competitive",
      leftOption: "Too true",
      rightOption: "Wrong",
      leftChoice: "true",
      rightChoice: "wrong",
      symbol: "!",
    },
  ],
  finish_sentence: [
    {
      prompt: "The thing I never say out loud is...",
      leftOption: "I miss it",
      rightOption: "I am scared",
      leftChoice: "ending_a",
      rightChoice: "ending_b",
      symbol: "“”",
    },
    {
      prompt: "If we were honest, we would admit...",
      leftOption: "This matters",
      rightOption: "We are avoiding it",
      leftChoice: "ending_a",
      rightChoice: "ending_b",
      symbol: "…",
    },
    {
      prompt: "The real answer is probably...",
      leftOption: "Closer than it looks",
      rightOption: "Not what people think",
      leftChoice: "ending_a",
      rightChoice: "ending_b",
      symbol: "✎",
    },
  ],
};

function gameTitle(type: ConversationGameType) {
  return GAME_CARDS.find((game) => game.type === type)?.title || "Game";
}

function gameTemplate(type: OtherGameType, index: number) {
  const templates = OTHER_GAME_TEMPLATES[type];
  return templates[(Math.max(1, index) - 1) % templates.length];
}

function gameResultText(
  type: ConversationGameType,
  result?: "match" | "split" | null,
) {
  if (type === "agree_or_fight") {
    return result === "match"
      ? "You both chose the same side"
      : "You two are fighting this one";
  }
  if (type === "callback") {
    return result === "match"
      ? "You both remembered it the same way"
      : "One of you remembers. One of you does not.";
  }
  if (type === "assumptions") {
    return result === "match"
      ? "You both read this the same way"
      : "The assumption did not land cleanly";
  }
  if (type === "finish_sentence") {
    return result === "match"
      ? "You both finished it the same way"
      : "Two different endings. Interesting.";
  }
  return result === "match"
    ? "You both agreed on this"
    : "You both disagreed on this";
}

function cleanName(name: string) {
  return name.trim().split(/\s+/)[0] || "them";
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

function useRoundCountdown(roundId?: string | null, startedAt?: unknown) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [roundId]);

  const started = toMillis(startedAt);
  if (!roundId || !started) return ROUND_SECONDS;
  return Math.max(0, ROUND_SECONDS - Math.floor((now - started) / 1000));
}

function optionSymbol(option?: string | null, side: ThisOrThatChoice = "left") {
  const text = String(option || "").toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/night|late|moon|dark/, "🌙"],
    [/early|morning|sun|day/, "🌤"],
    [/delete|erase|remove/, "🗑"],
    [/screenshot|photo|picture/, "📸"],
    [/show|seen|visible/, "👀"],
    [/stay|home|safe/, "🏠"],
    [/say|tell|truth|speak/, "🗣"],
    [/unsaid|silence|quiet|leave/, "🤐"],
    [/love|loved|heart/, "💚"],
    [/understood|known deeply|deep/, "🧠"],
    [/many|crowd|famous/, "✨"],
    [/few|close/, "🤝"],
    [/lie|protect/, "🛡"],
    [/change/, "🔁"],
    [/situation|place/, "🧭"],
    [/need|needed/, "🫶"],
    [/run/, "🏃"],
    [/face|tonight/, "⚡"],
  ];
  return (
    rules.find(([pattern]) => pattern.test(text))?.[1] ||
    (side === "left" ? "🔥" : "⚡")
  );
}

export function GamesRoomScreen({
  conversationId,
  currentUserId,
  currentUserName,
  participantIds,
  initialSessionId = null,
  otherUser,
  onClose,
}: GamesRoomScreenProps) {
  const [sessions, setSessions] = useState<ConversationGameSession[]>([]);
  const [rounds, setRounds] = useState<ConversationGameRound[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSessionId,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const joinedRef = useRef(new Set<string>());
  const activatedRef = useRef(new Set<string>());
  const bootRoundRef = useRef(new Set<string>());

  const otherName = cleanName(otherUser.name);
  const participantList = useMemo(
    () => [...new Set(participantIds.filter(Boolean))],
    [participantIds],
  );

  useEffect(() => {
    setSelectedSessionId(initialSessionId);
  }, [initialSessionId]);

  useEffect(() => {
    if (!conversationId) return;
    return conversationGamesService.subscribeToSessions(
      conversationId,
      (nextSessions) => {
        setSessions(nextSessions);
        setSelectedSessionId((current) => {
          if (
            current &&
            nextSessions.some((session) => session.id === current)
          ) {
            return current;
          }
          return initialSessionId || null;
        });
      },
      setError,
    );
  }, [conversationId, initialSessionId]);

  useEffect(() => {
    setRounds([]);
    if (!conversationId || !selectedSessionId) return;
    return conversationGamesService.subscribeToRounds(
      conversationId,
      selectedSessionId,
      setRounds,
      setError,
    );
  }, [conversationId, selectedSessionId]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [selectedSessionId, sessions],
  );
  const activeRound = rounds[rounds.length - 1] || null;
  const currentAnswer = activeRound?.answers?.[currentUserId]?.choice || null;
  const bothAnswered =
    !!activeRound &&
    activeRound.participants.every((id) => activeRound.answers?.[id]);
  const joinedBy = selectedSession?.joined_by || {};
  const currentJoined = !!joinedBy[currentUserId];
  const countdown = useRoundCountdown(
    activeRound?.id || null,
    activeRound?.created_at,
  );

  useEffect(() => {
    if (!selectedSession || joinedRef.current.has(selectedSession.id)) return;
    joinedRef.current.add(selectedSession.id);
    void conversationGamesService
      .joinSession({
        conversationId,
        sessionId: selectedSession.id,
        userId: currentUserId,
      })
      .then((round) => { if (round) setRounds([round]); })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not enter waiting room.",
        ),
      );
  }, [conversationId, currentUserId, selectedSession]);

  useEffect(() => {
    if (
      !selectedSession ||
      selectedSession.status !== "waiting" ||
      !currentJoined ||
      activatedRef.current.has(selectedSession.id)
    ) {
      return;
    }
    activatedRef.current.add(selectedSession.id);
    void conversationGamesService
      .activateSession({
        conversationId,
        sessionId: selectedSession.id,
        userId: currentUserId,
        force: false,
      })
      .then((round) => { if (round) setRounds([round]); })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not start the game.",
        ),
      );
  }, [conversationId, currentUserId, currentJoined, selectedSession]);

  useEffect(() => {
    if (
      !selectedSession ||
      selectedSession.status !== "active" ||
      rounds.length > 0 ||
      bootRoundRef.current.has(selectedSession.id)
    ) {
      return;
    }
    bootRoundRef.current.add(selectedSession.id);
    if (selectedSession.type === "this_or_that") {
      const [leftOption, rightOption] = THIS_OR_THAT_TEMPLATES[0];
      void conversationGamesService
        .createThisOrThatRound({
          conversationId,
          sessionId: selectedSession.id,
          userId: currentUserId,
          participants: selectedSession.participants,
          roundIndex: 1,
          leftOption,
          rightOption,
        })
        .catch((err) =>
          setError(
            err instanceof Error ? err.message : "Could not drop round one.",
          ),
        );
      return;
    }

    const template = gameTemplate(selectedSession.type, 1);
    void conversationGamesService
      .createGameRound({
        conversationId,
        sessionId: selectedSession.id,
        type: selectedSession.type,
        userId: currentUserId,
        participants: selectedSession.participants,
        roundIndex: 1,
        prompt: template.prompt,
        leftOption: template.leftOption,
        rightOption: template.rightOption,
        symbol: template.symbol,
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not drop round one.",
        ),
      );
  }, [conversationId, currentUserId, rounds.length, selectedSession]);

  // One bounded fallback read if the round insert beats/misses Realtime publication.
  useEffect(() => {
    if (!selectedSession || selectedSession.status !== "active" || rounds.length > 0) return;
    const timer = window.setTimeout(() => {
      void conversationGamesService.getRounds(conversationId, selectedSession.id).then((recovered) => {
        if (recovered.length) setRounds(recovered);
      }).catch(() => undefined);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [conversationId, selectedSession, rounds.length]);


  const sendGameInvite = async (type: ConversationGameType) => {
    if (!currentUserId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await conversationGamesService.createGameInvite({
        conversationId,
        type,
        title: gameTitle(type),
        userId: currentUserId,
        userName: currentUserName,
        otherUserName: otherUser.name,
        participants: participantList,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send the game invite.",
      );
    } finally {
      setBusy(false);
    }
  };

  const createNextTemplateRound = async () => {
    if (!selectedSession || busy) return;
    setBusy(true);
    setError(null);
    try {
      const nextIndex = (rounds[rounds.length - 1]?.round_index || 0) + 1;
      if (selectedSession.type === "this_or_that") {
        const [leftOption, rightOption] =
          THIS_OR_THAT_TEMPLATES[
            (nextIndex - 1) % THIS_OR_THAT_TEMPLATES.length
          ];
        await conversationGamesService.createThisOrThatRound({
          conversationId,
          sessionId: selectedSession.id,
          userId: currentUserId,
          participants: selectedSession.participants,
          roundIndex: nextIndex,
          leftOption,
          rightOption,
        });
      } else {
        const template = gameTemplate(selectedSession.type, nextIndex);
        await conversationGamesService.createGameRound({
          conversationId,
          sessionId: selectedSession.id,
          type: selectedSession.type,
          userId: currentUserId,
          participants: selectedSession.participants,
          roundIndex: nextIndex,
          prompt: template.prompt,
          leftOption: template.leftOption,
          rightOption: template.rightOption,
          symbol: template.symbol,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not drop the next round.",
      );
    } finally {
      setBusy(false);
    }
  };

  const answerRound = async (choice: ThisOrThatChoice) => {
    if (!selectedSession || !activeRound || currentAnswer || busy) return;
    setBusy(true);
    setError(null);
    try {
      await conversationGamesService.answerThisOrThat({
        conversationId,
        sessionId: selectedSession.id,
        roundId: activeRound.id,
        userId: currentUserId,
        choice,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Your answer did not land.",
      );
    } finally {
      setBusy(false);
    }
  };

  const answerGenericRound = async (choice: ConversationGameAnswerValue) => {
    if (!selectedSession || !activeRound || currentAnswer || busy) return;
    setBusy(true);
    setError(null);
    try {
      await conversationGamesService.answerGameRound({
        conversationId,
        sessionId: selectedSession.id,
        roundId: activeRound.id,
        userId: currentUserId,
        choice,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Your answer did not land.",
      );
    } finally {
      setBusy(false);
    }
  };

  const finishSession = async () => {
    if (!selectedSession || busy) return;
    setBusy(true);
    setError(null);
    try {
      await conversationGamesService.completeSession({
        conversationId,
        sessionId: selectedSession.id,
        userId: currentUserId,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not close this session.",
      );
    } finally {
      setBusy(false);
    }
  };

  const closeRoom = () => {
    if (selectedSession?.id && selectedSession.status !== "completed") {
      void conversationGamesService.leaveSession({
        conversationId,
        sessionId: selectedSession.id,
        userId: currentUserId,
      });
    }
    onClose();
  };

  const showPicker = !selectedSessionId;
  // Solo/mock mode: never wait for the other user — the room boots straight
  // into rounds and a simulated opponent answers automatically.
  const showWaiting = false;

  const renderOtherGameStage = () => {
    if (
      !selectedSession ||
      !activeRound ||
      selectedSession.type === "this_or_that"
    ) {
      return null;
    }

    const template = gameTemplate(
      selectedSession.type,
      activeRound.round_index,
    );
    const choices = [
      {
        side: "left" as const,
        label: activeRound.left_option || template.leftOption,
        choice: template.leftChoice,
      },
      {
        side: "right" as const,
        label: activeRound.right_option || template.rightOption,
        choice: template.rightChoice,
      },
    ];
    const chosen = (choice: ConversationGameAnswerValue) =>
      Object.entries(activeRound.answers || {}).filter(
        ([, answer]) => answer.choice === choice,
      ).length;
    const renderButton = (
      item: (typeof choices)[number],
      className: string,
      symbol: string,
    ) => {
      const mine = currentAnswer === item.choice;
      return (
        <button
          key={item.choice}
          type="button"
          disabled={!!currentAnswer || activeRound.status !== "voting" || busy}
          onClick={() => answerGenericRound(item.choice)}
          className={`relative overflow-hidden border text-center transition-transform active:scale-[.976] disabled:cursor-default ${className}`}
          style={{
            borderColor: mine ? "rgba(74,222,128,.62)" : "rgba(255,255,255,.1)",
            boxShadow: mine
              ? "0 0 42px rgba(74,222,128,.18), inset 0 1px 0 rgba(255,255,255,.09)"
              : "inset 0 1px 0 rgba(255,255,255,.055), 0 16px 38px rgba(0,0,0,.26)",
          }}
        >
          <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)]" />
          {mine && (
            <span className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#3df57f] text-[#07130c]">
              <Check size={17} strokeWidth={3} />
            </span>
          )}
          <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3">
            <div className="text-[38px] font-black leading-none text-[#86efac]">
              {symbol}
            </div>
            <p className="m-0 max-w-[240px] text-[20px] font-black leading-[1.08] text-white sm:text-[24px]">
              {item.label}
            </p>
            {activeRound.status !== "voting" && (
              <span className="rounded-full border border-white/10 bg-black/18 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/48">
                {chosen(item.choice)} chose
              </span>
            )}
          </div>
        </button>
      );
    };

    if (selectedSession.type === "callback") {
      return (
        <div className="grid gap-4">
          <div className="relative min-h-[330px] overflow-hidden rounded-[34px] border border-[#22d3ee]/16 bg-[radial-gradient(circle_at_50%_-18%,rgba(14,165,233,.16),transparent_42%),linear-gradient(180deg,rgba(11,20,22,.98),rgba(5,8,8,.99))] p-5 text-center shadow-[0_24px_62px_rgba(0,0,0,.38)]">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[28px] border border-[#67e8f9]/20 bg-[#67e8f9]/10 text-[34px] font-black text-[#bae6fd] [animation:gamesIconFloat_2s_ease-in-out_infinite]">
              {(activeRound as any).symbol || "↺"}
            </div>
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.18em] text-[#67e8f9]">
              Memory flash
            </p>
            <h3 className="m-0 mx-auto mt-3 max-w-[520px] text-[30px] font-black leading-[1.02] text-white sm:text-[38px]">
              {activeRound.prompt}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {renderButton(
              choices[0],
              "min-h-[150px] rounded-[30px] bg-[linear-gradient(180deg,rgba(15,34,32,.98),rgba(5,10,9,.99))] p-4",
              "↺",
            )}
            {renderButton(
              choices[1],
              "min-h-[150px] rounded-[30px] bg-[linear-gradient(180deg,rgba(25,22,18,.98),rgba(8,8,6,.99))] p-4",
              "?",
            )}
          </div>
        </div>
      );
    }

    if (selectedSession.type === "agree_or_fight") {
      return (
        <div className="grid gap-4">
          <div className="rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,22,18,.98),rgba(6,9,8,.99))] p-5 text-center shadow-[0_24px_62px_rgba(0,0,0,.38)]">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.2em] text-[#86efac]">
              Arena statement
            </p>
            <h3 className="m-0 mx-auto mt-3 max-w-[560px] text-[30px] font-black leading-[1.02] text-white sm:text-[40px]">
              {activeRound.prompt}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {renderButton(
              choices[0],
              "min-h-[250px] rounded-[36px] bg-[radial-gradient(circle_at_50%_0%,rgba(74,222,128,.22),transparent_45%),linear-gradient(180deg,rgba(12,34,22,.98),rgba(5,10,7,.99))] p-5",
              "✓",
            )}
            {renderButton(
              choices[1],
              "min-h-[250px] rounded-[36px] bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,.22),transparent_45%),linear-gradient(180deg,rgba(12,25,34,.98),rgba(5,8,10,.99))] p-5",
              "⚡",
            )}
          </div>
        </div>
      );
    }

    if (selectedSession.type === "assumptions") {
      const answerLabel = (choice?: ConversationGameAnswerValue | null) => {
        if (choice === template.leftChoice)
          return activeRound.left_option || template.leftOption;
        if (choice === template.rightChoice)
          return activeRound.right_option || template.rightOption;
        return null;
      };
      const otherAnswer =
        Object.entries(activeRound.answers || {}).find(
          ([id]) => id !== currentUserId,
        )?.[1]?.choice || null;
      const myReceiptLine = answerLabel(currentAnswer);
      const otherReceiptLine = answerLabel(otherAnswer);
      const verdictLine =
        activeRound.status === "voting"
          ? currentAnswer
            ? `Your stamp is drying. Waiting for ${otherName}.`
            : "Choose the stamp that belongs on the receipt."
          : activeRound.result === "match"
            ? "Receipt confirmed. You both read it the same way."
            : "Receipt disputed. The assumption did not land cleanly.";

      return (
        <div className="grid gap-4">
          <div className="relative mx-auto w-full max-w-[640px] overflow-hidden rounded-[38px] border border-[#86efac]/16 bg-[radial-gradient(circle_at_50%_-22%,rgba(74,222,128,.18),transparent_44%),radial-gradient(circle_at_82%_12%,rgba(34,211,238,.08),transparent_34%),linear-gradient(180deg,rgba(12,18,14,.98),rgba(4,7,6,.99))] p-4 shadow-[0_30px_76px_rgba(0,0,0,.46),inset_0_1px_0_rgba(255,255,255,.055)] sm:p-5">
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(134,239,172,.72),rgba(103,232,249,.42),transparent)]" />
            <div className="pointer-events-none absolute left-1/2 top-24 h-44 w-44 -translate-x-1/2 rounded-full bg-[#4ade80]/10 blur-3xl" />
            <p className="m-0 text-center text-[11px] font-black uppercase tracking-[0.22em] text-[#86efac]">
              Receipt desk
            </p>
            <div className="relative mx-auto mt-4 min-h-[410px] max-w-[430px]">
              <div className="absolute left-7 top-8 h-[310px] w-[250px] rotate-[-5deg] rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,23,17,.96),rgba(7,11,8,.98))] shadow-[0_18px_44px_rgba(0,0,0,.35)]" />
              <div className="absolute right-7 top-16 h-[300px] w-[238px] rotate-[6deg] rounded-[26px] border border-[#86efac]/14 bg-[linear-gradient(180deg,rgba(11,18,14,.97),rgba(5,9,7,.99))] shadow-[0_18px_44px_rgba(0,0,0,.34)]" />
              <div
                className="relative z-10 mx-auto flex min-h-[392px] w-full max-w-[340px] flex-col rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,25,19,.98),rgba(8,12,9,.99))] p-5 shadow-[0_24px_64px_rgba(0,0,0,.48),inset_0_1px_0_rgba(255,255,255,.07)]"
                style={{
                  animation:
                    "assumptionReceiptIn .48s cubic-bezier(.2,.9,.2,1) both, assumptionPaperFloat 4.8s ease-in-out .6s infinite",
                }}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="m-0 text-[10px] font-black uppercase tracking-[0.2em] text-[#86efac]">
                      Assumption file
                    </p>
                    <p className="m-0 mt-1 text-[13px] font-black text-white/58">
                      Round {activeRound.round_index}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[#86efac]/18 bg-[#3df57f]/10 text-[18px] font-black text-[#86efac] shadow-[0_12px_28px_rgba(0,0,0,.24)]">
                    ID
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/22 p-4">
                  <p className="m-0 text-[10px] font-black uppercase tracking-[0.18em] text-[#64748b]">
                    Claim written on receipt
                  </p>
                  <h3
                    className="assumption-receipt-line m-0 mt-2 text-[25px] font-black leading-[1.04] text-white sm:text-[29px]"
                    style={{ animationDelay: ".12s" }}
                  >
                    {activeRound.prompt}
                  </h3>
                </div>
                <div className="mt-4 grid gap-2">
                  {[
                    {
                      label: "Your stamp",
                      value: myReceiptLine || "Not stamped yet",
                      active: !!myReceiptLine,
                      delay: ".26s",
                    },
                    {
                      label: `${otherName}'s stamp`,
                      value: otherReceiptLine || "Waiting",
                      active: !!otherReceiptLine,
                      delay: ".42s",
                    },
                    {
                      label: "Desk note",
                      value: verdictLine,
                      active:
                        activeRound.status !== "voting" || !!currentAnswer,
                      delay: ".58s",
                    },
                  ].map((line) => (
                    <div
                      key={line.label}
                      className="overflow-hidden rounded-[18px] border border-white/8 bg-white/[0.035] px-3 py-2.5"
                    >
                      <p className="m-0 text-[9px] font-black uppercase tracking-[0.16em] text-[#64748b]">
                        {line.label}
                      </p>
                      <p
                        className={`assumption-receipt-line m-0 mt-1 text-[13px] font-black leading-snug ${
                          line.active ? "text-[#d7ffe6]" : "text-white/36"
                        }`}
                        style={{ animationDelay: line.delay }}
                      >
                        {line.value}
                      </p>
                    </div>
                  ))}
                </div>
                {activeRound.status !== "voting" && (
                  <div
                    className={`absolute right-4 top-[190px] flex h-28 w-28 rotate-[-12deg] items-center justify-center rounded-full border-[3px] text-center text-[12px] font-black uppercase leading-tight tracking-[0.12em] ${
                      activeRound.result === "match"
                        ? "border-[#86efac]/70 bg-[#4ade80]/12 text-[#bbf7d0]"
                        : "border-[#67e8f9]/65 bg-[#22d3ee]/10 text-[#bae6fd]"
                    }`}
                    style={{
                      animation:
                        "assumptionStampSlam .62s cubic-bezier(.18,1.18,.22,1) both",
                    }}
                  >
                    {activeRound.result === "match"
                      ? "Read confirmed"
                      : "Receipt disputed"}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mx-auto grid w-full max-w-[640px] gap-3 sm:grid-cols-2">
            {choices.map((item, index) => {
              const mine = currentAnswer === item.choice;
              const isPositive = item.choice === template.leftChoice;
              return (
                <button
                  key={item.choice}
                  type="button"
                  disabled={
                    !!currentAnswer || activeRound.status !== "voting" || busy
                  }
                  onClick={() => answerGenericRound(item.choice)}
                  className="group relative min-h-[118px] overflow-hidden rounded-[30px] border p-4 text-left transition-transform active:scale-[.974] disabled:cursor-default"
                  style={{
                    borderColor: mine
                      ? "rgba(74,222,128,.62)"
                      : isPositive
                        ? "rgba(134,239,172,.18)"
                        : "rgba(103,232,249,.18)",
                    background: mine
                      ? "radial-gradient(circle at 50% 0%, rgba(74,222,128,.24), transparent 48%), linear-gradient(180deg, rgba(15,38,25,.98), rgba(5,10,7,.99))"
                      : isPositive
                        ? "linear-gradient(180deg,rgba(18,34,23,.98),rgba(5,10,7,.99))"
                        : "linear-gradient(180deg,rgba(13,25,29,.98),rgba(5,8,10,.99))",
                    boxShadow: mine
                      ? "0 0 42px rgba(74,222,128,.18), inset 0 1px 0 rgba(255,255,255,.09)"
                      : "inset 0 1px 0 rgba(255,255,255,.055), 0 16px 38px rgba(0,0,0,.26)",
                    animation:
                      !currentAnswer && activeRound.status === "voting"
                        ? `assumptionStampBreathe 2.7s ${index * 1.35}s ease-in-out infinite`
                        : undefined,
                  }}
                >
                  <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)]" />
                  <div className="pointer-events-none absolute -left-1/2 top-0 h-full w-1/2 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.13),transparent)] opacity-0 group-active:opacity-100 group-active:[animation:gamesShine_.46s_ease]" />
                  {mine && (
                    <span className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#3df57f] text-[#07130c]">
                      <Check size={17} strokeWidth={3} />
                    </span>
                  )}
                  <p className="m-0 text-[10px] font-black uppercase tracking-[0.18em] text-[#86efac]">
                    Stamp receipt
                  </p>
                  <p className="m-0 mt-3 max-w-[250px] text-[24px] font-black leading-[1.02] text-white">
                    {item.label}
                  </p>
                  <p className="m-0 mt-2 text-[12px] font-bold text-white/45">
                    {isPositive ? "Confirm the read" : "Reject the claim"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (false) {
      return (
        <div className="grid gap-4">
          <div className="relative overflow-hidden rounded-[38px] border border-[#86efac]/14 bg-[radial-gradient(circle_at_50%_-16%,rgba(74,222,128,.18),transparent_42%),linear-gradient(180deg,rgba(14,24,18,.98),rgba(5,8,6,.99))] p-6 text-center shadow-[0_26px_70px_rgba(0,0,0,.42)]">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.2em] text-[#86efac]">
              Assumption on the table
            </p>
            <h3 className="m-0 mx-auto mt-4 max-w-[560px] text-[31px] font-black leading-[1.02] text-white sm:text-[42px]">
              {activeRound.prompt}
            </h3>
            <div className="mx-auto mt-6 h-2 max-w-[340px] overflow-hidden rounded-full bg-white/8">
              <div className="h-full w-2/3 rounded-full bg-[linear-gradient(90deg,#22d3ee,#4ade80)] shadow-[0_0_24px_rgba(74,222,128,.24)]" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {renderButton(
              choices[0],
              "min-h-[170px] rounded-[32px] bg-[linear-gradient(180deg,rgba(18,38,25,.98),rgba(5,10,7,.99))] p-5",
              "👀",
            )}
            {renderButton(
              choices[1],
              "min-h-[170px] rounded-[32px] bg-[linear-gradient(180deg,rgba(28,18,20,.98),rgba(9,6,7,.99))] p-5",
              "✕",
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-4">
        <div className="rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,22,20,.98),rgba(6,9,8,.99))] p-5 text-center shadow-[0_24px_62px_rgba(0,0,0,.38)]">
          <p className="m-0 text-[11px] font-black uppercase tracking-[0.2em] text-[#67e8f9]">
            Finish the sentence
          </p>
          <h3 className="m-0 mx-auto mt-3 max-w-[600px] text-[32px] font-black leading-[1.02] text-white sm:text-[44px]">
            {activeRound.prompt}
          </h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {renderButton(
            choices[0],
            "min-h-[240px] rotate-[-1.5deg] rounded-[34px] bg-[radial-gradient(circle_at_30%_0%,rgba(74,222,128,.18),transparent_44%),linear-gradient(180deg,rgba(16,28,20,.98),rgba(5,9,7,.99))] p-5",
            "A",
          )}
          {renderButton(
            choices[1],
            "min-h-[240px] rotate-[1.5deg] rounded-[34px] bg-[radial-gradient(circle_at_70%_0%,rgba(14,165,233,.18),transparent_44%),linear-gradient(180deg,rgba(14,24,29,.98),rgba(5,8,10,.99))] p-5",
            "B",
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[180] flex flex-col overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.16), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.12), transparent 28%), radial-gradient(circle at 90% 12%, rgba(34,211,238,0.08), transparent 30%), linear-gradient(180deg, #050806 0%, #07100c 46%, #020403 100%)",
      }}
    >
      <style>{`
        @keyframes gamesPopIn {
          from { opacity: 0; transform: translateY(18px) scale(.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes gamesBounce {
          0%, 100% { transform: translateY(0) scale(1); }
          45% { transform: translateY(-5px) scale(1.025); }
        }
        @keyframes gamesShine {
          from { transform: translateX(-120%) rotate(10deg); }
          to { transform: translateX(160%) rotate(10deg); }
        }
        @keyframes gamesMatchFlash {
          0% { box-shadow: 0 0 0 rgba(61,245,127,0); }
          36% { box-shadow: 0 0 54px rgba(61,245,127,.3); }
          100% { box-shadow: 0 0 0 rgba(61,245,127,0); }
        }
        @keyframes gamesSplitFlash {
          0% { box-shadow: 0 0 0 rgba(103,232,249,0); }
          36% { box-shadow: 0 0 54px rgba(103,232,249,.26); }
          100% { box-shadow: 0 0 0 rgba(103,232,249,0); }
        }
        @keyframes gamesChoicePulse {
          0%, 42%, 100% { transform: translateY(0) scale(1); }
          18% { transform: translateY(-6px) scale(1.018); }
        }
        @keyframes gamesVsPop {
          0%, 100% { transform: scale(1) rotate(0deg); filter: brightness(1); }
          45% { transform: scale(1.08) rotate(-2deg); filter: brightness(1.2); }
        }
        @keyframes gamesTimerHeat {
          0%, 100% { box-shadow: 0 0 0 rgba(61,245,127,0.0), 0 0 28px rgba(61,245,127,.18); }
          50% { box-shadow: 0 0 0 7px rgba(61,245,127,.07), 0 0 44px rgba(61,245,127,.3); }
        }
        @keyframes gamesIconFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-5px) rotate(2deg); }
        }
        @keyframes gamesRevealSnap {
          0% { opacity: 0; transform: translateY(10px) scale(.96); filter: blur(6px); }
          65% { opacity: 1; transform: translateY(-1px) scale(1.025); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes assumptionReceiptIn {
          0% { opacity: 0; transform: translateY(18px) rotate(-2deg) scale(.96); filter: blur(8px); }
          68% { opacity: 1; transform: translateY(-3px) rotate(.7deg) scale(1.015); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); filter: blur(0); }
        }
        @keyframes assumptionPaperFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-4px) rotate(.45deg); }
        }
        @keyframes assumptionLineWrite {
          0% { opacity: 0; clip-path: inset(0 100% 0 0); transform: translateY(5px); filter: blur(3px); }
          72% { opacity: 1; clip-path: inset(0 0 0 0); transform: translateY(0); filter: blur(0); }
          100% { opacity: 1; clip-path: inset(0 0 0 0); transform: translateY(0); filter: blur(0); }
        }
        @keyframes assumptionStampSlam {
          0% { opacity: 0; transform: translate3d(28px,-22px,0) rotate(-28deg) scale(1.45); filter: blur(4px); }
          48% { opacity: 1; transform: translate3d(0,0,0) rotate(-12deg) scale(.9); filter: blur(0); }
          66% { transform: translate3d(0,0,0) rotate(-12deg) scale(1.08); }
          100% { opacity: 1; transform: translate3d(0,0,0) rotate(-12deg) scale(1); }
        }
        @keyframes assumptionStampBreathe {
          0%, 52%, 100% { transform: translateY(0) scale(1); box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 16px 38px rgba(0,0,0,.26); }
          22% { transform: translateY(-5px) scale(1.015); box-shadow: 0 0 34px rgba(74,222,128,.13), inset 0 1px 0 rgba(255,255,255,.08), 0 18px 44px rgba(0,0,0,.3); }
        }
        .assumption-receipt-line {
          animation: assumptionLineWrite .62s cubic-bezier(.2,.9,.2,1) both;
          will-change: opacity, transform, clip-path;
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_28%_-42%,rgba(74,222,128,.1),transparent_66%),radial-gradient(ellipse_at_78%_-34%,rgba(14,165,233,.08),transparent_64%),linear-gradient(180deg,rgba(255,255,255,.025),transparent_28%,rgba(0,0,0,.28))]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,.34))]" />

      <header className="relative z-10 shrink-0 px-4 pb-3 pt-[calc(var(--safe-area-top)+12px)]">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={closeRoom}
            className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/10 bg-[rgba(15,22,18,.72)] text-white/78 shadow-[0_12px_28px_rgba(0,0,0,.3)]"
            aria-label="Back to chat"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="m-0 text-[10px] font-black uppercase tracking-[0.22em] text-[#86efac]">
              {selectedSession ? gameTitle(selectedSession.type) : "Games"}
            </p>
            <h1 className="m-0 truncate text-[23px] font-black leading-tight">
              You and {otherName}
            </h1>
          </div>
          <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-[18px] border border-[#67e8f9]/18 bg-[rgba(15,22,18,.78)] shadow-[0_14px_30px_rgba(0,0,0,.28)]">
            <Avatar
              src={otherUser.avatarUrl || ""}
              alt={otherUser.name}
              size={48}
              userId={otherUser.id}
              username={otherUser.username || undefined}
            />
          </div>
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom)+18px)]">
        {error && (
          <div className="mb-3 rounded-[20px] border border-red-400/20 bg-red-500/12 px-4 py-3 text-sm font-bold text-red-100">
            {error}
          </div>
        )}

        {showPicker && (
          <section className="mx-auto max-w-[430px]">
            <div className="mb-4 rounded-[30px] border border-white/8 bg-[radial-gradient(ellipse_at_24%_-45%,rgba(74,222,128,0.12),transparent_64%),radial-gradient(ellipse_at_82%_-40%,rgba(14,165,233,0.09),transparent_62%),linear-gradient(180deg,rgba(13,19,14,0.94),rgba(8,13,9,0.97))] p-4 shadow-[0_22px_62px_rgba(0,0,0,.38),inset_0_1px_0_rgba(255,255,255,.05)]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[19px] bg-[#3df57f] text-[#07130c] shadow-[0_12px_28px_rgba(61,245,127,.24)]">
                  <Gamepad2 size={24} />
                </div>
                <div>
                  <p className="m-0 text-[12px] font-black uppercase tracking-[0.18em] text-[#86efac]">
                    Pick a game
                  </p>
                  <p className="m-0 mt-1 text-[15px] font-bold leading-snug text-white/72">
                    This sends one invite card into the chat first.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-3">
              {GAME_CARDS.map((game, index) => (
                <button
                  key={game.type}
                  type="button"
                  disabled={!game.active || busy}
                  onClick={
                    game.active ? () => sendGameInvite(game.type) : undefined
                  }
                  className="group relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(145deg,rgba(74,222,128,.10),rgba(255,255,255,.04)_48%,rgba(56,189,248,.08)),linear-gradient(180deg,rgba(9,15,12,.98),rgba(5,8,6,.99))] p-4 text-left shadow-[0_18px_42px_rgba(0,0,0,.34),inset_0_1px_0_rgba(255,255,255,.055)] transition-transform active:scale-[.982] disabled:opacity-55"
                  style={{
                    animation: `gamesPopIn .42s ${index * 45}ms cubic-bezier(.2,.9,.2,1) both`,
                  }}
                >
                  {game.active && (
                    <div className="pointer-events-none absolute -left-1/2 top-0 h-full w-1/2 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent)] opacity-0 group-hover:opacity-100 group-hover:[animation:gamesShine_.8s_ease]" />
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="m-0 text-lg font-black text-white">
                        {game.title}
                      </p>
                      <p className="m-0 mt-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#86efac]">
                        {game.kicker}
                      </p>
                    </div>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-[#3df57f]/16 text-[#86efac]">
                      {game.active ? (
                        <ChevronRight size={20} />
                      ) : (
                        <Clock size={18} />
                      )}
                    </div>
                  </div>
                  <p className="m-0 mt-3 text-sm font-semibold leading-relaxed text-white/62">
                    {game.body}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {!showPicker && !showWaiting && selectedSession && (
          <section className="mx-auto flex min-h-[72dvh] w-full max-w-[880px] flex-col justify-center">
            <div
              className="relative overflow-hidden rounded-[34px] border border-white/8 bg-[radial-gradient(ellipse_at_24%_-45%,rgba(74,222,128,.14),transparent_62%),radial-gradient(ellipse_at_82%_-40%,rgba(14,165,233,.10),transparent_62%),linear-gradient(180deg,rgba(13,19,14,.98),rgba(6,10,8,.99))] p-3 shadow-[0_30px_86px_rgba(0,0,0,.54),0_0_36px_rgba(34,211,238,.055),inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur sm:p-4"
              style={{
                animation:
                  activeRound?.result === "match"
                    ? "gamesMatchFlash 1.2s ease both"
                    : activeRound?.result === "split"
                      ? "gamesSplitFlash 1.2s ease both"
                      : "gamesPopIn .38s cubic-bezier(.2,.9,.2,1) both",
              }}
            >
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(134,239,172,.72),rgba(103,232,249,.5),transparent)]" />
              <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="min-w-0">
                  <h2 className="m-0 truncate text-[19px] font-black text-white">
                    Round {activeRound?.round_index || 1}
                  </h2>
                </div>
                <div
                  className="flex h-16 w-16 flex-col items-center justify-center rounded-[24px] border border-[#86efac]/22 bg-[#3df57f] text-[#07130c]"
                  style={{
                    animation: "gamesTimerHeat 1.45s ease-in-out infinite",
                  }}
                >
                  <Timer size={17} strokeWidth={3} />
                  <span className="mt-0.5 text-[15px] font-black leading-none tabular-nums">
                    {activeRound?.status === "voting" && !currentAnswer
                      ? countdown
                      : "lock"}
                  </span>
                </div>
                <div aria-hidden="true" />
              </div>

              {activeRound ? (
                <>
                  {selectedSession.type === "this_or_that" ? (
                    <>
                      {selectedSession.type !== "this_or_that" && (
                        <div className="mb-4 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,.96),rgba(7,10,8,.98))] px-4 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.045)]">
                          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[20px] border border-[#86efac]/18 bg-[#3df57f]/10 text-[28px] font-black text-[#86efac] shadow-[0_12px_30px_rgba(0,0,0,.24)]">
                            {(activeRound as any).symbol || "*"}
                          </div>
                          <p className="m-0 text-[24px] font-black leading-[1.08] text-white sm:text-[30px]">
                            {activeRound.prompt}
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-[minmax(0,1fr)_38px_minmax(0,1fr)] items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_54px_minmax(0,1fr)] sm:gap-4">
                        {(["left", "right"] as ThisOrThatChoice[]).map(
                          (choice) => {
                            const template =
                              selectedSession.type === "this_or_that"
                                ? null
                                : gameTemplate(
                                    selectedSession.type,
                                    activeRound.round_index,
                                  );
                            const option =
                              choice === "left"
                                ? activeRound.left_option
                                : activeRound.right_option;
                            const answerChoice: ConversationGameAnswerValue =
                              selectedSession.type === "this_or_that"
                                ? choice
                                : choice === "left"
                                  ? template!.leftChoice
                                  : template!.rightChoice;
                            const chosenBy = Object.entries(
                              activeRound.answers || {},
                            )
                              .filter(
                                ([, answer]) => answer.choice === answerChoice,
                              )
                              .map(([id]) => id);
                            const mine = currentAnswer === answerChoice;
                            const revealed =
                              activeRound.status !== "voting" || bothAnswered;
                            const symbol =
                              selectedSession.type === "this_or_that"
                                ? optionSymbol(option, choice)
                                : optionSymbol(option, choice);
                            const isLeft = choice === "left";
                            return (
                              <div key={choice} className="contents">
                                {!isLeft && (
                                  <div className="flex h-full items-center justify-center">
                                    <div
                                      className="flex h-16 w-10 items-center justify-center rounded-full border border-white/12 bg-black/24 text-[11px] font-black text-white/72 shadow-[0_14px_34px_rgba(0,0,0,.28)] sm:h-20 sm:w-14 sm:text-[13px]"
                                      style={{
                                        animation:
                                          "gamesVsPop 1.4s ease-in-out infinite",
                                      }}
                                    >
                                      VS
                                    </div>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  disabled={
                                    !!currentAnswer ||
                                    activeRound.status !== "voting" ||
                                    busy
                                  }
                                  onClick={() =>
                                    selectedSession.type === "this_or_that"
                                      ? answerRound(choice)
                                      : answerGenericRound(answerChoice)
                                  }
                                  className="group relative min-h-[390px] overflow-hidden rounded-[32px] border p-4 text-center transition-transform active:scale-[.974] disabled:cursor-default sm:min-h-[430px] sm:p-6"
                                  style={{
                                    borderColor: mine
                                      ? "rgba(61,245,127,.68)"
                                      : isLeft
                                        ? "rgba(134,239,172,.18)"
                                        : "rgba(103,232,249,.2)",
                                    background: mine
                                      ? "radial-gradient(circle at 50% 0%, rgba(74,222,128,.28), transparent 48%), linear-gradient(180deg, rgba(15,40,27,.98), rgba(6,15,11,.98))"
                                      : isLeft
                                        ? "radial-gradient(circle at 20% 0%, rgba(74,222,128,.14), transparent 46%), linear-gradient(180deg, rgba(15,22,18,.98), rgba(6,10,8,.98))"
                                        : "radial-gradient(circle at 80% 0%, rgba(14,165,233,.16), transparent 46%), linear-gradient(180deg, rgba(13,21,22,.98), rgba(5,9,10,.98))",
                                    boxShadow: mine
                                      ? "0 0 46px rgba(61,245,127,.22), inset 0 1px 0 rgba(255,255,255,.12)"
                                      : "inset 0 1px 0 rgba(255,255,255,.07), 0 18px 44px rgba(0,0,0,.24)",
                                    animation:
                                      !currentAnswer &&
                                      activeRound.status === "voting"
                                        ? `gamesChoicePulse 2.4s ${isLeft ? "0s" : "1.2s"} ease-in-out infinite`
                                        : undefined,
                                  }}
                                >
                                  <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.62),transparent)]" />
                                  <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-active:opacity-100">
                                    <div className="absolute inset-0 bg-white/10" />
                                  </div>
                                  <div className="flex h-full min-h-[358px] flex-col items-center justify-center gap-5 sm:min-h-[384px]">
                                    <div className="absolute right-4 top-4 flex w-full justify-end">
                                      {mine && (
                                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3df57f] text-[#07130c] shadow-[0_10px_24px_rgba(61,245,127,.28)]">
                                          <Check size={17} strokeWidth={3} />
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex flex-col items-center justify-center gap-5">
                                      <div
                                        className="flex h-24 w-24 items-center justify-center rounded-[30px] border border-white/12 bg-white/[0.085] text-[50px] shadow-[0_18px_42px_rgba(0,0,0,.24)] sm:h-28 sm:w-28 sm:text-[58px]"
                                        style={{
                                          animation:
                                            "gamesIconFloat 2s ease-in-out infinite",
                                        }}
                                      >
                                        {symbol}
                                      </div>
                                      <p className="m-0 max-w-[260px] break-words text-[24px] font-black leading-[1.06] text-white sm:text-[30px]">
                                        {option}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              </div>
                            );
                          },
                        )}
                      </div>
                    </>
                  ) : (
                    renderOtherGameStage()
                  )}

                  {activeRound.status === "voting" &&
                    currentAnswer &&
                    !bothAnswered && (
                      <div className="mt-4 rounded-[22px] border border-[#67e8f9]/18 bg-[#67e8f9]/10 px-4 py-3 text-center text-sm font-bold text-[#bae6fd]">
                        You locked in. Waiting for {otherName}.
                      </div>
                    )}

                  {activeRound.status !== "voting" && (
                    <div className="mt-4 rounded-[26px] border border-white/10 bg-black/18 p-4">
                      <div className="flex items-center justify-center gap-2">
                        {activeRound.result === "match" ? (
                          <Zap size={18} className="text-[#86efac]" />
                        ) : (
                          <Split size={18} className="text-[#67e8f9]" />
                        )}
                        <p className="m-0 text-center text-[20px] font-black">
                          {gameResultText(
                            selectedSession.type,
                            activeRound.result,
                          )}
                        </p>
                      </div>
                      {activeRound.darren_line && (
                        <div className="mx-auto mt-3 flex max-w-[320px] items-center justify-center gap-3 rounded-[22px] border border-[#86efac]/18 bg-[#3df57f]/10 px-3 py-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[16px] border border-[#86efac]/30 bg-black/20">
                            <Avatar
                              src="/avatars/darren-soft-menace.svg"
                              alt="Darren"
                              size={40}
                              userId="darren"
                              username="darren"
                            />
                          </div>
                          <p className="m-0 text-left text-[14px] font-black leading-snug text-[#d7ffe6]">
                            Darren: {activeRound.darren_line}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 text-center">
                  <PartyPopper
                    className="mx-auto mb-3 text-[#86efac]"
                    size={32}
                  />
                  <p className="m-0 text-lg font-black">Starting together.</p>
                  <p className="m-0 mt-1 text-sm font-semibold text-white/55">
                    The first pair is loading for both screens.
                  </p>
                </div>
              )}
            </div>

            <div className="mx-auto mt-4 grid w-full max-w-[520px] grid-cols-2 gap-2">
              <button
                type="button"
                onClick={createNextTemplateRound}
                disabled={busy || activeRound?.status === "voting"}
                className="min-h-[50px] rounded-[18px] border border-white/12 bg-white/[0.08] px-3 text-[12px] font-black text-white disabled:opacity-40"
              >
                Next pair
              </button>
              <button
                type="button"
                onClick={finishSession}
                disabled={busy || selectedSession.status === "completed"}
                className="min-h-[50px] rounded-[18px] border border-white/12 bg-white/[0.05] px-3 text-[12px] font-black text-white/68 disabled:opacity-40"
              >
                End
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
