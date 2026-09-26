import type { InjectionKey, Ref } from 'vue'
import type { InfoTabKey } from '../api/types'
import type { useHistoryTab } from './useHistoryTab'
import type { useMemoryTab } from './useMemoryTab'
import type { useLibraryTab } from './useLibraryTab'
import type { useProfileTab } from './useProfileTab'
import type { useTagGraphTab } from './useTagGraphTab'

export { useHistoryTab } from './useHistoryTab'
export { useMemoryTab } from './useMemoryTab'
export { useLibraryTab } from './useLibraryTab'
export { useProfileTab } from './useProfileTab'
export { useTagGraphTab } from './useTagGraphTab'

export type HistoryTabApi = ReturnType<typeof useHistoryTab>
export type MemoryTabApi = ReturnType<typeof useMemoryTab>
export type LibraryTabApi = ReturnType<typeof useLibraryTab>
export type ProfileTabApi = ReturnType<typeof useProfileTab>
export type TagGraphTabApi = ReturnType<typeof useTagGraphTab>

export interface InfoTabsApi {
  activeTab: Ref<InfoTabKey>
  history: HistoryTabApi
  memory: MemoryTabApi
  library: LibraryTabApi
  profile: ProfileTabApi
  graph: TagGraphTabApi
}

export const INFO_TABS_KEY: InjectionKey<InfoTabsApi> = Symbol('info-tabs')
