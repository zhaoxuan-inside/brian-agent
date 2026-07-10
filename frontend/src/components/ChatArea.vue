<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import { useSessionStore } from '../stores/session'
import MessageBubble from './MessageBubble.vue'
import AgentChainSidebar from './AgentChainSidebar.vue'

const sessionStore = useSessionStore()
const scrollContainer = ref<HTMLElement | null>(null)

const hasAgents = computed(() => sessionStore.agentChain.length > 0)

// Watch for new messages AND content changes (streaming)
watch(
  () => ({
    len: sessionStore.messages.length,
    lastContent: sessionStore.messages[sessionStore.messages.length - 1]?.content,
    agents: sessionStore.agentChain.length,
  }),
  async () => {
    await nextTick()
    scrollToBottom()
  },
  { deep: false }
)

function scrollToBottom() {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
}
</script>

<template>
  <!-- Chat messages: shifts left when agent chain sidebar is open -->
  <div
    :class="[
      'fixed flex transition-all duration-300',
      hasAgents ? 'inset-0 pt-16 pb-24 pr-[360px]' : 'inset-0 pt-16 pb-24'
    ]"
  >
    <div
      ref="scrollContainer"
      class="flex-1 overflow-y-auto px-8 py-4"
    >
      <TransitionGroup
        v-if="sessionStore.messages.length > 0"
        name="message"
        tag="div"
        :class="hasAgents ? 'max-w-2xl mx-auto space-y-4' : 'max-w-4xl mx-auto space-y-4'"
      >
        <MessageBubble
          v-for="message in sessionStore.messages"
          :key="message.id"
          :message="message"
        />
      </TransitionGroup>
    </div>
  </div>

  <!-- Agent chain right sidebar — always visible when agents exist -->
  <AgentChainSidebar v-if="hasAgents" />
</template>

<style scoped>
.message-enter-active {
  transition: all 0.3s ease-out;
}

.message-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.message-leave-active {
  transition: all 0.2s ease-in;
}

.message-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
