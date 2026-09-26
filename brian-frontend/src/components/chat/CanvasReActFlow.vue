<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import type { ThinkingStep } from '@/api/types'

const props = defineProps<{
  steps: ThinkingStep[]
  input?: string | Record<string, unknown>
  output?: string | Record<string, unknown>
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const selectedStepIndex = ref<number | null>(null)

interface FlowNode {
  id: string
  label: string
  subLabel: string
  type: 'input' | 'think' | 'act' | 'reflect' | 'output'
  x: number
  y: number
  w: number
  h: number
  status: 'done' | 'active' | 'fail'
  stepData?: ThinkingStep
}

function drawFlow() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const parentWidth = canvas.parentElement?.clientWidth || 600
  const canvasHeight = 120

  canvas.width = parentWidth * dpr
  canvas.height = canvasHeight * dpr
  canvas.style.width = `${parentWidth}px`
  canvas.style.height = `${canvasHeight}px`

  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, parentWidth, canvasHeight)

  const nodes: FlowNode[] = []
  
  nodes.push({
    id: 'node-input',
    label: '任务输入',
    subLabel: 'Input Prompt',
    type: 'input',
    x: 0,
    y: 35,
    w: 100,
    h: 46,
    status: 'done',
  })

  if (props.steps && props.steps.length > 0) {
    props.steps.forEach((step, idx) => {
      let label = '思考推理'
      let type: FlowNode['type'] = 'think'
      let subLabel = `Step ${idx + 1}`

      if (step.phase === 'THINK') {
        label = 'THINK 推理'
      } else if (step.phase === 'ACT') {
        label = 'ACT 技能执行'
        type = 'act'
        if (step.toolCalls?.length) {
          subLabel = step.toolCalls[0].toolName || 'Tool'
        }
      } else if (step.phase === 'REFLECT') {
        label = 'REFLECT 反思'
        type = 'reflect'
        subLabel = step.passed ? '通过' : '重试'
      }

      nodes.push({
        id: `node-step-${idx}`,
        label,
        subLabel,
        type,
        x: 0,
        y: 35,
        w: 110,
        h: 46,
        status: step.passed === false ? 'fail' : 'done',
        stepData: step,
      })
    })
  } else {
    nodes.push({
      id: 'node-think-default',
      label: 'THINK 思考推理',
      subLabel: 'CoT Reasoning',
      type: 'think',
      x: 0,
      y: 35,
      w: 110,
      h: 46,
      status: 'done',
    })
  }

  nodes.push({
    id: 'node-output',
    label: '阶段产出',
    subLabel: 'Agent Output',
    type: 'output',
    x: 0,
    y: 35,
    w: 100,
    h: 46,
    status: 'done',
  })

  const nodeGap = 28
  const totalNodesW = nodes.reduce((acc, n) => acc + n.w, 0) + (nodes.length - 1) * nodeGap
  const startX = Math.max(15, (parentWidth - totalNodesW) / 2)

  let currentX = startX
  nodes.forEach(n => {
    n.x = currentX
    currentX += n.w + nodeGap
  })

  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i]
    const to = nodes[i + 1]

    const fromX = from.x + from.w
    const fromY = from.y + from.h / 2
    const toX = to.x
    const toY = to.y + to.h / 2

    ctx.beginPath()
    ctx.moveTo(fromX, fromY)
    ctx.lineTo(toX, toY)
    ctx.strokeStyle = '#a855f7'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 2])
    ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    ctx.moveTo(toX, toY)
    ctx.lineTo(toX - 6, toY - 4)
    ctx.lineTo(toX - 6, toY + 4)
    ctx.closePath()
    ctx.fillStyle = '#a855f7'
    ctx.fill()
  }

  nodes.forEach((n, idx) => {
    let bgColor = '#f3e8ff'
    let borderColor = '#c084fc'
    let textColor = '#6b21a8'

    if (n.type === 'input') {
      bgColor = '#eff6ff'
      borderColor = '#60a5fa'
      textColor = '#1e40af'
    } else if (n.type === 'act') {
      bgColor = '#e0f2fe'
      borderColor = '#38bdf8'
      textColor = '#0369a1'
    } else if (n.type === 'reflect') {
      bgColor = n.status === 'fail' ? '#fef2f2' : '#ecfdf5'
      borderColor = n.status === 'fail' ? '#f87171' : '#34d399'
      textColor = n.status === 'fail' ? '#991b1b' : '#065f46'
    } else if (n.type === 'output') {
      bgColor = '#f0fdf4'
      borderColor = '#4ade80'
      textColor = '#166534'
    }

    if (selectedStepIndex.value === idx) {
      borderColor = '#7e22ce'
    }

    const r = 8
    ctx.beginPath()
    ctx.moveTo(n.x + r, n.y)
    ctx.lineTo(n.x + n.w - r, n.y)
    ctx.quadraticCurveTo(n.x + n.w, n.y, n.x + n.w, n.y + r)
    ctx.lineTo(n.x + n.w, n.y + n.h - r)
    ctx.quadraticCurveTo(n.x + n.w, n.y + n.h, n.x + n.w - r, n.y + n.h)
    ctx.lineTo(n.x + r, n.y + n.h)
    ctx.quadraticCurveTo(n.x, n.y + n.h, n.x, n.y + n.h - r)
    ctx.lineTo(n.x, n.y + r)
    ctx.quadraticCurveTo(n.x, n.y, n.x + r, n.y)
    ctx.closePath()

    ctx.fillStyle = bgColor
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = borderColor
    ctx.stroke()

    ctx.font = 'bold 11px sans-serif'
    ctx.fillStyle = textColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(n.label, n.x + n.w / 2, n.y + 16)

    ctx.font = '9px sans-serif'
    ctx.fillStyle = '#6b7280'
    const subText = n.subLabel.length > 12 ? `${n.subLabel.slice(0, 10)}..` : n.subLabel
    ctx.fillText(subText, n.x + n.w / 2, n.y + 32)
  })
}

onMounted(() => {
  nextTick(() => {
    drawFlow()
  })
})

watch(() => [props.steps, props.input, props.output], () => {
  nextTick(() => drawFlow())
}, { deep: true })
</script>

<template>
  <div class="canvas-react-flow w-full overflow-x-auto py-1">
    <div class="min-w-[500px]">
      <div class="flex items-center justify-between text-2xs font-medium text-purple-700 dark:text-purple-300 mb-1 px-1">
        <span>CoT / ReAct 状态机流转路线 (Canvas 渲染)</span>
        <span class="text-4xs text-apple-gray-400">Think ⇄ Act ⇄ Reflect</span>
      </div>
      <canvas ref="canvasRef" class="w-full rounded-lg bg-purple-50/20 dark:bg-purple-950/20 border border-purple-100/50 dark:border-purple-900/30" />
    </div>
  </div>
</template>
