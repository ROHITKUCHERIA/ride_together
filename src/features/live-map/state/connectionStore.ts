import { ObservableStore } from './observable'
import type { RealtimeConnection } from '../types'

class ConnectionStore extends ObservableStore<RealtimeConnection> {
  constructor() {
    super('connected')
  }

  set(state: RealtimeConnection): void {
    if (state === this.getState()) return
    this.setState(state)
  }
}

export const connectionStore = new ConnectionStore()
