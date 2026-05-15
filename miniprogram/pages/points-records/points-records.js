const { callFunction } = require('../../utils/cloud')
const { timeAgo } = require('../../utils/date')

Page({
  data: { list: [], loaded: false },

  onLoad() { this.loadRecords() },

  async loadRecords() {
    try {
      const res = await callFunction('points', { action: 'list' })
      if (res.code === 0) {
        const list = res.list.map(item => ({ ...item, timeStr: timeAgo(item.createdAt) }))
        this.setData({ list, loaded: true })
      }
    } catch (e) {
      this.setData({ loaded: true })
    }
  }
})
