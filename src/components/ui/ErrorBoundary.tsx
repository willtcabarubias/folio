"use client";

import React from "react";
import { pushGlobalError } from "@/lib/error/store";

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): State {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    pushGlobalError({
      source: "react:error-boundary",
      severity: "error",
      message: error.message || "React render crashed",
      stack: error.stack,
      details: info.componentStack?.slice(0, 4000),
      cause: (error as unknown as { cause?: unknown }).cause ? String((error as unknown as { cause?: unknown }).cause) : undefined,
      hint: "A component threw during render. Check the stack below.",
    });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-semibold text-ink">Something didn&apos;t go as planned</p>
          <p className="max-w-md text-xs leading-5 text-muted">Don&apos;t worry — your work is safe. Please reload to try again, and contact the developer if it keeps happening.</p>
          <button type="button" onClick={() => window.location.reload()} className="btn-primary">
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
