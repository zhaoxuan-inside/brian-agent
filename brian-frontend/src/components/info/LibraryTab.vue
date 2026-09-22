<script setup lang="ts">
/**
 * 信息页「学习资料库」页签视图：资料库卡片 / 目录浏览 / 文档阅读（划词咨询）/ 文档编辑与删除。
 * 业务逻辑来自 useLibraryTab（经 InfoView 注入）。
 *
 * 阅读区采用「目录 + 正文 + 读伴提问」三栏阅读器：
 * - 正文为舒适行宽的阅读栏，选中内容右键即可提问；
 * - 提问以编号下划线标注正文位置，点击卡片滚动定位并高亮；
 * - 宽屏（≥1360px）下问答结果以「边注」形式呈现在正文右侧空白处，
 *   与对应原文标注垂直对齐（纸质书空白批注的体验）；窄屏回退为右栏列表；
 * - 文档内容变更后，无法匹配的提问标注为「原文已变更」，卡片仍保留。
 */
import { computed, inject } from 'vue'
import {
  Plus, Folder, Trash2, ArrowLeft, ChevronRight, Search,
  FileText, Sparkles, Loader2, X, Pencil, Check, BookOpen,
} from '@lucide/vue'
import AnnotationCard from '@/components/info/AnnotationCard.vue'
import LibraryTreeItem from '@/components/LibraryTreeItem.vue'
import { INFO_TABS_KEY } from '@/composables/useInfoTabs'
import { formatFileSize } from '@/utils/format'
import { renderMarkdown } from '@/utils/markdown'

const {
  activeAnnotationId,
  annotations,
  articleSections,
  askDialog,
  askError,
  asking,
  cancelDeleteFile,
  checkLibPath,
  checkingPath,
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
} = inject(INFO_TABS_KEY)!.library

/** 当前文档在文件列表中的条目（读取体积 / 学习状态等元信息） */
const selectedEntry = computed(() => libraryFiles.value.find(f => f.id === selectedFile.value?.fileId) || null)

/** 当前文档正文字数（去掉空白） */
const charCount = computed(() => (selectedFile.value?.content || '').replace(/\s/g, '').length)

const statusLabel = computed(() => {
  const status = selectedEntry.value?.status || ''
  if (status === 'COMPLETED') return '已学习'
  if (status === 'FAILED') return '学习失败'
  if (status === 'PENDING') return '待学习'
  return ''
})
</script>

