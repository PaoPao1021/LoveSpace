const { callFunction, uploadImage } = require('../../utils/cloud')

Page({
  data: {
    isLoggedIn: false,
    coupleId: '',
    nickName: '',
    avatarUrl: '',
    startDate: '',
    step: '', // '' | 'create' | 'invite' | 'join'
    inviteCode: '',
    inputCode: '',
    loading: false
  },

  async onShow() {
    const app = getApp()
    await app.ensureReady()
    if (app.globalData.openid && app.globalData.coupleId) {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    if (app.globalData.openid) {
      this.setData({ isLoggedIn: true })
    }
  },

  onNickNameInput(e) {
    this.setData({ nickName: e.detail.value })
  },

  onChooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const filePath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '上传中...' })
        try {
          const fileID = await uploadImage(filePath)
          this.setData({ avatarUrl: fileID })
          wx.showToast({ title: '头像已选择', icon: 'success' })
        } catch (e) {
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  async onGetUserInfo() {
    const nickName = this.data.nickName.trim()
    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    try {
      const { openid } = await callFunction('login')
      const app = getApp()
      app.globalData.openid = openid
      await callFunction('user', {
        action: 'updateProfile',
        data: { nickName, avatarUrl: this.data.avatarUrl }
      })

      app.globalData.userInfo = { nickName, avatarUrl: this.data.avatarUrl }
      this.setData({ isLoggedIn: true })
    } catch (e) {
      console.error('登录失败:', e)
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onDateChange(e) {
    this.setData({ startDate: e.detail.value })
  },

  onCreate() {
    this.setData({ step: 'create' })
  },

  onJoin() {
    this.setData({ step: 'join' })
  },

  onBack() {
    this.setData({ step: '' })
  },

  async onCreateCouple() {
    const { startDate } = this.data
    if (!startDate) {
      wx.showToast({ title: '请选择在一起的日期', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    try {
      const res = await callFunction('couple', {
        action: 'create',
        data: { startDate, nickName: this.data.nickName, avatarUrl: this.data.avatarUrl }
      })

      if (res.code === 0) {
        const app = getApp()
        app.globalData.coupleId = res.coupleId

        this.setData({
          step: 'invite',
          inviteCode: res.inviteCode
        })
      }
    } catch (e) {
      console.error(e)
    } finally {
      this.setData({ loading: false })
    }
  },

  onCodeInput(e) {
    this.setData({ inputCode: e.detail.value.toUpperCase() })
  },

  async onJoinCouple() {
    const { inputCode } = this.data
    if (inputCode.length !== 6) {
      wx.showToast({ title: '请输入6位邀请码', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    try {
      const res = await callFunction('couple', {
        action: 'join',
        data: { inviteCode: inputCode, nickName: this.data.nickName, avatarUrl: this.data.avatarUrl }
      })

      if (res.code === 0) {
        const app = getApp()
        app.globalData.coupleId = res.coupleId

        wx.showToast({ title: '绑定成功！', icon: 'success' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 1500)
      }
    } catch (e) {
      console.error(e)
    } finally {
      this.setData({ loading: false })
    }
  },

  onCopyCode() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  }
})
