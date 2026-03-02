import { Component, type ErrorInfo, type ReactNode } from 'react';
import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════════
// Issue #10: Error Boundary Component
// ═══════════════════════════════════════════════════════════════════════════════

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught:', error, errorInfo);
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <motion.div
          className="V2ErrorBoundary"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          role="alert"
          aria-live="assertive"
        >
          <div className="V2ErrorBoundary__icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h2 className="V2ErrorBoundary__title">Something went wrong</h2>

          <p className="V2ErrorBoundary__message">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>

          {import.meta.env.DEV && this.state.errorInfo && (
            <details className="V2ErrorBoundary__details">
              <summary>Technical details</summary>
              <pre>{this.state.errorInfo.componentStack}</pre>
            </details>
          )}

          <div className="V2ErrorBoundary__actions">
            <button
              onClick={this.handleRetry}
              className="V2ErrorBoundary__btn V2ErrorBoundary__btn--primary"
              type="button"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="V2ErrorBoundary__btn V2ErrorBoundary__btn--secondary"
              type="button"
            >
              Reload page
            </button>
          </div>
        </motion.div>
      );
    }

    return this.props.children;
  }
}

// Wrapper for functional components
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
): React.FC<P> {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

export default ErrorBoundary;
