const { callFunction } = require('../../utils/cloud')
const { getMoodByType } = require('../../utils/theme')

function getMonthOptions() {
  const now = new Date()
  return Array.from({ length: 12 }, (_, index) => {
    const value = new Date(now.getFullYear(), now.getMonth() - index, 1)
    return {
      label: `${value.getFullYear()} 年 ${value.getMonth() + 1} 月`,
      year: value.getFullYear(),
      month: value.getMonth() + 1
    }
  })
}

Page({
  data: {
    loading: true,
    monthIndex: 0,
    months: getMonthOptions(),
    report: null,
    topMood: null,
    connectionCopy: ''
  },

  onLoad() {
    this.loadReport()
  },

  async loadReport() {
    const selected = this.data.months[this.data.monthIndex]
    this.setData({ loading: true })
    try {
      const result = await callFunction('monthly-report', { year: selected.year, month: selected.month })
      const report = result.report
      const score = report.connectionScore
      this.setData({
        report,
        topMood: report.mood.topMood ? getMoodByType(report.mood.topMood) : null,
        connectionCopy: score >= 80 ? '这个月，你们把爱放进了很多具体的小事里。' : score >= 50 ? '稳定的连接正在形成，再多留一点时间给彼此。' : '忙碌也没关系，从今天的一个问题重新靠近。',
        loading: false
      })
    } catch (error) {
      this.setData({ loading: false, report: null })
    }
  },

  onMonthChange(event) {
    this.setData({ monthIndex: Number(event.detail.value) }, () => this.loadReport())
  },

  onPullDownRefresh() {
    this.loadReport().finally(() => wx.stopPullDownRefresh())
  }
})
