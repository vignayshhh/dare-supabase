'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUpRight, Check, Handshake, HeartHandshake, LockKeyhole, MessageCircle, MoreHorizontal, Send, Sparkles, Target, X } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore-v2';
import { useCirclesStore } from '@/stores/useCirclesStore';
import { CHAT_KINDS, type ChatInteractionKind, type ChatSource } from '@/lib/chatContext';
import type { CircleChatMessage } from '@/middleware/services/circle-chat.service';
import { useCircleChat } from './useCircleChat';
import './circle-chat.css';
import '../chat/chat-presentation.css';
import { joinsChatGroup, chatSenderColor } from '../chat/chatPresentation';
import { useChatViewport } from '../chat/useChatViewport';

const icons = { dare: Target, truth: MessageCircle, prediction: Sparkles, deal: Handshake, promise: HeartHandshake, jail: LockKeyhole };

export function CircleChatEntry({ onClick }: { onClick: () => void }) {
  const circle = useCirclesStore(state => state.circles.find(item => item.id === state.activeId));
  if (!circle) return null;
  return <button className="circle-chat-entry" onClick={onClick}>
    <span className="circle-chat-entry-avatar">{circle.avatar}</span>
    <span><strong>{circle.name}</strong><small>Group chat · where the lore starts</small></span>
    <ArrowUpRight size={19} />
  </button>;
}

export function ChatSourceQuote({ source }: { source: ChatSource }) {
  return <blockquote className="chat-source-quote"><small>Started with {source.author_name}</small><p>{source.body}</p></blockquote>;
}

function Message({ message, mine, onCreate, onOpen, onRetry, joinedBefore, joinedAfter }: {
  message: CircleChatMessage; mine: boolean; onCreate: (source: ChatSource) => void;
  onOpen: (message: CircleChatMessage) => void; onRetry: () => void;
  joinedBefore: boolean; joinedAfter: boolean;
}) {
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const interactive = !message.delivery && !message.demo;
  const cancel = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  useEffect(() => cancel, []);
  const start = (event: PointerEvent) => {
    if (event.button !== 0 || !interactive) return;
    origin.current = { x: event.clientX, y: event.clientY };
    held.current = false;
    cancel();
    hold.current = setTimeout(() => { held.current = true; onCreate(message); hold.current = null; }, 430);
  };
  const kind = message.interaction_kind;
  const elapsed = message.status_until && new Date(message.status_until).getTime() <= Date.now();
  const status = elapsed && kind === 'jail' && message.status === 'jailed' ? 'released'
    : elapsed && ['open', 'confirmed'].includes(message.status || '') ? (kind === 'jail' ? 'voting closed' : 'awaiting outcome')
    : (message.status || 'open').replaceAll('_', ' ').toLowerCase();
  const Icon = kind ? icons[kind] : null;
  return <article data-circle-message-id={message.id} className={`circle-chat-message ${mine ? 'is-mine' : ''} ${joinedBefore ? 'is-joined-before' : ''} ${joinedAfter ? 'is-joined-after' : ''}`}>
    {!mine && !joinedBefore && <small className="chat-author" style={{ color: chatSenderColor(message.author_id) }}>{message.author_name}</small>}
    <div className="chat-message-line">
      <div className="chat-bubble" tabIndex={interactive && !kind ? 0 : undefined} role={interactive && !kind ? 'button' : undefined}
        aria-label={interactive && !kind ? `Message from ${message.author_name}: ${message.body}. Open actions` : undefined}
        onKeyDown={event => { if (interactive && !kind && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onCreate(message); } }}
        onPointerDown={start} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
        onPointerMove={event => { if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 9) cancel(); }}
        onContextMenu={event => { event.preventDefault(); if (interactive) onCreate(message); }}>
        {kind && Icon ? <button className="chat-interaction-card" style={{ '--chat-accent': CHAT_KINDS[kind].color } as CSSProperties} onClick={() => { if (!message.demo && !held.current) onOpen(message); held.current = false; }}>
          <span className="chat-card-type"><Icon size={17} />{CHAT_KINDS[kind].label}<ArrowUpRight size={16} /></span>
          <strong>{message.body}</strong>
          <span className="chat-card-status"><span />{status}</span>
          <small>From a message · tap to open</small>
        </button> : <p>{message.body}</p>}
      </div>
      {interactive && !joinedAfter && <button className="chat-more" aria-label={`Create interaction from ${message.author_name}'s message`} onClick={() => onCreate(message)}><MoreHorizontal size={17} /></button>}
    </div>
    {(!joinedAfter || message.delivery) && <small className="chat-time">{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      {message.delivery === 'sending' ? ' · sending' : mine && !message.delivery && <Check size={11} />}
      {message.delivery === 'failed' && <button onClick={onRetry}>Not sent · Retry</button>}
    </small>}
  </article>;
}

