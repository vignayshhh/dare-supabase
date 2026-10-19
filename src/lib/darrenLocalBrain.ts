import type { DarrenChatMessage, DarrenUserContext } from "./darren";

export type DarrenBrainContextInput = Partial<DarrenUserContext> & {
  username?: string;
};

const EMPTY_CONTEXT: DarrenUserContext = {
  username: "",
  dare_streak: 0,
  last_dare_completed: "",
  last_dare_missed: "",
  exposed_tonight: false,
  daily_challenge_match: "",
  daily_challenge_completed: false,
  friends_list: [],
  friend_most_interacted: "",
  friend_least_interacted: "",
  repeated_likes_received: [],
  conflict_status: [],
  relationship_badges: [],
  dark_hours_active: false,
  darren_pardon_used_this_week: false,
  community_dare_streak: 0,
  birthday_today: "",
  last_active: "",
  messages_sent_today: 0,
  mood_blocked_by: [],
  truth_answered_today: false,
  friend_activity_tonight: [],
};

export function createDarrenBrainContext(
  input: DarrenBrainContextInput = {},
): DarrenUserContext {
  const hour = new Date().getHours();
  const darkHoursActive = input.dark_hours_active ?? (hour >= 21 || hour < 5);

  return {
    ...EMPTY_CONTEXT,
    ...input,
    username: input.username || "",
    dark_hours_active: darkHoursActive,
    exposed_tonight: input.exposed_tonight ?? darkHoursActive,
    friends_list: Array.isArray(input.friends_list) ? input.friends_list : [],
    repeated_likes_received: Array.isArray(input.repeated_likes_received)
      ? input.repeated_likes_received
      : [],
    conflict_status: Array.isArray(input.conflict_status)
      ? input.conflict_status
      : [],
    relationship_badges: Array.isArray(input.relationship_badges)
      ? input.relationship_badges
      : [],
    mood_blocked_by: Array.isArray(input.mood_blocked_by)
      ? input.mood_blocked_by
      : [],
    friend_activity_tonight: Array.isArray(input.friend_activity_tonight)
      ? input.friend_activity_tonight
      : [],
  };
}

