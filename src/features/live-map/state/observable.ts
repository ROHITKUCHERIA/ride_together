import { useSyncExternalStore } from 'react'

export type Listener = () => void

/** Minimal observable store — no dependencies, works with React 19. */
export class ObservableStore<T> {
  private state: T
  private readonly listeners = new Set<Listener>()

  constructor(initial: T) {
    this.state = initial
  }

  getState = (): T => {
    return this.state
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  protected emit(): void {
    for (const listener of this.listeners) listener()
  }

  protected setState(next: T): void {
    this.state = next
    this.emit()
  }
}

export function useStore<T>(store: ObservableStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
