const { callFunction } = require('../../utils/cloud')

const GOAL_LABELS = {
  'fat-loss': '减脂',
  muscle: '增肌',
  shape: '塑形'
}

const WORKOUT_OPTIONS = [
  { value: 'strength', label: '力量训练', icon: '◆' },
  { value: 'run', label: '跑步', icon: '↗' },
  { value: 'walk', label: '快走', icon: '→' },
  { value: 'cycle', label: '骑行', icon: '◎' },
  { value: 'swim', label: '游泳', icon: '≈' },
  { value: 'yoga', label: '瑜伽', icon: '◇' },
  { value: 'other', label: '其他运动', icon: '＋' }
]

const MAX_DAILY_WORKOUTS = 12

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

function currentTime() {
  const date = new Date()
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function createWorkout() {
  return {
    id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'strength',
    workoutIndex: 0,
    startTime: currentTime(),
    minutes: '',
    calories: ''
  }
}

function workoutDrafts(checkin) {
  if (Array.isArray(checkin.workouts)) {
    return checkin.workouts.map((item, index) => {
      const workoutIndex = Math.max(0, WORKOUT_OPTIONS.findIndex(option => option.value === item.type))
      return {
        id: item.id || `saved_${index}`,
        type: WORKOUT_OPTIONS[workoutIndex].value,
        workoutIndex,
        startTime: item.startTime || currentTime(),
        minutes: item.minutes ? String(item.minutes) : '',
        calories: item.calories ? String(item.calories) : ''
      }
    })
  }
  if (checkin.workoutType && checkin.workoutType !== 'rest' && Number(checkin.minutes) > 0) {
    const workoutIndex = Math.max(0, WORKOUT_OPTIONS.findIndex(option => option.value === checkin.workoutType))
    return [{
      id: 'legacy',
      type: WORKOUT_OPTIONS[workoutIndex].value,
      workoutIndex,
      startTime: currentTime(),
      minutes: String(checkin.minutes),
      calories: checkin.calories ? String(checkin.calories) : ''
    }]
  }
  return []
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
    workoutDrafts: [],
    workoutsDirty: false,
    checkinForm: {
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
      height: '',
      age: '',
      biologicalSex: '',
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
      if (dashboard.partnerToday && Array.isArray(dashboard.partnerToday.workouts)) {
        dashboard.partnerToday.workouts = dashboard.partnerToday.workouts.map(item => ({
          ...item,
          typeLabel: (WORKOUT_OPTIONS.find(option => option.value === item.type) || { label: '其他运动' }).label
        }))
      }
      const checkin = dashboard.todayCheckin || {}
      const goal = dashboard.myGoal || {}
      this.setData({
        dashboard,
        weekLabel: `${shortDate(dashboard.week.start)} — ${shortDate(dashboard.week.end)}`,
        teamCopy: progressCopy(dashboard.teamProgress),
        goalTypeLabel: GOAL_LABELS[goal.goalType] || '减脂',
        workoutDrafts: workoutDrafts(checkin),
        workoutsDirty: false,
        checkinForm: {
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
          height: goal.height ? String(goal.height) : '',
          age: goal.age ? String(goal.age) : '',
          biologicalSex: goal.biologicalSex || '',
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

  selectBiologicalSex(event) {
    this.setData({ 'goalForm.biologicalSex': event.currentTarget.dataset.value })
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
    const metabolicFields = [form.height, form.age, form.biologicalSex].filter(Boolean)
    if (metabolicFields.length > 0 && metabolicFields.length < 3) {
      wx.showToast({ title: '请完整填写基础代谢参数', icon: 'none' })
      return
    }
    if (metabolicFields.length === 3 && !form.currentWeight) {
      wx.showToast({ title: '计算基础代谢需要当前体重', icon: 'none' })
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

  addWorkout() {
    if (this.data.workoutDrafts.length >= MAX_DAILY_WORKOUTS) {
      wx.showToast({ title: `每天最多添加 ${MAX_DAILY_WORKOUTS} 条`, icon: 'none' })
      return
    }
    this.setData({ workoutDrafts: [...this.data.workoutDrafts, createWorkout()], workoutsDirty: true })
  },

  removeWorkout(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ workoutDrafts: this.data.workoutDrafts.filter((item, itemIndex) => itemIndex !== index), workoutsDirty: true })
  },

  onWorkoutTypeChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    const workoutIndex = Number(event.detail.value)
    this.setData({
      [`workoutDrafts[${index}].workoutIndex`]: workoutIndex,
      [`workoutDrafts[${index}].type`]: WORKOUT_OPTIONS[workoutIndex].value,
      workoutsDirty: true
    })
  },

  onWorkoutTimeChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`workoutDrafts[${index}].startTime`]: event.detail.value, workoutsDirty: true })
  },

  onWorkoutInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    this.setData({ [`workoutDrafts[${index}].${field}`]: event.detail.value, workoutsDirty: true })
  },

  onCheckinInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`checkinForm.${field}`]: event.detail.value })
  },

  onHealthyMealChange(event) {
    this.setData({ 'checkinForm.healthyMeal': event.detail.value })
  },

  validateWorkouts() {
    for (let index = 0; index < this.data.workoutDrafts.length; index += 1) {
      const item = this.data.workoutDrafts[index]
      if (!item.startTime) return `请选择第 ${index + 1} 条运动时间`
      if (!Number(item.minutes)) return `请填写第 ${index + 1} 条运动时长`
      if (!Number(item.calories)) return `请填写第 ${index + 1} 条消耗大卡`
    }
    return ''
  },

  async persistToday(successTitle) {
    if (this.data.saving) return
    const errorMessage = this.validateWorkouts()
    if (errorMessage) {
      wx.showToast({ title: errorMessage, icon: 'none' })
      return
    }
    const workouts = this.data.workoutDrafts.map(item => ({
      id: item.id,
      type: item.type,
      startTime: item.startTime,
      minutes: item.minutes,
      calories: item.calories
    }))
    this.setData({ saving: true })
    try {
      const result = await callFunction('fitness', { action: 'checkIn', data: { ...this.data.checkinForm, workouts } })
      if (!result.checkin || !Array.isArray(result.checkin.workouts) || result.checkin.workouts.length !== workouts.length) {
        wx.showModal({
          title: '云函数需要更新',
          content: '云端 fitness 仍是旧版本，记录没有可靠落库。请重新上传并部署 fitness 云函数后再保存。',
          showCancel: false,
          confirmText: '知道了'
        })
        return false
      }
      this.setData({ workoutsDirty: false })
      if (result.completed && result.completed.length) {
        const challenge = result.completed[0]
        wx.showModal({
          title: '双人挑战完成',
          content: `${challenge.title}\n你们各获得 ${challenge.points} 积分`,
          showCancel: false,
          confirmText: '继续变好'
        })
      } else {
        wx.showToast({ title: successTitle, icon: 'success' })
      }
      await this.loadDashboard(false)
      return true
    } catch (error) {
      // 统一错误提示由云函数封装处理。
    } finally {
      this.setData({ saving: false })
    }
  },

  saveWorkoutRecords() {
    return this.persistToday('运动记录已保存')
  },

  saveCheckin() {
    return this.persistToday(this.data.dashboard.todayCheckin ? '今日记录已更新' : '今日打卡完成')
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
