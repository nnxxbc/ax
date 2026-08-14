import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./button";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-6 text-destructive">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
            <Button
              onClick={() => window.location.reload()}
              className="rounded-2xl h-12 gap-2"
            >
              <RefreshCw size={16} />
              Reload App
            </Button>
            <Button
              variant="outline"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-2xl h-12"
            >
              Try Again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
