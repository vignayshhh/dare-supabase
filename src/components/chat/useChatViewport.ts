'use client';

import { useCallback } from 'react';

/** Follow the visible viewport, which mobile keyboards shrink independently of 100dvh. */
export function useChatViewport<T extends HTMLElement>() {
  // React 19 cleans up this callback ref when a nested screen replaces chat.
  // Reattach on return from Games/other surfaces, not just on component mount.
  return useCallback((element: T | null) => {
    if (!element) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      if (viewport && Math.abs(viewport.scale - 1) > .05) return;
      const feed = element.querySelector<HTMLElement>('.circle-chat-feed, .chat-message-feed');
      const pinned = feed && feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
      const focused = element.contains(document.activeElement) && document.activeElement?.tagName === 'TEXTAREA';
      const height = viewport?.height ?? window.innerHeight;
      element.style.height = `${height}px`;
      element.style.top = `${viewport?.offsetTop ?? 0}px`;
      element.dataset.keyboardOpen = String(Boolean(focused && window.innerHeight - height > 100));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (feed && (pinned || focused)) feed.scrollTop = feed.scrollHeight;
      });
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    element.addEventListener('focusin', update);
    element.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      element.removeEventListener('focusin', update);
      element.removeEventListener('focusout', update);
    };
  }, []);
}
