<script setup lang="ts">
/**
 * ToggleSwitch —— 统一开关(替代手写 w-9 h-5 / w-8 h-4 三种规格)
 * 键盘可达:role=switch + aria-checked,空格/回车切换。
 */
const props = withDefaults(defineProps<{
  modelValue: boolean
  disabled?: boolean
  /** 无障碍名称 */
  label?: string
}>(), {
  disabled: false,
  label: '开关',
})

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

function toggle() {
  if (!props.disabled) emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    class="relative inline-flex items-center h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
    :class="modelValue ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
    @click="toggle"
  >
    <span
      class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-ios"
      :class="modelValue ? 'translate-x-[18px]' : 'translate-x-0.5'"
    />
  </button>
</template>
