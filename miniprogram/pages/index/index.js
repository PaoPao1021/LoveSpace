const { callFunction } = require('../../utils/cloud')
const { daysSince, formatDate, getNextAnniversaryDate, daysUntil, timeAgo } = require('../../utils/date')
const { getMoodByType } = require('../../utils/theme')

Page({
  data: {
    loaded: false,
    coupleId: '',
    greeting: '',
    daysTogether: 0,
    startDate: '',
    myAvatar: '',
    partnerAvatar: '',
    myName: '我',
    partnerName: 'TA',
    myMood: {},
    partnerMood: {},
    moodSummary: '今天还没有打卡',
    nextAnniversary: null,
    recentList: [],
    notifications: [],
    loveEnergy: 0,
    energyLevel: '正在萌芽',
    energyTip: '从一次真诚互动开始',
    dailyQuestion: {},
    dailyQuestionStatus: '去回答',
    fitnessSummary: {
      teamProgress: 0,
      myWorkouts: 0,
      checkedIn: false,
      partnerCheckedIn: false
    },
    fitnessCopy: '从一次打卡开始',
    quickActions: [
      { icon: '＋', label: '记录此刻', note: '照片与文字', url: '/pages/moment-edit/moment-edit', tone: 'rose' },
      { icon: '✓', label: '共同任务', note: '一起完成', url: '/pages/tasks/tasks', tone: 'sage' },
      { icon: '⌁', label: '今天吃什么', note: '替选择减负', url: '/pages/menu/menu', tone: 'sand' },
      { icon: '☆', label: '愿望清单', note: '约定未来', url: '/pages/wishes/wishes', tone: 'lilac' },
      { icon: '□', label: '时光胶囊', note: '写给未来', url: '/pages/capsule/capsule', tone: 'blue' },
      { icon: '▧', label: '共同相册', note: '收藏回忆', url: '/pages/album/album', tab: true, tone: 'peach' }
    ]
  },

  async onShow() {
    const app = getApp()
    await app.ensureReady()
    await this.loadData()
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 0 })
  },

  async loadData() {
    const app = getApp()
    const coupleId = app.globalData.coupleId || ''
    if (!coupleId) {
      this.setData({ loaded: true, coupleId: '', greeting: this.getGreeting() })
      return
    }

    this.setData({ coupleId, greeting: this.getGreeting() })
    try {
      const result = await callFunction('couple', { action: 'getInfo' })
      if (!result.couple) {
        this.setData({ loaded: true, coupleId: '' })
        return
      }

      const { couple, user, partner } = result
      this.setData({
        daysTogether: daysSince(couple.startDate),
        startDate: formatDate(couple.startDate, 'YYYY.MM.DD'),
        myAvatar: (user && user.avatarUrl) || '',
        partnerAvatar: (partner && partner.avatarUrl) || '',
        myName: (user && user.nickName) || '我',
        partnerName: (partner && partner.nickName) || 'TA',
        loaded: true
      })

      await Promise.allSettled([
        this.loadDailyQuestion(),
        this.loadMood(),
        this.loadAnniversaries(),
        this.loadRecent(),
        this.loadNotifications(),
        this.loadLoveEnergy(),
        this.loadFitness()
      ])
    } catch (error) {
      console.error('首页加载失败:', error)
      this.setData({ loaded: true })
    }
  },

  getGreeting() {
    const hour = new Date().getHours()
    if (hour < 6) return '夜深了，记得好好休息'
    if (hour < 11) return '早安，今天也好好相爱'
    if (hour < 14) return '午间好，留一点时间给彼此'
    if (hour < 18) return '下午好，分享今天的小事吧'
    if (hour < 22) return '晚上好，聊聊今天的心情'
    return '晚安，把今天温柔收好'
  },

  async loadDailyQuestion() {
    const result = await callFunction('daily-question', { action: 'getToday' }, { silent: true })
    let status = '去回答'
    if (result.bothAnswered) status = '已揭晓'
    else if (result.myAnswer) status = '等 TA 回答'
    else if (result.partnerAnswered) status = 'TA 已回答'
    this.setData({ dailyQuestion: result, dailyQuestionStatus: status })
  },

  async loadMood() {
    const [mine, partner] = await Promise.all([
      callFunction('mood', { action: 'getToday' }, { silent: true }),
      callFunction('mood', { action: 'getPartner', data: {} }, { silent: true })
    ])
    const myMood = mine.data ? getMoodByType(mine.data.moodType) : {}
    const partnerMood = partner.data ? getMoodByType(partner.data.moodType) : {}
    const summary = myMood.label && partnerMood.label ? `${myMood.label} / ${partnerMood.label}` : myMood.label ? `我：${myMood.label}` : partnerMood.label ? `TA：${partnerMood.label}` : '今天还没有打卡'
    this.setData({ myMood, partnerMood, moodSummary: summary })
  },

  async loadAnniversaries() {
    const result = await callFunction('anniversary', { action: 'list' }, { silent: true })
    let nearest = null
    ;(result.list || []).forEach(item => {
      const nextDate = item.isRepeat === false ? new Date(item.date) : getNextAnniversaryDate(item.date)
      const daysLeft = daysUntil(nextDate)
      if (daysLeft >= 0 && (!nearest || daysLeft < nearest.daysLeft)) {
        nearest = { name: item.name, date: formatDate(nextDate, 'MM月DD日'), daysLeft, isToday: daysLeft === 0 }
      }
    })
    this.setData({ nextAnniversary: nearest })
  },

  async loadRecent() {
    const result = await callFunction('moments', { action: 'list', data: { pageSize: 3 } }, { silent: true })
    const recentList = (result.list || []).slice(0, 3).map(item => {
      const content = item.title || item.content || '共同记下的一刻'
      return {
        _id: item._id,
        text: content.slice(0, 36),
        time: timeAgo(item.createdAt),
        hasImage: Boolean(item.images && item.images.length),
        image: item.images && item.images[0]
      }
    })
    this.setData({ recentList })
  },

  async loadLoveEnergy() {
    const result = await callFunction('points', { action: 'getScore' }, { silent: true })
    const total = Math.max(0, Number(result.myScore || 0) + Number(result.partnerScore || 0))
    const percent = Math.min(100, Math.round(total / 20))
    let energyLevel = '正在萌芽'
    let energyTip = '从一次真诚互动开始'
    if (percent >= 85) { energyLevel = '默契发光'; energyTip = '你们正在稳定回应彼此' }
    else if (percent >= 60) { energyLevel = '持续升温'; energyTip = '爱被放进了具体行动里' }
    else if (percent >= 30) { energyLevel = '温柔生长'; energyTip = '一点一滴都算数' }
    this.setData({ loveEnergy: percent, energyLevel, energyTip })
  },

  async loadFitness() {
    const result = await callFunction('fitness', { action: 'dashboard' }, { silent: true })
    const teamProgress = Number(result.teamProgress || 0)
    let fitnessCopy = '从一次打卡开始'
    if (teamProgress >= 85) fitnessCopy = '这周节奏很稳，记得认真恢复'
    else if (teamProgress >= 60) fitnessCopy = '共同节奏正在形成'
    else if (teamProgress >= 30) fitnessCopy = '今天再一起完成一小步'
    this.setData({
      fitnessSummary: {
        teamProgress,
        myWorkouts: Number(result.myStats && result.myStats.workouts || 0),
        checkedIn: Boolean(result.todayCheckin),
        partnerCheckedIn: Boolean(result.partnerCheckedIn)
      },
      fitnessCopy
    })
  },

  async loadNotifications() {
    const result = await callFunction('notification', { action: 'list' }, { silent: true })
    this.setData({ notifications: (result.list || []).slice(0, 2) })
  },

  onNotificationTap(event) {
    const item = event.currentTarget.dataset.item
    callFunction('notification', { action: 'read', data: { id: item._id } }, { silent: true }).catch(() => {})
    if (item.type === 'order') wx.navigateTo({ url: '/pages/order-history/order-history' })
    if (item.type === 'fitness') wx.navigateTo({ url: '/pages/fitness/fitness' })
    this.setData({ notifications: this.data.notifications.filter(note => note._id !== item._id) })
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  goQuickAction(event) {
    const { url, tab } = event.currentTarget.dataset
    if (tab) wx.switchTab({ url })
    else wx.navigateTo({ url })
  },
  goLogin() { wx.navigateTo({ url: '/pages/login/login' }) },
  goDailyQuestion() { wx.navigateTo({ url: '/pages/daily-question/daily-question' }) },
  goMonthlyReport() { wx.navigateTo({ url: '/pages/monthly-report/monthly-report' }) },
  goFitness() { wx.navigateTo({ url: '/pages/fitness/fitness' }) },
  goMood() { wx.navigateTo({ url: '/pages/mood/mood' }) },
  goAnniversary() { wx.navigateTo({ url: '/pages/anniversary/anniversary' }) },
  goTimeline() { wx.navigateTo({ url: '/pages/timeline/timeline' }) },
  goMoments() { wx.switchTab({ url: '/pages/moments/moments' }) }
})
