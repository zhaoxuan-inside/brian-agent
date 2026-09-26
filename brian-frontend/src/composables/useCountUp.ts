import { ref, type Ref } from 'vue'

export function useCountUp(target: number, suffix = '', durationMs = 1200) {
  const display: Ref<string> = ref(suffix)
  let started = false

  function start() {
    if (started) return
    started = true
    if (target === 0) {
      display.value = '0' + suffix
      return
    }
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      display.value = Math.round(target * eased) + suffix
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  return { display, start }
}
