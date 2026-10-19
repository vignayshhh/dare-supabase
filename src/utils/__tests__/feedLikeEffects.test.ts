import { createFeedLikeFeedback, feedHeartColor, FEED_HEART_PALETTE, likeDanceVariant } from "../feedLikeEffects";

describe("feed multi-like feedback", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    jest.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it("alternates the original groove and new shuffle at successive 50-like milestones", () => {
    expect([50, 100, 150, 200, 250, 300].map(likeDanceVariant)).toEqual([
      "groove", "shuffle", "groove", "shuffle", "groove", "shuffle",
    ]);
  });

  it("keeps the default for the first 14 likes, then blends into wine red", () => {
    expect(feedHeartColor(1)).toBe(FEED_HEART_PALETTE[0]);
    expect(feedHeartColor(14)).toBe(FEED_HEART_PALETTE[0]);
    expect(feedHeartColor(15)).not.toBe(feedHeartColor(14));
    expect(feedHeartColor(15)).not.toBe(FEED_HEART_PALETTE[1]);
    expect(feedHeartColor(19)).toBe(FEED_HEART_PALETTE[1]);
    expect(feedHeartColor(29)).toBe(FEED_HEART_PALETTE[1]);
  });

  it("returns to default after the whole palette and starts a new cycle", () => {
    expect(feedHeartColor(94)).toBe(FEED_HEART_PALETTE[0]);
    expect(feedHeartColor(109)).toBe(FEED_HEART_PALETTE[1]);
  });

  it("visits every distinct accent in order before returning to default", () => {
    const expected = ["#ff3b6b", "#9f3455", "#c084fc", "#38bdf8", "#4ade80", "#facc15"];
    for (let stage = 0; stage < expected.length * 2; stage++) {
      const settledTap = stage * 15 + 4;
      expect(feedHeartColor(settledTap)).toBe(expected[stage % expected.length]);
      expect(feedHeartColor(stage * 15 + 14)).toBe(expected[stage % expected.length]);
    }
    for (let tap = 15; tap < 90; tap++) {
      expect(feedHeartColor(tap)).not.toBe(expected[0]);
    }
  });

  it("bounds vibration during rapid taps", () => {
    const now = jest.spyOn(performance, "now");
    const vibrate = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    const feedback = createFeedLikeFeedback();
    now.mockReturnValue(0);
    expect(() => feedback.play(49)).not.toThrow();
    expect(vibrate).toHaveBeenLastCalledWith([40]);
    now.mockReturnValue(30);
    feedback.play(50);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenLastCalledWith([25, 30, 40, 35, 65]);
    now.mockReturnValue(100);
    feedback.play(100);
    expect(vibrate).toHaveBeenCalledTimes(2);
    now.mockReturnValue(210);
    feedback.play(101);
    expect(vibrate).toHaveBeenCalledTimes(2);
    now.mockReturnValue(285);
    feedback.play(102);
    expect(vibrate).toHaveBeenCalledTimes(3);
    expect(vibrate).toHaveBeenLastCalledWith([44]);
    expect(() => feedback.dispose()).not.toThrow();
    now.mockRestore();
    Reflect.deleteProperty(navigator, "vibrate");
  });

  it("adds a double beat for color changes and preserves it during rapid taps", () => {
    const now = jest.spyOn(performance, "now").mockReturnValue(0);
    const vibrate = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    const feedback = createFeedLikeFeedback();
    feedback.play(15);
    expect(vibrate).toHaveBeenLastCalledWith([25, 30, 45]);
    now.mockReturnValue(100);
    feedback.play(16);
    expect(vibrate).toHaveBeenCalledTimes(1);
    now.mockReturnValue(140);
    feedback.play(17);
    expect(vibrate).toHaveBeenLastCalledWith([40]);
    feedback.dispose();
    Reflect.deleteProperty(navigator, "vibrate");
  });

  it("keeps one continuous voice across likes and milestones, then fades and stops", () => {
    const voices: HTMLMediaElement[] = [];
    jest.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      voices.push(this);
      return Promise.resolve();
    });
    const feedback = createFeedLikeFeedback();
    [1, 7, 13, 19, 25, 50].forEach((taps) => {
      feedback.play(taps);
      jest.advanceTimersByTime(100);
      expect(voices).toHaveLength(1);
    });
    const voice = voices[0];
    expect(voice.getAttribute("src")).toBe("/audio/likes/bubble-flow.wav?v=1");
    expect(voice.loop).toBe(true);
    expect(voice.preservesPitch).toBe(false);
    expect(voice.muted).toBe(false);
    expect(voice.playbackRate).toBeGreaterThan(1);
    const sustainedVolume = voice.volume;
    jest.advanceTimersByTime(600);
    expect(voice.volume).toBeLessThan(sustainedVolume);
    jest.advanceTimersByTime(200);
    expect(voice.volume).toBe(0);
    expect(voice.pause).toHaveBeenCalled();
    feedback.play(51);
    expect(voices).toHaveLength(2);
    expect(voices[1]).toBe(voice);
    feedback.dispose();
    feedback.play(52);
    expect(voices).toHaveLength(2);
    expect(voice.hasAttribute("src")).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("handles denied playback and retries on the next gesture", async () => {
    const now = jest.spyOn(performance, "now").mockReturnValue(0);
    const play = jest.spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"))
      .mockResolvedValue();
    const feedback = createFeedLikeFeedback();
    feedback.play(1);
    await Promise.resolve();
    await Promise.resolve();
    now.mockReturnValue(100);
    feedback.play(2);
    expect(play).toHaveBeenCalledTimes(2);
    feedback.dispose();
  });

  it("stops the continuous sound when the page is hidden", () => {
    const feedback = createFeedLikeFeedback();
    feedback.play(1);
    const hidden = jest.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    hidden.mockRestore();
    feedback.dispose();
  });
});
