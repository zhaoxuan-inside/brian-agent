/**
 * @fileoverview 信息页「学习资料库」页签的业务逻辑组合式函数。
 *
 * 从 InfoView.vue 分离：资料库增删与路径校验 / 文件树与目录导航 /
 * 文件阅读（分页 sentinel）/ 划词咨询（annotations）/ 右键菜单。
 */

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { LibraryFileEntry, LibraryPath, LibraryTreeNode } from '../api/types'
import { libraryApi } from '../api'

/** 一条读伴咨询（划词提问）的完整卡片数据 */
export interface DocAnnotation {
  id: string
  question: string
  result: string
  selectionText: string
  /** 原文已变更导致无法在正文中定位（下划线失效，但卡片仍展示） */
  stale: boolean
}

/** 模糊重锚定的字符重合度阈值 */
export const FUZZY_MATCH_THRESHOLD = 0.6
/** 模糊重锚定要求的最短归一化长度（过短易误锚定） */
export const FUZZY_MIN_LENGTH = 6

/** 归一化：去掉空白与标点/符号并转小写，返回压缩文本与到原下标的映射 */
export function normalizeForFuzzy(s: string): { text: string; map: number[] } {
  const punct = /[\p{P}\p{S}]/u
  const chars: string[] = []
  const map: number[] = []
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (/\s/u.test(ch) || punct.test(ch)) continue
    chars.push(ch.toLowerCase())
    map.push(i)
  }
  return { text: chars.join(''), map }
}

/**
 * 模糊重锚定：编辑后原文微调（改字/加词/调标点）导致精确匹配失败时，
 * 以选中片段归一化后的头/中/尾探针在全文中收集候选窗口，按字符重合度
 * （顺序无关计数交集，对插入/删除/位移鲁棒）取最优，≥阈值视为命中。
 *
 * @returns 命中区域在原始全文中的 [start, end)；未命中返回 null。
 */
export function fuzzyLocate(full: string, needle: string): { start: number; end: number } | null {
  const normNeedle = normalizeForFuzzy(needle)
  const needleText = normNeedle.text
  const len = needleText.length
  if (len < FUZZY_MIN_LENGTH) return null
  const normFull = normalizeForFuzzy(full)
  const hay = normFull.text
  if (hay.length < len) return null

  const scoreWindow = (at: number): number => {
    const counts = new Map<string, number>()
    for (let k = 0; k < len; k++) counts.set(needleText[k], (counts.get(needleText[k]) || 0) + 1)
    let hit = 0
    for (let k = 0; k < len; k++) {
      const left = counts.get(hay[at + k]) || 0
      if (left > 0) { counts.set(hay[at + k], left - 1); hit++ }
    }
    return hit / len
  }

  const probeLen = Math.min(8, len)
  const midFrom = Math.floor((len - probeLen) / 2)
  const candidates = new Set<number>()
  const collect = (probe: string, toStart: (found: number) => number) => {
    if (!probe) return
    let idx = hay.indexOf(probe)
    let found = 0
    while (idx >= 0 && found < 20) {
      candidates.add(Math.max(0, toStart(idx)))
      idx = hay.indexOf(probe, idx + 1)
      found += 1
    }
  }
  collect(needleText.slice(0, probeLen), (found) => found)
  collect(needleText.slice(midFrom, midFrom + probeLen), (found) => found - midFrom)
  collect(needleText.slice(len - probeLen), (found) => found + probeLen - len)
  if (candidates.size === 0) return null

  let best = -1
  let bestScore = 0
  for (const cand of candidates) {
    if (cand + len > hay.length) continue
    const score = scoreWindow(cand)
    if (score > bestScore) { bestScore = score; best = cand }
  }
  if (best < 0 || bestScore < FUZZY_MATCH_THRESHOLD) return null
  return { start: normFull.map[best], end: normFull.map[best + len - 1] + 1 }
}

/**
 * 学习资料库页签状态与操作。
 */
