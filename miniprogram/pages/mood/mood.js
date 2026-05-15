const { callFunction } = require('../../utils/cloud')
const { MOOD_TYPES, getMoodByType } = require('../../utils/theme')

Page({
  data: {
    moodTypes: MOOD_TYPES,
    selectedMood: '',
    content: '',
    visibility: 'both',
    todayMood: null,
    partnerMood: null
  },

  onShow() {
    this.loadTodayMood()
    this.loadPartnerMood()
  },

  async loadTodayMood() {
    try {
      const res = await callFunction('mood', { action: 'getToday' })
      if (res.code === 0 && res.data) {
        const mood = getMoodByType(res.data.moodType)
        this.setData({
          todayMood: res.data,
          selectedMood: res.data.moodType,
          content: res.data.content || '',
          visibility: res.data.visibility || 'both'
        })
      }
    } catch (e) {
      console.error(e)
    }
  },

  async loadPartnerMood() {
    try {
      const res = await callFunction('mood', { action: 'getPartner', data: {} })
      if (res.code === 0 && res.data) {
        const mood = getMoodByType(res.data.moodType)
        this.setData({
          partnerMood: {
            emoji: mood.emoji,
            label: mood.label,
            content: res.data.content
          }
        })
      }
    } catch (e) {
      console.error(e)
    }
  },

  onSelectMood(e) {
    this.setData({ selectedMood: e.currentTarget.dataset.type })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  onVisibility(e) {
    this.setData({ visibility: e.currentTarget.dataset.v })
  },

  async onSave() {
    const { selectedMood, content, visibility } = this.data
    if (!selectedMood) {
      wx.showToast({ title: '请选择心情', icon: 'none' })
      return
    }

    const mood = getMoodByType(selectedMood)
    wx.showLoading({ title: '打卡中...' })
    try {
      await callFunction('mood', {
        action: 'add',
        data: {
          moodType: selectedMood,
          moodEmoji: mood.emoji,
          content,
          visibility
        }
      })
      wx.showToast({ title: '打卡成功！', icon: 'success' })
    } catch (e) {
      console.error(e)
    } finally {
      wx.hideLoading()
    }
  },

  goCalendar() {
    wx.navigateTo({ url: '/pages/mood-calendar/mood-calendar' })
  }
})
