import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import Button from './Button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  errorMessage: string | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, errorMessage: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, errorMessage: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[rt] render error:', error, info.componentStack)
  }

  private reset = (): void => {
    this.setState({ hasError: false, errorMessage: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-night px-6 text-center">
        <p className="font-display text-5xl font-bold tracking-[0.18em] text-bone">
          RIDE<span className="text-ember">TOGETHER</span>
        </p>
        <p className="mt-4 text-sm text-mist/80">Something went wrong while rendering this screen.</p>
        {this.state.errorMessage ? (
          <p className="mt-3 max-w-md break-words rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-bone/70">
            {this.state.errorMessage}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button onClick={this.reset}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    )
  }
}