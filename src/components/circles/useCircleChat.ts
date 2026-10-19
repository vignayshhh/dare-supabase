import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { circleChatService, CHAT_PAGE_SIZE, mergeChatMessages, type CircleChatMessage } from '@/middleware/services/circle-chat.service';
import { createUuid } from '@/utils/uuid';

export function useCircleChat(circleId: string, userId: string, name: string, chatEpoch?: string) {
  const [messages, setMessages] = useState<CircleChatMessage[]>([]);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(new Set<string>());
  const [retryKey, setRetryKey] = useState(0);
  const retry = () => setRetryKey(value => value + 1);

  useEffect(() => {
    const version = ++generation.current;
    let disposed = false;
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>['channel']> | undefined;
    let opening = false;
    const client = getSupabaseBrowserClient();
    setMessages(rows => rows.filter(row => row.delivery && row.circle_id === circleId && row.author_id === userId));
    setLoading(true);
    setError('');
    const close = () => {
      setConnected(false);
      if (channel) { void client.removeChannel(channel); channel = undefined; }
    };
    const open = async (refreshTopic = false) => {
      if (opening || disposed || document.visibilityState === 'hidden') return;
      opening = true;
      close();
      try {
        const topic = await circleChatService.topic(circleId, refreshTopic ? undefined : chatEpoch);
        await client.realtime.setAuth();
        if (disposed || document.hidden) return;
        const next = client.channel(topic, { config: { private: true } });
        let hydrating = false;
        let buffered: CircleChatMessage[] = [];
        const statuses = new Map<string, { status: string; status_until: string | null }>();
        channel = next;
        next.on('broadcast', { event: 'message' }, ({ payload }) => {
          if (!disposed && channel === next && payload.circle_id === circleId) {
            if (hydrating) buffered.push(payload as CircleChatMessage);
            setMessages(rows => mergeChatMessages(rows, [{ ...payload, ...statuses.get(payload.id) } as CircleChatMessage]).slice(-400));
          }
        }).on('broadcast', { event: 'status' }, ({ payload }) => {
          if (disposed || channel !== next) return;
          statuses.set(payload.id, { status: payload.status, status_until: payload.status_until });
          if (statuses.size > 400) statuses.delete(statuses.keys().next().value!);
          setMessages(rows => rows.map(row => row.id === payload.id ? { ...row, status: payload.status, status_until: payload.status_until } : row));
        }).on('broadcast', { event: 'rotate' }, () => { void open(true); })
          .subscribe(async status => {
            if (disposed || channel !== next) return;
            setConnected(status === 'SUBSCRIBED');
            if (status === 'SUBSCRIBED') {
              hydrating = true;
              buffered = [];
              // Subscribe before snapshot: messages sent during hydration are merged by UUID.
              try {
                const rows = await circleChatService.page(circleId);
                if (disposed || channel !== next) return;
                const snapshot = mergeChatMessages(rows, buffered).map(row => ({ ...row, ...statuses.get(row.id) }));
                setMessages(current => mergeChatMessages(current.filter(row => row.delivery), snapshot));
                setHasOlder(rows.length === CHAT_PAGE_SIZE);
                setError('');
              } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : 'Could not load chat'); }
              finally { hydrating = false; if (!disposed) setLoading(false); }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              setLoading(false);
              setError('Connection interrupted. Tap retry to reconnect.');
            }
          });
      } catch (e) {
        if (!disposed) { setError(e instanceof Error ? e.message : 'Circle unavailable'); setLoading(false); setMessages([]); }
      } finally { opening = false; }
    };
    const visibility = () => { if (document.visibilityState === 'hidden') close(); else void open(); };
    const online = () => { void open(); };
    void open();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', online);
    return () => {
      disposed = true;
      if (generation.current === version) generation.current++;
      close();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', online);
    };
  }, [circleId, userId, retryKey, chatEpoch]);

  const send = useCallback(async (body: string, retryId?: string) => {
    const text = body.trim();
    if (!text || text.length > 2000) return;
    const id = retryId || createUuid();
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    const version = generation.current;
    const optimistic: CircleChatMessage = { id, circle_id: circleId, author_id: userId, author_name: name, body: text,
      seq: Number.MAX_SAFE_INTEGER, created_at: new Date().toISOString(), source_message_id: null,
      interaction_kind: null, interaction_id: null, status: null, delivery: 'sending' };
    setMessages(rows => mergeChatMessages(rows, [optimistic]));
    try {
      const row = await circleChatService.send(id, circleId, text);
      if (version === generation.current) setMessages(rows => mergeChatMessages(rows, [row]));
    } catch {
      if (version === generation.current) setMessages(rows => rows.map(row => row.id === id && row.delivery ? { ...row, delivery: 'failed' } : row));
    } finally { inFlight.current.delete(id); }
  }, [circleId, userId, name]);

  const older = async () => {
    if (loadingOlder) return;
    const first = messages.find(row => !row.delivery);
    if (!first) return;
    const version = generation.current;
    setLoadingOlder(true);
    try {
      const rows = await circleChatService.page(circleId, first.seq);
      if (version !== generation.current) return;
      setMessages(current => mergeChatMessages(current, rows));
      setHasOlder(rows.length === CHAT_PAGE_SIZE);
    } catch { setError('Could not load older messages. Try again.'); }
    finally { setLoadingOlder(false); }
  };
  return { messages, send, error, connected, loading, hasOlder, loadingOlder, older, retry };
}
