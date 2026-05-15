const { callFunction } = require('../../utils/cloud')
const { POINT_REASONS, getLevelByPoints } = require('../../utils/theme')

Page({
  data: {
    myScore: 0,
    partnerScore: 0,
    level: {},
    nextLevel: null,
    progressPercent: 0,
    reasons: POINT_REASONS,
    customReasons: [],
    // 内置兑换
    exchanges: [
      { name: '一次按摩', cost: 30, icon: '💆' },
      { name: '一杯奶茶', cost: 20, icon: '🧋' },
      { name: '电影选择权', cost: 50, icon: '🎬' },
      { name: '免做家务一次', cost: 40, icon: '🧹' },
      { name: '小惊喜', cost: 60, icon: '🎁' },
      { name: '约会策划权', cost: 80, icon: '💕' },
      { name: '赖床特权', cost: 25, icon: '🛌' },
      { name: '专属大餐', cost: 100, icon: '🍽️' }
    ],
    cloudExchanges: [],
    // 弹窗
    showCustom: false,
    customMode: 'reason',
    customForm: { label: '', icon: '🎁', points: 10, cost: 30 },
    editingIndex: -1,
    // 兑换历史
    exchangeHistory: [],
    showHistory: false
  },

  onShow() {
    this.loadScore()
    this.loadCustomReasons()
    this.loadExchanges()
    this.loadExchangeHistory()
  },

  loadCustomReasons() {
    const customReasons = wx.getStorageSync('ls_custom_reasons') || []
    this.setData({ customReasons })
  },

  saveCustomReasons() {
    wx.setStorageSync('ls_custom_reasons', this.data.customReasons)
  },

  async loadExchanges() {
    try {
      const res = await callFunction('points', { action: 'listExchanges' })
      if (res.code === 0) this.setData({ cloudExchanges: res.list || [] })
    } catch (e) {
      console.error(e)
    }
  },

  async loadExchangeHistory() {
    try {
      const res = await callFunction('points', { action: 'listExchangeHistory' })
      if (res.code === 0) {
        this.setData({ exchangeHistory: (res.list || []).slice(0, 10) })
      }
    } catch (e) { /* silent */ }
  },

  async loadScore() {
    try {
      const res = await callFunction('points', { action: 'getScore' })
      if (res.code === 0) {
        const { myScore, partnerScore } = res
        const level = getLevelByPoints(myScore)
        const levels = [
          { name: '新手情侣', min: 0 },
          { name: '甜蜜搭子', min: 100 },
          { name: '默契满分', min: 500 },
          { name: '神仙伴侣', min: 1000 },
          { name: '灵魂伴侣', min: 2000 },
          { name: '天作之合', min: 5000 }
        ]
        let nextLevel = null
        let progressPercent = 100
        for (let i = 0; i < levels.length; i++) {
          if (myScore < levels[i].min) {
            nextLevel = { ...levels[i], remaining: levels[i].min - myScore }
            const prevMin = i > 0 ? levels[i - 1].min : 0
            progressPercent = ((myScore - prevMin) / (levels[i].min - prevMin)) * 100
            break
          }
        }
        this.setData({ myScore, partnerScore, level, nextLevel, progressPercent })
      }
    } catch (e) {
      console.error(e)
    }
  },

  // ===== 快速加分 =====
  async onGivePoints(e) {
    const reason = e.currentTarget.dataset.reason
    wx.showModal({
      title: `给TA加 ${reason.points} 积分`,
      content: `原因：${reason.label}`,
      editable: true,
      placeholderText: '补充说明（可选）',
      confirmText: '确认',
      confirmColor: '#FF6B81',
      success: async (res) => {
        if (res.confirm) {
          try {
            await callFunction('points', {
              action: 'add',
              data: { amount: reason.points, reason: reason.label, note: res.content || '' }
            })
            wx.showToast({ title: '加分成功！', icon: 'success' })
            this.loadScore()
          } catch (e) { /* toast handled by callFunction */ }
        }
      }
    })
  },

  onCustomPoints() {
    this.setData({
      showCustom: true, customMode: 'reason', editingIndex: -1,
      customForm: { label: '', icon: '🎁', points: 10, cost: 30 }
    })
  },

  onAddPoints() {
    const { customForm } = this.data
    if (!customForm.label.trim()) {
      wx.showToast({ title: '请输入项目名称', icon: 'none' })
      return
    }
    const points = parseInt(customForm.points)
    if (!points || points === 0) {
      wx.showToast({ title: '请输入积分数', icon: 'none' })
      return
    }
    wx.showModal({
      title: points > 0 ? `+${points} 积分` : `${points} 积分`,
      content: `项目：${customForm.label}`,
      editable: true,
      placeholderText: '补充说明（可选）',
      confirmColor: '#FF6B81',
      success: async (res) => {
        if (res.confirm) {
          await callFunction('points', {
            action: 'add',
            data: { amount: points, reason: customForm.label, note: res.content || '' }
          })
          wx.showToast({ title: points > 0 ? '加分成功！' : '减分成功', icon: 'success' })
          this.setData({ showCustom: false })
          this.loadScore()
        }
      }
    })
  },

  onCustomInput(e) {
    this.setData({ [`customForm.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  onCustomPointsChange(e) {
    this.setData({ 'customForm.points': parseInt(e.detail.value) || 0 })
  },

  onCustomCostChange(e) {
    this.setData({ 'customForm.cost': parseInt(e.detail.value) || 0 })
  },

  onSaveCustomReason() {
    const { customForm, customReasons, editingIndex } = this.data
    if (!customForm.label.trim()) {
      wx.showToast({ title: '请输入名称', icon: 'none' })
      return
    }
    const item = {
      label: customForm.label.trim(),
      icon: customForm.icon || '🎁',
      points: parseInt(customForm.points) || 10
    }
    if (editingIndex >= 0) {
      customReasons[editingIndex] = item
    } else {
      customReasons.push(item)
    }
    this.setData({ customReasons, showCustom: false })
    this.saveCustomReasons()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  onEditCustomReason(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.customReasons[index]
    this.setData({
      showCustom: true, customMode: 'reason', editingIndex: index,
      customForm: { label: item.label, icon: item.icon, points: item.points, cost: 30 }
    })
  },

  onDeleteCustomReason(e) {
    const index = e.currentTarget.dataset.index
    wx.showModal({
      title: '删除', content: '确定删除？', confirmColor: '#FF6B81',
      success: (res) => {
        if (res.confirm) {
          const customReasons = [...this.data.customReasons]
          customReasons.splice(index, 1)
          this.setData({ customReasons })
          this.saveCustomReasons()
        }
      }
    })
  },

  // ===== 自定义兑换 =====
  onCustomExchange() {
    this.setData({
      showCustom: true, customMode: 'exchange', editingIndex: -1,
      customForm: { label: '', icon: '🎁', points: 10, cost: 30 }
    })
  },

  async onSaveCustomExchange() {
    const { customForm } = this.data
    if (!customForm.label.trim()) {
      wx.showToast({ title: '请输入名称', icon: 'none' })
      return
    }
    const cost = parseInt(customForm.cost) || 30
    if (cost <= 0) {
      wx.showToast({ title: '积分必须大于0', icon: 'none' })
      return
    }
    try {
      await callFunction('points', {
        action: 'addExchange',
        data: { name: customForm.label.trim(), cost, icon: customForm.icon || '🎁' }
      })
      this.setData({ showCustom: false })
      this.loadExchanges()
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  onDeleteCustomExchange(e) {
    const item = e.currentTarget.dataset.item
    wx.showModal({
      title: '删除', content: `确定删除「${item.name}」？`, confirmColor: '#FF6B81',
      success: async (res) => {
        if (res.confirm) {
          await callFunction('points', { action: 'deleteExchange', data: { id: item._id } })
          this.loadExchanges()
        }
      }
    })
  },

  // ===== 兑换 =====
  onExchange(e) {
    const item = e.currentTarget.dataset.item
    if (this.data.myScore < item.cost) {
      wx.showToast({ title: `还差 ${item.cost - this.data.myScore} 积分`, icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认兑换',
      content: `消耗 ${item.cost} 积分兑换「${item.name}」\n当前积分：${this.data.myScore}\n兑换后：${this.data.myScore - item.cost}`,
      confirmText: '确认兑换',
      confirmColor: '#FF6B81',
      success: async (res) => {
        if (res.confirm) {
          await callFunction('points', {
            action: 'exchange',
            data: { amount: item.cost, item: item.name, exchangeId: item._id || '' }
          })
          wx.showToast({ title: '兑换成功！', icon: 'success' })
          this.loadScore()
          this.loadExchangeHistory()
        }
      }
    })
  },

  onCloseCustom() { this.setData({ showCustom: false }) },

  onToggleHistory() {
    this.setData({ showHistory: !this.data.showHistory })
  },

  goRecords() {
    wx.navigateTo({ url: '/pages/points-records/points-records' })
  }
})
