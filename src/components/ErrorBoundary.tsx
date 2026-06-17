"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback: (message: string) => ReactNode };
type State = { error: Error | null };

/** Minimal error boundary so the demo can catch the Card guardrail error and display it. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) return this.props.fallback(this.state.error.message);
    return this.props.children;
  }
}