export function useLibraryTab() {
const loadingLibs = ref(false)
const showAddLib = ref(false)
const newLib = ref({ name: '', description: '', path: '' })
const pathCheckResult = ref<{ exists: boolean; isReadable: boolean; isWritable: boolean } | null>(null)
const checkingPath = ref(false)
const libraryDetail = ref<LibraryPath | null>(null)

const libraries = ref<LibraryPath[]>([])
async function loadLibraries() {
  loadingLibs.value = true
  try { libraries.value = await libraryApi.paths() }
  catch { /* ignore */ }
  finally { loadingLibs.value = false }
}

async function checkLibPath() {
  if (!newLib.value.path) return
  checkingPath.value = true
  try { pathCheckResult.value = await libraryApi.checkPath(newLib.value.path) }
  catch { pathCheckResult.value = { exists: false, isReadable: false, isWritable: false } }
  finally { checkingPath.value = false }
}

async function handleAddLibrary() {
  if (!newLib.value.name || !newLib.value.path) return
  try {
    await libraryApi.addPath({ ...newLib.value, category: 'general' })
    showAddLib.value = false
    newLib.value = { name: '', description: '', path: '' }
    pathCheckResult.value = null
    await loadLibraries()
  } catch { /* ignore */ }
}

async function handleDeleteLibrary(id: string) {
  await libraryApi.deletePath(id)
  libraries.value = libraries.value.filter(l => l.id !== id)
}

async function handleToggleLibrary(lib: LibraryPath) {
  try {
    const result = await libraryApi.setEnabled(lib.id, !lib.enableSelfLearning)
    lib.enableSelfLearning = result.enabled
    await loadLibraries()
  } catch { /* ignore */ }
}

// Library detail
const libraryFiles = ref<LibraryFileEntry[]>([])
const libraryTree = ref<LibraryTreeNode[]>([])
const currentDirectory = ref('')
const fileKeyword = ref('')
const fileHasMore = ref(false)
const fileNextCursor = ref<string | null>(null)
const fileLoading = ref(false)
const fileLoadingMore = ref(false)
const selectedFile = ref<{ fileId: string; name: string; content: string } | null>(null)
const selectedFileLoading = ref(false)

const libraryBreadcrumb = computed(() => {
  const parts = currentDirectory.value ? currentDirectory.value.split('/').filter(Boolean) : []
  const items = [{ label: '根目录', path: '' }]
  for (let i = 0; i < parts.length; i++) {
    items.push({ label: parts[i], path: parts.slice(0, i + 1).join('/') })
  }
  return items
})

function openLibraryDetail(lib: LibraryPath) {
  libraryDetail.value = lib
  currentDirectory.value = ''
  fileKeyword.value = ''
  selectedFile.value = null
  annotations.value = []
  closeEditor()
  Promise.all([loadLibraryFiles(true), loadLibraryTree()])
}

async function loadLibraryFiles(reset = true) {
  if (!libraryDetail.value) return
  if (reset) fileLoading.value = true
  else fileLoadingMore.value = true
  try {
    const data = await libraryApi.files(libraryDetail.value.id, {
      directory: currentDirectory.value,
      keyword: fileKeyword.value.trim() || undefined,
      cursor: reset ? undefined : fileNextCursor.value || undefined,
      limit: 50,
    })
    if (reset) libraryFiles.value = data.files
    else libraryFiles.value = [...libraryFiles.value, ...data.files]
    fileHasMore.value = data.has_more
    fileNextCursor.value = data.next_cursor
  } catch { /* ignore */ }
  finally {
    if (reset) fileLoading.value = false
    else fileLoadingMore.value = false
  }
}

async function loadMoreLibraryFiles() {
  if (!fileHasMore.value || fileLoadingMore.value || fileLoading.value) return
  await loadLibraryFiles(false)
}

async function loadLibraryTree() {
  if (!libraryDetail.value) return
  try { libraryTree.value = await libraryApi.tree(libraryDetail.value.id) }
  catch { libraryTree.value = [] }
}

function enterDirectory(dirPath: string) {
  currentDirectory.value = dirPath
  selectedFile.value = null
  loadLibraryFiles(true)
}

function goUpDirectory() {
  if (!currentDirectory.value) return
  const idx = currentDirectory.value.lastIndexOf('/')
  currentDirectory.value = idx > 0 ? currentDirectory.value.slice(0, idx) : ''
  selectedFile.value = null
  loadLibraryFiles(true)
}

async function openFile(file: LibraryFileEntry) {
  if (file.isDirectory) { enterDirectory(file.relativePath); return }
  selectedFileLoading.value = true
  closeEditor()
  annotations.value = []
  activeAnnotationId.value = null

  const [contentResult, annotationsResult] = await Promise.allSettled([
    libraryApi.fileContent(file.id),
    libraryApi.fileAnnotations(file.id),
  ])

  if (contentResult.status === 'fulfilled') {
    selectedFile.value = { fileId: file.id, name: contentResult.value.fileName, content: contentResult.value.content }
  } else {
    // ===== 修改后（2026-09-21）：文档可能已被删除/移动，给出可读的降级文案而非空白 =====
    selectedFile.value = { fileId: file.id, name: file.name, content: '> 文档内容读取失败：该文档可能已被删除或不可读。' }
  }
  selectedFileLoading.value = false

  await nextTick()

  if (annotationsResult.status === 'fulfilled') {
    annotations.value = annotationsResult.value.map((a) => ({
      id: a.id,
      question: a.question,
      result: a.result,
      selectionText: a.selection_text,
      stale: false,
    }))
    await nextTick()
    refreshAnnotationMarks()
  }
}

// ===== 原始 restoreMark（保留作为参考，2026-09-21 改为跨节点匹配 + 模糊重锚定） =====
// function restoreMark(text: string, id: string, index: number): boolean {
//   const container = contentAreaRef.value
//   if (!container || !text) return false
//   const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
//   let node: Node | null
//   while ((node = walker.nextNode())) {
//     if (node.parentElement?.classList.contains('doc-annotation-mark')) continue
//     const nodeText = node.textContent || ''
//     const idx = nodeText.indexOf(text)
//     if (idx >= 0) {
//       try {
//         const range = document.createRange()
//         range.setStart(node, idx)
//         range.setEnd(node, idx + text.length)
//         const mark = document.createElement('mark')
//         mark.setAttribute('data-anchor-id', id)
//         mark.setAttribute('data-anno-index', String(index))
//         mark.className = 'doc-annotation-mark'
//         range.surroundContents(mark)
//         return true
//       } catch { return false }
//     }
//   }
//   return false
// }

/** 正文文本索引：拼接后每个字符对应的文本节点与节点内偏移，用于回放 Range */
interface DomTextPos { node: Text; offset: number }

/** 可包裹进内联 mark 的元素上限：跨块级元素的选中不绘制下划线（避免非法嵌套） */
const INLINE_WRAP_BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,table,ul,ol,div,hr'

/**
 * 拼接容器内全部可见文本节点，记录每个字符的 (node, offset)。
 * 已标注（mark 内）的文本跳过，避免重复包裹。
 */
function buildDomTextIndex(container: HTMLElement): { text: string; pos: DomTextPos[] } {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const chars: string[] = []
  const pos: DomTextPos[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.parentElement?.classList.contains('doc-annotation-mark')) continue
    const value = node.textContent || ''
    for (let i = 0; i < value.length; i++) {
      chars.push(value[i])
      pos.push({ node: node as Text, offset: i })
    }
  }
  return { text: chars.join(''), pos }
}

