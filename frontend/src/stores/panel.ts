import { defineStore } from 'pinia'
import { ref } from 'vue'

export type PanelType = 'memory' | 'library' | 'settings' | 'monitor' | 'soul' | 'work' | 'skill' | 'mcp' | 'learning' | 'profile' | 'visual' | 'history'

export const usePanelStore = defineStore('panel', () => {
  const activePanel = ref<PanelType | null>(null)

  function openPanel(panel: PanelType) {
    activePanel.value = panel
  }

  function closePanel() {
    activePanel.value = null
  }

  function togglePanel(panel: PanelType) {
    if (activePanel.value === panel) {
      closePanel()
    } else {
      openPanel(panel)
    }
  }

  return {
    activePanel,
    openPanel,
    closePanel,
    togglePanel
  }
})
