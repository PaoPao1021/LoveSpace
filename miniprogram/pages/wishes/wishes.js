const { callFunction } = require('../../utils/cloud')
Page({
  data: { list: [], loaded: false, showAdd: false, form: { title: '', description: '' } },
  onShow() { this.loadWishes() },
  async loadWishes() {
    const res = await callFunction('wish', { action: 'list' })
    if (res.code === 0) this.setData({ list: res.list, loaded: true })
  },
  onAdd() { this.setData({ showAdd: true, form: { title: '', description: '' } }) },
  onCloseAdd() { this.setData({ showAdd: false }) },
  onInput(e) { this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value }) },
  async onSave() {
    const { title, description } = this.data.form
    if (!title.trim()) return wx.showToast({ title: '请输入愿望', icon: 'none' })
    await callFunction('wish', { action: 'add', data: { title: title.trim(), description } })
    this.setData({ showAdd: false })
    this.loadWishes()
  },
  onToggle(e) {
    const { id, status } = e.currentTarget.dataset
    const next = status === 'todo' ? 'doing' : status === 'doing' ? 'done' : 'todo'
    wx.showModal({
      title: next === 'done' ? '🎉 实现了！' : '更新状态',
      confirmColor: '#E85D75',
      success: async (res) => {
        if (res.confirm) {
          await callFunction('wish', { action: 'update', data: { id, status: next } })
          this.loadWishes()
        }
      }
    })
  }
})
