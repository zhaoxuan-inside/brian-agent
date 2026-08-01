<script setup lang="ts">
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import LearningPanel from '@/components/panels/LearningPanel.vue'
</script>

<template>
  <div class="min-h-screen relative">
    <NeuralBackground />
    <Header />
    <div class="pt-16 px-6 pb-6 min-h-screen">
      <LearningPanel />
    </div>
  </div>
</template>
