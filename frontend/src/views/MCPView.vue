<script setup lang="ts">
import NeuralBackground from '../components/NeuralBackground.vue'
import Header from '../components/Header.vue'
import MCPPanel from '../components/panels/MCPPanel.vue'
</script>

<template>
  <div class="h-screen w-screen overflow-hidden relative">
    <NeuralBackground />
    <Header />
    <div class="pt-16 h-full relative z-10">
      <MCPPanel />
    </div>
  </div>
</template>