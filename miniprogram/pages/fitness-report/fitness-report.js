const { callFunction } = require('../../utils/cloud')

function buildWeekOptions() {
  return Array.from({ length: 8 }, (_, offset) => ({
    offset,
    label: offset === 0 ? '本周' : offset === 1 ? '上周' : `${offset} 周前`
  }))
}

function shortDate(value) {
  const parts = String(value || '').split('-')
  return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日` : ''
}

function weightCopy(member) {
  const stats = member.stats || {}
  if (!Object.prototype.hasOwnProperty.call(stats, 'weightChange')) return '体重数据保持私密'
  if (stats.weightChange === null || stats.weightChange === undefined) return '本周还没有形成体重趋势'
  if (stats.weightChange === 0) return '本周体重趋势保持稳定'
  return `本周趋势 ${stats.weightChange > 0 ? '+' : ''}${stats.weightChange} kg`
}

Page({
  data: {
    loading: true,
    weekIndex: 0,
    weekOptions: buildWeekOptions(),
    report: null
  },

  onLoad() {
    this.loadReport()
  },

  async loadReport(showLoading = true) {
    if (showLoading) this.setData({ loading: true })
    try {
      const selected = this.data.weekOptions[this.data.weekIndex]
      const result = await callFunction('fitness', { action: 'weeklyReport', data: { offset: selected.offset } })
      const report = result.report
      report.periodLabel = `${shortDate(report.range.start)} — ${shortDate(report.range.end)}`
      report.totalStepsLabel = Number(report.totalSteps || 0).toLocaleString()
      report.members = (report.members || []).map(member => ({
        ...member,
        weightCopy: weightCopy(member),
        stepsLabel: Number(member.stats.totalSteps || 0).toLocaleString()
      }))
      this.setData({ report, loading: false })
    } catch (error) {
      this.setData({ report: null, loading: false })
    }
  },

  onWeekChange(event) {
    this.setData({ weekIndex: Number(event.detail.value) }, () => this.loadReport())
  },

  onPullDownRefresh() {
    this.loadReport(false).finally(() => wx.stopPullDownRefresh())
  },

  goFitness() {
    wx.navigateBack({ delta: 1 })
  }
})
