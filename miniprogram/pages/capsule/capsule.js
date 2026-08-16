const { callFunction } = require('../../utils/cloud')
const { getToday } = require('../../utils/date')
Page({
  data: { locked: [], unlocked: [], loaded: false, showAdd: false, submitting: false, today: getToday(), form: { title: '', content: '', unlockDate: '' } },
  onShow() { this.loadCapsules() },
  async loadCapsules() {
    const res = await callFunction('capsule', { action: 'list' })
    if (res.code === 0) this.setData({ locked: res.locked || [], unlocked: res.unlocked || [], loaded: true })
  },
  onAdd() { this.setData({ showAdd: true, form: { title: '', content: '', unlockDate: '' } }) },
  onCloseAdd() { this.setData({ showAdd: false }) },
  onInput(e) { this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value }) },
  onDateChange(e) { this.setData({ 'form.unlockDate': e.detail.value }) },
  async onSave() {
    const { title, content, unlockDate } = this.data.form
    if (!title.trim() || !content.trim() || !unlockDate) return wx.showToast({ title: '请填写完整', icon: 'none' })
    if (this.data.submitting) return
    this.setData({ submitting: true })
    wx.showLoading({ title: '封存中...' })
    try {
      await callFunction('capsule', { action: 'add', data: { title: title.trim(), content: content.trim(), unlockDate } })
      wx.showToast({ title: '胶囊已封存！', icon: 'success' })
      this.setData({ showAdd: false })
      this.loadCapsules()
    } finally {
      wx.hideLoading()
      this.setData({ submitting: false })
    }
  },
  async onOpen(e) {
    const id = e.currentTarget.dataset.id
    const res = await callFunction('capsule', { action: 'get', data: { id } })
    if (res.code === 0 && res.data.isUnlocked) {
      wx.showModal({ title: res.data.title, content: res.data.content, showCancel: false, confirmText: '好温馨~' })
    }
  }
})
