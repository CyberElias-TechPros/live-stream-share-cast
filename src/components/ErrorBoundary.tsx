import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="panel max-w-md p-8 text-center">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-live" aria-hidden="true" />
            <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              We hit an unexpected error. Retrying usually fixes it — if not, refreshing the page will.
            </p>
            {this.state.error && import.meta.env.DEV && (
              <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-bg-raised p-3 text-left text-xs text-text-faint">
                {String(this.state.error)}
              </pre>
            )}
            <div className="mt-6 space-y-2">
              <Button onClick={this.handleRetry} className="w-full">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
              <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
                Refresh page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
