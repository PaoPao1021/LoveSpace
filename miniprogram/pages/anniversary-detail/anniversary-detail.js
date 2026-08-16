const { callFunction } = require('../../utils/cloud')
const { daysUntil, daysSince, getNextAnniversaryDate } = require('../../utils/date')

Page({
  data: {
    id: '',
    data: null,
    daysLeft: 0,
    daysPast: 0,
    emoji: '📅'
  },

  onLoad(options) {
    this.setData({ id: options.id })
  },

  onShow() {
    if (this.data.id) this.loadDetail()
  },

  async loadDetail() {
    try {
      const res = await callFunction('anniversary', { action: 'get', data: { id: this.data.id } })
      if (res.code === 0) {
        const data = res.data
        const nextDate = getNextAnniversaryDate(data.date)
        const emojiMap = {
          together: '💕', birthday: '🎂', valentine: '❤️', meet: '🤝', custom: '📅'
        }
        this.setData({
          data,
          daysLeft: daysUntil(nextDate),
          daysPast: daysSince(data.date),
          emoji: emojiMap[data.type] || '📅'
        })
      }
    } catch (e) {
      console.error(e)
    }
  },

  onEdit() {
    wx.navigateTo({ url: `/pages/anniversary/anniversary?editId=${this.data.id}` })
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这个纪念日吗？',
      confirmColor: '#E85D75',
      success: async (res) => {
        if (res.confirm) {
          await callFunction('anniversary', { action: 'delete', data: { id: this.data.id } })
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1500)
        }
      }
    })
  }
})
