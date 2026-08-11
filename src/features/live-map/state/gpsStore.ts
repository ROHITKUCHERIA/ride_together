import { ObservableStore } from './observable'
import type { GpsMode, GpsUiState } from '../types'

class GpsStore extends ObservableStore<GpsUiState> {
  constructor() {
    super({ mode: 'inactive', error: null, accuracy: null })
  }

  setMode(mode: GpsMode): void {
    const s = this.getState()
    const error = mode === 'active' || mode === 'paused' || mode === 'inactive' ? null : s.error
    this.setState({ ...s, mode, error })
  }

  setError(error: string | null): void {
    this.setState({ ...this.getState(), error })
  }

  setAccuracy(accuracy: number | null): void {
    this.setState({ ...this.getState(), accuracy })
  }
}

export const gpsStore = new GpsStore()
