import { Component, ErrorBoundary as SolidErrorBoundary, JSX } from "solid-js";
import { Button } from "~/components/ui/Button";

interface ErrorFallbackProps {
  reset: () => void;
  error: unknown;
}

const ErrorFallback: Component<ErrorFallbackProps> = (props) => {
  return (
    <div class="flex flex-col items-center justify-center min-h-[400px] p-8 space-y-4">
      <div class="text-destructive text-4xl">⚠</div>
      <h2 class="text-xl font-semibold text-foreground">Something went wrong</h2>
      <p class="text-muted-foreground text-sm max-w-md text-center">
        An unexpected error occurred. You can try resetting the view below.
      </p>
      <Button onClick={props.reset} variant="outline">
        Reset & Retry
      </Button>
    </div>
  );
};

interface ErrorBoundaryProps {
  children: JSX.Element;
}

const ErrorBoundary: Component<ErrorBoundaryProps> = (props) => {
  return (
    <SolidErrorBoundary
      fallback={(err, reset) => <ErrorFallback error={err} reset={reset} />}
    >
      {props.children}
    </SolidErrorBoundary>
  );
};

export default ErrorBoundary;
