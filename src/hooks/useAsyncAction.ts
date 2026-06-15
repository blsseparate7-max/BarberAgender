
import { useState, useCallback } from 'react';

/**
 * Hook to handle async actions with loading state and double-click protection.
 */
export function useAsyncAction<T extends (...args: any[]) => Promise<any>>(action: T) {
  const [isLoading, setIsLoading] = useState(false);

  const execute = useCallback(async (...args: Parameters<T>) => {
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      const result = await action(...args);
      return result;
    } catch (error) {
      console.error('Action failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [action, isLoading]);

  return { execute, isLoading };
}
