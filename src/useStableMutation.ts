import { useCallback, useEffect, useRef, useState } from "react";
import { ApiResponseError, RequestCancelledError, RequestTimeoutError, failureMessage } from "./api";

export type MutationFeedback = {
  key: string;
  state: "pending" | "timeout" | "error" | "success";
  message: string;
  requestId?: string;
};

type MutationConfig<T> = {
  key: string;
  pendingLabel: string;
  task: (signal: AbortSignal) => Promise<T>;
  onSuccess: (value: T) => void;
  refreshBeforeRetry?: () => Promise<void>;
};

export function useStableMutation() {
  const mounted = useRef(true);
  const controllers = useRef(new Map<string, AbortController>());
  const generations = useRef(new Map<string, number>());
  const retryConfig = useRef<MutationConfig<unknown> | null>(null);
  const [feedback, setFeedback] = useState<MutationFeedback | null>(null);

  useEffect(() => {
    mounted.current = true;
    const activeControllers = controllers.current;
    return () => {
      mounted.current = false;
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
    };
  }, []);

  const run = useCallback(async <T,>(config: MutationConfig<T>): Promise<void> => {
    if (controllers.current.has(config.key)) return;
    const controller = new AbortController();
    const generation = (generations.current.get(config.key) || 0) + 1;
    generations.current.set(config.key, generation);
    controllers.current.set(config.key, controller);
    retryConfig.current = config as MutationConfig<unknown>;
    setFeedback({ key: config.key, state: "pending", message: config.pendingLabel });
    try {
      const value = await config.task(controller.signal);
      if (!mounted.current || generations.current.get(config.key) !== generation) return;
      config.onSuccess(value);
      retryConfig.current = null;
      setFeedback({ key: config.key, state: "success", message: "Completed" });
    } catch (error) {
      if (!mounted.current || error instanceof RequestCancelledError ||
        generations.current.get(config.key) !== generation) return;
      if (error instanceof RequestTimeoutError) {
        setFeedback({ key: config.key, state: "timeout", message: error.message });
      } else {
        setFeedback({ key: config.key, state: "error", message: failureMessage(error),
          requestId: error instanceof ApiResponseError ? error.requestId : undefined });
      }
    } finally {
      if (controllers.current.get(config.key) === controller) controllers.current.delete(config.key);
    }
  }, []);

  const retry = useCallback(async () => {
    const config = retryConfig.current;
    if (!config || controllers.current.has(config.key)) return;
    await config.refreshBeforeRetry?.();
    if (!mounted.current) return;
    await run(config);
  }, [run]);

  const dismiss = useCallback(() => { retryConfig.current = null; setFeedback(null); }, []);
  const isPending = useCallback((key: string) => feedback?.key === key && feedback.state === "pending", [feedback]);

  return { feedback, run, retry, dismiss, isPending };
}
