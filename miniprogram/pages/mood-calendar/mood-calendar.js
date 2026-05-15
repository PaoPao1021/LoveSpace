const { callFunction } = require('../../utils/cloud')
const { getDaysInMonth } = require('../../utils/date')

Page({
  data: {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: []
  },

  onLoad() {
    this.loadCalendar()
  },

  async loadCalendar() {
    const { year, month } = this.data
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = new Date(year, month - 1, 1).getDay()
    const today = new Date()

    // 获取心情数据
    let moodMap = {}
    try {
      const res = await callFunction('mood', {
        action: 'getCalendar',
        data: { year, month }
      })
      if (res.code === 0) {
        res.list.forEach(m => {
          const day = parseInt(m.date.split('-')[2])
          if (!moodMap[day]) moodMap[day] = {}
          // 区分自己和对方
          moodMap[day].emoji = m.moodEmoji
        })
      }
    } catch (e) {
      console.error(e)
    }

    // 构建日历
    const days = []
    // 上月填充
    const prevMonthDays = getDaysInMonth(year, month === 1 ? 12 : month - 1)
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: prevMonthDays - i, isCurrentMonth: false })
    }
    // 本月
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d
      days.push({
        day: d,
        isCurrentMonth: true,
        isToday,
        mood: moodMap[d] ? moodMap[d].emoji : '',
        partnerMood: ''
      })
    }
    // 下月填充
    const remaining = 42 - days.length
    for (let d = 1; d <= remaining; d++) {
      days.push({ day: d, isCurrentMonth: false })
    }

    this.setData({ calendarDays: days })
  },

  onPrevMonth() {
    let { year, month } = this.data
    month--
    if (month < 1) { month = 12; year-- }
    this.setData({ year, month })
    this.loadCalendar()
  },

  onNextMonth() {
    let { year, month } = this.data
    month++
    if (month > 12) { month = 1; year++ }
    this.setData({ year, month })
    this.loadCalendar()
  }
})
