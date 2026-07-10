<script setup lang="ts">
import { useSessionStore } from '../stores/session'
import AgentNode from './AgentNode.vue'

const sessionStore = useSessionStore()
</script>

<template>
  <div class="h-full p-4">
    <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-4">
      Agent 工作链路
    </h3>
    
    <div class="space-y-3">
      <AgentNode 
        v-for="agent in sessionStore.agentChain" 
        :key="agent.id" 
        :agent="agent"
      />
    </div>
  </div>
</template>
