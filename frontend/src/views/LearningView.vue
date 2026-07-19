<script setup lang="ts">
import NeuralBackground from '../components/NeuralBackground.vue'
import Header from '../components/Header.vue'
import LearningPanel from '../components/panels/LearningPanel.vue'
</script>

<template>
  <div class="h-screen w-screen overflow-hidden relative">
    <NeuralBackground />
    <Header />
    <div class="pt-16 h-full relative z-10">
      <LearningPanel />
    </div>
  </div>
</template>