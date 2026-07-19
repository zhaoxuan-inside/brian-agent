<script setup lang="ts">
import NeuralBackground from '../components/NeuralBackground.vue'
import Header from '../components/Header.vue'
import LibraryPanel from '../components/panels/LibraryPanel.vue'
</script>

<template>
  <div class="h-screen w-screen overflow-hidden relative">
    <NeuralBackground />
    <Header />
    <div class="pt-16 h-full relative z-10">
      <LibraryPanel />
    </div>
  </div>
</template>