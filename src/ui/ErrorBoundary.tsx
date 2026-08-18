import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Last line of defence: a broken preset / stale saved settings must not leave a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State {
    return { error }
  }
  componentDidCatch(error: Error): void {
    console.error(error)
  }
  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash">
        <h2>TwitchSim hit an error</h2>
        <pre className="help">{String(this.state.error?.stack || this.state.error)}</pre>
        <p className="hint">Usually a broken preset or old saved settings. Resetting the settings fixes it (your uploaded images are kept).</p>
        <div className="btns">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              try {
                localStorage.removeItem('twitchsim.config.v1')
              } catch {
                /* ignore */
              }
              location.reload()
            }}
          >
            Reset settings & reload
          </button>
          <button type="button" className="btn" onClick={() => location.reload()}>
            Just reload
          </button>
        </div>
      </div>
    )
  }
}
