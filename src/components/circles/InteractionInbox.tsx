'use client';
import { useAuthStore } from '@/stores/useAuthStore-v2';
import { useDealStore } from '@/stores/useDealStore';
import { useDramaStore } from '@/stores/useDramaStore';
import { InteractionConfirmation } from './InteractionConfirmation';
export function InteractionInbox({ onOpen }: { onOpen?: (kind: string, id: string) => void }) {
  const user = useAuthStore(state => state.user);
  const deals = useDealStore(state => state.deals);
  const promises = useDramaStore(state => state.promises);
  const entries = [
    ...deals.map(post => ({ kind: 'deal', id: post.id, title: post.event, confirmations: post.confirmations })),
    ...promises.map(post => ({ kind: 'promise', id: post.id, title: post.promise, confirmations: post.confirmations })),
  ].filter(post => post.confirmations?.some(item => item.user_id === user?.id && item.status === 'pending'));
  return <>{entries.map(post => <article key={post.id} className="rounded-2xl border border-violet-300/20 bg-violet-300/5 p-4">
    <small className="text-xs font-bold uppercase text-violet-300">{post.kind} · your confirmation</small>
    <button className="my-2 block min-h-11 text-left text-sm font-bold" onClick={() => onOpen?.(post.kind, post.id)}>{post.title}</button>
    <InteractionConfirmation postId={post.id} confirmations={post.confirmations} />
  </article>)}</>;
}
