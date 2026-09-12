import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { WifiOff, RefreshCw } from 'lucide-react';

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
    console.error('Error caught by boundary:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="grid min-h-svh place-items-center p-4 bg-background">
          <div className="relative w-full max-w-md text-center">
            <div className="absolute -inset-x-20 -top-20 -bottom-20 -z-10 rounded-[40px] bg-[hsl(349_86%_50%/0.08)] blur-[80px]" aria-hidden />
            <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-card shadow-card">
              <WifiOff className="h-7 w-7 text-[hsl(349_86%_65%)]" />
            </div>
            <p className="font-mono text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
              Transmission interrupted
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
              Something went wrong
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              We hit an unexpected error mid-broadcast. Give it another go.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button onClick={this.handleRetry} variant="glow">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
              <Link to="/" className="w-full sm:w-auto">
                <Button variant="glass" className="w-full">
                  Back home
                </Button>
              </Link>
            </div>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Error details
                </summary>
                <pre className="mt-2 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-red-300">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
