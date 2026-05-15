const { callFunction } = require('../../utils/cloud')
const { timeAgo } = require('../../utils/date')
Page({
  data: { list: [], loaded: false },
  onLoad() { this.loadThanks() },
  async loadThanks() {
    // 暂用moments的tags筛选，后续独立
    this.setData({ loaded: true })
  },
  onAdd() {
    wx.showModal({
      title: '记录感谢', editable: true, placeholderText: 'TA做了什么让你感动的事？',
      confirmColor: '#FF6B81',
      success: async (res) => {
        if (res.confirm && res.content) {
          await callFunction('moments', { action: 'add', data: { content: res.content, tags: ['感动'] } })
          wx.showToast({ title: '已记录', icon: 'success' })
        }
      }
    })
  }
})
