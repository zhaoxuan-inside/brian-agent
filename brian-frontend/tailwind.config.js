export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 语义色(ADR-008 单一事实源):组件内表达"含义"一律用语义色,
        // 禁止直接使用 tailwind 原生 red/green/amber/purple/sky 表达语义。
        // 全站值已按 Claude 暖色体系取值(ADR-016,设计源 design-md/claude):
        // brian-blue 即品牌强调色 coral,经 CSS 变量随明暗切换(浅 #cc785c/深 #d98b70)。
        'brian-blue': 'rgb(var(--brian-blue) / <alpha-value>)',
        'success-green': 'rgb(var(--success-green) / <alpha-value>)',
        'warning-orange': 'rgb(var(--warning-orange) / <alpha-value>)',
        'error-red': 'rgb(var(--error-red) / <alpha-value>)',
        // 暖灰阶梯(Claude muted 家族):浅色模式用 900/700 深端,深色模式用 50/300 浅端
        'apple-gray': {
          50: '#faf9f5', 100: '#f5f0e8', 200: '#e6dfd8', 300: '#d6cec0',
          400: '#a6a29a', 500: '#8e8b82', 600: '#6c6a64', 700: '#3a3833',
          800: '#1f1e1b', 900: '#181715', 950: '#141312'
        },
        // 暖棕深色表面(Claude surface-dark 家族)
        'apple-dark': {
          bg: '#181715', elevated: '#1f1e1b', grouped: '#141312', separator: '#3a3833'
        },
        // Claude 主题令牌(design-md/claude/DESIGN.md,ADR-015, supersede ADR-014):
        // 仅对话页 .theme-chat 作用域消费。颜色经 CSS 变量(RGB 三元组)取值,
        // 浅色值定义于 .theme-chat、深色值于 :root.dark .theme-chat(globals.css),
        // 随顶栏明暗开关自动切换;<alpha-value> 支撑 /N 透明度修饰符。
        'chat': {
          canvas: 'rgb(var(--chat-canvas) / <alpha-value>)',
          'surface-1': 'rgb(var(--chat-surface-1) / <alpha-value>)',
          'surface-2': 'rgb(var(--chat-surface-2) / <alpha-value>)',
          'surface-3': 'rgb(var(--chat-surface-3) / <alpha-value>)',
          hairline: 'rgb(var(--chat-hairline) / <alpha-value>)',
          'hairline-strong': 'rgb(var(--chat-hairline-strong) / <alpha-value>)',
          'hairline-tertiary': 'rgb(var(--chat-hairline-tertiary) / <alpha-value>)',
          ink: 'rgb(var(--chat-ink) / <alpha-value>)',
          'ink-muted': 'rgb(var(--chat-ink-muted) / <alpha-value>)',
          'ink-subtle': 'rgb(var(--chat-ink-subtle) / <alpha-value>)',
          'ink-tertiary': 'rgb(var(--chat-ink-tertiary) / <alpha-value>)',
          primary: 'rgb(var(--chat-primary) / <alpha-value>)',
          'primary-hover': 'rgb(var(--chat-primary-hover) / <alpha-value>)',
          'on-primary': 'rgb(var(--chat-on-primary) / <alpha-value>)',
          success: 'rgb(var(--chat-success) / <alpha-value>)',
          warning: 'rgb(var(--chat-warning) / <alpha-value>)',
          error: 'rgb(var(--chat-error) / <alpha-value>)'
        }
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        // Claude 主题字体:正文 Inter/系统栈;display 用衬线替代 Copernicus(仅拉丁品牌字样)
        chat: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', 'Helvetica Neue', 'Arial', 'sans-serif'],
        'chat-display': ['Copernicus', 'Tiempos Headline', 'Georgia', 'Times New Roman', 'Songti SC', 'SimSun', 'serif']
      },
      // 字号阶梯:10/11/12/14/16/18 六级收敛,替代任意值 text-[Npx]
      fontSize: {
        '4xs': ['11px', { lineHeight: '16px' }],
        '2xs': ['12px', { lineHeight: '18px' }]
      },
      // 圆角阶梯(Claude 几何,ADR-016):xl=按钮/输入 8px,2xl=卡片 12px,3xl/4xl=面板 16px
      borderRadius: {
        xl: '8px', '2xl': '12px', '3xl': '16px', '4xl': '16px',
        // Claude 圆角阶梯(design-md/claude):md=按钮/输入 8px,lg=卡片 12px,xl=面板 16px,pill=胶囊
        'chat-xs': '4px', 'chat-sm': '6px', 'chat-md': '8px', 'chat-lg': '12px', 'chat-xl': '16px', 'chat-pill': '9999px'
      },
      // z-index 层级表:替代魔法数 z-[120]/z-[130]/z-[60]
      zIndex: {
        drawer: '40',
        modal: '50',
        'modal-top': '55',
        popover: '60',
        toast: '70'
      },
      boxShadow: {
        glass: '0 4px 20px rgba(28, 25, 23, 0.06)',
        'glass-dark': '0 4px 20px rgba(0,0,0,0.35)',
        focus: '0 0 0 3px rgba(204, 120, 92, 0.22)',
        lift: '0 8px 24px rgba(28, 25, 23, 0.1)',
        'lift-dark': '0 8px 24px rgba(0,0,0,0.5)'
      },
      transitionTimingFunction: {
        ios: 'cubic-bezier(0.32,0.72,0,1)'
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-right': 'slide-right 0.35s cubic-bezier(0.32,0.72,0,1)',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'cursor-blink': 'cursor-blink 1s step-end infinite',
        'pop-in': 'pop-in 0.22s cubic-bezier(0.32,0.72,0,1)'
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-up': { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'slide-right': { '0%': { opacity: '0', transform: 'translateX(20px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        'pulse-soft': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        'cursor-blink': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
        'pop-in': { '0%': { opacity: '0', transform: 'scale(0.96) translateY(8px)' }, '100%': { opacity: '1', transform: 'scale(1) translateY(0)' } }
      }
    }
  },
  plugins: []
}
