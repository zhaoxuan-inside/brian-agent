<script setup lang="ts">
import { useI18nStore } from '@/stores/i18n'
const i18nStore = useI18nStore()
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import LearningPanel from '@/components/panels/LearningPanel.vue'
</script>

<template>
  <div class="h-screen relative overflow-hidden">
    <NeuralBackground />
    <Header />
    <div class="pt-14 h-full flex flex-col relative z-10">
      <div class="h-10 flex items-center px-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md shrink-0">
        <PageBreadcrumb :path="[i18nStore.t('nav.learning')]" />
      </div>
      <div class="flex-1 min-h-0 px-6 pt-4 pb-6">
        <LearningPanel />
      </div>
    </div>
  </div>
</template>