/**
 * 用带编号的 mark 包裹指定 Range。
 * surroundContents 仅支持单节点内 Range，跨内联节点（加粗/链接拆开文本）
 * 时退回 extract/insert 方式；跨块级元素会产生非法嵌套，放弃标注。
 *
 * @returns 是否成功绘制下划线。
 */
function wrapRange(range: Range, id: string, index: number): boolean {
  const mark = document.createElement('mark')
  mark.setAttribute('data-anchor-id', id)
  mark.setAttribute('data-anno-index', String(index))
  mark.className = 'doc-annotation-mark'
  try {
    range.surroundContents(mark)
    return true
  } catch { /* 跨节点：退回 extract/insert */ }
  let frag: DocumentFragment
  try { frag = range.extractContents() } catch { return false }
  if (frag.querySelector(INLINE_WRAP_BLOCK_SELECTOR)) {
    try { range.insertNode(frag) } catch { /* 还原失败也无从标注 */ }
    return false
  }
  mark.appendChild(frag)
  try {
    range.insertNode(mark)
    return true
  } catch { return false }
}

/**
 * 在正文中定位一条咨询的原文位置并绘制下划线（2026-09-21 重写）：
 * 1) 全文拼接文本节点精确匹配——支持同一块级元素内跨内联节点；
 * 2) 失败时按 fuzzyLocate 模糊重锚定——编辑后原文微调仍能对齐；
 * 3) 仍失败返回 false，由调用方标记「原文已变更」。
 *
 * @returns 是否成功标注。
 */
