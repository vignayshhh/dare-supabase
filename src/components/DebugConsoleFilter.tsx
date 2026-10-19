"use client";

import { useEffect } from "react";

const ENABLE_DEV_CONSOLE_LOG_FILTER = true;

function shouldAllowConsoleLog(args: unknown[]): boolean {
  const first = args[0];
  return typeof first === "string" && first.includes("[DARE_LIVE_DEBUG]");
}

export default function DebugConsoleFilter() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" ||
      !ENABLE_DEV_CONSOLE_LOG_FILTER
    ) {
      return;
    }

    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      if (shouldAllowConsoleLog(args)) {
        originalLog(...args);
      }
    };

    return () => {
      console.log = originalLog;
    };
  }, []);

  return null;
}
