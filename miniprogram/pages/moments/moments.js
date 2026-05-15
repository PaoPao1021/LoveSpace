const { callFunction } = require('../../utils/cloud')
const { timeAgo } = require('../../utils/date')

Page({
  data: {
    loaded: false,
    list: [],
    page: 1,
    hasMore: false
  },

  onShow() {
    this.setData({ page: 1 })
    this.loadList()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
  },

  async loadList() {
    try {
      const res = await callFunction('moments', {
        action: 'list',
        data: { page: this.data.page }
      })
      if (res.code === 0) {
        const list = res.list.map(item => ({
          ...item,
          timeStr: timeAgo(item.createdAt)
        }))
        this.setData({
          list: this.data.page === 1 ? list : [...this.data.list, ...list],
          hasMore: res.hasMore,
          loaded: true
        })
      }
    } catch (e) {
      console.error(e)
      this.setData({ loaded: true })
    }
  },

  loadMore() {
    this.setData({ page: this.data.page + 1 })
    this.loadList()
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/moment-edit/moment-edit' })
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/moment-edit/moment-edit?id=${id}` })
  },

  async onRandom() {
    try {
      const res = await callFunction('moments', { action: 'random' })
      if (res.code === 0 && res.data) {
        wx.showModal({
          title: '随机回忆',
          content: res.data.content,
          showCancel: false,
          confirmText: '好温馨~'
        })
      } else {
        wx.showToast({ title: '还没有记录哦', icon: 'none' })
      }
    } catch (e) {
      console.error(e)
    }
  }
})
