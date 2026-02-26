/**
 * Call State Machine
 *
 * Manages valid state transitions for call lifecycle.
 * All state changes MUST go through this to prevent invalid transitions
 * (e.g. ENDED → ACTIVE).
 *
 * States:
 *   IDLE → RINGING → ACTIVE → ENDED
 *                ↓        ↓
 *              ENDED   RECONNECTING → ENDED
 *                            ↓
 *                          ACTIVE (if reconnected)
 */

export type CallState = 'IDLE' | 'RINGING' | 'ACTIVE' | 'RECONNECTING' | 'ENDED';

export type CallEvent =
      | 'INITIATE'     // IDLE → RINGING
      | 'ACCEPT'       // RINGING → ACTIVE
      | 'REJECT'       // RINGING → ENDED
      | 'HANGUP'       // ACTIVE | RINGING | RECONNECTING → ENDED
      | 'TIMEOUT'      // RINGING → ENDED
      | 'DISCONNECT'   // ACTIVE → RECONNECTING
      | 'RECONNECT'    // RECONNECTING → ACTIVE
      | 'FAIL'         // RECONNECTING → ENDED
      | 'BLOCK'        // any non-ENDED → ENDED
      | 'CANCEL';      // RINGING → ENDED (caller cancels)

/**
 * Transition table keyed by [currentState][event] → nextState.
 * If a combination is missing, the transition is invalid.
 */
const TRANSITIONS: Record<string, Partial<Record<CallEvent, CallState>>> = {
      IDLE: {
            INITIATE: 'RINGING',
      },
      RINGING: {
            ACCEPT: 'ACTIVE',
            REJECT: 'ENDED',
            HANGUP: 'ENDED',
            TIMEOUT: 'ENDED',
            CANCEL: 'ENDED',
            BLOCK: 'ENDED',
      },
      ACTIVE: {
            HANGUP: 'ENDED',
            DISCONNECT: 'RECONNECTING',
            BLOCK: 'ENDED',
      },
      RECONNECTING: {
            RECONNECT: 'ACTIVE',
            FAIL: 'ENDED',
            HANGUP: 'ENDED',
            BLOCK: 'ENDED',
      },
      ENDED: {
            // Terminal state — no valid transitions out
      },
};

/**
 * Check if a state transition is valid.
 */
export function canTransition(currentState: CallState, event: CallEvent): boolean {
      const stateTransitions = TRANSITIONS[currentState];
      if (!stateTransitions) return false;
      return event in stateTransitions;
}

/**
 * Get the next state for a given transition.
 * Returns null if the transition is invalid.
 */
export function getNextState(currentState: CallState, event: CallEvent): CallState | null {
      const stateTransitions = TRANSITIONS[currentState];
      if (!stateTransitions) return null;
      return stateTransitions[event] ?? null;
}

/**
 * Attempt a state transition. Throws if invalid.
 */
export function transition(currentState: CallState, event: CallEvent): CallState {
      const next = getNextState(currentState, event);
      if (next === null) {
            throw new Error(
                  `Invalid call state transition: ${currentState} + ${event}. ` +
                  `Valid events for ${currentState}: [${Object.keys(TRANSITIONS[currentState] ?? {}).join(', ')}]`,
            );
      }
      return next;
}

/**
 * Map ActiveCallSession.status (stored in Redis) to CallState.
 * Redis stores 'RINGING' | 'ACTIVE' | 'RECONNECTING'.
 */
export function sessionStatusToCallState(
      status: 'RINGING' | 'ACTIVE' | 'RECONNECTING',
): CallState {
      return status; // They happen to match directly
}
