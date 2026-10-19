'use client';
import { useState } from 'react';
import { useAuthStore } from '@/stores/useAuthStore-v2';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { loadDramaFeed } from '@/stores/dramaBackend';
export type InteractionConfirmationState = { user_id: string; status: 'pending' | 'accepted' | 'declined' };
export function InteractionConfirmation({ postId, confirmations = [] }: { postId: string; confirmations?: InteractionConfirmationState[] }) {
  const user = useAuthStore(state => state.user);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!confirmations.length) return null;
  const own = confirmations.find(item => item.user_id === user?.id);
  const declined = confirmations.some(item => item.status === 'declined');
  const pending = confirmations.filter(item => item.status === 'pending').length;
  const confirm = async (accept: boolean) => {
    if (busy) return; setBusy(true); setError('');
    try {
      const { error } = await getSupabaseBrowserClient().rpc('confirm_drama_participation', { p_post: postId, p_accept: accept });
      if (error) throw new Error(error.message);
      await loadDramaFeed(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not confirm'); }
    finally { setBusy(false); }
  };
  return <div className="relative z-10 mb-3 shrink-0 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-300">
    <p>{declined ? 'Declined · this agreement cannot resolve' : pending ? `Waiting on ${pending} confirmation${pending === 1 ? '' : 's'}` : 'Everyone confirmed. It’s on.'}</p>
    {own?.status === 'pending' && <div className="mt-2 flex gap-2"><button className="min-h-11 flex-1 rounded-xl bg-emerald-300 px-3 font-bold text-black" disabled={busy} onClick={() => void confirm(true)}>I’m in</button><button className="min-h-11 flex-1 rounded-xl bg-white/10 px-3" disabled={busy} onClick={() => void confirm(false)}>Pass</button></div>}
    {error && <p role="alert" className="mt-2 text-rose-300">{error}</p>}
  </div>;
}
