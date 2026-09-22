import { watch, onUnmounted, type Ref } from 'vue'

// useOnceVisible：目标元素首次进入视口时执行一次回调（用于触发首页各区块的动画）
export function useOnceVisible(target: Ref<Element | null>, cb: () => void, threshold = 0.4) {
  let io: IntersectionObserver | null = null
  let fired = false

  const stopWatch = watch(
    target,
    (el) => {
      if (!el || io || fired) return
      if (!('IntersectionObserver' in window)) {
        fired = true
        cb()
        return
      }
      io = new IntersectionObserver(
        (entries) => {
          if (fired || !entries.some((e) => e.isIntersecting)) return
          fired = true
          io?.disconnect()
          cb()
        },
        { threshold }
      )
      io.observe(el)
    },
    { immediate: true, flush: 'post' }
  )

  onUnmounted(() => {
    io?.disconnect()
    stopWatch()
  })
}
