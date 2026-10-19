/* eslint-disable @typescript-eslint/no-require-imports */
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://test.supabase.local';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||= 'test-publishable-key';

const { useFeedStore } = require('../useFeedStore');
const { useDareStore } = require('../useDareStore');
const { useMessagingStore } = require('../useMessagingStore');
const { usePresenceStore } = require('../usePresenceStore');

jest.mock('@/middleware/services/feed.service', () => ({
  feedService: { getFeed: jest.fn(), likePost: jest.fn(), unlikePost: jest.fn() },
}));
jest.mock('@/middleware/services/dare.service', () => ({
  dareService: { getDaresForUser: jest.fn() },
}));
jest.mock('@/middleware/services/messaging.service', () => ({
  messagingService: { getConversationsForUser: jest.fn() },
}));
jest.mock('@/middleware/services/presence.service', () => ({ presenceService: {} }));

describe('current Supabase-backed stores', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useFeedStore.setState({ posts: [], feedEvents: [], loading: false, error: null, hasMore: true, offset: 0 });
    useDareStore.setState({ sentDares: [], receivedDares: [], currentDare: null, loading: false, error: null, creatingDare: false });
    useMessagingStore.setState({ conversations: [], currentConversation: null, messages: [], loading: false, loadingMessages: false, error: null, sendingMessage: false });
    usePresenceStore.setState({ userPresence: null, onlineFriends: [], profileViewers: [], presenceStats: null, onlineUsersNotFriends: [], loading: false, error: null });
  });

  it('starts with empty feed', () => {
    expect(useFeedStore.getState().posts).toEqual([]);
    expect(useFeedStore.getState().unreadCount).toBe(0);
    useFeedStore.setState({ feedEvents: [{ id: 'event-1' }] });
    expect(useFeedStore.getState().feedEvents).toHaveLength(1);
  });

  it('loads feed through current service boundary', async () => {
    const { feedService } = require('@/middleware/services/feed.service');
    feedService.getFeed.mockResolvedValue([{ id: 'post-1' }]);
    await useFeedStore.getState().loadFeed('user-1');
    expect(feedService.getFeed).toHaveBeenCalledWith('user-1', 20, null);
    expect(useFeedStore.getState().posts).toEqual([{ id: 'post-1' }]);
  });

  it('updates like state locally after successful like', async () => {
    const { feedService } = require('@/middleware/services/feed.service');
    feedService.likePost.mockResolvedValue(undefined);
    useFeedStore.setState({ posts: [{ id: 'post-1', likes_count: 2, is_liked_by_user: false }] });
    await useFeedStore.getState().likePost('post-1', 'user-1');
    expect(useFeedStore.getState().posts[0]).toMatchObject({ likes_count: 3, is_liked_by_user: true });
  });

  it('stores dare state by role', () => {
    useDareStore.setState({ sentDares: [{ id: 's', state: 'ACCEPTED' }], receivedDares: [{ id: 'r', state: 'SENT' }] });
    expect(useDareStore.getState().sentDares).toHaveLength(1);
    expect(useDareStore.getState().receivedDares).toHaveLength(1);
  });

  it('loads dares through current service boundary', async () => {
    const { dareService } = require('@/middleware/services/dare.service');
    dareService.getDaresForUser.mockResolvedValue([{ id: 'dare-1', challenger_id: 'user-1', receiver_id: 'user-2', state: 'SENT' }]);
    await useDareStore.getState().loadUserDares('user-1', 'sent');
    expect(dareService.getDaresForUser).toHaveBeenCalledWith('user-1', 'challenger');
    expect(useDareStore.getState().sentDares).toHaveLength(1);
  });

  it('stores messaging conversations and active conversation', () => {
    useMessagingStore.setState({ conversations: [{ unread_count: 2 }, { unread_count: 3 }], currentConversation: { id: 'conversation-1' } });
    expect(useMessagingStore.getState().conversations).toHaveLength(2);
    expect(useMessagingStore.getState().currentConversation.id).toBe('conversation-1');
  });

  it('loads conversations through current service boundary', async () => {
    const { messagingService } = require('@/middleware/services/messaging.service');
    messagingService.getConversationsForUser.mockResolvedValue([]);
    await useMessagingStore.getState().loadConversations('user-1');
    expect(messagingService.getConversationsForUser).toHaveBeenCalledWith('user-1');
    expect(useMessagingStore.getState().conversations).toEqual([]);
  });

  it('keeps presence state local and has no Ghost Mode state', () => {
    usePresenceStore.setState({ onlineFriends: [{ user_id: 'friend-1' }] });
    const state = usePresenceStore.getState();
    expect(state.onlineFriends).toHaveLength(1);
    expect(state).not.toHaveProperty('isGhostMode');
  });
});
