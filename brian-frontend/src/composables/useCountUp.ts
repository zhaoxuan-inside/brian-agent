import { ref, type Ref } from 'vue'

// useCountUp：数字从 0 递增到 target 的计数动画
// 返回 display（当前显示值，含后缀）与 start()；start 幂等，只跑一次
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
