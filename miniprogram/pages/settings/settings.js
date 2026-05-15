const { callFunction, uploadImage } = require('../../utils/cloud')

Page({
  data: {
    nickName: '',
    startDate: '',
    inviteCode: '',
    bgImage: '',
    bgOpacity: 80,
    showBgPanel: false
  },

  onShow() {
    this.loadInfo()
    this.loadBgSettings()
  },

  loadBgSettings() {
    const bgImage = wx.getStorageSync('ls_bg_image') || ''
    const bgOpacity = wx.getStorageSync('ls_bg_opacity') || 80
    this.setData({ bgImage, bgOpacity })
  },

  async loadInfo() {
    const res = await callFunction('couple', { action: 'getInfo' })
    if (res.code === 0) {
      this.setData({
        nickName: res.user ? res.user.nickName || '未设置' : '未设置',
        startDate: res.couple ? res.couple.startDate : '',
        inviteCode: res.couple ? res.couple.inviteCode : ''
      })
    }
  },

  onEditNick() {
    wx.showModal({
      title: '修改昵称', editable: true, placeholderText: '输入新昵称',
      success: async (res) => {
        if (res.confirm && res.content) {
          wx.showToast({ title: '已更新', icon: 'success' })
        }
      }
    })
  },

  // ===== 自定义背景 =====
  onOpenBgPanel() {
    this.setData({ showBgPanel: true })
  },

  onCloseBgPanel() {
    this.setData({ showBgPanel: false })
  },

  onChooseBg() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = res.tempFiles[0].tempFilePath
        this.setData({ bgImage: filePath })
        wx.setStorageSync('ls_bg_image', filePath)
        this.applyBg()
        wx.showToast({ title: '已设置背景', icon: 'success' })
      }
    })
  },

  onOpacityChange(e) {
    const bgOpacity = e.detail.value
    this.setData({ bgOpacity })
    wx.setStorageSync('ls_bg_opacity', bgOpacity)
    this.applyBg()
  },

  onPresetOpacity(e) {
    const bgOpacity = parseInt(e.currentTarget.dataset.val)
    this.setData({ bgOpacity })
    wx.setStorageSync('ls_bg_opacity', bgOpacity)
    this.applyBg()
  },

  onResetBg() {
    this.setData({ bgImage: '', bgOpacity: 80 })
    wx.removeStorageSync('ls_bg_image')
    wx.removeStorageSync('ls_bg_opacity')
    this.applyBg()
    wx.showToast({ title: '已重置', icon: 'success' })
  },

  applyBg() {
    const app = getApp()
    app.globalData.bgImage = this.data.bgImage
    app.globalData.bgOpacity = this.data.bgOpacity
  },

  onExport() {
    wx.showToast({ title: '功能开发中', icon: 'none' })
  },

  onDissolve() {
    wx.showModal({
      title: '⚠️ 解除绑定',
      content: '解除后所有数据将保留但无法再共享，确定要解除吗？',
      confirmColor: '#FF0000',
      success: async (res) => {
        if (res.confirm) {
          await callFunction('couple', { action: 'dissolve' })
          wx.showToast({ title: '已解除绑定', icon: 'success' })
          const app = getApp()
          app.globalData.coupleId = ''
          setTimeout(() => wx.reLaunch({ url: '/pages/login/login' }), 1500)
        }
      }
    })
  }
})
