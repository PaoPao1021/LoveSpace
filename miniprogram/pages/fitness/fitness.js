const { callFunction } = require('../../utils/cloud')

const GOAL_LABELS = {
  'fat-loss': '减脂',
  muscle: '增肌',
  shape: '塑形'
}

const WORKOUT_OPTIONS = [
  { value: 'rest', label: '休息日', icon: '○' },
  { value: 'strength', label: '力量训练', icon: '◆' },
  { value: 'run', label: '跑步', icon: '↗' },
  { value: 'walk', label: '快走', icon: '→' },
  { value: 'cycle', label: '骑行', icon: '◎' },
  { value: 'swim', label: '游泳', icon: '≈' },
  { value: 'yoga', label: '瑜伽', icon: '◇' },
  { value: 'other', label: '其他运动', icon: '＋' }
]

function shortDate(value) {
  const parts = String(value || '').split('-')
  return parts.length === 3 ? `${Number(parts[1])}.${Number(parts[2])}` : ''
}

function progressCopy(value) {
  if (value >= 85) return '状态很稳，记得给恢复留空间'
  if (value >= 60) return '节奏正在形成，继续互相接住'
  if (value >= 30) return '已经开始了，今天再完成一小步'
  return '从一次打卡和一次约好的运动开始'
}

Page({
  data: {
    loading: true,
    saving: false,
    dashboard: null,
    weekLabel: '',
    teamCopy: '',
    goalTypeLabel: '减脂',
    workoutOptions: WORKOUT_OPTIONS,
    workoutLabels: WORKOUT_OPTIONS.map(item => item.label),
    workoutIndex: 0,
    checkinForm: {
      workoutType: 'rest',
      minutes: '',
      steps: '',
      water: '',
      sleep: '',
      healthyMeal: false,
      weight: ''
    },
    goalForm: {
      goalType: 'fat-loss',
      currentWeight: '',
      targetWeight: '',
      weeklyWorkouts: '3',
      dailySteps: '8000',
      privacy: 'trend'
    },
    showGoalEditor: false,
    showChallengePicker: false
  },

  onLoad() {
    this.loadDashboard()
  },

  async loadDashboard(showLoading = true) {
    if (showLoading) this.setData({ loading: true })
    try {
      const dashboard = await callFunction('fitness', { action: 'dashboard' })
      const checkin = dashboard.todayCheckin || {}
      const workoutIndex = Math.max(0, WORKOUT_OPTIONS.findIndex(item => item.value === (checkin.workoutType || 'rest')))
      const goal = dashboard.myGoal || {}
      this.setData({
        dashboard,
        weekLabel: `${shortDate(dashboard.week.start)} — ${shortDate(dashboard.week.end)}`,
        teamCopy: progressCopy(dashboard.teamProgress),
        goalTypeLabel: GOAL_LABELS[goal.goalType] || '减脂',
        workoutIndex,
        checkinForm: {
          workoutType: checkin.workoutType || 'rest',
          minutes: checkin.minutes ? String(checkin.minutes) : '',
          steps: checkin.steps ? String(checkin.steps) : '',
          water: checkin.water ? String(checkin.water) : '',
          sleep: checkin.sleep ? String(checkin.sleep) : '',
          healthyMeal: Boolean(checkin.healthyMeal),
          weight: checkin.weight ? String(checkin.weight) : ''
        },
        goalForm: {
          goalType: goal.goalType || 'fat-loss',
          currentWeight: goal.currentWeight ? String(goal.currentWeight) : '',
          targetWeight: goal.targetWeight ? String(goal.targetWeight) : '',
          weeklyWorkouts: String(goal.weeklyWorkouts || 3),
          dailySteps: String(goal.dailySteps || 8000),
          privacy: goal.privacy || 'trend'
        },
        loading: false
      })
    } catch (error) {
      this.setData({ loading: false })
    }
  },

  onPullDownRefresh() {
    this.loadDashboard(false).finally(() => wx.stopPullDownRefresh())
  },

  openGoalEditor() {
    this.setData({ showGoalEditor: true })
  },

  closeGoalEditor() {
    if (!this.data.saving) this.setData({ showGoalEditor: false })
  },

  stopPropagation() {},

  selectGoalType(event) {
    this.setData({ 'goalForm.goalType': event.currentTarget.dataset.value })
  },

  selectPrivacy(event) {
    this.setData({ 'goalForm.privacy': event.currentTarget.dataset.value })
  },

  onGoalInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`goalForm.${field}`]: event.detail.value })
  },

  async saveGoal() {
    if (this.data.saving) return
    const form = this.data.goalForm
    if (!form.weeklyWorkouts || !form.dailySteps) {
      wx.showToast({ title: '请填写运动次数和步数目标', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await callFunction('fitness', { action: 'saveGoal', data: form })
      wx.showToast({ title: '目标已保存', icon: 'success' })
      this.setData({ showGoalEditor: false })
      await this.loadDashboard(false)
    } catch (error) {
      // 统一错误提示由云函数封装处理。
    } finally {
      this.setData({ saving: false })
    }
  },

  onWorkoutChange(event) {
    const workoutIndex = Number(event.detail.value)
    const option = WORKOUT_OPTIONS[workoutIndex]
    this.setData({
      workoutIndex,
      'checkinForm.workoutType': option.value,
      ...(option.value === 'rest' ? { 'checkinForm.minutes': '' } : {})
    })
  },

  onCheckinInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`checkinForm.${field}`]: event.detail.value })
  },

  onHealthyMealChange(event) {
    this.setData({ 'checkinForm.healthyMeal': event.detail.value })
  },

  async saveCheckin() {
    if (this.data.saving) return
    const form = this.data.checkinForm
    if (form.workoutType !== 'rest' && !Number(form.minutes)) {
      wx.showToast({ title: '请填写运动时长', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const result = await callFunction('fitness', { action: 'checkIn', data: form })
      if (result.completed && result.completed.length) {
        const challenge = result.completed[0]
        wx.showModal({
          title: '双人挑战完成',
          content: `${challenge.title}\n你们各获得 ${challenge.points} 积分`,
          showCancel: false,
          confirmText: '继续变好'
        })
      } else {
        wx.showToast({ title: result.updated ? '今日记录已更新' : '今日打卡完成', icon: 'success' })
      }
      await this.loadDashboard(false)
    } catch (error) {
      // 统一错误提示由云函数封装处理。
    } finally {
      this.setData({ saving: false })
    }
  },

  openChallengePicker() {
    if (!this.data.dashboard.partner) {
      wx.showToast({ title: '等 TA 加入后再发起挑战', icon: 'none' })
      return
    }
    this.setData({ showChallengePicker: true })
  },

  closeChallengePicker() {
    if (!this.data.saving) this.setData({ showChallengePicker: false })
  },

  async createChallenge(event) {
    if (this.data.saving) return
    const presetId = event.currentTarget.dataset.id
    this.setData({ saving: true })
    try {
      await callFunction('fitness', { action: 'createChallenge', data: { presetId } })
      wx.showToast({ title: '双人挑战已开启', icon: 'success' })
      this.setData({ showChallengePicker: false })
      await this.loadDashboard(false)
    } catch (error) {
      // 统一错误提示由云函数封装处理。
    } finally {
      this.setData({ saving: false })
    }
  },

  goReport() {
    wx.navigateTo({ url: '/pages/fitness-report/fitness-report' })
  }
})
