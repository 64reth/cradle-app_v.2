import { Component, type ErrorInfo, type ReactNode } from "react";
import { trackAlphaError } from "../alphaDiagnostics";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Cradle render failure", error, info.componentStack);
    trackAlphaError(error, { action: "render" });
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell">
          <section className="hero-panel" role="alert">
            <p className="eyebrow">Something needs attention</p>
            <h1>Cradle could not load this view.</h1>
            <p>Refresh the page and try again.</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
