import { useQuery } from '@tanstack/react-query';
import apiService from '../services/api';

/**
 * Fetches the Onairos client SDK config (enabled flag + key) from the backend
 * at runtime, so the `ona_...` key is NOT bundled into the app binary via an
 * EXPO_PUBLIC_ env var (where it would be publicly extractable). The key is
 * served by GET /api/onairos/config and can be rotated server-side.
 *
 * Returns { enabled, apiKey, isLoading }. Treat `enabled` as false until loaded.
 */
export function useOnairosConfig(): { enabled: boolean; apiKey: string; isLoading: boolean } {
    const { data, isLoading } = useQuery({
        queryKey: ['onairos', 'config'],
        queryFn: () => apiService.getOnairosConfig(),
        staleTime: 60 * 60 * 1000, // 1h — the key rarely changes
        retry: 1,
    });
    return {
        enabled: !!data?.enabled && !!(data?.api_key || '').trim(),
        apiKey: (data?.api_key || '').trim(),
        isLoading,
    };
}
