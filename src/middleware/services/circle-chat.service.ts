import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { ChatInteractionKind, ChatSource } from '@/lib/chatContext';

export interface CircleChatMessage extends ChatSource {
  seq: number;
  created_at: string;
  source_message_id: string | null;
  interaction_kind: ChatInteractionKind | null;
  interaction_id: string | null;
  status: string | null;
  status_until?: string | null;
  delivery?: 'sending' | 'failed';
  /** Development-only visual fixture. Never stored or submitted. */
  demo?: true;
}
const columns = 'id,seq,circle_id,author_id,author_name,body,created_at,source_message_id,interaction_kind,interaction_id,status,status_until';
export const CHAT_PAGE_SIZE = 40;

export function mergeChatMessages(current: CircleChatMessage[], incoming: CircleChatMessage[]) {
  const rows = new Map(current.map(row => [row.id, row]));
  incoming.forEach(row => rows.set(row.id, row));
  return [...rows.values()].sort((a, b) => a.seq - b.seq);
}

export const circleChatService = {
  async topic(circleId: string, knownEpoch?: string) {
    // The Circle list is loaded before ChatList is displayed. Reusing its epoch
    // removes a REST read on every ordinary room entry. A topic rotation still
    // calls this without knownEpoch to obtain the new, membership-safe topic.
    if (knownEpoch) return `circle-chat:${circleId}:${knownEpoch}`;
    const { data, error } = await getSupabaseBrowserClient().from('circles').select('chat_epoch').eq('id', circleId).single();
    if (error || !data) throw error || new Error('Circle unavailable');
    return `circle-chat:${circleId}:${data.chat_epoch}`;
  },
  async page(circleId: string, before?: number): Promise<CircleChatMessage[]> {
    let query = getSupabaseBrowserClient().from('circle_chat_messages').select(columns)
      .eq('circle_id', circleId).order('seq', { ascending: false }).limit(CHAT_PAGE_SIZE);
    if (before !== undefined) query = query.lt('seq', before);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as CircleChatMessage[];
  },
  async source(id: string): Promise<CircleChatMessage> {
    const { data, error } = await getSupabaseBrowserClient().from('circle_chat_messages').select(columns).eq('id', id).single();
    if (error || !data) throw error || new Error('Original message unavailable');
    return data as CircleChatMessage;
  },
  async send(id: string, circleId: string, body: string): Promise<CircleChatMessage> {
    const { data, error } = await getSupabaseBrowserClient().rpc('send_circle_chat', { p_id: id, p_circle: circleId, p_body: body });
    if (error) throw error;
    return data as CircleChatMessage;
  },
};
