import type { Directive } from 'vue'

interface RevealHost extends HTMLElement {
  __revealIO?: IntersectionObserver
}

// v-reveal：元素进入视口时添加 .is-visible，触发渐显上浮动画
// 可选值作为 transition-delay（如 v-reveal="'120ms'"），用于同屏多元素的错峰效果
export const vReveal: Directive<RevealHost, string | undefined> = {
  mounted(el, binding) {
    if (!('IntersectionObserver' in window)) {
      el.classList.add('is-visible')
      return
    }
    el.classList.add('reveal')
    if (binding.value) el.style.transitionDelay = binding.value
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          el.classList.add('is-visible')
          io.unobserve(el)
        }
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' }
    )
    io.observe(el)
    el.__revealIO = io
  },
  unmounted(el) {
    el.__revealIO?.disconnect()
    delete el.__revealIO
  },
}
