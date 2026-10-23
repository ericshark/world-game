import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** What to show instead of the broken part. `reset` tries to draw it again. */
  fallback: (problem: { error: Error; id: string; reset: () => void }) => ReactNode
  children: ReactNode
}

interface State {
  failure: { error: Error; id: string } | null
}

/** A short code a player can quote, which also appears in the console log. */
function errorId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

/** Stops a crash in one part of the app from blanking the whole page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failure: null }

  static getDerivedStateFromError(error: unknown): State {
    return {
      failure: { error: error instanceof Error ? error : new Error(String(error)), id: errorId() },
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[error ${this.state.failure?.id ?? '?'}]`, error, info.componentStack)
  }

  render() {
    const { failure } = this.state
    if (!failure) return this.props.children
    return this.props.fallback({ ...failure, reset: () => this.setState({ failure: null }) })
  }
}

/** The whole-app fallback: a plain page that does not depend on anything that may have broken. */
export function AppCrashed({ id, reset }: { id: string; reset: () => void }) {
  return (
    <div className="screen screen--center" role="alert">
      <div className="panel waiting waiting--column">
        <h1 className="loading__title">Something went wrong</h1>
        <p>
          The game hit an unexpected problem. Your progress is saved in this browser. If it keeps
          happening, mention error <strong data-testid="error-id">{id}</strong>.
        </p>
        <div className="settings__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              window.location.hash = '#/'
              reset()
            }}
          >
            Back to the menu
          </button>
        </div>
      </div>
    </div>
  )
}
