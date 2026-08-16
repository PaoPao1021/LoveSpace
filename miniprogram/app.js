const { cloudEnvId } = require('./config/index')

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    wx.cloud.init({
      env: cloudEnvId,
      traceUser: true
    })
    this.loadBgSettings()
    this.ready = this.checkLogin()
  },

  loadBgSettings() {
    this.globalData.bgImage = wx.getStorageSync('ls_bg_image') || ''
    this.globalData.bgOpacity = wx.getStorageSync('ls_bg_opacity') || 80
  },

  async checkLogin() {
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      const { openid, userInfo } = res.result || {}
      if (!openid) throw new Error('登录结果异常')
      this.globalData.openid = openid
      this.globalData.userInfo = userInfo || null
      this.globalData.coupleId = (userInfo && userInfo.coupleId) || ''
      return this.globalData
    } catch (e) {
      console.error('登录检查失败:', e)
      return this.globalData
    }
  },

  ensureReady() {
    return this.ready || Promise.resolve(this.globalData)
  },

  /**
   * 获取页面背景样式数据
   * 在页面 data 中调用: bgStyle: getApp().getBgStyle()
   */
  getBgStyle() {
    const { bgImage, bgOpacity } = this.globalData
    if (!bgImage) return {}
    return {
      bgImage,
      bgOpacity,
      bgStyle: `background-image: url(${bgImage}); background-size: cover; background-position: center; opacity: ${bgOpacity / 100};`
    }
  },

  globalData: {
    openid: '',
    userInfo: null,
    coupleId: '',
    bgImage: '',
    bgOpacity: 80
  }
})
