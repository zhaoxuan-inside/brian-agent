import type { Directive } from 'vue'

interface RevealHost extends HTMLElement {
  __revealIO?: IntersectionObserver
}

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
