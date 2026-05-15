const { callFunction } = require('../../utils/cloud')
const { timeAgo } = require('../../utils/date')

Page({
  data: {
    list: [],
    loaded: false
  },

  onShow() { this.loadOrders() },

  async loadOrders() {
    try {
      const res = await callFunction('menu', { action: 'listOrders' })
      if (res.code === 0) {
        const list = res.list.map(order => ({
          ...order,
          timeText: timeAgo(order.createdAt),
          itemCount: order.items.reduce((sum, i) => sum + (i.quantity || 1), 0)
        }))
        this.setData({ list, loaded: true })
      }
    } catch (e) {
      this.setData({ loaded: true })
    }
  }
})
