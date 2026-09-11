import { ref, toValue, watch, onUnmounted, type MaybeRefOrGetter } from 'vue'

/** 在 active 为真时按固定间隔刷新当前时间，供执行中步骤的实时计时。 */
export function useNowTick(active: MaybeRefOrGetter<boolean>, intervalMs = 250) {
  const nowMs = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  watch(
    () => toValue(active),
    (on) => {
      stop()
      if (on) {
        nowMs.value = Date.now()
        timer = setInterval(() => { nowMs.value = Date.now() }, intervalMs)
      }
    },
    { immediate: true },
  )

  onUnmounted(stop)
  return nowMs
}
