const { callFunction, uploadImage } = require('../../utils/cloud')

Page({
  data: {
    nickName: '',
    startDate: '',
    inviteCode: '',
    bgImage: '',
    bgOpacity: 80,
    showBgPanel: false,
    hasPartner: false
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
        inviteCode: res.couple ? res.couple.inviteCode : '',
        hasPartner: Boolean(res.couple && res.couple.partner)
      })
    }
  },

  onEditNick() {
    wx.showModal({
      title: '修改昵称', editable: true, placeholderText: '输入新昵称',
      success: async (res) => {
        if (res.confirm && res.content) {
          await callFunction('user', { action: 'updateProfile', data: { nickName: res.content.trim() } })
          wx.showToast({ title: '已更新', icon: 'success' })
          this.loadInfo()
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
      success: async (res) => {
        const filePath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '正在保存' })
        try {
          const previous = this.data.bgImage
          const fileID = await uploadImage(filePath)
          this.setData({ bgImage: fileID })
          wx.setStorageSync('ls_bg_image', fileID)
          this.applyBg()
          if (previous && previous.startsWith('cloud://')) {
            wx.cloud.deleteFile({ fileList: [previous] }).catch(() => {})
          }
          wx.showToast({ title: '已设置背景', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: '背景保存失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
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
    const previous = this.data.bgImage
    this.setData({ bgImage: '', bgOpacity: 80 })
    wx.removeStorageSync('ls_bg_image')
    wx.removeStorageSync('ls_bg_opacity')
    this.applyBg()
    if (previous && previous.startsWith('cloud://')) {
      wx.cloud.deleteFile({ fileList: [previous] }).catch(() => {})
    }
    wx.showToast({ title: '已重置', icon: 'success' })
  },

  applyBg() {
    const app = getApp()
    app.globalData.bgImage = this.data.bgImage
    app.globalData.bgOpacity = this.data.bgOpacity
  },

  onCopyInvite() {
    if (!this.data.inviteCode) return
    wx.setClipboardData({ data: this.data.inviteCode })
  },

  onPrivacyInfo() {
    wx.showModal({
      title: '双人空间保护',
      content: '相册、心情、问答与共同记录均通过云函数校验情侣关系。心情选择“仅自己”后，对方无法查看。请同时在云开发控制台关闭数据库的客户端直接读写权限。',
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#E85D75'
    })
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
