import { ObservableStore } from '../features/live-map/state/observable'
import type { JamStatePayload } from '../types/jam'
import type { RealtimeConnection } from '../features/live-map/types'

export type JamPhase = 'idle' | 'loading' | 'active' | 'deleted'

export interface JamUiState {
  phase: JamPhase
  jam: JamStatePayload | null
  connection: RealtimeConnection
  syncing: boolean
  /** Clock skew = serverTime - localReceiveTime (ms), used by the sync math. */
  skew: number
  /** Non-blocking message shown inside the Jam panel (e.g. host offline). */
  notice: string | null
  /** Terminal message shown after the Jam ended (e.g. host ended it). */
  endedMessage: string | null
  /** Blocking error (e.g. "This Jam is no longer available."). */
  error: string | null
}

const initialState: JamUiState = {
  phase: 'idle',
  jam: null,
  connection: 'connecting',
  syncing: false,
  skew: 0,
  notice: null,
  endedMessage: null,
  error: null,
}

class JamStore extends ObservableStore<JamUiState> {
  constructor() {
    super(initialState)
  }

  set(partial: Partial<JamUiState> | ((prev: JamUiState) => Partial<JamUiState>)): void {
    const patch = typeof partial === 'function' ? partial(this.getState()) : partial
    this.setState({ ...this.getState(), ...patch })
  }

  /** Alias used by the Jam sync hook. */
  update(partial: Partial<JamUiState> | ((prev: JamUiState) => Partial<JamUiState>)): void {
    this.set(partial)
  }

  reset(): void {
    this.setState(initialState)
  }
}

/** Single app-wide store for the current trip's Jam. Reset per trip mount. */
export const jamStore = new JamStore()
