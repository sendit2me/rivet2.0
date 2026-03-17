import { type QueryKey, type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { handleError } from '../utils/errorHandling.js';

type MutationMetadata<TVariables> = Record<string, unknown> | ((variables: TVariables) => Record<string, unknown> | undefined);

export function useHandledMutation<TData, TVariables>({
  mutationFn,
  errorMessage,
  metadata,
  invalidateQueryKey,
  onMutate,
  onSuccess,
}: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  errorMessage: string;
  metadata?: MutationMetadata<TVariables>;
  invalidateQueryKey?: QueryKey;
  onMutate?: (variables: TVariables) => void | Promise<void>;
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
}): UseMutationResult<TData, Error, TVariables, unknown> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate,
    onSuccess: async (data: TData, variables: TVariables) => {
      if (invalidateQueryKey) {
        await queryClient.invalidateQueries({ queryKey: invalidateQueryKey });
      }

      await onSuccess?.(data, variables);
    },
    onError: (error: Error, variables: TVariables) => {
      handleError(error, errorMessage, {
        metadata: typeof metadata === 'function' ? metadata(variables) : metadata,
      });
    },
  });
}
