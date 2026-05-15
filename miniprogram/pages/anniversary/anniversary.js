const { callFunction } = require('../../utils/cloud')
const { daysUntil, daysSince, getNextAnniversaryDate, formatDate } = require('../../utils/date')

Page({
  data: {
    loaded: false,
    list: [],
    showAdd: false,
    form: {
      name: '',
      date: '',
      type: 'custom',
      note: '',
      isRepeat: true
    },
    types: [
      { label: '在一起', value: 'together' },
      { label: '生日', value: 'birthday' },
      { label: '情人节', value: 'valentine' },
      { label: '见面', value: 'meet' },
      { label: '自定义', value: 'custom' }
    ]
  },

  onShow() {
    this.loadList()
  },

  async loadList() {
    try {
      const res = await callFunction('anniversary', { action: 'list' })
      if (res.code === 0) {
        const list = res.list.map(item => {
          const nextDate = getNextAnniversaryDate(item.date)
          const daysLeft = daysUntil(nextDate)
          const daysPast = daysSince(item.date)
          return {
            ...item,
            daysLeft,
            daysPast,
            emoji: this.getEmoji(item.type)
          }
        })
        // 按距离排序
        list.sort((a, b) => a.daysLeft - b.daysLeft)
        this.setData({ list, loaded: true })
      }
    } catch (e) {
      console.error(e)
      this.setData({ loaded: true })
    }
  },

  getEmoji(type) {
    const map = {
      together: '💕',
      birthday: '🎂',
      valentine: '❤️',
      meet: '🤝',
      custom: '📅'
    }
    return map[type] || '📅'
  },

  onAdd() {
    this.setData({
      showAdd: true,
      form: { name: '', date: '', type: 'custom', note: '', isRepeat: true }
    })
  },

  onCloseAdd() {
    this.setData({ showAdd: false })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onDateChange(e) {
    this.setData({ 'form.date': e.detail.value })
  },

  onTypeSelect(e) {
    this.setData({ 'form.type': e.currentTarget.dataset.value })
  },

  onRepeatChange(e) {
    this.setData({ 'form.isRepeat': e.detail.value })
  },

  async onSave() {
    const { name, date, type, note, isRepeat } = this.data.form
    if (!name.trim()) {
      wx.showToast({ title: '请输入名称', icon: 'none' })
      return
    }
    if (!date) {
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })
    try {
      await callFunction('anniversary', {
        action: 'add',
        data: { name: name.trim(), date, type, note, isRepeat, remindDaysBefore: 3 }
      })
      wx.showToast({ title: '添加成功', icon: 'success' })
      this.setData({ showAdd: false })
      this.loadList()
    } catch (e) {
      console.error(e)
    } finally {
      wx.hideLoading()
    }
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/anniversary-detail/anniversary-detail?id=${id}` })
  }
})
