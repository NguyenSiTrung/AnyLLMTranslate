/**
 * Query live pool key statuses for the options UI.
 * Isolated for unit testing without full message plumbing.
 */

import type { TranslationService } from '@/services/base';
import { ProviderPoolCoordinator } from '@/services/providerPool';
import type { GetPoolKeyStatusesResponse } from '@/types/messages';

export async function queryPoolKeyStatuses(
  getService: () => Promise<TranslationService>,
): Promise<GetPoolKeyStatusesResponse> {
  try {
    const service = await getService();
    if (!(service instanceof ProviderPoolCoordinator)) {
      return { success: true, statuses: {} };
    }
    return { success: true, statuses: service.getAllKeyStatuses() };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to query pool statuses',
    };
  }
}
