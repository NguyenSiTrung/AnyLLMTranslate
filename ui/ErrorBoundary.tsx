/**
 * Minimal error boundary for React entrypoints (popup, options).
 * Shows a fallback UI with reload button on unhandled errors.
 */
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AnyLLMTranslate] ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center text-zinc-100 bg-zinc-950 min-h-screen flex flex-col items-center justify-center gap-4">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-zinc-400 max-w-xs">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
