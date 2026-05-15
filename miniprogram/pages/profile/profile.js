const { callFunction, uploadImage, getTempFileURL } = require('../../utils/cloud')
const { daysSince } = require('../../utils/date')

Page({
  data: {
    myAvatar: '',
    partnerAvatar: '',
    myName: '我',
    partnerName: 'TA',
    daysTogether: 0,
    showEditNickname: false,
    editNickname: '',
    loading: true
  },

  onShow() {
    this.loadProfile()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
  },

  async loadProfile() {
    this.setData({ loading: true })
    try {
      const res = await callFunction('couple', { action: 'getInfo' })
      if (res.code === 0) {
        const { couple, user, partner } = res

        // 头像URL由云函数服务端转换，前端直接使用
        const myAvatar = (user && user.avatarUrl) || this.data.myAvatar || ''
        const partnerAvatar = (partner && partner.avatarUrl) || this.data.partnerAvatar || ''

        // 更新全局缓存
        const app = getApp()
        if (user) {
          app.globalData.userInfo = user
          app.globalData.coupleId = user.coupleId || ''
        }

        this.setData({
          myAvatar,
          myName: (user && user.nickName) ? user.nickName : '我',
          partnerAvatar,
          partnerName: (partner && partner.nickName) ? partner.nickName : 'TA',
          daysTogether: couple ? daysSince(couple.startDate) : 0,
          loading: false
        })
      } else {
        this.setData({ loading: false })
      }
    } catch (e) {
      console.error('加载个人信息失败:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败，下拉刷新', icon: 'none' })
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadProfile().then(() => wx.stopPullDownRefresh())
  },

  // ===== 头像 =====
  onTapAvatar() {
    const that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const filePath = res.tempFiles[0].tempFilePath

        wx.showLoading({ title: '上传中...' })
        try {
          const fileID = await uploadImage(filePath)

          // 立即转为临时HTTPS链接显示
          const tempURL = await getTempFileURL(fileID)
          that.setData({ myAvatar: tempURL || fileID })

          // 更新全局缓存（存cloud://永久链接）
          const app = getApp()
          if (app.globalData.userInfo) {
            app.globalData.userInfo.avatarUrl = fileID
          }

          // 云端数据库存cloud://永久链接
          const updateRes = await callFunction('user', {
            action: 'updateProfile',
            data: { avatarUrl: fileID }
          })
          console.log('updateProfile result:', updateRes)

          wx.hideLoading()
          wx.showToast({ title: '头像已更新', icon: 'success' })

          // 延迟重新加载（等DB写入 + 服务端转临时链接）
          setTimeout(() => { that.loadProfile() }, 1000)
        } catch (e) {
          wx.hideLoading()
          console.error('Avatar upload error:', e)
          wx.showToast({ title: '上传失败，请重试', icon: 'none' })
        }
      }
    })
  },

  // ===== 昵称 =====
  onTapNickname() {
    this.setData({
      showEditNickname: true,
      editNickname: this.data.myName === '我' ? '' : this.data.myName
    })
  },

  onCloseEditNickname() {
    this.setData({ showEditNickname: false })
  },

  onNicknameInput(e) {
    this.setData({ editNickname: e.detail.value })
  },

  async onSaveNickname() {
    const nickName = this.data.editNickname.trim()
    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (nickName.length > 20) {
      wx.showToast({ title: '昵称最多20个字符', icon: 'none' })
      return
    }
    try {
      this.setData({ myName: nickName, showEditNickname: false })
      const app = getApp()
      if (app.globalData.userInfo) {
        app.globalData.userInfo.nickName = nickName
      }
      await callFunction('user', {
        action: 'updateProfile',
        data: { nickName }
      })
      wx.showToast({ title: '昵称已更新', icon: 'success' })
      setTimeout(() => { this.loadProfile() }, 800)
    } catch (e) {
      wx.showToast({ title: '修改失败', icon: 'none' })
    }
  },

  // ===== 导航 =====
  goPage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.navigateTo({ url })
  }
})
