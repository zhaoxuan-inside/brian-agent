<script setup lang="ts">
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import LearningPanel from '@/components/panels/LearningPanel.vue'
</script>

<template>
  <div class="min-h-screen relative">
    <NeuralBackground />
    <Header />
    <div class="pt-14 px-5 py-2.5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md relative z-10">
      <PageBreadcrumb :path="['学习']" />
    </div>
    <div class="px-6 pb-6 min-h-screen">
      <LearningPanel />
    </div>
  </div>
</template>
