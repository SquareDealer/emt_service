import { createContext, useContext } from 'react';

/** Pre-filled slot for the intake wizard, e.g. from a calendar click. */
export interface IntakeInitial {
  scheduledAt?: string;
  durationMin?: number;
}

interface IntakeContextValue {
  openIntake: (initial?: IntakeInitial) => void;
}

/**
 * The intake wizard is a singleton mounted in AppShell and was only reachable
 * from the topbar button. Creating a booking by clicking the calendar needs to
 * open it with the clicked slot already chosen, so AppShell publishes the opener.
 */
export const IntakeContext = createContext<IntakeContextValue>({ openIntake: () => {} });

export function useIntake(): IntakeContextValue {
  return useContext(IntakeContext);
}
