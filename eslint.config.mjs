import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // Tests: allow non-null assertions (common after expect) and dynamic delete
  // on mock storage maps. Production code still uses the strict defaults above.
  {
    files: [
      '**/__tests__/**/*.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      'tests/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.agents/**',
      '.claude/**',
      '.wxt/**',
      '.output/**',
      'dist/**',
      'coverage/**',
      // Vendored third-party reference copies (gitignored, minified)
      'ImmersiveTransalteExtensionCode/**',
    ],
  },
);
