<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animationId = 0

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
}

interface Connection {
  from: number
  to: number
  opacity: number
}

const particles: Particle[] = []
const connections: Connection[] = []
const particleCount = 100
const maxDistance = 150

function initParticles(width: number, height: number) {
  particles.length = 0
  connections.length = 0
  
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      radius: Math.random() * 3 + 1,
      opacity: Math.random() * 0.5 + 0.2
    })
  }
}

function updateParticles(width: number, height: number) {
  connections.length = 0
  
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    
    p.x += p.vx
    p.y += p.vy
    
    if (p.x < 0 || p.x > width) p.vx *= -1
    if (p.y < 0 || p.y > height) p.vy *= -1
    
    for (let j = i + 1; j < particles.length; j++) {
      const p2 = particles[j]
      const dx = p.x - p2.x
      const dy = p.y - p2.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      if (distance < maxDistance) {
        const opacity = 1 - distance / maxDistance
        connections.push({ from: i, to: j, opacity: opacity * 0.3 })
      }
    }
  }
}

function draw(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  
  ctx.strokeStyle = '#007AFF'
  connections.forEach(conn => {
    const p1 = particles[conn.from]
    const p2 = particles[conn.to]
    
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.globalAlpha = conn.opacity
    ctx.lineWidth = 0.5
    ctx.stroke()
  })
  
  ctx.globalAlpha = 1
  particles.forEach(p => {
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(0, 122, 255, ${p.opacity})`
    ctx.fill()
  })
}

function animate() {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  updateParticles(canvas.width, canvas.height)
  draw(ctx)
  
  animationId = requestAnimationFrame(animate)
}

function handleResize() {
  const canvas = canvasRef.value
  if (!canvas) return
  
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  
  initParticles(canvas.width, canvas.height)
}

onMounted(() => {
  handleResize()
  animate()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="fixed inset-0 z-0">
    <canvas 
      ref="canvasRef" 
      class="w-full h-full"
      style="filter: blur(40px); opacity: 0.6;"
    />
    <div class="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80" />
  </div>
</template>
