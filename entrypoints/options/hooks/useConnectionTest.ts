/**
 * Connection-test lifecycle hook (FR-1 extraction).
 *
 * Wraps `testConnection` with progress/result state and toast feedback.
 * Extracted verbatim from `ProvidersSection.tsx` so `ProviderConnectionTest`
 * and `ProviderKeyRow` share one implementation.
 */

import { useCallback, useState } from 'react';
import { useToast } from '@/ui/ToastProvider';
import { getConnectionErrorMessage } from '@/lib/providerReadiness';
import { testConnection } from '@/services/providerTester';
import type { ConnectionTestResult, ConnectionTestStep } from '@/services/providerTester';
import type { ProviderConfig } from '@/types/config';

export interface UseConnectionTestResult {
  isTesting: boolean;
  testProgress: ConnectionTestStep[];
  testResult: ConnectionTestResult | null;
  runTest: (config: ProviderConfig, successLabel: string) => Promise<ConnectionTestResult>;
}

export function useConnectionTest(targetLanguage: string): UseConnectionTestResult {
  const { success: showSuccess, error: showError } = useToast();
  const [isTesting, setIsTesting] = useState(false);
  const [testProgress, setTestProgress] = useState<ConnectionTestStep[]>([]);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const runTest = useCallback(
    async (config: ProviderConfig, successLabel: string) => {
      setIsTesting(true);
      setTestResult(null);
      setTestProgress([]);

      const result = await testConnection(config, (step) => {
        setTestProgress((prev) => [...prev, step]);
      }, targetLanguage);

      setTestResult(result);
      setIsTesting(false);

      if (result.overall) {
        showSuccess(successLabel);
      } else {
        const failed = result.steps.find((s) => !s.success);
        const message = getConnectionErrorMessage(failed?.error);
        showError(`${message.title}: ${message.action}`);
      }

      return result;
    },
    [showSuccess, showError, targetLanguage],
  );

  return { isTesting, testProgress, testResult, runTest };
}
