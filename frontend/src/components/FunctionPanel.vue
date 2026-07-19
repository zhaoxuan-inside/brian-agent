<script setup lang="ts">
import { usePanelStore } from '../stores/panel'
import MemoryPanel from './panels/MemoryPanel.vue'
import LibraryPanel from './panels/LibraryPanel.vue'
import SettingsPanel from './panels/SettingsPanel.vue'
import MonitorPanel from './panels/MonitorPanel.vue'
import SoulPanel from './panels/SoulPanel.vue'
import WorkPanel from './panels/WorkPanel.vue'
import SkillPanel from './panels/SkillPanel.vue'
import MCPPanel from './panels/MCPPanel.vue'
import LearningPanel from './panels/LearningPanel.vue'
import ProfilePanel from './panels/ProfilePanel.vue'
import VisualPanel from './panels/VisualPanel.vue'
import HistoryPanel from './panels/HistoryPanel.vue'

const panelStore = usePanelStore()
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="panelStore.activePanel" class="modal-overlay" @click.self="panelStore.closePanel()">
        <div class="modal-container">
          <div class="modal-content">
            <MemoryPanel v-if="panelStore.activePanel === 'memory'" />
            <LibraryPanel v-if="panelStore.activePanel === 'library'" />
            <SettingsPanel v-if="panelStore.activePanel === 'settings'" />
            <MonitorPanel v-if="panelStore.activePanel === 'monitor'" />
            <SoulPanel v-if="panelStore.activePanel === 'soul'" />
            <WorkPanel v-if="panelStore.activePanel === 'work'" />
            <SkillPanel v-if="panelStore.activePanel === 'skill'" />
            <MCPPanel v-if="panelStore.activePanel === 'mcp'" />
            <LearningPanel v-if="panelStore.activePanel === 'learning'" />
            <ProfilePanel v-if="panelStore.activePanel === 'profile'" />
            <VisualPanel v-if="panelStore.activePanel === 'visual'" />
            <HistoryPanel v-if="panelStore.activePanel === 'history'" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 24px;
}

.modal-container {
  position: relative;
  width: 95vw;
  max-width: 960px;
  height: calc(100vh - 48px);
  max-height: calc(100vh - 48px);
  background: #FFFFFF;
  border-radius: 24px;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:root.dark .modal-container {
  background: #1C1C1E;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.modal-content {
  flex: 1;
  overflow-y: auto;
}

.modal-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-leave-active {
  transition: all 0.2s ease-in;
}

.modal-enter-from {
  opacity: 0;
}

.modal-enter-from .modal-container {
  transform: scale(0.92);
  opacity: 0;
}

.modal-leave-to {
  opacity: 0;
}

.modal-leave-to .modal-container {
  transform: scale(0.95);
  opacity: 0;
}
</style>