function restoreMark(text: string, id: string, index: number): boolean {
  const container = contentAreaRef.value
  if (!container || !text) return false
  const { text: full, pos } = buildDomTextIndex(container)
  if (!full) return false

  const exactAt = full.indexOf(text)
  if (exactAt >= 0) {
    if (exactAt + text.length > pos.length) return false
    const range = document.createRange()
    range.setStart(pos[exactAt].node, pos[exactAt].offset)
    range.setEnd(pos[exactAt + text.length - 1].node, pos[exactAt + text.length - 1].offset + 1)
    return wrapRange(range, id, index)
  }

  const fuzzy = fuzzyLocate(full, text)
  if (!fuzzy || fuzzy.end > pos.length) return false
  const range = document.createRange()
  range.setStart(pos[fuzzy.start].node, pos[fuzzy.start].offset)
  range.setEnd(pos[fuzzy.end - 1].node, pos[fuzzy.end - 1].offset + 1)
  return wrapRange(range, id, index)
}

/**
 * 重建全部咨询标注（内容变更 / 编辑保存后调用）：
 * 清除旧 mark 后逐条按 selection_text 重新匹配，匹配失败者标记 stale（原文已变更）。
 */
// ===== 原始 refreshAnnotationMarks（保留作为参考，2026-09-21 增加边注重排触发） =====
// function refreshAnnotationMarks(): void {
//   const container = contentAreaRef.value
//   if (!container) return
//   container.querySelectorAll('mark.doc-annotation-mark').forEach((el) => {
//     const parent = el.parentNode
//     if (!parent) return
//     while (el.firstChild) parent.insertBefore(el.firstChild, el)
//     parent.removeChild(el)
//   })
//   let index = 0
//   for (const ann of annotations.value) {
//     index += 1
//     ann.stale = !restoreMark(ann.selectionText, ann.id, index)
//   }
//   setActiveAnnotation(activeAnnotationId.value)
// }

// ===== 修改后的 refreshAnnotationMarks（2026-09-21）：重建标注后同步重排边注 =====
function refreshAnnotationMarks(): void {
  const container = contentAreaRef.value
  if (!container) return
  container.querySelectorAll('mark.doc-annotation-mark').forEach((el) => {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  })
  let index = 0
  for (const ann of annotations.value) {
    index += 1
    ann.stale = !restoreMark(ann.selectionText, ann.id, index)
  }
  setActiveAnnotation(activeAnnotationId.value)
  // 标注位置已变化：边注卡片需重新对齐
  void nextTick().then(relayoutMarginNotes)
}

// ===== 原始 setActiveAnnotation（保留作为参考，2026-09-21 增加边注卡片联动滚动） =====
// function setActiveAnnotation(id: string | null): void {
//   const container = contentAreaRef.value
//   if (!container) return
//   container.querySelectorAll('mark.doc-annotation-mark').forEach((el) => el.classList.remove('is-active'))
//   if (!id) return
//   const el = container.querySelector(`mark[data-anchor-id="${id}"]`) as HTMLElement | null
//   if (el) {
//     el.classList.add('is-active')
//     el.scrollIntoView({ behavior: 'smooth', block: 'center' })
//   }
// }

