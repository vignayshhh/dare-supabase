'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, LockKeyhole, Plus } from 'lucide-react';
import { useCirclesStore } from '@/stores/useCirclesStore';
import { useAuthStore } from '@/stores/useAuthStore-v2';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { createUuid } from '@/utils/uuid';
import type { ChatSource } from '@/lib/chatContext';
import { ChatSourceQuote } from './CircleChatScreen';
import './circle-chat.css';
import { InteractionReceipt } from './InteractionReceipt';
import { CourtStickman } from '../court/CourtStickman';
import { circleChatService } from '@/middleware/services/circle-chat.service';

type JailCase = { id: string; target_id: string; reason: string; source_message_id: string | null; status: 'open' | 'jailed' | 'dismissed'; votes: Record<string, boolean>; eligible_ids: string[]; closes_at: string; sentenced_until: string | null };
export function CircleJailVotesScreen({ onBack, source, initialId }: { onBack: () => void; source?: ChatSource | null; initialId?: string }) {
  const circle = useCirclesStore(state => state.circles.find(c => c.id === state.activeId));
  const user = useAuthStore(state => state.user);
  const [cases, setCases] = useState<JailCase[]>([]);
  const [create, setCreate] = useState(Boolean(source));
  const [target, setTarget] = useState(source?.author_id !== user?.id ? source?.author_id || '' : '');
  const [reason, setReason] = useState(source?.body.slice(0, 280) || '');
  const [requestId, setRequestId] = useState(createUuid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  const load = useCallback(async () => {
    if (!circle) return;
    const { data, error } = await getSupabaseBrowserClient().from('circle_jail_cases').select('*').eq('circle_id', circle.id).order('created_at', { ascending: false }).limit(40);
    if (error) { setError(error.message); return; }
    const rows = (data || []) as JailCase[];
    if (initialId && !rows.some(row => row.id === initialId)) {
      const result = await getSupabaseBrowserClient().from('circle_jail_cases').select('*').eq('id', initialId).single();
      if (result.data) rows.unshift(result.data as JailCase);
    }
    setCases(rows.sort((a, b) => Number(b.id === initialId) - Number(a.id === initialId)));
  }, [circle, initialId]);
  useEffect(() => {
    if (!circle) return;
    let disposed = false;
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>['channel']> | undefined;
    const client = getSupabaseBrowserClient();
    const close = () => { if (channel) { void client.removeChannel(channel); channel = undefined; } };
    const open = async () => {
      close();
      try {
        const topic = await circleChatService.topic(circle.id);
        await client.realtime.setAuth();
        if (disposed || document.visibilityState === 'hidden') return;
        channel = client.channel(topic, { config: { private: true } })
          .on('broadcast', { event: 'jail' }, ({ payload }) => {
            if (disposed) return;
            const item = payload.case as JailCase;
            setCases(rows => rows.some(row => row.id === item.id) ? rows.map(row => row.id === item.id ? item : row) : [item, ...rows].slice(0, 40));
          }).on('broadcast', { event: 'rotate' }, () => { void open(); })
          .subscribe(status => { if (status === 'SUBSCRIBED' && !disposed) void load(); });
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : 'Circle unavailable'); }
    };
    const visibility = () => { if (document.visibilityState === 'hidden') close(); else void open(); };
    void open(); document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; close(); document.removeEventListener('visibilitychange', visibility); };
  }, [circle, load]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const act = async (fn: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); } finally { setBusy(false); }
  };
  const vote = async (id: string, guilty: boolean | null) => {
    const { data, error } = await getSupabaseBrowserClient().rpc('vote_circle_jail_case', { p_case: id, p_guilty: guilty });
    if (error) throw new Error(error.message);
    setCases(rows => rows.map(row => row.id === id ? data as JailCase : row));
  };
  if (!circle || !user) return null;
  return <section className="circle-chat-screen"><header className="circle-chat-header"><button aria-label="Back" onClick={onBack}><ArrowLeft /></button><div><h1>Circle Jail</h1><small>The group chat has consequences.</small></div><button aria-label="Open a Jail vote" onClick={() => { setCreate(true); setRequestId(createUuid()); }}><Plus /></button></header>
    <div className="circle-chat-feed">
      {error && <p role="alert" className="chat-error">{error}</p>}
      {create && <form className="jail-case-form" onSubmit={event => { event.preventDefault(); void act(async () => {
        const { data, error } = await getSupabaseBrowserClient().rpc('create_circle_jail_case', { p_id: requestId, p_circle: circle.id, p_target: target, p_reason: reason, p_source: source?.id || null });
        if (error) throw new Error(error.message);
        setCases(rows => [data as JailCase, ...rows.filter(row => row.id !== data.id)]); setCreate(false);
      }); }}>
        <h2>Take it to the Circle.</h2>{source && <ChatSourceQuote source={source} />}
        <label>Who’s on trial?<select required value={target} onChange={event => setTarget(event.target.value)}><option value="">Choose a member</option>{circle.members.filter(m => m.id !== user.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label>The charge<textarea required maxLength={280} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <p>24 hours to vote. More than half the Circle must vote guilty. Ties dismiss the case. A guilty verdict means a 6-hour social Jail sentence.</p>
        <button className="circles-primary" disabled={busy || !target || !reason.trim()}>Open Jail vote</button><button type="button" onClick={() => setCreate(false)}>Cancel</button>
      </form>}
      {!cases.length && !create && <div className="chat-empty"><LockKeyhole size={38} className="mx-auto" /><h2>No charges. Yet.</h2><p>Start a vote here or hold a message in your Circle chat.</p></div>}
      {cases.map(item => {
        const expired = new Date(item.closes_at).getTime() <= now;
        const released = item.status === 'jailed' && new Date(item.sentenced_until!).getTime() <= now;
        const mine = item.votes[user.id];
        const yes = Object.values(item.votes).filter(Boolean).length;
        return <article className="jail-case" key={item.id}><span className="jail-case-label"><LockKeyhole size={15} />{released ? 'Released' : item.status === 'open' && expired ? 'Voting closed' : item.status}</span>
          <InteractionReceipt id={item.id} table="circle_jail_cases" /><h2>{circle.members.find(m => m.id === item.target_id)?.name || 'Circle member'}</h2><p>{item.reason}</p>
          <small>{yes} guilty · {Object.keys(item.votes).length - yes} not guilty · {item.eligible_ids.length} eligible</small>
          {item.status === 'open' && !expired && <div className="jail-vote-actions"><button disabled={busy || !item.eligible_ids.includes(user.id)} aria-pressed={mine === true} onClick={() => void act(() => vote(item.id, true))}>Guilty</button><button disabled={busy || !item.eligible_ids.includes(user.id)} aria-pressed={mine === false} onClick={() => void act(() => vote(item.id, false))}>Let them live</button></div>}
          {item.status === 'open' && expired && <button disabled={busy} onClick={() => void act(() => vote(item.id, null))}>Reveal verdict</button>}
          {item.status === 'jailed' && !released && <p className="jail-sentence">Behind bars until {new Date(item.sentenced_until!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. The Circle keeps the receipt.</p>}
          {item.status === 'jailed' && !released && <div className="chat-jail-cell" aria-label="Serving a six-hour Circle Jail sentence"><CourtStickman name={circle.members.find(m => m.id === item.target_id)?.name || 'Circle member'} avatarUrl={circle.members.find(m => m.id === item.target_id)?.avatar} size={48} role="doing time" defeated /><div className="chat-jail-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div></div>}
        </article>;
      })}
      <button className="chat-load-older" onClick={() => void load()}>Refresh votes</button>
    </div></section>;
}
