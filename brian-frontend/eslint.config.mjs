// Brian-Agent 前端 ESLint flat config（eslint 9）。规则与原 .eslintrc.json 等价迁移。
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import tsParser from '@typescript-eslint/parser'
import tseslintPlugin from '@typescript-eslint/eslint-plugin'
import globals from 'globals'

const tsRules = {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  '@typescript-eslint/no-explicit-any': 'warn',
  'no-console': 'off',
  'no-empty': ['error', { allowEmptyCatch: true }],
  // TS 项目由 tsc 做类型/环境检查：no-undef/no-redeclare 对类型与运行时双态声明会误报
  'no-undef': 'off',
  'no-redeclare': 'off',
}

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  // JS/TS 源码：TypeScript 解析器
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parser: tsParser,
    },
    plugins: { '@typescript-eslint': tseslintPlugin },
    rules: { ...tseslintPlugin.configs.recommended.rules, ...tsRules },
  },
  // Vue SFC：vue-eslint-parser 主解析，script 内回退 TS 解析器
  {
    files: ['**/*.vue'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parser: vueParser,
      parserOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module', extraFileExtensions: ['.vue'] },
    },
    plugins: { vue: pluginVue, '@typescript-eslint': tseslintPlugin },
    rules: { ...tseslintPlugin.configs.recommended.rules, ...tsRules },
  },
  {
    files: ['test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
]