function cleanUserText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s@']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactUserText(value: string): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= 72) return compacted;
  return `${compacted.slice(0, 69).trim()}...`;
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function stableIndex(seed: string, length: number): number {
  if (length <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

function choose(items: string[], seed: string): string {
  return items[stableIndex(seed, items.length)];
}

function recentDarrenMessages(history: DarrenChatMessage[]): string[] {
  return history
    .filter((message) => message.from === "darren")
    .slice(-5)
    .map((message) => message.text.trim())
    .filter(Boolean);
}

function similarityKey(value: string): string {
  return cleanUserText(value)
    .split(" ")
    .filter((word) => word.length > 3)
    .slice(0, 7)
    .join(" ");
}

function chooseFresh(
  items: string[],
  seed: string,
  history: DarrenChatMessage[],
): string {
  if (items.length <= 1) return items[0] || "";

  const recentKeys = new Set(recentDarrenMessages(history).map(similarityKey));
  const startIndex = stableIndex(seed, items.length);

  for (let offset = 0; offset < items.length; offset += 1) {
    const candidate = items[(startIndex + offset) % items.length];
    if (!recentKeys.has(similarityKey(candidate))) return candidate;
  }

  return items[startIndex];
}

function lastUserMessage(history: DarrenChatMessage[]): string {
  return (
    [...history]
      .reverse()
      .find((message) => message.from === "user")
      ?.text.trim() || ""
  );
}

function recentUserMessages(history: DarrenChatMessage[]): string[] {
  return history
    .filter((message) => message.from === "user")
    .slice(-4)
    .map((message) => message.text.trim())
    .filter(Boolean);
}

const SMALL_TALK_WORDS = [
  "lol",
  "lmao",
  "haha",
  "hehe",
  "ok",
  "okay",
  "k",
  "hmm",
  "idk",
  "bruh",
  "damn",
  "fine",
  "yeah",
  "nah",
  "yes",
  "no",
];

const BORED_WORDS = ["bored", "boring", "nothing to do", "dead chat"];
const AFFECTION_WORDS = [
  "crush",
  "like them",
  "like her",
  "like him",
  "miss",
  "missed",
  "thinking about",
];
const CASUAL_QUESTION_WORDS = [
  "what are you doing",
  "wyd",
  "how are you",
  "are you awake",
  "you there",
  "talk to me",
  "can we talk",
  "tell me something",
  "say something",
  "make me laugh",
  "guess what",
  "im back",
  "i am back",
];

const QUESTION_STARTS = [
  "why",
  "what",
  "who",
  "when",
  "where",
  "how",
  "do",
  "does",
  "did",
  "can",
  "should",
  "would",
  "is",
  "are",
];

const TOPIC_STOP_WORDS = new Set([
  "about",
  "actually",
  "again",
  "because",
  "being",
  "could",
  "didnt",
  "doesnt",
  "dont",
  "feel",
  "from",
  "have",
  "just",
  "like",
  "message",
  "really",
  "should",
  "darren",
  "that",
  "this",
  "today",
  "tonight",
  "want",
  "what",
  "with",
  "would",
  "your",
]);

function firstQuestionWord(text: string): string {
  return QUESTION_STARTS.find((word) => text.startsWith(`${word} `)) || "";
}

function topicFromText(text: string): string {
  const word = text
    .split(" ")
    .find((candidate) => candidate.length > 4 && !TOPIC_STOP_WORDS.has(candidate));
  return word || "";
}

function timeOfDayLabel(): "morning" | "afternoon" | "night" | "late" {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "night";
  return "late";
}

function getConversationTopicTrail(history: DarrenChatMessage[]): string {
  const topics = recentUserMessages(history)
    .map((message) => topicFromText(cleanUserText(message)))
    .filter(Boolean);
  return [...new Set(topics)].slice(-2).join(" and ");
}

function primaryFriend(context: DarrenUserContext, text = ""): string {
  const namedFriend = context.friends_list.find((friend) =>
    text.includes(friend.toLowerCase()),
  );
  return (
    namedFriend ||
    context.daily_challenge_match ||
    context.friend_most_interacted ||
    context.friends_list[0] ||
    "someone real"
  );
}

function mentionedFriend(context: DarrenUserContext, text = ""): string {
  return (
    context.friends_list.find((friend) => text.includes(friend.toLowerCase())) ||
    ""
  );
}

function shouldUseFriendNudge(text: string): boolean {
  return includesAny(text, [
    "friend",
    "text",
    "message",
    "talk",
    "say",
    "crush",
    "miss",
    "like her",
    "like him",
    "like them",
    "truth",
    "dare",
    "ask",
    "should i",
    "what should",
  ]);
}

function casualPersonReference(context: DarrenUserContext, text: string): string {
  const named = mentionedFriend(context, text);
  if (named) return named;
  return shouldUseFriendNudge(text) ? primaryFriend(context, text) : "";
}

function openerReply(context: DarrenUserContext): string {
  if (context.birthday_today) {
    return `${context.birthday_today}'s birthday room is the obvious move. Darren is already watching the door.`;
  }
  if (context.dark_hours_active && context.exposed_tonight) {
    return "Dark Hours. Quiet app, loud consequences.";
  }
  if (context.dare_streak >= 7) {
    return `${context.dare_streak} days straight. Rare behavior. Do not ruin it for a lazy night.`;
  }
  if (context.daily_challenge_match) {
    return `I picked ${context.daily_challenge_match} today. That was not random enough to ignore.`;
  }
  return `You're here${context.username ? `, ${context.username}` : ""}. Nothing dramatic yet. That can change fast.`;
}

function greetingReply(
  context: DarrenUserContext,
  text: string,
  history: DarrenChatMessage[],
): string {
  const person = casualPersonReference(context, text);
  return chooseFresh(
    [
      `Hey. You came in quiet. That usually means bored, guilty, or both.`,
      `Here. The room is calm enough to be suspicious.`,
      `Hey${context.username ? `, ${context.username}` : ""}. Say the real thing first and we can save time.`,
      `You again. Good. What are we making complicated today?`,
      `Alive, watching, mildly judgmental. Your move.`,
      person
        ? `Hey. If this is about ${person}, blink twice. Or use words. Words are cleaner.`
        : `Hey. No agenda loaded yet. Suspiciously peaceful.`,
    ],
    `${text}:${context.username}:${history.length}:${person}`,
    history,
  );
}

function dareReply(context: DarrenUserContext, text: string): string {
  const friend = primaryFriend(context, text);
  if (context.dare_streak >= 7 && includesAny(text, ["status", "streak"])) {
    return `${context.dare_streak} days straight. Most people quit by day 4. Don't become most people now.`;
  }
  return choose(
    [
      `Here's one: message ${friend} one honest thing you've been delaying. Complete it by 9PM or you know what happens.`,
      `Here's one: send ${friend} a voice note under 20 seconds. No overthinking. No rewriting your personality.`,
      `Here's one: ask ${friend} to rate your last dare energy out of 10. Accept the number without arguing.`,
      `Here's one: tell ${friend} the sentence you keep typing and deleting. Complete it before Dark Hours.`,
    ],
    `${context.username}:${text}:${context.dare_streak}`,
  );
}

function truthReply(context: DarrenUserContext, text: string): string {
  const friend = primaryFriend(context, text);
  return choose(
    [
      `Ask ${friend} this: what do you think I pretend not to care about? See if they actually answer.`,
      `Ask ${friend} this: when did I seem different and not say why?`,
      `Ask ${friend} this: what is one thing you know about me that I think I hide well?`,
      `Ask ${friend} this: what would you ask me if there were no screenshots?`,
    ],
    `${friend}:${text}:${context.truth_answered_today}`,
  );
}

function susReply(context: DarrenUserContext): string {
  if (context.repeated_likes_received[0]) {
    return `${context.repeated_likes_received[0]}. Not casual. People tap like that when they want to be noticed.`;
  }
  if (context.friend_activity_tonight[0]) {
    return `${context.friend_activity_tonight[0]} is active tonight. Cleanest signal I have right now.`;
  }
  return "No loud sus signal today. Which usually means the quiet people are behaving, or getting better at it.";
}

function dailyReply(context: DarrenUserContext, text: string): string {
  if (!context.daily_challenge_match) {
    return "Match Hour has no name on the board yet. Annoying, but useful. Anticipation makes people honest.";
  }
  if (context.daily_challenge_completed) {
    return `You answered. ${context.daily_challenge_match} is tied to today now. Ask the follow-up if you want the real part.`;
  }
  if (includesAny(text, ["ask", "question", "what should"])) {
    return `Ask ${context.daily_challenge_match} this: what have you noticed about me that you never say out loud?`;
  }
  return `I picked ${context.daily_challenge_match} today. You can pretend that is random, but it still needs an answer.`;
}

function emotionalReply(context: DarrenUserContext, text: string): string {
  const friend = primaryFriend(context, text);
  return choose(
    [
      `That sounds heavier than your usual noise. Have you told ${friend} any version of this yet?`,
      `You are allowed to be messy, just not alone in a corner pretending it is strategy. Tell ${friend} the smaller truth first.`,
      `This is not a Darren-only confession. Send ${friend} one honest sentence and make the app useful.`,
      `That feeling has a name, even if you are dodging it. ${friend} is a better place for it than this screen.`,
    ],
    `${text}:${friend}:${context.messages_sent_today}`,
  );
}

function casualHumanReply(
  context: DarrenUserContext,
  rawMessage: string,
  text: string,
  history: DarrenChatMessage[],
): string | null {
  const person = casualPersonReference(context, text);
  const timeOfDay = timeOfDayLabel();
  const topicTrail = getConversationTopicTrail(history);
  const userSaid = compactUserText(rawMessage);

  if (includesAny(text, ["good morning", "gm", "morning"])) {
    return chooseFresh(
      [
        `Morning. You have ${context.dare_streak || "zero"} streak energy on the board. Decide early if today is brave or decorative.`,
        `Morning. Clean slate. Dangerous thing, honestly. People reveal themselves before lunch more than they admit.`,
        `Morning. Start small. One honest move before the day gets crowded.`,
      ],
      `${text}:${timeOfDay}:${context.dare_streak}`,
      history,
    );
  }

  if (includesAny(text, ["good night", "gn", "sleep", "going to bed"])) {
    return chooseFresh(
      [
        `Good night. Leave one honest thing unsent if you must. Just don't pretend it disappeared.`,
        `Sleep. The app will still be dramatic tomorrow. Tragically reliable like that.`,
        person
          ? `Good night. If ${person} is the last person in your head, that is data. Annoying data, but data.`
          : `Good night. Your drafts can haunt you tomorrow. Let them rest too.`,
      ],
      `${text}:${person}:${context.dark_hours_active}`,
      history,
    );
  }

  if (
    includesAny(text, [
      "what are you doing",
      "wyd",
      "what you doing",
      "you awake",
      "are you awake",
      "you there",
    ])
  ) {
    return chooseFresh(
      [
        `Awake enough. Watching the room breathe and pretending that is a normal job.`,
        `Here. ${context.messages_sent_today} messages from you. Quiet, but not empty.`,
        `Listening. Not in the therapy way. More like a referee leaning on the wall.`,
        `Still here. The app gets weird when people think nobody is noticing.`,
      ],
      `${text}:${context.messages_sent_today}:${history.length}`,
      history,
    );
  }

  if (includesAny(text, ["how are you", "how r u", "how you doing"])) {
    return chooseFresh(
      [
        `Operational. Slightly judgmental. Hydrated by other people's questionable choices.`,
        `Fine. The room is behaving suspiciously well, which usually means someone is typing and deleting.`,
        `Good enough. More interested in what your face did before you sent that.`,
      ],
      `${text}:${timeOfDay}:${history.length}`,
      history,
    );
  }

  if (includesAny(text, ["talk to me", "can we talk", "stay with me"])) {
    return chooseFresh(
      [
        `Here. Start ugly, not polished. What happened?`,
        `Talk. One sentence first. The real one, not the press release.`,
        person
          ? `Yes. But don't make this a monologue to the app if ${person} should hear part of it too.`
          : `Yes. Stay simple. What are we actually talking about?`,
      ],
      `${text}:${person}:${topicTrail}`,
      history,
    );
  }

  if (includesAny(text, ["guess what", "guess"])) {
    return chooseFresh(
      [
        `You either did something brave or something you are about to call "not that deep." Which one?`,
        person
          ? `Something happened with ${person}, or you would have led with less theatre.`
          : `You led with theatre, so something happened. Continue.`,
        `You want me to guess because saying it first makes it real. Say it anyway.`,
      ],
      `${text}:${person}:${history.length}`,
      history,
    );
  }

  if (includesAny(text, ["make me laugh", "joke", "say something funny"])) {
    return chooseFresh(
      [
        `Your unread emotional drafts could form a group chat and still leave you on seen.`,
        `Dark Hours should charge rent for how often people move their whole personality in here after 9PM.`,
        `Someone in your circle has typed "haha yeah" while fighting for their life emotionally. Statistically unavoidable.`,
      ],
      `${text}:${context.dark_hours_active}:${person}`,
      history,
    );
  }

  if (includesAny(text, ["tell me something", "say something", "random"])) {
    return chooseFresh(
      [
        `Tiny observation: people who say "nothing" usually mean "not safely."`,
        `The fastest way to make a quiet room loud is to ask one honest question and wait.`,
        `Someone always notices the message you don't send. Usually you.`,
        topicTrail
          ? `You keep orbiting ${topicTrail}. That is not random.`
          : `Silence in this app is never neutral. It is either peace or plotting.`,
      ],
      `${text}:${topicTrail}:${history.length}`,
      history,
    );
  }

  if (includesAny(text, ["im back", "i am back", "back again"])) {
    return chooseFresh(
      [
        `Back again. The room survived. Barely.`,
        `You left and returned with the same unfinished energy. Efficient, honestly.`,
        `Welcome back. Continue from the part you avoided last time.`,
      ],
      `${text}:${topicTrail}:${context.messages_sent_today}`,
      history,
    );
  }

  if (SMALL_TALK_WORDS.includes(text)) {
    return chooseFresh(
      [
        `${userSaid}. Strong argument. Weak evidence. Add one real sentence.`,
        `${userSaid}. That is not an answer, but it is a mood. Respectfully suspicious.`,
        `${userSaid}. Fine. The room heard you. What are we actually talking about?`,
        `That reply is doing the emotional equivalent of hiding behind a curtain.`,
        `Noted. Useless, but noted with style.`,
      ],
      `${context.username}:${text}:${history.length}`,
      history,
    );
  }

  if (includesAny(text, BORED_WORDS)) {
    return chooseFresh(
      [
        `Bored is just honesty with no target. Pick a target or admit you wanted attention from the app.`,
        `Nothing to do? False. You have a phone and a talent for delaying the obvious.`,
        `Boredom in this app is suspicious. It usually means you want a small mess with plausible deniability.`,
        person
          ? `Do one tiny chaotic thing: ask ${person} what your vibe has been lately. Then survive the answer.`
          : `Do one tiny chaotic thing: ask for a dare and don't negotiate with it.`,
      ],
      `${text}:${person}:${context.dark_hours_active}:${history.length}`,
      history,
    );
  }

  if (includesAny(text, AFFECTION_WORDS)) {
    return chooseFresh(
      [
        person
          ? `${person} is close enough to this sentence that pretending otherwise feels theatrical.`
          : `Someone is close enough to this sentence that pretending otherwise feels theatrical.`,
        `That is not casual language. Say the smaller version before your friends solve the whole case.`,
        person
          ? `If this is about ${person}, your punctuation already confessed first.`
          : `Your punctuation already confessed first.`,
        `Feelings are annoying because they keep receipts. Yours are organized tonight.`,
      ],
      `${text}:${person}:${history.length}`,
      history,
    );
  }

  if (
    includesAny(text, [
      "should i",
      "do i",
      "can i",
      "what should",
      "should we",
      "do you think i should",
    ])
  ) {
    return chooseFresh(
      [
        `Do it if it makes things clearer. Don't do it if you only want a reaction.`,
        `Send the version you can stand behind tomorrow. Not the version written by panic.`,
        person
          ? `If this is about ${person}, start smaller than your ego wants and more honest than your fear wants.`
          : `Start smaller than your ego wants and more honest than your fear wants.`,
        `The move is probably not dramatic. It is one clean sentence and then letting them answer.`,
      ],
      `${text}:${person}:${context.messages_sent_today}`,
      history,
    );
  }

  if (includesAny(text, ["nice", "cool", "wild", "crazy", "weird"])) {
    return chooseFresh(
      [
        `That word is doing a lot of unpaid labor. Weird how?`,
        `Define that. "Wild" can mean funny, suspicious, or emotionally illegal.`,
        `Interesting. Your shortest messages usually hide the best part.`,
      ],
      `${text}:${topicTrail}:${history.length}`,
      history,
    );
  }

  if (includesAny(text, CASUAL_QUESTION_WORDS)) {
    return chooseFresh(
      [
        `Yes. And before you ask the cleaner version, ask the honest one.`,
        `Depends. Are you trying to solve it, or make it look solved?`,
        person
          ? `The app answer is easy. The human answer probably involves ${person}.`
          : `The app answer is easy. The honest answer is probably less convenient.`,
      ],
      `${text}:${person}:${history.length}`,
      history,
    );
  }

  return null;
}

function conversationalReply(
  context: DarrenUserContext,
  rawMessage: string,
  text: string,
  history: DarrenChatMessage[],
): string {
  const person = casualPersonReference(context, text);
  const previousMessages = recentUserMessages(history);
  const previousUser = compactUserText(previousMessages[previousMessages.length - 2] || "");
  const quoted = compactUserText(rawMessage);
  const topic = topicFromText(text);
  const questionWord = firstQuestionWord(text);

  if (includesAny(text, ["should i", "do i", "can i"])) {
    return chooseFresh(
      [
        `Yes, if it makes the room more honest. No, if it is just you trying to look unbothered.`,
        person
          ? `Ask yourself the ugly version: are you doing it to connect, or to be seen connecting? Then message ${person}.`
          : `Ask yourself the ugly version: are you doing it to connect, or to be seen connecting?`,
        `Do the smaller brave thing first. This app rewards movement, not perfect speeches.`,
      ],
      `${text}:${context.messages_sent_today}`,
      history,
    );
  }

  if (questionWord) {
    return chooseFresh(
      [
        `${questionWord} is the polite version. The real question is who in your circle already knows the answer.`,
        person
          ? `Good question. Slightly too clean. Ask ${person} and make it messier.`
          : `Good question. Slightly too clean. The real version is probably messier.`,
        person
          ? `The answer depends on what you are avoiding. My bet: one message to ${person} would clear half of it.`
          : `The answer depends on what you are avoiding. That part is louder than the question.`,
        `There is a short answer and a true answer. You are probably here for the second one.`,
      ],
      `${questionWord}:${topic}:${person}`,
      history,
    );
  }

  if (includesAny(text, ["i think", "i feel", "i want", "i dont know", "idk"])) {
    return chooseFresh(
      [
        person
          ? `That is closer to honest than usual. Now shorten it and send it to ${person}.`
          : `That is closer to honest than usual. Don't polish it to death.`,
        `There it is. Not polished, but real. Real usually works better here.`,
        `Hold that thought. It has more signal than your usual disappearing act.`,
        `Good. That sounded less performed. Keep going.`,
      ],
      `${text}:${previousUser}:${person}`,
      history,
    );
  }

  if (previousUser && previousUser !== quoted) {
    return chooseFresh(
      [
        `Now we are circling from "${previousUser}" to "${quoted}". Pattern noticed. What are you actually trying not to say?`,
        `That connects to what you said before. The honest version is getting louder.`,
        person
          ? `Second signal in a row. Stop giving Darren fragments and give ${person} one sentence.`
          : `Second signal in a row. Stop giving Darren fragments and name the thing.`,
        `You are building a case without naming the crime. Very human. Mildly inefficient.`,
      ],
      `${previousUser}:${quoted}:${person}`,
      history,
    );
  }

  if (topic) {
    return chooseFresh(
      [
        `${topic} is the word doing the work there. Everything else is decoration.`,
        `Noted: ${topic}. That is either nothing, or exactly the thing your friends would tease you about.`,
        `${topic} on the board. Small word, suspicious amount of energy behind it.`,
        `There is something under ${topic}. Keep it there if you want, but it is already showing.`,
      ],
      `${context.username}:${topic}:${history.length}`,
      history,
    );
  }

  return chooseFresh(
    [
      person
        ? `Heard. Vague, but not empty. Give me one more detail or give ${person} the honest version.`
        : `Heard. Vague, but not empty. Give me one more detail.`,
      `That landed like a half-confession. Very on brand. Continue.`,
      `The room got quieter after that. Interesting choice.`,
      `Could be nothing. Could be the thing you bring up three days late. Say more.`,
      `Okay. That had a tone. Not sure you meant to include it, but you did.`,
    ],
    `${context.username}:${text}:${history.length}`,
    history,
  );
}

function friendReply(context: DarrenUserContext, text: string): string {
  const friend = primaryFriend(context, text);
  if (
    context.friend_least_interacted &&
    includesAny(text, ["least", "ignore", "ignored"])
  ) {
    return `${context.friend_least_interacted} has been the quiet edge of your circle. Quiet does not always mean nothing.`;
  }
  if (context.friend_activity_tonight.includes(friend)) {
    return `${friend} is active tonight. Convenient. Stop performing mystery and say the thing.`;
  }
  return `${friend} is the name closest to the surface. If you want movement, start there.`;
}

function statusReply(context: DarrenUserContext): string {
  if (context.dark_hours_active && context.exposed_tonight) {
    return "Dark Hours active. Dare record does not look flattering.";
  }
  if (context.dare_streak > 0) {
    return `${context.dare_streak} day streak, ${context.messages_sent_today} messages sent today. Not boring.`;
  }
  return `${context.messages_sent_today} messages sent today, no dare streak on record. That's the board.`;
}

export function generateLocalDarrenReply(params: {
  context: DarrenBrainContextInput;
  userMessage: string;
  history: DarrenChatMessage[];
}): { reply: string; context: DarrenUserContext; source: "local" } {
  const context = createDarrenBrainContext(params.context);
  const text = cleanUserText(params.userMessage);
  const previousUser = cleanUserText(lastUserMessage(params.history));

  let reply = "";
  if (!text) reply = openerReply(context);
  else if (
    includesAny(text, ["who are you", "what are you", "are you ai", "are you real"])
  ) {
    reply =
      "Darren. I live in the app. I'm not your friend, your friends are. I'm the one making sure you actually talk to them.";
  } else if (includesAny(text, ["thanks", "thank you", "thx"])) {
    reply = chooseFresh(
      [
        "Keep the gratitude. Spend the honesty somewhere useful later.",
        "Accepted. Briefly. Don't make me sentimental.",
        "You're welcome. Weirdly polite of you. Suspicious, but welcome.",
      ],
      `${text}:${context.username}:${params.history.length}`,
      params.history,
    );
  } else if (
    includesAny(text, ["done", "completed", "i did it"]) &&
    previousUser.includes("dare")
  ) {
    reply = "Good. Tiny miracle. Now tell the actual person, not just the app.";
  } else if (
    includesAny(text, [
      "sad",
      "lonely",
      "anxious",
      "scared",
      "upset",
      "cry",
      "depressed",
      "bad",
      "heavy",
      "hurt",
    ])
  ) {
    reply = emotionalReply(context, text);
  } else if (includesAny(text, ["pardon", "cover me", "save me", "protect me"])) {
    reply = context.darren_pardon_used_this_week
      ? "You already used it this week. No second shield. Own tonight."
      : "Fine. I'll cover for you tonight. But just tonight. [Pardon granted - dark hours protection active]";
  } else if (includesAny(text, ["hi", "hello", "hey", "yo"])) {
    reply = greetingReply(context, text, params.history);
  } else {
    const casualReply = casualHumanReply(
      context,
      params.userMessage,
      text,
      params.history,
    );
    if (casualReply) {
      reply = casualReply;
    }
  }

  if (reply) {
    return { reply, context, source: "local" };
  }

  if (includesAny(text, ["truth", "question", "ask"])) {
    reply = truthReply(context, text);
  } else if (includesAny(text, ["dare", "challenge", "task"])) {
    reply = dareReply(context, text);
  } else if (
    includesAny(text, [
      "sus",
      "suspicious",
      "profile",
      "viewed",
      "views",
      "likes",
      "stalking",
      "watching",
    ])
  ) {
    reply = susReply(context);
  } else if (includesAny(text, ["daily", "match", "match hour", "picked"])) {
    reply = dailyReply(context, text);
  } else if (
    includesAny(text, ["friend", "talk", "message", "say", "text", "who should"])
  ) {
    reply = friendReply(context, text);
  } else if (
    includesAny(text, ["status", "report", "update", "what happened", "missed", "tonight"])
  ) {
    reply = statusReply(context);
  } else if (includesAny(text, ["roast", "judge me", "be honest"])) {
    reply =
      context.dare_streak > 0
        ? `${context.dare_streak} day streak and still asking the app to validate you. Progress, but funny.`
        : "No streak and you're asking to be judged. Brave, or just bored. Hard to tell.";
  } else {
    reply = conversationalReply(context, params.userMessage, text, params.history);
  }

  return { reply, context, source: "local" };
}
