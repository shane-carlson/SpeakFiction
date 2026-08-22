import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ViewErrorBoundary extends Component<
  {
    children: ReactNode;
    title: string;
    hint: string;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="view-error card" role="alert">
        <h3>{this.props.title}</h3>
        <p className="sub">{this.props.hint}</p>
        <button
          type="button"
          className="btn primary"
          onClick={() => this.setState({ failed: false })}
        >
          Try again
        </button>
      </div>
    );
  }
}
