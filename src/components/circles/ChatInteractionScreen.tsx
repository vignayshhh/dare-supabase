'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { circleChatService, type CircleChatMessage } from '@/middleware/services/circle-chat.service';
import { apiFetch } from '@/lib/apiClient';
import { CHAT_KINDS, type ChatSource } from '@/lib/chatContext';
import { usePredictionStore, type PredictionPost } from '@/stores/usePredictionStore';
import { useDealStore, type DealPost } from '@/stores/useDealStore';
import { useDramaStore, type PromisePost } from '@/stores/useDramaStore';
import { PredictionFeedScreen } from '../screens/PredictionFeedScreen';
import { ChatSourceQuote } from './CircleChatScreen';

export function ChatInteractionScreen({ message, onBack, onOpenChallenge }: {
  message: CircleChatMessage; onBack: () => void; onOpenChallenge: (message: CircleChatMessage, source: ChatSource | null) => void | Promise<void>;
}) {
  const [source, setSource] = useState<ChatSource | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const kind = message.interaction_kind!;
  useEffect(() => {
    let alive = true;
    setLoaded(false); setError('');
    const load = async () => {
      try {
        const original = message.source_message_id ? await circleChatService.source(message.source_message_id) : null;
        if (!alive) return;
        setSource(original);
        if (['prediction', 'deal', 'promise'].includes(kind)) {
          const data = await apiFetch<{ predictions: PredictionPost[]; deals: DealPost[]; promises: PromisePost[] }>(`/api/drama/feed?id=${message.interaction_id}`);
          if (!alive) return;
          if (![...data.predictions, ...data.deals, ...data.promises].length) throw new Error('This interaction is no longer available.');
          if (data.predictions.length) usePredictionStore.setState(state => ({ predictions: [...data.predictions, ...state.predictions.filter(p => p.id !== message.interaction_id)] }));
          if (data.deals.length) useDealStore.setState(state => ({ deals: [...data.deals, ...state.deals.filter(p => p.id !== message.interaction_id)] }));
          if (data.promises.length) useDramaStore.setState(state => ({ promises: [...data.promises, ...state.promises.filter(p => p.id !== message.interaction_id)] }));
        }
        setLoaded(true);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Could not open interaction'); }
    };
    void load();
    return () => { alive = false; };
  }, [message, kind, retry]);
  return <section className="circle-chat-screen">
    <header className="circle-chat-header"><button aria-label="Back to Circle chat" onClick={onBack}><ArrowLeft size={22} /></button><h1>{CHAT_KINDS[kind].label}</h1></header>
    {source && <ChatSourceQuote source={source} />}
    {error && <p role="alert" className="chat-error">{error}<button onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
    {!loaded && !error && <p className="chat-empty">Opening the receipts…</p>}
    {loaded && (kind === 'dare' || kind === 'truth') && <div className="p-5"><h2 className="text-xl font-bold">{message.body}</h2><p className="my-3 text-sm text-zinc-400">Open the original {kind} to respond, submit proof or see its outcome.</p><button className="circles-primary" onClick={() => { void Promise.resolve(onOpenChallenge(message, source)).catch(e => setError(e instanceof Error ? e.message : "Could not open interaction")); }}>Open {CHAT_KINDS[kind].label}</button></div>}
    {loaded && ['prediction', 'deal', 'promise'].includes(kind) && <div className="min-h-0 flex-1 overflow-hidden"><PredictionFeedScreen kind="all" focusId={message.interaction_id!} deadlineReviewOpen={false} onDeadlineReviewOpenChange={() => {}} onDeadlineReviewCountChange={() => {}} /></div>}
  </section>;
}
