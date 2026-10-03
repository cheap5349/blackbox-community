import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

// 前端 src/ 跑在浏览器，server/ 与构建配置跑在 Node，两边可用的全局变量不同，
// 分开声明才能让 no-undef 真正抓到「把 Node API 写进浏览器代码」这类错误。
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'server/uploads/**'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      // catch {} 在本项目里用于「故意的忽略」（清理临时文件、可选数据加载失败），
      // 这类空块是有意为之，强制写注释只会制造噪音
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      // 视图组件按角色命名（HomeView、PostView…），单词名不算问题
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['server/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['ecosystem.config.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  // 放在最后：关掉所有与 Prettier 冲突的格式规则，格式问题只由 Prettier 负责
  prettier,
]
