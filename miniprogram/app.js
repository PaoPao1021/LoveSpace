App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    wx.cloud.init({
      env: 'cloudbase-d1ge15ed4f58fe910',
      traceUser: true
    })
    this.globalData = {}
    this.loadBgSettings()
    this.checkLogin()
  },

  loadBgSettings() {
    this.globalData.bgImage = wx.getStorageSync('ls_bg_image') || ''
    this.globalData.bgOpacity = wx.getStorageSync('ls_bg_opacity') || 80
  },

  async checkLogin() {
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      const { openid } = res.result
      this.globalData.openid = openid

      const db = wx.cloud.database()
      const userRes = await db.collection('users').doc(openid).get().catch(() => null)
      if (userRes && userRes.data) {
        this.globalData.userInfo = userRes.data
        this.globalData.coupleId = userRes.data.coupleId
      }
    } catch (e) {
      console.error('登录检查失败:', e)
    }
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