<template>
  <div class="px-6 pb-8 space-y-4">
    <div v-if="!libraryDetail">
      <h3 class="text-lg font-semibold mb-4">资料库</h3>
      <div v-if="loadingLibs" class="text-center py-8 text-apple-gray-400">加载中...</div>
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <button class="flex flex-col items-center justify-center border-2 border-dashed border-apple-gray-300 dark:border-apple-gray-600 rounded-lg text-apple-gray-400 hover:border-brian-blue hover:text-brian-blue transition-colors aspect-[3/2]" @click="showAddLib = true">
          <Plus :size="24" class="mb-1.5" />
          <span class="text-xs font-medium">添加资料库</span>
        </button>
        <div
          v-for="lib in libraries"
          :key="lib.id"
          class="relative p-4 rounded-lg border border-apple-gray-100 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800/50 hover:border-brian-blue/40 hover:shadow-sm transition-all aspect-[3/2] flex flex-col cursor-pointer"
          @click="openLibraryDetail(lib)"
        >
          <div class="flex items-center gap-2 mb-2">
            <div class="p-1.5 bg-brian-blue/10 rounded-lg flex-shrink-0">
              <Folder :size="16" class="text-brian-blue" />
            </div>
            <h4 class="text-sm font-semibold truncate flex-1 min-w-0">{{ lib.name }}</h4>
            <button class="p-1 rounded-lg text-apple-gray-300 hover:text-error-red hover:bg-error-red/10 flex-shrink-0" @click.stop="handleDeleteLibrary(lib.id)">
              <Trash2 :size="13" />
            </button>
          </div>
          <p class="text-[11px] text-apple-gray-400 truncate font-mono">{{ lib.path }}</p>
          <p class="text-xs text-apple-gray-500 line-clamp-2 mt-1.5 flex-1 min-h-0">{{ lib.description || '暂无描述' }}</p>
          <div class="flex items-center justify-between mt-auto pt-2 border-t border-apple-gray-100 dark:border-apple-gray-700">
            <span class="text-[11px] text-apple-gray-400">{{ lib.learnedFiles || 0 }}/{{ lib.totalFiles || 0 }} 文件</span>
            <button class="flex items-center gap-1.5" @click.stop="handleToggleLibrary(lib)">
              <span class="relative w-8 h-4 rounded-full transition-colors" :class="lib.enableSelfLearning ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'">
                <span class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform" :class="lib.enableSelfLearning ? 'translate-x-4' : ''" />
              </span>
              <span class="text-[11px]" :class="lib.enableSelfLearning ? 'text-brian-blue' : 'text-apple-gray-400'">{{ lib.enableSelfLearning ? '启用' : '禁用' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Add library modal -->
      <div v-if="showAddLib" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showAddLib = false">
        <div class="block-card w-full max-w-md mx-4 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">添加资料库</h3>
            <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="showAddLib = false"><X :size="18" /></button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="text-xs font-medium text-apple-gray-500 mb-1 block">资料库名称</label>
              <input v-model="newLib.name" placeholder="输入名称..." class="w-full px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            </div>
            <div>
              <label class="text-xs font-medium text-apple-gray-500 mb-1 block">摘要</label>
              <input v-model="newLib.description" placeholder="输入摘要..." class="w-full px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            </div>
            <div>
              <label class="text-xs font-medium text-apple-gray-500 mb-1 block">路径</label>
              <div class="flex gap-2">
                <input v-model="newLib.path" placeholder="/path/to/library" class="flex-1 px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
                <button class="px-3 py-2 text-xs font-medium btn-secondary whitespace-nowrap" :disabled="checkingPath || !newLib.path" @click="checkLibPath">{{ checkingPath ? '检查中...' : '检查路径' }}</button>
              </div>
              <div v-if="pathCheckResult" class="mt-2 flex items-center gap-3 text-xs">
                <span :class="pathCheckResult.exists ? 'text-success-green' : 'text-error-red'">{{ pathCheckResult.exists ? '✓ 路径存在' : '✗ 路径不存在' }}</span>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button class="btn-secondary" @click="showAddLib = false">取消</button>
            <button class="btn-primary" :disabled="!newLib.name || !newLib.path" @click="handleAddLibrary">提交</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Library detail -->
    <div v-else>
      <!-- 文档阅读 / 编辑 -->
      <div v-if="selectedFile || selectedFileLoading">
        <div class="flex items-center gap-2 mb-4 flex-wrap">
          <button class="flex items-center gap-1 text-sm text-apple-gray-500 hover:text-brian-blue" @click="closeFileModal">
            <ArrowLeft :size="16" /> {{ libraryDetail.name }}
          </button>
          <ChevronRight :size="14" class="text-apple-gray-400" />
          <span class="text-sm font-medium flex items-center gap-1.5 min-w-0"><FileText :size="14" class="text-brian-blue flex-shrink-0" /> <span class="truncate">{{ selectedFile?.name || '加载中...' }}</span></span>
          <div class="ml-auto flex items-center gap-2">
            <button class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors disabled:opacity-50" :disabled="selectedFileLoading" @click="openEditor">
              <Pencil :size="13" /> 编辑
            </button>
            <button class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-error-red/90 hover:bg-error-red/10 transition-colors disabled:opacity-50" :disabled="selectedFileLoading" @click="requestDeleteFile">
              <Trash2 :size="13" /> 删除
            </button>
          </div>
        </div>

        <!-- 编辑模式 -->
        <div v-if="editorOpen" class="block-card rounded-2xl overflow-hidden">
          <div class="flex items-center gap-2 px-5 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <Pencil :size="15" class="text-brian-blue" />
            <span class="text-sm font-semibold">编辑文档</span>
            <span class="text-xs text-apple-gray-400 truncate">{{ selectedFile?.name }}</span>
            <div class="ml-auto flex items-center gap-2">
              <button class="btn-secondary" @click="closeEditor">取消</button>
              <button class="btn-primary flex items-center gap-1.5" :disabled="savingFile" @click="saveEditor">
                <Loader2 v-if="savingFile" :size="14" class="animate-spin" /><Check v-else :size="14" /> 保存
              </button>
            </div>
          </div>
          <textarea
            v-model="editorContent"
            spellcheck="false"
            class="w-full min-h-[62vh] px-6 py-5 bg-transparent text-[13px] leading-relaxed font-mono text-apple-gray-800 dark:text-apple-gray-100 focus:outline-none resize-y"
          ></textarea>
          <div class="px-5 py-2 border-t border-apple-gray-200 dark:border-apple-gray-700 text-[11px] text-apple-gray-400">
            保存后将写回本地 Markdown 文件；改动过的文档会重新进入学习队列，原咨询标注会自动重新对齐到新内容（支持跨行内格式与局部改动），实在无法对齐时才标记「原文已变更」。
          </div>
        </div>

        <!-- 阅读模式 -->
        <div v-else class="flex flex-wrap items-start gap-5">
          <!-- 目录 -->
          <aside class="hidden lg:block w-56 flex-shrink-0 order-1">
            <div class="block-card rounded-2xl p-3 sticky top-32 max-h-[calc(100vh-10rem)] overflow-y-auto">
              <div class="flex items-center gap-1.5 text-xs font-semibold text-apple-gray-500 mb-2 px-1">
                <BookOpen :size="13" /> 目录
              </div>
              <nav class="space-y-0.5">
                <button
                  v-for="sec in articleSections"
                  :key="sec.id"
                  class="w-full text-left text-xs text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/5 rounded-lg py-1.5 pr-2 transition-colors truncate"
                  :style="{ paddingLeft: `${(sec.level - 1) * 12 + 8}px` }"
                  @click="scrollToSection(sec)"
                >
                  {{ sec.title }}
                </button>
                <div v-if="articleSections.length === 0" class="text-xs text-apple-gray-400 px-1 py-2">暂无章节</div>
              </nav>
            </div>
          </aside>

          <!-- 正文阅读栏 -->
          <article class="flex-1 min-w-0 order-2 block-card rounded-2xl overflow-hidden">
            <header class="px-6 sm:px-10 py-5 border-b border-apple-gray-200 dark:border-apple-gray-700">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-base font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ selectedFile?.name }}</span>
                <span v-if="statusLabel" class="text-[11px] px-2 py-0.5 rounded-full" :class="selectedEntry?.status === 'COMPLETED' ? 'bg-success-green/10 text-success-green' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500'">{{ statusLabel }}</span>
              </div>
              <div class="mt-1 text-[11px] text-apple-gray-400">
                {{ articleSections.length }} 个章节 · {{ charCount }} 字<template v-if="selectedEntry"> · {{ formatFileSize(selectedEntry.size) }}</template> · 选中正文右键即可向读伴提问
              </div>
            </header>
            <div v-if="selectedFileLoading" class="text-center py-16 text-apple-gray-400">加载中...</div>
            <div v-else class="max-h-[calc(100vh-16rem)] overflow-y-auto px-6 sm:px-10 py-8">
              <!-- 边注模式：正文靠左 + 右侧空白承载边注（grid 居中，模拟书页版心） -->
              <div class="relative" :class="marginMode ? 'doc-margin-grid' : ''">
                <div
                  ref="contentAreaRef"
                  class="markdown-body doc-reading select-text"
                  :class="marginMode ? '' : 'max-w-[46rem] mx-auto'"
                  @contextmenu.prevent="handleFileContextMenu"
                  @click="handleMarkClick"
                  v-html="renderMarkdown(selectedFile!.content)"
                ></div>
                <!-- 边注层：问答卡片对齐正文标注位置，像写在书页空白处 -->
                <div v-if="marginMode" ref="marginLayerRef" class="doc-margin-layer">
                  <div
                    v-for="(ann, i) in annotations"
                    :key="ann.id"
                    class="doc-margin-note"
                    :class="{ 'is-active': activeAnnotationId === ann.id }"
                    :style="{ top: `${noteTops[ann.id] ?? 0}px` }"
                    :data-note-id="ann.id"
                  >
                    <AnnotationCard
                      :ann="ann"
                      :index="i + 1"
                      :active="activeAnnotationId === ann.id"
                      compact
                      @select="handleCardClick(ann.id)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </article>

          <!-- 读伴提问（窄屏回退：独立右栏列表） -->
          <aside v-if="!marginMode" class="w-full xl:w-80 flex-shrink-0 order-3">
            <div class="block-card rounded-2xl p-4 sticky top-32 flex flex-col max-h-[calc(100vh-10rem)]">
              <div class="flex items-center gap-1.5 mb-1">
                <Sparkles :size="14" class="text-brian-blue" />
                <span class="text-sm font-semibold">读伴提问</span>
                <span class="ml-auto text-[11px] text-apple-gray-400">{{ annotations.length }} 条</span>
              </div>
              <p class="text-[11px] text-apple-gray-400 mb-3">选中正文并右键「询问读伴」，即可让读伴结合文档上下文讲解。</p>
              <div class="space-y-3 overflow-y-auto pr-1">
                <AnnotationCard
                  v-for="(ann, i) in annotations"
                  :key="ann.id"
                  :data-card-id="ann.id"
                  :ann="ann"
                  :index="i + 1"
                  :active="activeAnnotationId === ann.id"
                  @select="handleCardClick(ann.id)"
                />
                <div v-if="annotations.length === 0" class="text-xs text-apple-gray-400 text-center py-6 border border-dashed border-apple-gray-200 dark:border-apple-gray-700 rounded-xl">
                  还没有提问<br />选中正文后右键试试
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <!-- 目录浏览 -->
      <template v-else>
        <div class="flex items-center gap-2 mb-4">
          <button class="flex items-center gap-1 text-sm text-apple-gray-500 hover:text-brian-blue" @click="libraryDetail = null">
            <ArrowLeft :size="16" /> 资料库
          </button>
          <ChevronRight :size="14" class="text-apple-gray-400" />
          <span class="text-sm font-medium">{{ libraryDetail.name }}</span>
          <button class="ml-auto flex items-center gap-1.5" @click="handleToggleLibrary(libraryDetail)">
            <span class="relative w-8 h-4 rounded-full transition-colors" :class="libraryDetail.enableSelfLearning ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'">
              <span class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform" :class="libraryDetail.enableSelfLearning ? 'translate-x-4' : ''" />
            </span>
            <span class="text-xs" :class="libraryDetail.enableSelfLearning ? 'text-brian-blue' : 'text-apple-gray-400'">{{ libraryDetail.enableSelfLearning ? '启用' : '禁用' }}</span>
          </button>
        </div>

        <div class="flex items-center gap-3 mb-4 flex-wrap">
          <div class="flex items-center gap-1 text-sm flex-wrap">
            <template v-for="(crumb, i) in libraryBreadcrumb" :key="crumb.path">
              <ChevronRight v-if="i > 0" :size="14" class="text-apple-gray-300 flex-shrink-0" />
              <button class="hover:text-brian-blue transition-colors" :class="i === libraryBreadcrumb.length - 1 ? 'text-apple-gray-900 dark:text-apple-gray-50 font-medium' : 'text-apple-gray-500'" @click="enterDirectory(crumb.path)">{{ crumb.label }}</button>
            </template>
          </div>
          <button v-if="currentDirectory" class="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 hover:text-brian-blue transition-colors" @click="goUpDirectory">
            <ArrowLeft :size="12" /> 上级
          </button>
          <div class="relative flex-1 max-w-xs ml-auto">
            <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
            <input v-model="fileKeyword" placeholder="搜索文件..." class="w-full pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
          </div>
        </div>

        <div class="flex gap-4">
          <div class="w-56 flex-shrink-0 block-card rounded-xl p-3 max-h-[70vh] overflow-y-auto">
            <div class="text-xs font-semibold text-apple-gray-500 mb-2 px-2">目录</div>
            <LibraryTreeItem
              v-for="node in libraryTree"
              :key="node.file_id"
              :node="node"
              :depth="0"
              @enter="(p: string) => enterDirectory(p)"
            />
            <div v-if="libraryTree.length === 0" class="text-xs text-apple-gray-400 px-2 py-2">暂无目录</div>
          </div>

          <div class="flex-1 min-w-0">
            <div v-if="fileLoading" class="text-center py-12 text-apple-gray-400">加载中...</div>
            <div v-else-if="libraryFiles.length === 0" class="text-center py-12 text-apple-gray-400 text-sm">该目录下暂无文件</div>
            <div v-else class="space-y-1.5">
              <div
                v-for="file in libraryFiles"
                :key="file.id"
                class="flex items-center gap-3 p-3 rounded-lg border border-apple-gray-100 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800/50 hover:border-brian-blue/40 transition-all cursor-pointer"
                @click="openFile(file)"
              >
                <Folder v-if="file.isDirectory" :size="18" class="text-brian-blue flex-shrink-0" />
                <FileText v-else :size="18" class="text-apple-gray-400 flex-shrink-0" />
                <span class="text-sm truncate flex-1 min-w-0">{{ file.name }}</span>
                <span v-if="!file.isDirectory" class="text-[11px] text-apple-gray-400 flex-shrink-0">{{ formatFileSize(file.size) }}</span>
                <ChevronRight v-if="file.isDirectory" :size="14" class="text-apple-gray-300 flex-shrink-0" />
              </div>
              <div ref="libraryFileSentinel" v-if="fileHasMore || fileLoadingMore" class="text-center py-3 text-xs text-apple-gray-400">
                {{ fileLoadingMore ? '加载中...' : '继续滚动加载更多' }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 询问弹窗 -->
      <Teleport to="body">
        <div v-if="askDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" @click.self="askDialog = null">
          <div class="w-full max-w-lg rounded-2xl bg-white dark:bg-apple-gray-800 shadow-xl p-6">
            <h3 class="text-lg font-semibold mb-2 flex items-center gap-1.5"><Sparkles :size="16" class="text-brian-blue" /> 询问读伴</h3>
            <p class="text-xs text-apple-gray-400 mb-4">选中内容：<span class="text-apple-gray-600 dark:text-apple-gray-300">{{ askDialog.selectionText.slice(0, 80) }}{{ askDialog.selectionText.length > 80 ? '…' : '' }}</span></p>
            <textarea v-model="askDialog.question" rows="3" class="w-full px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" placeholder="输入你想咨询的问题，例如：这段内容是什么意思？"></textarea>
            <p v-if="asking" class="mt-2 flex items-center gap-1.5 text-xs text-brian-blue">
              <Loader2 :size="12" class="animate-spin" /> 读伴正在结合文档上下文思考，通常需要 10~30 秒，请稍候…
            </p>
            <p v-else-if="askError" class="mt-2 text-xs text-error-red">{{ askError }}</p>
            <div class="flex justify-end gap-2 mt-4">
              <button class="btn-secondary" @click="askDialog = null">取消</button>
              <button class="btn-primary flex items-center gap-1.5" :disabled="asking" @click="submitAsk">
                <Loader2 v-if="asking" :size="14" class="animate-spin" /> 咨询
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- 文档选中右键菜单 -->
      <Teleport to="body">
        <div v-if="contextMenu" class="fixed z-[60] bg-white dark:bg-apple-gray-800 rounded-lg shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 py-1 min-w-[160px]" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop>
          <button class="w-full text-left px-3 py-2 text-sm text-apple-gray-700 dark:text-apple-gray-200 hover:bg-brian-blue/10 flex items-center gap-2" @click="openAskDialog">
            <Sparkles :size="14" class="text-brian-blue" /> 询问读伴
          </button>
        </div>
      </Teleport>

      <!-- 删除文档二次确认 -->
      <Teleport to="body">
        <div v-if="deleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" @click.self="cancelDeleteFile">
          <div class="w-full max-w-md rounded-2xl bg-white dark:bg-apple-gray-800 shadow-xl p-6">
            <h3 class="text-lg font-semibold mb-2 flex items-center gap-1.5 text-error-red"><Trash2 :size="16" /> 删除文档</h3>
            <p class="text-sm text-apple-gray-600 dark:text-apple-gray-300">
              将删除本地文件 <span class="font-medium">{{ selectedFile?.name }}</span>，并同步清理该文档的咨询记录。此操作不可恢复。
            </p>
            <div class="flex justify-end gap-2 mt-6">
              <button class="btn-secondary" @click="cancelDeleteFile">取消</button>
              <button class="px-4 py-2 bg-error-red text-white font-medium rounded-xl hover:bg-error-red/90 transition-colors disabled:opacity-50 flex items-center gap-1.5" :disabled="deletingFile" @click="confirmDeleteFile">
                <Loader2 v-if="deletingFile" :size="14" class="animate-spin" /> 删除文档
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>
