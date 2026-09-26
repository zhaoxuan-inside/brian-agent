import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { LibraryFileEntry, LibraryPath, LibraryTreeNode } from '../api/types'
import { libraryApi } from '../api'

export interface DocAnnotation {
  id: string
  question: string
  result: string
  selectionText: string

  stale: boolean
}

export const FUZZY_MATCH_THRESHOLD = 0.6

export const FUZZY_MIN_LENGTH = 6

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
  catch {  }
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
  } catch {  }
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
  } catch {  }
}

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
  } catch {  }
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

interface DomTextPos { node: Text; offset: number }

const INLINE_WRAP_BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,table,ul,ol,div,hr'

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

function wrapRange(range: Range, id: string, index: number): boolean {
  const mark = document.createElement('mark')
  mark.setAttribute('data-anchor-id', id)
  mark.setAttribute('data-anno-index', String(index))
  mark.className = 'doc-annotation-mark'
  try {
    range.surroundContents(mark)
    return true
  } catch {  }
  let frag: DocumentFragment
  try { frag = range.extractContents() } catch { return false }
  if (frag.querySelector(INLINE_WRAP_BLOCK_SELECTOR)) {
    try { range.insertNode(frag) } catch {  }
    return false
  }
  mark.appendChild(frag)
  try {
    range.insertNode(mark)
    return true
  } catch { return false }
}

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

  void nextTick().then(relayoutMarginNotes)
}

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

  if (marginMode.value) {
    const card = marginLayerRef.value?.querySelector(`[data-note-id="${id}"]`) as HTMLElement | null
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

const annotations = ref<DocAnnotation[]>([])
const activeAnnotationId = ref<string | null>(null)
const askDialog = ref<{ selectionText: string; contextBefore: string; contextAfter: string; question: string } | null>(null)

const askError = ref('')
const asking = ref(false)
const contextMenu = ref<{ x: number; y: number } | null>(null)
const contentAreaRef = ref<HTMLElement | null>(null)

const MARGIN_MEDIA_QUERY = '(min-width: 1360px)'

const MARGIN_NOTE_GAP = 16

const MARGIN_NOTE_OFFSET = 4

const marginMode = ref(false)

const noteTops = ref<Record<string, number>>({})
const marginLayerRef = ref<HTMLElement | null>(null)
let marginMedia: MediaQueryList | null = null
let marginMediaHandler: (() => void) | null = null
let contentResizeObserver: ResizeObserver | null = null

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

  void nextTick().then(relayoutMarginNotes)
}

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

function handleMarkClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  const mark = target?.closest('mark.doc-annotation-mark') as HTMLElement | null
  if (!mark) return
  const id = mark.getAttribute('data-anchor-id')
  if (id) handleCardClick(id)
}

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
      } catch {  }
    }
  } catch (err: unknown) {

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

function markSelection(id: string, index: number) {
  if (!pendingSelection) return
  try {
    const range = document.createRange()
    range.setStart(pendingSelection.startContainer, pendingSelection.startOffset)
    range.setEnd(pendingSelection.endContainer, pendingSelection.endOffset)
    wrapRange(range, id, index)
  } catch {  }
}

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

    refreshAnnotationMarks()
  } catch {  }
  finally { savingFile.value = false }
}

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
  } catch {  }
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