// ===== 修改后的 setActiveAnnotation（2026-09-21）：正文标注与边注卡片双向联动 =====
function setActiveAnnotation(id: string | null): void {
  const container = contentAreaRef.value
  if (!container) return
  container.querySelectorAll('mark.doc-annotation-mark').forEach((el) => el.classList.remove('is-active'))
  if (!id) return
  const el = container.querySelector(`mark[data-anchor-id="${id}"]`) as HTMLElement | null
  if (el) {
    el.classList.add('is-active')
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  // 激活的边注卡片若被顺延出可视区，滚入视口（block:'nearest' 已可见时不打断滚动）
  if (marginMode.value) {
    const card = marginLayerRef.value?.querySelector(`[data-note-id="${id}"]`) as HTMLElement | null
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

// ========== 文档展示区：注释（咨询） ==========
const annotations = ref<DocAnnotation[]>([])
const activeAnnotationId = ref<string | null>(null)
const askDialog = ref<{ selectionText: string; contextBefore: string; contextAfter: string; question: string } | null>(null)
/** 询问读伴的失败反馈（弹窗内展示；成功后清空） */
const askError = ref('')
const asking = ref(false)
const contextMenu = ref<{ x: number; y: number } | null>(null)
const contentAreaRef = ref<HTMLElement | null>(null)

// ========== 边注（marginalia）模式（2026-09-21） ==========
// 思想来自读纸质书：在正文旁的空白区写批注。宽屏（≥1360px）时问答卡片
// 脱离独立右栏，垂直对齐到正文对应标注右侧的空白处，编号徽章 + 引线
// 建立补充内容与原文的视觉联系；窄屏回退为右栏列表。
/** 边注模式断点：视口 ≥1360px 时正文右侧有足够空白承载边注 */
const MARGIN_MEDIA_QUERY = '(min-width: 1360px)'
/** 相邻边注卡片之间的最小垂直间距（px） */
const MARGIN_NOTE_GAP = 16
/** 边注卡片相对其正文标注的垂直偏移（px），让编号徽章大致对齐标注行 */
const MARGIN_NOTE_OFFSET = 4

const marginMode = ref(false)
/** 每条边注的垂直偏移（相对正文内容区顶部，px），键为注释 id */
const noteTops = ref<Record<string, number>>({})
const marginLayerRef = ref<HTMLElement | null>(null)
let marginMedia: MediaQueryList | null = null
let marginMediaHandler: (() => void) | null = null
let contentResizeObserver: ResizeObserver | null = null

/** 正文内容区的 relative 包裹层（承载边注层与 min-height 撑开） */
function marginWrap(): HTMLElement | null {
  return contentAreaRef.value?.parentElement ?? null
}

function updateMarginMode(): void {
  const next = !!marginMedia?.matches
  if (next === marginMode.value) return
  marginMode.value = next
  if (!next) {
    noteTops.value = {}
    marginWrap()?.style.removeProperty('min-height')
  }
  // 切换到边注模式：等边注层挂载后再测量定位
  void nextTick().then(relayoutMarginNotes)
}

/**
 * 重排边注：按正文标注的垂直位置对齐卡片，相邻卡片重叠时向下顺延；
 * 并以最后一张卡片的底边撑开内容区（绝对定位的边注超出正文高度时仍可滚动到）。
 */
function relayoutMarginNotes(): void {
  if (!marginMode.value) return
  const textEl = contentAreaRef.value
  if (!textEl) return
  const textTop = textEl.getBoundingClientRect().top
  let cursor = 0
  const tops: Record<string, number> = {}
  for (const ann of annotations.value) {
    const mark = textEl.querySelector(`mark[data-anchor-id="${ann.id}"]`) as HTMLElement | null
    const markTop = mark ? Math.max(0, mark.getBoundingClientRect().top - textTop - MARGIN_NOTE_OFFSET) : cursor
    const top = Math.max(markTop, cursor)
    tops[ann.id] = top
    const card = marginLayerRef.value?.querySelector(`[data-note-id="${ann.id}"]`) as HTMLElement | null
    cursor = top + (card ? card.offsetHeight : 0) + MARGIN_NOTE_GAP
  }
  noteTops.value = tops
  const wrap = marginWrap()
  if (wrap) wrap.style.minHeight = `${Math.max(cursor - MARGIN_NOTE_GAP, 0)}px`
}

/** 事件委托：点击正文中的咨询标注，联动激活对应边注卡片 */
function handleMarkClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  const mark = target?.closest('mark.doc-annotation-mark') as HTMLElement | null
  if (!mark) return
  const id = mark.getAttribute('data-anchor-id')
  if (id) handleCardClick(id)
}

// ===== 文档编辑 / 删除（2026-09-21）=====
const editorOpen = ref(false)
const editorContent = ref('')
const savingFile = ref(false)
const deleteConfirm = ref(false)
const deletingFile = ref(false)

interface ArticleSection { id: string; level: number; title: string }
const articleSections = computed<ArticleSection[]>(() => {
  const content = selectedFile.value?.content || ''
  const sections: ArticleSection[] = []
  for (const line of content.split('\n')) {
    const m = line.match(/^(#{1,4})\s+(.+)$/)
    if (m) {
      sections.push({ id: `sec-${sections.length}`, level: m[1].length, title: m[2].trim() })
    }
  }
  return sections
})

let pendingSelection: { startContainer: Node; startOffset: number; endContainer: Node; endOffset: number } | null = null
let pendingAskContext: { text: string; contextBefore: string; contextAfter: string; selectionStart: number; selectionEnd: number } | null = null

function handleFileContextMenu(event: MouseEvent) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const text = selection.toString().trim()
  if (!text) return
  const range = selection.getRangeAt(0)
  pendingSelection = {
    startContainer: range.startContainer,
    startOffset: range.startOffset,
    endContainer: range.endContainer,
    endOffset: range.endOffset,
  }
  const content = selectedFile.value?.content || ''
  const idx = content.indexOf(text)
  const contextBefore = idx > 0 ? content.slice(Math.max(0, idx - 500), idx) : ''
  const contextAfter = idx >= 0 ? content.slice(idx + text.length, idx + text.length + 500) : ''
  pendingAskContext = {
    text,
    contextBefore,
    contextAfter,
    selectionStart: idx >= 0 ? idx : 0,
    selectionEnd: idx >= 0 ? idx + text.length : text.length,
  }
  contextMenu.value = { x: event.clientX, y: event.clientY }
}

function closeContextMenu() {
  contextMenu.value = null
}

function openAskDialog() {
  if (!contextMenu.value || !pendingAskContext) return
  askError.value = ''
  askDialog.value = {
    selectionText: pendingAskContext.text,
    contextBefore: pendingAskContext.contextBefore,
    contextAfter: pendingAskContext.contextAfter,
    question: '',
  }
  contextMenu.value = null
}

// ===== 原始 submitAsk（保留作为参考，2026-09-21 增加错误反馈） =====
// async function submitAsk() {
//   if (!askDialog.value) return
//   const dlg = askDialog.value
//   asking.value = true
//   try {
//     const data = await libraryApi.queryDocument({ /* … */ })
//     // …落卡与持久化…
//   } catch { /* ignore */ }
//   finally { asking.value = false }
// }

// ===== 修改后的 submitAsk（2026-09-21）：失败在弹窗内给出可见错误，保留输入便于重试 =====
// 背景：读伴问答是同步 LLM 推理（实测 10~30s+），此前失败被静默吞掉，
// 用户只看到按钮转圈/停止，无任何反馈，感知为「一直在转圈」。
async function submitAsk() {
  if (!askDialog.value) return
  const dlg = askDialog.value
  asking.value = true
  askError.value = ''
  try {
    const data = await libraryApi.queryDocument({
      selection: dlg.selectionText,
      context_before: dlg.contextBefore,
      context_after: dlg.contextAfter,
      question: dlg.question.trim() || '请解释这段内容',
      document_title: selectedFile.value?.name,
    })
    const id = `ann-${Date.now()}`
    const question = dlg.question.trim() || '请解释这段内容'
    annotations.value.push({
      id,
      question,
      result: data.result,
      selectionText: dlg.selectionText,
      stale: false,
    })
    activeAnnotationId.value = id
    markSelection(id, annotations.value.length)
    askDialog.value = null
    await nextTick()
    relayoutMarginNotes()
    setActiveAnnotation(id)
    // 持久化咨询卡片与关联关系
    if (selectedFile.value && pendingAskContext) {
      try {
        await libraryApi.saveAnnotation({
          library_id: libraryDetail.value?.id,
          file_id: selectedFile.value.fileId,
          selection_text: dlg.selectionText,
          selection_start: pendingAskContext.selectionStart,
          selection_end: pendingAskContext.selectionEnd,
          question,
          result: data.result,
          llm_id: data.llm_id,
        })
      } catch { /* ignore */ }
    }
  } catch (err: unknown) {
    // 超时（AbortSignal.timeout → TimeoutError）与一般失败都给出可读提示
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      askError.value = '咨询超时：读伴响应超过 60 秒，请稍后重试或缩短选中的内容。'
    } else {
      askError.value = err instanceof Error && err.message
        ? `咨询失败：${err.message}`
        : '咨询失败：网络异常或读伴服务不可用，请稍后重试。'
    }
  }
  finally { asking.value = false }
}

function handleCardClick(id: string) {
  activeAnnotationId.value = activeAnnotationId.value === id ? null : id
  setActiveAnnotation(activeAnnotationId.value)
}

function scrollToSection(section: ArticleSection) {
  const container = contentAreaRef.value
  if (!container) return
  const headings = container.querySelectorAll('h1, h2, h3, h4')
  for (const h of headings) {
    if ((h.textContent || '').trim() === section.title) {
      h.scrollIntoView({ behavior: 'smooth', block: 'start' })
      break
    }
  }
}

// ===== 原始 markSelection（保留作为参考，2026-09-21 改用 wrapRange 支持跨内联节点） =====
// function markSelection(id: string, index: number) {
//   if (!pendingSelection) return
//   try {
//     const range = document.createRange()
//     range.setStart(pendingSelection.startContainer, pendingSelection.startOffset)
//     range.setEnd(pendingSelection.endContainer, pendingSelection.endOffset)
//     const mark = document.createElement('mark')
//     mark.setAttribute('data-anchor-id', id)
//     mark.setAttribute('data-anno-index', String(index))
//     mark.className = 'doc-annotation-mark'
//     range.surroundContents(mark)
//   } catch { /* 跨节点选中无法包裹，跳过下划线 */ }
// }

// ===== 修改后的 markSelection（2026-09-21）：跨内联节点选中也能落标注 =====
function markSelection(id: string, index: number) {
  if (!pendingSelection) return
  try {
    const range = document.createRange()
    range.setStart(pendingSelection.startContainer, pendingSelection.startOffset)
    range.setEnd(pendingSelection.endContainer, pendingSelection.endOffset)
    wrapRange(range, id, index)
  } catch { /* 无法包裹时跳过下划线 */ }
}

// ===== 文档编辑：写回本地文件 =====
function openEditor() {
  if (!selectedFile.value) return
  editorContent.value = selectedFile.value.content
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
  editorContent.value = ''
}

async function saveEditor() {
  if (!selectedFile.value || savingFile.value) return
  const fileId = selectedFile.value.fileId
  const name = selectedFile.value.name
  savingFile.value = true
  try {
    const res = await libraryApi.updateFileContent(fileId, editorContent.value)
    selectedFile.value = { fileId, name: res.fileName || name, content: res.content }
    const entry = libraryFiles.value.find((f) => f.id === fileId)
    if (entry) {
      entry.size = res.size
      entry.status = 'PENDING'
      entry.learnedAt = 0
    }
    closeEditor()
    await nextTick()
    // 内容已变更：重新匹配注释下划线，匹配失败的标记为「原文已变更」
    refreshAnnotationMarks()
  } catch { /* ignore */ }
  finally { savingFile.value = false }
}

// ===== 文档删除：删除本地文件 + 级联清理注释 =====
function requestDeleteFile() {
  if (!selectedFile.value) return
  deleteConfirm.value = true
}

function cancelDeleteFile() {
  deleteConfirm.value = false
}

async function confirmDeleteFile() {
  const file = selectedFile.value
  if (!file || deletingFile.value) return
  deletingFile.value = true
  try {
    await libraryApi.deleteFile(file.fileId)
    libraryFiles.value = libraryFiles.value.filter((f) => f.id !== file.fileId)
    deleteConfirm.value = false
    closeFileModal()
  } catch { /* ignore */ }
  finally { deletingFile.value = false }
}

function closeFileModal() {
  selectedFile.value = null
  annotations.value = []
  activeAnnotationId.value = null
  askDialog.value = null
  askError.value = ''
  contextMenu.value = null
  closeEditor()
  deleteConfirm.value = false
  pendingSelection = null
  pendingAskContext = null
  // 边注状态随阅读视图一并清理（2026-09-21）
  noteTops.value = {}
}

const libraryFileSentinel = ref<HTMLElement | null>(null)
let libraryFileObserver: IntersectionObserver | null = null
watch(libraryFileSentinel, (el) => {
  libraryFileObserver?.disconnect()
  libraryFileObserver = null
  if (el) {
    libraryFileObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMoreLibraryFiles()
    }, { rootMargin: '200px' })
    libraryFileObserver.observe(el)
  }
})

