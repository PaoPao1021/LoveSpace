Component({
  properties: {
    count: { type: Number, value: 8 },
    type: { type: String, value: 'sparkle' } // 'sparkle' | 'heart' | 'mix'
  },

  data: {
    particles: []
  },

  lifetimes: {
    attached() {
      this.generateParticles()
    }
  },

  pageLifetimes: {
    show() {
      this.generateParticles()
    }
  },

  methods: {
    generateParticles() {
      const count = this.properties.count
      const type = this.properties.type
      const particles = []

      for (let i = 0; i < count; i++) {
        particles.push({
          id: i,
          style: this.createParticleStyle(i, type),
          isHeart: type === 'mix' ? i % 3 === 0 : type === 'heart',
          isSparkle: type === 'sparkle' || (type === 'mix' && i % 3 !== 0)
        })
      }

      this.setData({ particles })

      // 定时刷新粒子位置
      this._timer = setInterval(() => {
        const updated = this.data.particles.map((p, idx) => ({
          ...p,
          style: this.createParticleStyle(idx + Date.now() % 100, type)
        }))
        this.setData({ particles: updated })
      }, 8000)
    },

    createParticleStyle(seed, type) {
      const left = 5 + (seed * 37 + 13) % 90
      const delay = (seed * 1.3) % 7
      const duration = 5 + (seed * 0.7) % 5
      const size = type === 'heart' ? 20 + (seed % 3) * 8 : 4 + (seed % 3) * 2

      return `left:${left}%;animation-delay:${delay.toFixed(1)}s;animation-duration:${duration.toFixed(1)}s;font-size:${size}rpx;`
    },

    destroyed() {
      if (this._timer) clearInterval(this._timer)
    }
  }
})
