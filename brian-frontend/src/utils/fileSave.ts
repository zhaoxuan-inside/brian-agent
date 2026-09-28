/**
 * saveMarkdownFile —— 把文本内容保存为本地 Markdown 文件。
 * 能力链:目录选择器(showDirectoryPicker) > 另存为(showSaveFilePicker) > Blob 下载,
 * 后者在前者不可用的环境(Firefox/Safari/非安全上下文)逐级兜底。
 * showDirectoryPicker/showSaveFilePicker 尚未进入 TS DOM lib,此处自行补充声明。
 */
interface DirectoryPickerOptions {
  mode?: 'read' | 'readwrite'
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description?: string; accept: Record<string, string[]> }[]
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
  }
}

export type SaveMarkdownMode = 'directory' | 'saveAs' | 'download'

export interface SaveMarkdownResult {
  mode: SaveMarkdownMode
  /** directory:所选目录名;saveAs:文件名;download:触发下载的文件名 */
  location: string
}

/** 用户在目录/另存为对话框点取消会抛 AbortError,调用方据此静默 */
export function isUserCancelled(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/** 取文本首个非空行做文件名主体,清理各平台非法字符,不足则回退 chat */
export function buildMarkdownFileName(text: string, now = new Date()): string {
  const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
  const base = sanitizeFileName(firstLine) || 'chat'
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${base}-${stamp}.md`
}

function sanitizeFileName(raw: string): string {
  return raw
    .replace(/[\\/:*?"<>|#%&{}$!`'@+=~^[\]\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(0, 40)
    .replace(/[-.]+$/, '')
}

export async function saveMarkdownFile(text: string): Promise<SaveMarkdownResult> {
  const fileName = buildMarkdownFileName(text)

  if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' })
    const fileHandle = await dir.getFileHandle(fileName, { create: true })
    await writeFileHandle(fileHandle, text)
    return { mode: 'directory', location: dir.name }
  }

  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
    })
    await writeFileHandle(handle, text)
    return { mode: 'saveAs', location: handle.name }
  }

  triggerBlobDownload(text, fileName)
  return { mode: 'download', location: fileName }
}

async function writeFileHandle(handle: FileSystemFileHandle, content: string): Promise<void> {
  const writable = await handle.createWritable()
  try {
    await writable.write(content)
  } finally {
    await writable.close()
  }
}

function triggerBlobDownload(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // 立即 revoke 会让部分浏览器中断下载,延迟到落盘完成后回收
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
