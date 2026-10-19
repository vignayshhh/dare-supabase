import { test, expect } from '@playwright/test';
import { joinsChatGroup, chatSenderColor } from '../../src/components/chat/chatPresentation';

test('grouping preserves author, chronological and standalone boundaries', () => {
  const a = { sender: 'a', time: 1_000_000 };
  expect(joinsChatGroup(a, { sender: 'a', time: 1_010_000 })).toBe(true);
  expect(joinsChatGroup(a, { sender: 'b', time: 1_010_000 })).toBe(false);
  expect(joinsChatGroup(a, { sender: 'a', time: 1_300_000 })).toBe(false);
  expect(joinsChatGroup(a, { sender: 'a', time: 999_999 })).toBe(false);
  expect(joinsChatGroup(a, { ...a, standalone: true })).toBe(false);
  expect(joinsChatGroup({ ...a, standalone: true }, a)).toBe(false);
  expect(joinsChatGroup(undefined, a)).toBe(false);
  expect(joinsChatGroup(a, { sender: 'a', time: 'invalid' })).toBe(false);
  expect(chatSenderColor('member-a')).toBe(chatSenderColor('member-a'));
});
