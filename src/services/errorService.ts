
import { useToast } from '@/hooks/use-toast';

export interface ErrorLog {
  id: string;
  timestamp: Date;
  level: 'error' | 'warning' | 'info';
  message: string;
  stack?: string;
  userAgent: string;
  url: string;
  userId?: string;
  context?: Record<string, any>;
}

class ErrorService {
  private logs: ErrorLog[] = [];
  private maxLogs = 100;

  logError(error: Error | string, context?: Record<string, any>, level: 'error' | 'warning' | 'info' = 'error'): void {
    const errorLog: ErrorLog = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level,
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      userAgent: navigator.userAgent,
      url: window.location.href,
      context,
    };

    // Add to local storage for debugging
    this.logs.push(errorLog);
    
    // Limit logs in memory
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error logged:', errorLog);
    }

    // In production, you would send this to your error tracking service
    // e.g., Sentry, LogRocket, or your own logging endpoint
  }

  getLogs(): ErrorLog[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  getRecentErrors(count: number = 10): ErrorLog[] {
    return this.logs.slice(-count);
  }

  // Helper method to handle common errors gracefully
  handleError(error: unknown, context?: Record<string, any>): void {
    if (error instanceof Error) {
      this.logError(error, context);
    } else if (typeof error === 'string') {
      this.logError(error, context);
    } else {
      this.logError('Unknown error occurred', { ...context, errorData: error });
    }
  }

  // Method to handle async errors
  async handleAsyncError<T>(
    asyncFn: () => Promise<T>, 
    context?: Record<string, any>,
    fallback?: T
  ): Promise<T | undefined> {
    try {
      return await asyncFn();
    } catch (error) {
      this.handleError(error, context);
      return fallback;
    }
  }
}

export const errorService = new ErrorService();

// Global error handler
window.addEventListener('error', (event) => {
  errorService.logError(event.error || event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  errorService.logError(
    event.reason instanceof Error ? event.reason : 'Unhandled Promise Rejection',
    { reason: event.reason }
  );
});
