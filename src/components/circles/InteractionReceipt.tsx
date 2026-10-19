'use client';
import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { ChatSource } from '@/lib/chatContext';
import { ChatSourceQuote } from './CircleChatScreen';

/** Fetch only on intent. Feed cards never add a per-card source read. */
export function InteractionReceipt({ id, table }: { id: string; table: 'dares' | 'truths' | 'drama_posts' | 'circle_jail_cases' }) {
  const [source, setSource] = useState<ChatSource | null>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = async () => {
    setOpen(!open);
    if (loaded || busy) return;
    setBusy(true); setError('');
    const { data, error } = await getSupabaseBrowserClient().from(table)
      .select('source:circle_chat_messages!source_message_id(id,circle_id,body,author_id,author_name)').eq('id', id).single();
    if (error) setError('Could not load the original message. Tap to retry.');
    else { setSource((data as unknown as { source: ChatSource | null }).source); setLoaded(true); }
    setBusy(false);
  };
  if (id.startsWith('local-')) return null;
  return <div className="relative z-10 shrink-0 text-left">
    <button className="flex min-h-9 items-center gap-1.5 px-2 text-[11px] text-violet-300" onClick={() => void toggle()} aria-expanded={open}><MessageCircle size={13} />{busy ? 'Finding receipts…' : 'Message context'}</button>
    {open && (error ? <p role="alert" className="text-xs text-rose-300">{error}</p> : source ? <ChatSourceQuote source={source} /> : loaded ? <p className="px-2 text-xs text-zinc-400">Created directly in Dare.</p> : null)}
  </div>;
}
