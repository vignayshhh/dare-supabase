/** Presentation-only grouping: no queries or persisted message changes. */
export type ChatGroupEntry = { sender: string; time?: string | number; standalone?: boolean };
export function joinsChatGroup(previous: ChatGroupEntry | undefined, next: ChatGroupEntry | undefined): boolean {
  if (!previous || !next || previous.standalone || next.standalone || previous.sender !== next.sender) return false;
  const time = (value: string | number | undefined) => typeof value === 'number' ? value : Date.parse(value || '');
  const elapsed = time(next.time) - time(previous.time);
  return elapsed >= 0 && elapsed < 5 * 60_000;
}
const senderColors = ['#4ade80', '#fb7185', '#38bdf8', '#c084fc', '#facc15', '#34d399', '#60a5fa', '#f472b6'];
export function chatSenderColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return senderColors[hash % senderColors.length];
}
