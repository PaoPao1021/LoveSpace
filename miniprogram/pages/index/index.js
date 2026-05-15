const { callFunction } = require('../../utils/cloud')
const { daysSince, formatDate, getNextAnniversaryDate, daysUntil, timeAgo } = require('../../utils/date')
const { MOOD_TYPES, getMoodByType } = require('../../utils/theme')

Page({
  data: {
    loaded: false,
    coupleId: '',
    greeting: '',
    daysTogether: 0,
    startDate: '',
    myAvatar: '',
    partnerAvatar: '',
    myName: '',
    partnerName: '',
    myMood: {},
    partnerMood: {},
    nextAnniversary: null,
    recentList: [],
    notifications: [],
    // 恋爱能量
    loveEnergy: 0,
    energyLevel: '',
    energyTip: '',
    // 每日一句
    dailyQuote: '',
    // 贴纸导航
    navItems: [
      { emoji: '📅', label: '纪念日', bg: 'sticker-bg-blush', tap: 'goAnniversary' },
      { emoji: '📸', label: '相册', bg: 'sticker-bg-cream', tap: 'goAlbum' },
      { emoji: '💝', label: '能量', bg: 'sticker-bg-lavender', tap: 'goPoints' },
      { emoji: '🍜', label: '点菜', bg: 'sticker-bg-mint', tap: 'goMenu' },
      { emoji: '✅', label: '任务', bg: 'sticker-bg-sky', tap: 'goTasks' },
      { emoji: '🌟', label: '愿望', bg: 'sticker-bg-peach', tap: 'goWishes' },
      { emoji: '💌', label: '胶囊', bg: 'sticker-bg-blush', tap: 'goCapsule' },
      { emoji: '📖', label: '时间轴', bg: 'sticker-bg-cream', tap: 'goTimeline' }
    ]
  },

  onShow() {
    this.loadData()
    this.setAtmosphere()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  setAtmosphere() {
    const h = new Date().getHours()
    let atmoClass = ''
    if (h >= 20 || h < 6) atmoClass = 'atmosphere-night'
    else if (h >= 17) atmoClass = 'atmosphere-dusk'
    else atmoClass = 'atmosphere-day'
    // 应用到页面
    const pageEl = '.page'
    this.setData({ atmoClass })
  },

  async loadData() {
    const app = getApp()
    const coupleId = app.globalData.coupleId

    if (!coupleId) {
      this.setData({ loaded: true, coupleId: '' })
      return
    }

    try {
      const coupleRes = await callFunction('couple', { action: 'getInfo' })
      if (coupleRes.code === 0 && coupleRes.couple) {
        const { couple, user, partner } = coupleRes
        const startDate = couple.startDate
        const days = daysSince(startDate)

        this.setData({
          coupleId,
          daysTogether: days,
          startDate,
          greeting: this.getGreeting(),
          dailyQuote: this.getRandomQuote(),
          myAvatar: (user && user.avatarUrl) || this.data.myAvatar || '',
          partnerAvatar: (partner && partner.avatarUrl) || this.data.partnerAvatar || '',
          myName: (user && user.nickName) ? user.nickName : '我',
          partnerName: (partner && partner.nickName) ? partner.nickName : 'TA',
          loaded: true
        })

        this.loadMood()
        this.loadAnniversaries()
        this.loadRecent()
        this.loadNotifications()
        this.loadLoveEnergy()
      } else {
        this.setData({ loaded: true })
      }
    } catch (e) {
      console.error(e)
      this.setData({ loaded: true })
    }
  },

  getGreeting() {
    const h = new Date().getHours()
    if (h < 6) return '夜深了，晚安'
    if (h < 9) return '早安，新的一天'
    if (h < 12) return '上午好'
    if (h < 14) return '中午好'
    if (h < 18) return '下午好'
    if (h < 21) return '傍晚好'
    return '晚上好'
  },

  getRandomQuote() {
    const quotes = [
      '你是我见过的最美的风景',
      '今天也想见到你',
      '和你在一起的每一天都值得纪念',
      '你笑起来真好看',
      '谢谢你来到我的世界',
      '今天比昨天更喜欢你了',
      '想念是会呼吸的甜',
      '你是我最大的幸运'
    ]
    return quotes[Math.floor(Math.random() * quotes.length)]
  },

  async loadMood() {
    try {
      const [myRes, partnerRes] = await Promise.all([
        callFunction('mood', { action: 'getToday' }),
        callFunction('mood', { action: 'getPartner', data: {} })
      ])
      const myMood = myRes.data ? getMoodByType(myRes.data.moodType) : {}
      const partnerMood = partnerRes.data ? getMoodByType(partnerRes.data.moodType) : {}
      this.setData({
        myMood: { emoji: myMood.emoji || '😶', label: myMood.label || '未打卡' },
        partnerMood: { emoji: partnerMood.emoji || '😶', label: partnerMood.label || '未打卡' }
      })
    } catch (e) {
      console.error(e)
    }
  },

  async loadAnniversaries() {
    try {
      const res = await callFunction('anniversary', { action: 'list' })
      if (res.code === 0 && res.list.length > 0) {
        let nearest = null
        let minDays = Infinity
        for (const ann of res.list) {
          const nextDate = getNextAnniversaryDate(ann.date)
          const d = daysUntil(nextDate)
          if (d >= 0 && d < minDays) {
            minDays = d
            nearest = {
              name: ann.name,
              date: formatDate(nextDate, 'MM月DD日'),
              daysLeft: d,
              isToday: d === 0
            }
          }
        }
        this.setData({ nextAnniversary: nearest })
      }
    } catch (e) {
      console.error(e)
    }
  },

  async loadRecent() {
    try {
      const res = await callFunction('moments', { action: 'list', data: { pageSize: 3 } })
      if (res.code === 0 && res.list.length > 0) {
        const recentList = res.list.slice(0, 3).map(item => ({
          _id: item._id,
          text: item.title || item.content.slice(0, 60),
          time: timeAgo(item.createdAt),
          hasImage: !!(item.images && item.images.length > 0),
          image: item.images && item.images.length > 0 ? item.images[0] : ''
        }))
        this.setData({ recentList })
      }
    } catch (e) {
      console.error(e)
    }
  },

  async loadLoveEnergy() {
    try {
      const res = await callFunction('points', { action: 'getScore' })
      if (res.code === 0) {
        const total = (res.myScore || 0) + (res.partnerScore || 0)
        const percent = Math.min(100, Math.floor(total / 20))
        let level = '初绽'
        let tip = '多互动，让爱意生长'
        if (percent >= 90) { level = '满糖'; tip = '甜度爆表，继续甜蜜~'; }
        else if (percent >= 70) { level = '浓情'; tip = '爱的能量正在发光'; }
        else if (percent >= 40) { level = '升温'; tip = '再多一点点互动吧'; }
        else if (percent >= 15) { level = '萌芽'; tip = '每天一点小互动就很棒'; }

        this.setData({
          loveEnergy: percent,
          energyLevel: level,
          energyTip: tip
        })
      }
    } catch (e) {
      console.error(e)
    }
  },

  async loadNotifications() {
    try {
      const res = await callFunction('notification', { action: 'list' })
      if (res.code === 0) {
        this.setData({ notifications: res.list.slice(0, 2) })
      }
    } catch (e) {
      console.error(e)
    }
  },

  onNotificationTap(e) {
    const item = e.currentTarget.dataset.item
    callFunction('notification', { action: 'read', data: { id: item._id } })
    if (item.type === 'order') {
      wx.navigateTo({ url: '/pages/order-history/order-history' })
    }
    const notifications = this.data.notifications.filter(n => n._id !== item._id)
    this.setData({ notifications })
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },
  goMood() {
    wx.navigateTo({ url: '/pages/mood/mood' })
  },
  goAnniversary() {
    wx.navigateTo({ url: '/pages/anniversary/anniversary' })
  },
  goAlbum() {
    wx.switchTab({ url: '/pages/album/album' })
  },
  goPoints() {
    wx.navigateTo({ url: '/pages/points/points' })
  },
  goMenu() {
    wx.navigateTo({ url: '/pages/menu/menu' })
  },
  goTasks() {
    wx.navigateTo({ url: '/pages/tasks/tasks' })
  },
  goCapsule() {
    wx.navigateTo({ url: '/pages/capsule/capsule' })
  },
  goWishes() {
    wx.navigateTo({ url: '/pages/wishes/wishes' })
  },
  goTimeline() {
    wx.navigateTo({ url: '/pages/timeline/timeline' })
  }
})
