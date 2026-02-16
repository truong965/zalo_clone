/**
 * ErrorBoundary — Shared React class component for catching render errors
 *
 * Usage:
 *   <ErrorBoundary fallback={<p>Something went wrong</p>}>
 *     <ChildComponent />
 *   </ErrorBoundary>
 *
 * Or with a render-prop fallback:
 *   <ErrorBoundary fallback={(error, reset) => <Button onClick={reset}>Retry</Button>}>
 *     <ChildComponent />
 *   </ErrorBoundary>
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';

const { Text } = Typography;

type FallbackRender = (error: Error, reset: () => void) => ReactNode;

interface ErrorBoundaryProps {
      children: ReactNode;
      /** Static ReactNode or render function (error, reset) => ReactNode */
      fallback?: ReactNode | FallbackRender;
      /** Called when an error is caught — useful for logging */
      onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
      error: Error | null;
}

export class ErrorBoundary extends Component<
      ErrorBoundaryProps,
      ErrorBoundaryState
> {
      constructor(props: ErrorBoundaryProps) {
            super(props);
            this.state = { error: null };
      }

      static getDerivedStateFromError(error: Error): ErrorBoundaryState {
            return { error };
      }

      componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
            console.error('[ErrorBoundary]', error, errorInfo);
            this.props.onError?.(error, errorInfo);
      }

      private handleReset = () => {
            this.setState({ error: null });
      };

      render() {
            const { error } = this.state;
            if (!error) return this.props.children;

            const { fallback } = this.props;

            // Render-prop fallback
            if (typeof fallback === 'function') {
                  return (fallback as FallbackRender)(error, this.handleReset);
            }

            // Static fallback
            if (fallback !== undefined) {
                  return fallback;
            }

            // Default fallback UI
            return (
                  <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
                        <WarningOutlined className="text-3xl text-orange-400" />
                        <Text type="secondary">
                              Đã xảy ra lỗi không mong muốn
                        </Text>
                        <Button size="small" onClick={this.handleReset}>
                              Thử lại
                        </Button>
                  </div>
            );
      }
}
