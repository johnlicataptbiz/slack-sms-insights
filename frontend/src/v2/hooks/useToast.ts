import { toast } from 'sonner';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Typed toast helpers that wrap sonner and match the v2 design system.
 * Import `useToast` anywhere in the v2 app to fire notifications.
 */
export function useToast() {
  const success = (message: string, options?: ToastOptions) => {
    toast.success(message, {
      description: options?.description,
      duration: options?.duration ?? 4000,
      action: options?.action
        ? { label: options.action.label, onClick: options.action.onClick }
        : undefined,
    });
  };

  const error = (message: string, options?: ToastOptions) => {
    toast.error(message, {
      description: options?.description,
      duration: options?.duration ?? 6000,
      action: options?.action
        ? { label: options.action.label, onClick: options.action.onClick }
        : undefined,
    });
  };

  const warning = (message: string, options?: ToastOptions) => {
    toast.warning(message, {
      description: options?.description,
      duration: options?.duration ?? 5000,
      action: options?.action
        ? { label: options.action.label, onClick: options.action.onClick }
        : undefined,
    });
  };

  const info = (message: string, options?: ToastOptions) => {
    toast.info(message, {
      description: options?.description,
      duration: options?.duration ?? 4000,
      action: options?.action
        ? { label: options.action.label, onClick: options.action.onClick }
        : undefined,
    });
  };

  /**
   * Promise toast — shows loading → success/error automatically.
   * Usage: promise(fetchFn(), { loading: '…', success: 'Done!', error: 'Failed' })
   */
  const promise = <T>(
    promiseFn: Promise<T>,
    messages: { loading: string; success: string | ((data: T) => string); error: string | ((err: unknown) => string) },
    options?: Pick<ToastOptions, 'duration'>
  ) => {
    return toast.promise(promiseFn, {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
      duration: options?.duration ?? 4000,
    });
  };

  const dismiss = (id?: string | number) => {
    toast.dismiss(id);
  };

  return { success, error, warning, info, promise, dismiss };
}
