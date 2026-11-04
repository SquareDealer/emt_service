module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', 'react-hooks'],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: [
        'src/**/*View.tsx',
        'src/features/work-orders/ScheduleFields.tsx',
        'src/components/ui.tsx',
        'src/components/ScheduleTimeline.tsx',
        'src/features/calendar/SlotMenu.tsx',
        'src/lib/view-helpers.ts',
        'src/lib/now.tsx',
        'src/lib/format.ts',
        'src/lib/schedule.ts',
        'src/lib/brand.ts',
      ],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: ['**/lib/api', '**/lib/auth', '**/lib/query', '**/lib/toast', '@tanstack/react-query'],
        }],
      },
    },
  ],
};
