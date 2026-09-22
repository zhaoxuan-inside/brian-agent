import { ref } from 'vue'

export interface TypeLine {
  t: string
  c?: string
}

// useTypewriter：终端逐行打字动画
// start() 幂等触发；打完停留 holdMs 后自动循环重放
export function useTypewriter(lines: TypeLine[], holdMs = 6000) {
  const rendered = ref('')
  let timer: ReturnType<typeof setTimeout> | null = null
  let started = false

  function build(buf: string[]): string {
    const body = buf
      .map((s, i) => (s === undefined ? '' : `<span class="${lines[i].c || ''}">${s}</span>`))
      .join('\n')
    return body + '<span class="cur"></span>'
  }

  function type(li: number, ci: number, buf: string[]) {
    if (li >= lines.length) {
      timer = setTimeout(() => run(), holdMs)
      return
    }
    buf[li] = lines[li].t.slice(0, ci)
    rendered.value = build(buf)
    const lineDone = ci > lines[li].t.length
    if (lineDone) {
      const delay = lines[li].c === 'cmd' ? 260 : 520
      timer = setTimeout(() => type(li + 1, 0, buf), delay)
    } else {
      timer = setTimeout(() => type(li, ci + 1, buf), 34)
    }
  }

  function run() {
    if (timer) clearTimeout(timer)
    type(0, 0, [])
  }

  function start() {
    if (started) return
    started = true
    run()
  }

  function stop() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  return { rendered, start, stop }
}
