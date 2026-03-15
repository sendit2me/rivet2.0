import { type FC, type ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { handleError } from '../utils/errorHandling';

export const AppErrorBoundary: FC<{
  children: ReactNode;
  context: string;
  fallback: ReactNode;
}> = ({ children, context, fallback }) => {
  return (
    <ErrorBoundary
      fallbackRender={() => <>{fallback}</>}
      onError={(error) => {
        if (import.meta.env.DEV) {
          console.error(error);
          setTimeout(() => {
            throw error;
          });
          return;
        }

        handleError(error, context);
      }}
    >
      {children}
    </ErrorBoundary>
  );
};
