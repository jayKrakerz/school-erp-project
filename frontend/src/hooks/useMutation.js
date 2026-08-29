import { useCallback, useRef, useState } from 'react';

const initialState = { status: 'idle', data: undefined, error: null };

export default function useMutation(mutationFn, options = {}) {
  const [state, setState] = useState(initialState);
  const optionsRef = useRef(options);
  const invocationRef = useRef(0);
  optionsRef.current = options;

  const mutateAsync = useCallback(async (variables) => {
    const invocation = ++invocationRef.current;
    setState((current) => ({ ...current, status: 'pending', error: null }));
    optionsRef.current.onMutate?.(variables);
    try {
      const data = await mutationFn(variables);
      if (invocation === invocationRef.current) setState({ status: 'success', data, error: null });
      optionsRef.current.onSuccess?.(data, variables);
      optionsRef.current.onSettled?.(data, null, variables);
      return data;
    } catch (error) {
      if (invocation === invocationRef.current) setState({ status: 'error', data: undefined, error });
      optionsRef.current.onError?.(error, variables);
      optionsRef.current.onSettled?.(undefined, error, variables);
      throw error;
    }
  }, [mutationFn]);

  const mutate = useCallback((variables, callbacks = {}) => {
    mutateAsync(variables).then(callbacks.onSuccess).catch(callbacks.onError || (() => {}));
  }, [mutateAsync]);

  const reset = useCallback(() => {
    invocationRef.current += 1;
    setState(initialState);
  }, []);

  return {
    ...state,
    mutate,
    mutateAsync,
    reset,
    isIdle: state.status === 'idle',
    isPending: state.status === 'pending',
    isLoading: state.status === 'pending',
    isSuccess: state.status === 'success',
    isError: state.status === 'error'
  };
}

export { useMutation };
