const { callFunction } = require('../../utils/cloud')
const { timeAgo } = require('../../utils/date')
Page({
  data: { list: [], loaded: false },
  onLoad() { this.loadThanks() },
  async loadThanks() {
    try {
      const result = await callFunction('moments', { action: 'list', data: { tag: '感动', pageSize: 50 } })
      this.setData({ list: (result.list || []).map(item => ({ ...item, timeStr: timeAgo(item.createdAt) })), loaded: true })
    } catch (error) {
      this.setData({ loaded: true })
    }
  },
  onAdd() {
    wx.showModal({
      title: '记录感谢', editable: true, placeholderText: 'TA做了什么让你感动的事？',
      confirmColor: '#E85D75',
      success: async (res) => {
        if (res.confirm && res.content) {
          await callFunction('moments', { action: 'add', data: { content: res.content, tags: ['感动'] } })
          wx.showToast({ title: '已记录', icon: 'success' })
          this.loadThanks()
        }
      }
    })
  }
})
