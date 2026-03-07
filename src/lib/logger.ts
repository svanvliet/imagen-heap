/**
 * Frontend logger — structured console logging with level control.
 *
 * All log lines are prefixed with timestamp + module name for easy filtering
 * in DevTools. In production, only warn/error are emitted.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default to debug in dev, warn in prod
const MIN_LEVEL: LogLevel =
  import.meta.env.DEV ? "debug" : "warn";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatTime(): string {
  return new Date().toISOString().substring(11, 23); // HH:MM:SS.mmm
}

export function createLogger(module: string) {
  const prefix = `[${module}]`;

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog("debug")) console.debug(formatTime(), prefix, ...args);
    },
    info: (...args: unknown[]) => {
      if (shouldLog("info")) console.info(formatTime(), prefix, ...args);
    },
    warn: (...args: unknown[]) => {
      if (shouldLog("warn")) console.warn(formatTime(), prefix, ...args);
    },
    error: (...args: unknown[]) => {
      if (shouldLog("error")) console.error(formatTime(), prefix, ...args);
    },
  };
}