// ===== 边注模式监听（2026-09-21） =====
// 正文高度变化（图片加载 / 编辑写回 / 窗口缩放引起换行变化）时重排边注
watch(contentAreaRef, (el) => {
  contentResizeObserver?.disconnect()
  contentResizeObserver = null
  if (el) {
    contentResizeObserver = new ResizeObserver(() => relayoutMarginNotes())
    contentResizeObserver.observe(el)
  }
})

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  marginMedia = window.matchMedia(MARGIN_MEDIA_QUERY)
  marginMode.value = marginMedia.matches
  marginMediaHandler = updateMarginMode
  marginMedia.addEventListener('change', marginMediaHandler)
}

let fileSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(fileKeyword, () => {
  if (fileSearchTimer) clearTimeout(fileSearchTimer)
  fileSearchTimer = setTimeout(() => { loadLibraryFiles(true) }, 300)
})

  // 注意：清理钩子必须在 return 之前注册——return 之后本函数已退出，代码不可达
  onBeforeUnmount(() => {
    libraryFileObserver?.disconnect()
    libraryFileObserver = null
    contentResizeObserver?.disconnect()
    contentResizeObserver = null
    if (marginMedia && marginMediaHandler) {
      marginMedia.removeEventListener('change', marginMediaHandler)
      marginMedia = null
      marginMediaHandler = null
    }
  })

  return {
    activeAnnotationId,
    annotations,
    articleSections,
    askDialog,
    asking,
    askError,
    cancelDeleteFile,
    checkLibPath,
    checkingPath,
    closeContextMenu,
    closeEditor,
    closeFileModal,
    confirmDeleteFile,
    contentAreaRef,
    contextMenu,
    currentDirectory,
    deleteConfirm,
    deletingFile,
    editorContent,
    editorOpen,
    enterDirectory,
    fileHasMore,
    fileKeyword,
    fileLoading,
    fileLoadingMore,
    fileNextCursor,
    goUpDirectory,
    handleAddLibrary,
    handleCardClick,
    handleDeleteLibrary,
    handleFileContextMenu,
    handleMarkClick,
    handleToggleLibrary,
    libraries,
    libraryBreadcrumb,
    libraryDetail,
    libraryFileSentinel,
    libraryFiles,
    libraryTree,
    loadLibraries,
    loadLibraryFiles,
    loadLibraryTree,
    loadMoreLibraryFiles,
    loadingLibs,
    marginLayerRef,
    marginMode,
    newLib,
    noteTops,
    openAskDialog,
    openEditor,
    openFile,
    openLibraryDetail,
    pathCheckResult,
    requestDeleteFile,
    saveEditor,
    savingFile,
    scrollToSection,
    selectedFile,
    selectedFileLoading,
    showAddLib,
    submitAsk,
  }
}