function InteractionPicker({ source, onClose, onSelect }: { source: ChatSource; onClose: () => void; onSelect: (kind: ChatInteractionKind) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="chat-picker" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="chat-picker-content">
      <div className="chat-picker-grip" />
      <header><div><small>FAMOUS LAST WORDS?</small><h2>Make it a thing.</h2></div><button aria-label="Close" onClick={onClose}><X size={21} /></button></header>
      <ChatSourceQuote source={source} />
      <div className="chat-picker-options">{(Object.keys(CHAT_KINDS) as ChatInteractionKind[]).map(kind => {
        const Icon = icons[kind]; const meta = CHAT_KINDS[kind];
        return <button key={kind} style={{ '--chat-accent': meta.color } as CSSProperties} onClick={() => onSelect(kind)}>
          <span><Icon size={22} /></span><strong>{meta.label}</strong><small>{meta.hint}</small>
        </button>;
      })}</div>
      <p className="chat-picker-footnote">Same Dare rules. This message stays attached.</p>
    </div>
  </dialog>;
}

export function CircleChatScreen({ onBack, onCreate, onOpen }: {
  onBack: () => void; onCreate: (kind: ChatInteractionKind, source: ChatSource) => void;
  onOpen: (message: CircleChatMessage) => void;
}) {
  const user = useAuthStore(state => state.user);
  const circle = useCirclesStore(state => state.circles.find(item => item.id === state.activeId));
  if (!user || !circle) return null;
  return <CircleChatRoom key={`${user.id}:${circle.id}:${circle.chatEpoch}`} circle={circle} user={{ id: user.id, name: user.displayName || user.username || 'You' }} onBack={onBack} onCreate={onCreate} onOpen={onOpen} />;
}

function CircleChatRoom({ circle, user, onBack, onCreate, onOpen }: {
  circle: { id: string; name: string; avatar: string; chatEpoch: string }; user: { id: string; name: string };
  onBack: () => void; onCreate: (kind: ChatInteractionKind, source: ChatSource) => void; onOpen: (message: CircleChatMessage) => void;
}) {
  const chat = useCircleChat(circle.id, user.id, user.name, circle.chatEpoch);
  const messages = chat.messages;
  const viewport = useChatViewport<HTMLElement>();
  const [text, setText] = useState('');
  const composerInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const input = composerInput.current;
    if (input) { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 112)}px`; }
  }, [text]);
  const [source, setSource] = useState<ChatSource | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const feed = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') tick(value => value + 1); }, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const scrollBottom = () => { const el = feed.current; if (el) el.scrollTop = el.scrollHeight; nearBottom.current = true; setAtBottom(true); };
  useEffect(() => { if (nearBottom.current) scrollBottom(); }, [chat.messages]);
  const submit = () => { if (!text.trim()) return; void chat.send(text); setText(''); nearBottom.current = true; };
  const older = async () => {
    const el = feed.current; const height = el?.scrollHeight || 0; const top = el?.scrollTop || 0;
    // Grouping can remove a sender label at the history boundary. Anchor the
    // visible bubble itself rather than assuming the total height delta matches.
    const anchor = el && Array.from(el.querySelectorAll<HTMLElement>('.chat-bubble'))
      .find(bubble => bubble.getBoundingClientRect().bottom >= el.getBoundingClientRect().top);
    const anchorTop = anchor?.getBoundingClientRect().top;
    nearBottom.current = false;
    await chat.older();
    requestAnimationFrame(() => {
      if (!el) return;
      el.scrollTop = anchor?.isConnected && anchorTop !== undefined
        ? el.scrollTop + anchor.getBoundingClientRect().top - anchorTop
        : top + el.scrollHeight - height;
    });
  };
  const groupEntry = (message?: CircleChatMessage) => message ? { sender: message.author_id, time: message.created_at, standalone: Boolean(message.interaction_kind || message.delivery) } : undefined;
  return <section ref={viewport} className="circle-chat-screen dare-chat chat-viewport" style={{ '--chat-accent': '#c084fc' } as CSSProperties}>
    <header className="circle-chat-header"><button aria-label="Back to chats" onClick={onBack}><ArrowLeft size={22} /></button>
      <span className="chat-room-avatar">{circle.avatar}</span><div><h1>{circle.name}</h1><small><span className={`chat-connection ${chat.connected ? 'is-connected' : ''}`} aria-label={chat.connected ? 'Connected' : 'Disconnected'} />{chat.connected ? 'Your private Circle' : 'Connecting…'}</small></div>
    </header>
    {chat.error && <div className="chat-error" role="alert">{chat.error}<button onClick={chat.retry}>Retry</button></div>}
    <div className="circle-chat-feed" ref={feed} role="log" aria-label="Circle messages" aria-live="polite" aria-relevant="additions" onScroll={() => {
      const el = feed.current; if (!el) return;
      nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
      setAtBottom(nearBottom.current);
    }}>
      {chat.hasOlder && <button className="chat-load-older" disabled={chat.loadingOlder} onClick={() => void older()}>{chat.loadingOlder ? 'Loading…' : 'Earlier lore'}</button>}
      {chat.loading && <p className="chat-empty">Finding the group chat…</p>}
      {!chat.loading && !messages.length && !chat.error && <div className="chat-empty"><span>{circle.avatar}</span><h2>The lore starts here.</h2><p>Drop a message. Hold it to make a dare,<br />a prediction, a deal. You know the crew.</p></div>}
      {messages.map((message, index) => <Message key={message.id} message={message} mine={message.author_id === user.id}
        joinedBefore={joinsChatGroup(groupEntry(messages[index - 1]), groupEntry(message))}
        joinedAfter={joinsChatGroup(groupEntry(message), groupEntry(messages[index + 1]))}
        onCreate={setSource} onOpen={onOpen} onRetry={() => void chat.send(message.body, message.id)} />)}
    </div>
    {!atBottom && <button className="chat-jump" onClick={scrollBottom}><ArrowDown size={15} />Latest messages</button>}
    <form className="circle-chat-composer" onSubmit={event => { event.preventDefault(); submit(); }}>
      <textarea ref={composerInput} className="chat-compose-input" aria-label="Message your Circle" placeholder="Message your Circle…" value={text} maxLength={2000} rows={1} onChange={event => setText(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.ctrlKey) { event.preventDefault(); submit(); }
      }} />
      <button aria-label="Send message" disabled={!text.trim()} type="submit"><Send size={20} /></button>
      <small>Hold a message. Start something.</small>
    </form>
    {source && <InteractionPicker source={source} onClose={() => setSource(null)} onSelect={kind => { setSource(null); onCreate(kind, source); }} />}
  </section>;
}
