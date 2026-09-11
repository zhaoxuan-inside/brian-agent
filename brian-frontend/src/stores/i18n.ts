import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type Locale = 'zh-CN' | 'en-US'

const i18nMap: Record<string, Record<Locale, string>> = {
  'nav.chat': { 'zh-CN': '对话', 'en-US': 'Chat' },
  'nav.info': { 'zh-CN': '信息', 'en-US': 'Info' },
  'nav.learning': { 'zh-CN': '学习', 'en-US': 'Learning' },
  'nav.monitor': { 'zh-CN': '监控', 'en-US': 'Monitor' },
  'nav.config': { 'zh-CN': '配置', 'en-US': 'Config' },
  'nav.tool': { 'zh-CN': '工具', 'en-US': 'Tools' },
  'nav.cron': { 'zh-CN': '定时任务', 'en-US': 'Cron' },
  'nav.profile': { 'zh-CN': '用户画像', 'en-US': 'Profile' },
  'nav.user': { 'zh-CN': '我', 'en-US': 'Me' },
  'user.localDevice': { 'zh-CN': '本机', 'en-US': 'This device' },
  'user.protected': { 'zh-CN': '已设锁屏', 'en-US': 'Lock enabled' },
  'user.unprotected': { 'zh-CN': '未锁屏', 'en-US': 'No lock' },
  'user.unnamed': { 'zh-CN': '尚未设置称呼', 'en-US': 'Name not set' },
  'user.portrait': { 'zh-CN': 'Brian 对你的理解', 'en-US': 'How Brian sees you' },
  'user.portraitEmpty': { 'zh-CN': '还没有画像。多聊几轮后点「更新画像」，Brian 会从对话里归纳你是谁。', 'en-US': 'No portrait yet. Chat a bit, then refresh to let Brian infer who you are.' },
  'user.viewPortrait': { 'zh-CN': '完整画像', 'en-US': 'Full portrait' },
  'user.updatePortrait': { 'zh-CN': '更新画像', 'en-US': 'Refresh' },
  'user.generating': { 'zh-CN': '生成中', 'en-US': 'Generating' },
  'user.howToAddress': { 'zh-CN': '你希望 Brian 如何对你', 'en-US': 'How Brian should address you' },
  'user.namePlaceholder': { 'zh-CN': '如何称呼你', 'en-US': 'What should Brian call you' },
  'user.replyStyle': { 'zh-CN': '回复风格', 'en-US': 'Reply style' },
  'user.replyDepth': { 'zh-CN': '回答深度', 'en-US': 'Depth' },
  'user.replyLanguage': { 'zh-CN': '回复语言', 'en-US': 'Reply language' },
  'user.additionalPlaceholder': { 'zh-CN': '补充偏好，例如：少用列表、先给结论…', 'en-US': 'Extra preferences, e.g. skip lists, lead with the answer…' },
  'user.savePrefs': { 'zh-CN': '保存偏好', 'en-US': 'Save preferences' },
  'user.saved': { 'zh-CN': '已保存', 'en-US': 'Saved' },
  'user.changePassword': { 'zh-CN': '修改锁屏密码', 'en-US': 'Change lock password' },
  'user.setPassword': { 'zh-CN': '设置锁屏密码', 'en-US': 'Set lock password' },
  'user.currentPassword': { 'zh-CN': '当前密码', 'en-US': 'Current password' },
  'user.newPassword': { 'zh-CN': '新密码（至少 4 位）', 'en-US': 'New password (min 4 chars)' },
  'user.lockNow': { 'zh-CN': '立即锁定', 'en-US': 'Lock now' },
  'chat.input.placeholder': { 'zh-CN': '输入消息...', 'en-US': 'Type a message...' },
  'chat.input.placeholderPicking': { 'zh-CN': '勾选上方消息后提问…', 'en-US': 'Check messages above, then ask…' },
  'chat.input.placeholderPicked': { 'zh-CN': '基于已选上文提问…', 'en-US': 'Ask using the selected context…' },
  'chat.send': { 'zh-CN': '发送', 'en-US': 'Send' },
  'chat.new': { 'zh-CN': '新建对话', 'en-US': 'New Chat' },
  'chat.history': { 'zh-CN': '历史会话', 'en-US': 'History' },
  'chat.search': { 'zh-CN': '搜索会话...', 'en-US': 'Search sessions...' },
  'chat.citingMode': { 'zh-CN': '选用上文', 'en-US': 'Pick context' },
  'chat.pickContext': { 'zh-CN': '选用上文', 'en-US': 'Pick context' },
  'chat.pickContextOn': { 'zh-CN': '选用中', 'en-US': 'Picking' },
  'chat.pickContextCount': { 'zh-CN': '已选 {n}', 'en-US': '{n} selected' },
  'chat.pickContextTip': { 'zh-CN': '勾选消息，指定这次提问主要依据哪些内容', 'en-US': 'Check messages to scope what this question should rely on' },
  'chat.pickContextHint': { 'zh-CN': '勾选上方消息。这次提问将主要依据你选中的内容，而不是整段对话。', 'en-US': 'Check messages above. This question will mainly use what you select, not the whole chat.' },
  'chat.pickContextSelected': { 'zh-CN': '已指定 {n} 条上文（将与钉住消息一并作为上下文）', 'en-US': '{n} messages selected (merged with pinned messages)' },
  'chat.pickContextClear': { 'zh-CN': '清空', 'en-US': 'Clear' },
  'chat.expandReply': { 'zh-CN': '展开回复', 'en-US': 'Show reply' },
  'chat.collapseReply': { 'zh-CN': '收起回复', 'en-US': 'Hide reply' },
  'chat.collapsedReplyMeta': { 'zh-CN': '已折叠 · {n} 字', 'en-US': 'Collapsed · {n} chars' },
  'info.history': { 'zh-CN': '历史', 'en-US': 'History' },
  'info.memory': { 'zh-CN': '记忆', 'en-US': 'Memory' },
  'info.library': { 'zh-CN': '资料库', 'en-US': 'Library' },
  'info.tagGraph': { 'zh-CN': '涌现', 'en-US': 'Emergence' },
  'info.keywordGraph': { 'zh-CN': '关键词图', 'en-US': 'Keyword Graph' },
  'info.profile': { 'zh-CN': '画像', 'en-US': 'Profile' },
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
