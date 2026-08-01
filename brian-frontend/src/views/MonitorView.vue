<script setup lang="ts">
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import MonitorPanel from '@/components/panels/MonitorPanel.vue'
</script>

<template>
  <div class="min-h-screen relative">
    <NeuralBackground />
    <Header />
    <div class="pt-16 px-6 pb-6 min-h-screen">
      <MonitorPanel />
    </div>
  </div>
</template>
