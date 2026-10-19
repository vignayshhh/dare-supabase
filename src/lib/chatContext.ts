import { getActiveCircleId } from './circleContext';

export type ChatInteractionKind = 'dare' | 'truth' | 'prediction' | 'deal' | 'promise' | 'jail';
export interface ChatSource {
  id: string;
  circle_id: string;
  body: string;
  author_name: string;
  author_id: string;
}
let source: ChatSource | null = null;
export const setChatSource = (value: ChatSource | null) => { source = value; };
export const getChatSource = () => source?.circle_id === getActiveCircleId() ? source : null;

export const CHAT_KINDS: Record<ChatInteractionKind, { label: string; color: string; hint: string }> = {
  dare: { label: 'Dare', color: '#fb7185', hint: 'Make them prove it' },
  truth: { label: 'Truth', color: '#38bdf8', hint: 'Get the real answer' },
  prediction: { label: 'Prediction', color: '#c084fc', hint: 'Call it before it happens' },
  deal: { label: 'Deal', color: '#fbbf24', hint: 'Put something on the line' },
  promise: { label: 'Promise', color: '#4ade80', hint: 'Keep the receipts' },
  jail: { label: 'Jail vote', color: '#fb923c', hint: 'Let the Circle decide' },
};
