import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type Locale = 'zh-CN' | 'en-US'

const i18nMap: Record<string, Record<Locale, string>> = {
  'nav.home': { 'zh-CN': '首页', 'en-US': 'Home' },
  'nav.chat': { 'zh-CN': '对话', 'en-US': 'Chat' },
  'nav.info': { 'zh-CN': '信息', 'en-US': 'Info' },
  'nav.learning': { 'zh-CN': '学习', 'en-US': 'Learning' },
  'nav.monitor': { 'zh-CN': '监控', 'en-US': 'Monitor' },
  'nav.config': { 'zh-CN': '配置', 'en-US': 'Config' },
  'nav.tool': { 'zh-CN': '工具', 'en-US': 'Tools' },
  'nav.cron': { 'zh-CN': '定时任务', 'en-US': 'Cron' },
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
  'header.toLight': { 'zh-CN': '切换到浅色模式', 'en-US': 'Switch to light mode' },
  'header.toDark': { 'zh-CN': '切换到深色模式', 'en-US': 'Switch to dark mode' },
  'header.toEnglish': { 'zh-CN': '切换到 English', 'en-US': 'Switch to 中文' },
  'header.toChinese': { 'zh-CN': '切换到中文', 'en-US': 'Switch to 中文' },
  'header.lock': { 'zh-CN': '锁定应用', 'en-US': 'Lock app' },
  'header.user': { 'zh-CN': '用户', 'en-US': 'User' },
  'page.configCenter': { 'zh-CN': '配置中心', 'en-US': 'Config Center' },
  'chat.deleteSelected': { 'zh-CN': '删除({n})', 'en-US': 'Delete ({n})' },
  'chat.noSessions': { 'zh-CN': '暂无历史会话', 'en-US': 'No sessions yet' },
  'chat.noMatch': { 'zh-CN': '未找到匹配的会话', 'en-US': 'No matching sessions' },
  'chat.selectSession': { 'zh-CN': '选择会话', 'en-US': 'Select session' },
  'chat.rename': { 'zh-CN': '修改名称', 'en-US': 'Rename' },
  'chat.saveTitle': { 'zh-CN': '保存', 'en-US': 'Save' },
  'chat.cancelEdit': { 'zh-CN': '取消', 'en-US': 'Cancel' },
  'chat.deleteSession': { 'zh-CN': '删除会话', 'en-US': 'Delete session' },
  'chat.overflow': { 'zh-CN': '会话已达到上限，请创建新会话', 'en-US': 'Session limit reached, please create a new one' },
  'chat.confirmDeleteTitle': { 'zh-CN': '确认删除', 'en-US': 'Confirm deletion' },
  'chat.confirmDeleteBtn': { 'zh-CN': '确认删除', 'en-US': 'Delete' },
  'chat.confirmDeleteSingle': { 'zh-CN': '确定删除该会话及其全部消息吗？', 'en-US': 'Delete this session and all its messages?' },
  'chat.confirmDeleteBatch': { 'zh-CN': '确定删除选中的 {n} 个会话及其全部消息吗？', 'en-US': 'Delete {n} selected sessions and all their messages?' },
  'chat.deleteWarning': { 'zh-CN': '此操作将同时清理关联的记忆、标签、向量与用户画像数据，且不可恢复。', 'en-US': 'This also clears associated memories, tags, vectors and profile data. This cannot be undone.' },
  'chat.emptyHint': { 'zh-CN': '开始一段对话', 'en-US': 'Start a conversation' },
  'chat.thinking': { 'zh-CN': '思考中...', 'en-US': 'Thinking...' },
  'chat.stop': { 'zh-CN': '停止生成', 'en-US': 'Stop generating' },
  'chat.saveToLibrary': { 'zh-CN': '保存到资料库', 'en-US': 'Save to Library' },
  'msg.summary': { 'zh-CN': '摘要', 'en-US': 'Summary' },
  'msg.original': { 'zh-CN': '原文', 'en-US': 'Original' },
  'msg.citing': { 'zh-CN': '引用 {n}', 'en-US': 'Refs {n}' },
  'msg.cited': { 'zh-CN': '被引用 {n}', 'en-US': 'Cited by {n}' },
  'msg.thinking': { 'zh-CN': '思考过程', 'en-US': 'Thinking' },
  'msg.eval': { 'zh-CN': '评估结果', 'en-US': 'Evaluation' },
  'msg.copyTrace': { 'zh-CN': '复制 TraceId', 'en-US': 'Copy TraceId' },
  'msg.copied': { 'zh-CN': '已复制', 'en-US': 'Copied' },
  'common.close': { 'zh-CN': '关闭', 'en-US': 'Close' },
  'common.emptyText': { 'zh-CN': '暂无内容', 'en-US': 'No content' },
  'common.loadFailed': { 'zh-CN': '加载失败', 'en-US': 'Failed to load' },
  'cron.refresh': { 'zh-CN': '刷新', 'en-US': 'Refresh' },
  'cron.enabledStat': { 'zh-CN': '{n}/{m} 启用', 'en-US': '{n}/{m} enabled' },
  'cron.empty': { 'zh-CN': '暂无定时任务', 'en-US': 'No scheduled tasks' },
  'cron.trigger': { 'zh-CN': '触发', 'en-US': 'Run' },
  'cron.runs': { 'zh-CN': '执行情况', 'en-US': 'Runs' },
  'cron.toggle': { 'zh-CN': '启用/停用', 'en-US': 'Enable/Disable' },
  'cron.edit': { 'zh-CN': '编辑定时时间', 'en-US': 'Edit schedule' },

}

export const useI18nStore = defineStore('i18n', () => {
  const locale = ref<Locale>(
    (localStorage.getItem('brian-locale') as Locale) || 'zh-CN'
  )

  function t(key: string, params?: Record<string, string | number>): string {
    const entry = i18nMap[key]
    let text = entry ? (entry[locale.value] || key) : key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.split(`{${k}}`).join(String(v))
      }
    }
    return text
  }

  function setLocale(newLocale: Locale) {
    locale.value = newLocale
    localStorage.setItem('brian-locale', newLocale)
    document.documentElement.lang = newLocale
    // 标题跟随语言即时刷新(路由切换时由 router.afterEach 接管)
    const seg = window.location.pathname === '/' ? 'home' : window.location.pathname.slice(1).split('?')[0].split('/')[0]
    const entry = i18nMap[`nav.${seg}`]
    if (entry) document.title = `${entry[newLocale]} - Brian-Agent`
  }

  const isZh = computed(() => locale.value === 'zh-CN')

  return { locale, t, setLocale, isZh }
})
