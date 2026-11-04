import { createContext, useContext, type ReactNode } from 'react';

// null = no provider: every useNow() call yields a fresh `new Date()` (app default).
const NowCtx = createContext<Date | null>(null);

/** Pins "now" for a subtree — used by frame-based renderers that need determinism. */
export function NowProvider({ value, children }: { value: Date; children: ReactNode }) {
  return <NowCtx.Provider value={value}>{children}</NowCtx.Provider>;
}

export function useNow(): Date {
  const pinned = useContext(NowCtx);
  return pinned ?? new Date();
}
