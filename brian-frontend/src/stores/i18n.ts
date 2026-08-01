import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type Locale = 'zh-CN' | 'en-US'

const i18nMap: Record<string, Record<Locale, string>> = {
  'nav.chat': { 'zh-CN': '对话', 'en-US': 'Chat' },
  'nav.info': { 'zh-CN': '信息', 'en-US': 'Info' },
  'nav.learning': { 'zh-CN': '学习', 'en-US': 'Learning' },
  'nav.monitor': { 'zh-CN': '监控', 'en-US': 'Monitor' },
  'nav.config': { 'zh-CN': '配置', 'en-US': 'Config' },
  'nav.profile': { 'zh-CN': '用户画像', 'en-US': 'Profile' },
  'chat.input.placeholder': { 'zh-CN': '输入消息...', 'en-US': 'Type a message...' },
  'chat.send': { 'zh-CN': '发送', 'en-US': 'Send' },
  'chat.new': { 'zh-CN': '新建对话', 'en-US': 'New Chat' },
  'chat.history': { 'zh-CN': '历史会话', 'en-US': 'History' },
  'chat.search': { 'zh-CN': '搜索会话...', 'en-US': 'Search sessions...' },
  'chat.citingMode': { 'zh-CN': '引用模式', 'en-US': 'Citing Mode' },
  'info.history': { 'zh-CN': '历史', 'en-US': 'History' },
  'info.memory': { 'zh-CN': '记忆', 'en-US': 'Memory' },
  'info.library': { 'zh-CN': '资料库', 'en-US': 'Library' },
  'info.tagGraph': { 'zh-CN': 'Tag图', 'en-US': 'Tag Graph' },
  'info.keywordGraph': { 'zh-CN': '关键词图', 'en-US': 'Keyword Graph' },
  'learning.start': { 'zh-CN': '开始学习', 'en-US': 'Start Learning' },
  'learning.stop': { 'zh-CN': '暂停学习', 'en-US': 'Stop Learning' },
  'learning.running': { 'zh-CN': '学习中...', 'en-US': 'Learning...' },
  'monitor.healthy': { 'zh-CN': '健康', 'en-US': 'Healthy' },
  'monitor.degraded': { 'zh-CN': '降级', 'en-US': 'Degraded' },
  'monitor.unhealthy': { 'zh-CN': '异常', 'en-US': 'Unhealthy' },
  'common.loading': { 'zh-CN': '加载中...', 'en-US': 'Loading...' },
  'common.empty': { 'zh-CN': '暂无数据', 'en-US': 'No data' },
  'common.save': { 'zh-CN': '保存', 'en-US': 'Save' },
  'common.cancel': { 'zh-CN': '取消', 'en-US': 'Cancel' },
  'common.delete': { 'zh-CN': '删除', 'en-US': 'Delete' },
  'common.confirm': { 'zh-CN': '确认', 'en-US': 'Confirm' },
  'common.retry': { 'zh-CN': '重试', 'en-US': 'Retry' },
  'common.search': { 'zh-CN': '搜索', 'en-US': 'Search' },
  'common.selectAll': { 'zh-CN': '全选', 'en-US': 'Select All' },
  'common.deselectAll': { 'zh-CN': '取消全选', 'en-US': 'Deselect All' },
}

export const useI18nStore = defineStore('i18n', () => {
  const locale = ref<Locale>(
    (localStorage.getItem('brian-locale') as Locale) || 'zh-CN'
  )

  function t(key: string): string {
    const entry = i18nMap[key]
    if (!entry) return key
    return entry[locale.value] || key
  }

  function setLocale(newLocale: Locale) {
    locale.value = newLocale
    localStorage.setItem('brian-locale', newLocale)
  }

  const isZh = computed(() => locale.value === 'zh-CN')

  return { locale, t, setLocale, isZh }
})
