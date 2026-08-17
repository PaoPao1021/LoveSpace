const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const GOAL_TYPES = ['fat-loss', 'muscle', 'shape']
const PRIVACY_TYPES = ['private', 'trend', 'shared']
const WORKOUT_TYPES = ['strength', 'run', 'walk', 'cycle', 'swim', 'yoga', 'other']
const MAX_DAILY_WORKOUTS = 12
const CHALLENGE_PRESETS = {
  workouts: { title: '共同完成 6 次运动', metric: 'workouts', target: 6, unit: '次', rewardPoints: 10 },
  minutes: { title: '合计运动 300 分钟', metric: 'minutes', target: 300, unit: '分钟', rewardPoints: 10 },
  steps: { title: '共同走满 8 万步', metric: 'steps', target: 80000, unit: '步', rewardPoints: 10 },
  checkins: { title: '一周完成 10 次打卡', metric: 'checkins', target: 10, unit: '次', rewardPoints: 10 }
}

function hashId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32)
}

function dateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(match[3])) return null
  return date
}

function formatDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function addDays(value, amount) {
  const date = dateParts(value)
  if (!date) throw new Error('日期无效')
  date.setUTCDate(date.getUTCDate() + amount)
  return formatDate(date)
}

function todayInChina() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function weekRange(value = todayInChina(), offset = 0) {
  const date = dateParts(value)
  if (!date) throw new Error('日期无效')
  const mondayOffset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - mondayOffset - offset * 7)
  const start = formatDate(date)
  return { start, end: addDays(start, 6) }
}

function datesBetween(start, end) {
  const dates = []
  let cursor = start
  while (cursor <= end && dates.length < 31) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return dates
}

function asNumber(value, min, max, label, optional = false) {
  if ((value === '' || value === null || value === undefined) && optional) return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label}需要在 ${min}-${max} 之间`)
  return Math.round(number * 10) / 10
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function workoutsForCheckin(checkin) {
  if (!checkin) return []
  if (Array.isArray(checkin.workouts)) return checkin.workouts
  if (checkin.workoutType && checkin.workoutType !== 'rest' && Number(checkin.minutes) > 0) {
    return [{
      id: 'legacy',
      type: checkin.workoutType,
      startTime: '',
      minutes: Number(checkin.minutes),
      calories: Number(checkin.calories || 0)
    }]
  }
  return []
}

function calculateBmr(goal, weight) {
  const height = Number(goal && goal.height)
  const age = Number(goal && goal.age)
  const biologicalSex = String(goal && goal.biologicalSex || '')
  if (!weight || !height || !age || !['male', 'female'].includes(biologicalSex)) {
    return { ready: false, message: '补充身高、年龄和生理性别后可计算基础代谢。' }
  }
  const sexAdjustment = biologicalSex === 'male' ? 5 : -161
  return {
    ready: true,
    value: Math.round(10 * weight + 6.25 * height - 5 * age + sexAdjustment),
    formula: 'Mifflin-St Jeor',
    note: '表示身体静息状态下维持基本生命活动的估算能量，不等于每天建议摄入量。'
  }
}

function buildNutritionPlan(goal, checkin) {
  const recordedWeight = Number(checkin && checkin.weight)
  const goalWeight = Number(goal && goal.currentWeight)
  const weight = recordedWeight > 0 ? recordedWeight : goalWeight > 0 ? goalWeight : 0
  if (!weight) {
    return {
      ready: false,
      message: '填写当前体重后，才能生成你的饮食参考。'
    }
  }

  const workouts = workoutsForCheckin(checkin)
  const workoutMinutes = workouts.reduce((sum, item) => sum + Number(item.minutes || 0), 0)
  const workoutCalories = workouts.reduce((sum, item) => sum + Number(item.calories || 0), 0)
  const hasStrength = workouts.some(item => item.type === 'strength')
  const intensity = workoutMinutes >= 75 || workoutCalories >= 600
    ? '高训练量'
    : workoutMinutes >= 35 || workoutCalories >= 280
      ? '中等训练量'
      : workouts.length
        ? '轻训练量'
        : '休息日'
  const goalType = goal && goal.goalType ? goal.goalType : 'shape'
  const bmr = calculateBmr(goal, weight)
  const baseRates = { 'fat-loss': 28, muscle: 33, shape: 30 }
  const fallbackCalories = clamp(Math.round((weight * baseRates[goalType]) / 10) * 10, 1400, 3200)
  const restingDailyCalories = bmr.ready ? Math.round((bmr.value * 1.2) / 10) * 10 : fallbackCalories
  const goalAdjustment = goalType === 'fat-loss' ? -250 : goalType === 'muscle' ? 200 : 0
  const trainingRecovery = clamp(Math.round((workoutCalories * 0.7) / 10) * 10, 0, 700)
  const calorieFloor = bmr.ready ? Math.max(1200, Math.round(bmr.value * 0.95)) : 1400
  const calories = clamp(restingDailyCalories + goalAdjustment + trainingRecovery, calorieFloor, 3600)
  const proteinRate = goalType === 'muscle' ? 1.8 : goalType === 'fat-loss' ? 1.7 : 1.6
  const adjustedProteinRate = clamp(proteinRate + (hasStrength || intensity === '高训练量' ? 0.1 : 0), 1.4, 2)
  const protein = clamp(Math.round(weight * adjustedProteinRate), 50, 200)
  const fat = Math.round((calories * 0.25) / 9)
  const carbohydrates = Math.max(100, Math.round((calories - protein * 4 - fat * 9) / 4))
  const totalMacroCalories = carbohydrates * 4 + protein * 4 + fat * 9
  const ratio = value => Math.round((value / totalMacroCalories) * 100)

  return {
    ready: true,
    bmr,
    calories,
    weight,
    intensity,
    workoutMinutes,
    workoutCalories,
    trainingRecovery,
    summary: workouts.length
      ? `已结合今天 ${workouts.length} 条训练、${workoutMinutes} 分钟和 ${workoutCalories} 大卡消耗估算。`
      : '今天按休息日估算，训练后保存记录会自动调整。',
    macros: [
      { key: 'carbohydrates', name: '碳水', grams: carbohydrates, ratio: ratio(carbohydrates * 4), color: '#c99857' },
      { key: 'protein', name: '蛋白质', grams: protein, ratio: ratio(protein * 4), color: '#5f8f76' },
      { key: 'fat', name: '脂肪', grams: fat, ratio: ratio(fat * 9), color: '#9b776b' }
    ],
    foodGroups: [
      { key: 'carbohydrates', name: '优质碳水', foods: '燕麦、糙米、全麦面、土豆、玉米和水果', note: intensity === '休息日' ? '均匀分配到三餐' : '训练前后优先安排一部分' },
      { key: 'protein', name: '优质蛋白', foods: '鸡蛋、鱼虾、鸡胸、瘦牛肉、牛奶、豆腐', note: '分到 3—4 餐，比集中一餐更容易执行' },
      { key: 'fat', name: '健康脂肪', foods: '坚果、牛油果、橄榄油和深海鱼', note: '优先不饱和脂肪，控制油炸食品' },
      { key: 'vegetables', name: '蔬果与纤维', foods: '深色蔬菜、菌菇、豆类和低糖水果', note: '每天至少安排两种蔬菜和一种水果' }
    ],
    disclaimer: '仅供健康成年人作日常参考；未结合身高、年龄、体脂及疾病情况，不替代医生或注册营养师方案。'
  }
}

function defaultGoal(userId, coupleId) {
  return {
    coupleId,
    userId,
    configured: false,
    goalType: 'fat-loss',
    currentWeight: null,
    targetWeight: null,
    height: null,
    age: null,
    biologicalSex: '',
    weeklyWorkouts: 3,
    dailySteps: 8000,
    privacy: 'trend'
  }
}

async function readDoc(collection, id) {
  try {
    const result = await db.collection(collection).doc(id).get()
    return result.data || null
  } catch (error) {
    return null
  }
}

async function getCoupleContext(openid) {
  const userResult = await db.collection('users').doc(openid).get()
  const user = userResult.data
  if (!user || !user.coupleId) throw new Error('请先绑定你们的空间')
  const coupleResult = await db.collection('couples').doc(user.coupleId).get()
  const couple = coupleResult.data
  if (!couple || couple.status !== 'active' || (couple.creator !== openid && couple.partner !== openid)) throw new Error('无权访问该空间')
  const partnerId = couple.creator === openid ? couple.partner : couple.creator
  const partner = partnerId ? await readDoc('users', partnerId) : null
  return { coupleId: user.coupleId, user, partner, partnerId }
}

function goalDocId(coupleId, userId) {
  return hashId(`fitness-goal:${coupleId}:${userId}`)
}

function checkinDocId(coupleId, userId, date) {
  return hashId(`fitness-checkin:${coupleId}:${userId}:${date}`)
}

async function getGoal(coupleId, userId) {
  if (!userId) return null
  const goal = await readDoc('fitness_goals', goalDocId(coupleId, userId))
  return goal ? { ...defaultGoal(userId, coupleId), ...goal, configured: true } : defaultGoal(userId, coupleId)
}

async function getCheckins(coupleId, userIds, start, end) {
  const requests = []
  userIds.filter(Boolean).forEach(userId => {
    datesBetween(start, end).forEach(date => {
      requests.push(readDoc('fitness_checkins', checkinDocId(coupleId, userId, date)))
    })
  })
  const records = await Promise.all(requests)
  return records.filter(Boolean)
}

function memberStats(checkins, goal, userId) {
  const mine = checkins.filter(item => item.userId === userId)
  const workouts = mine.reduce((sum, item) => sum + workoutsForCheckin(item).length, 0)
  const minutes = mine.reduce((sum, item) => sum + Number(item.minutes || 0), 0)
  const calories = mine.reduce((sum, item) => sum + Number(item.calories || 0), 0)
  const totalSteps = mine.reduce((sum, item) => sum + Number(item.steps || 0), 0)
  const stepGoalDays = mine.filter(item => Number(item.steps || 0) >= Number(goal.dailySteps || 8000)).length
  const healthyMealDays = mine.filter(item => item.healthyMeal).length
  const weights = mine.filter(item => Number(item.weight) > 0).sort((a, b) => a.date.localeCompare(b.date))
  const weightChange = weights.length >= 2 ? Math.round((Number(weights[weights.length - 1].weight) - Number(weights[0].weight)) * 10) / 10 : null
  const workoutScore = Math.min(1, workouts / Math.max(1, Number(goal.weeklyWorkouts || 3)))
  const checkinScore = Math.min(1, mine.length / 7)
  const stepScore = Math.min(1, stepGoalDays / 7)
  const mealScore = Math.min(1, healthyMealDays / 7)
  return {
    checkinDays: mine.length,
    workouts,
    minutes,
    calories,
    totalSteps,
    averageSteps: mine.length ? Math.round(totalSteps / mine.length) : 0,
    stepGoalDays,
    healthyMealDays,
    latestWeight: weights.length ? Number(weights[weights.length - 1].weight) : null,
    weightChange,
    progress: Math.round((workoutScore * 0.45 + checkinScore * 0.25 + stepScore * 0.2 + mealScore * 0.1) * 100)
  }
}

function sanitizePartnerGoal(goal) {
  if (!goal) return null
  const sanitized = { ...goal }
  delete sanitized.height
  delete sanitized.age
  delete sanitized.biologicalSex
  if (goal.privacy !== 'shared') {
    delete sanitized.currentWeight
    delete sanitized.targetWeight
  }
  return sanitized
}

function sanitizePartnerToday(checkin) {
  if (!checkin) return null
  return {
    date: checkin.date,
    workouts: workoutsForCheckin(checkin).map(item => ({
      id: item.id,
      type: item.type,
      startTime: item.startTime || '',
      minutes: Number(item.minutes || 0),
      calories: Number(item.calories || 0)
    })),
    workoutCount: workoutsForCheckin(checkin).length,
    minutes: Number(checkin.minutes || 0),
    calories: Number(checkin.calories || 0)
  }
}

function sanitizePartnerStats(stats, goal) {
  const sanitized = { ...stats }
  if (!goal || goal.privacy === 'private') {
    delete sanitized.latestWeight
    delete sanitized.weightChange
  } else if (goal.privacy === 'trend') {
    delete sanitized.latestWeight
  }
  return sanitized
}

function challengeValue(challenge, checkins) {
  const relevant = checkins.filter(item => item.date >= challenge.startDate && item.date <= challenge.endDate)
  if (challenge.metric === 'minutes') return relevant.reduce((sum, item) => sum + Number(item.minutes || 0), 0)
  if (challenge.metric === 'steps') return relevant.reduce((sum, item) => sum + Number(item.steps || 0), 0)
  if (challenge.metric === 'workouts') return relevant.reduce((sum, item) => sum + workoutsForCheckin(item).length, 0)
  return relevant.length
}

function formatChallenge(challenge, checkins) {
  const current = challenge.status === 'completed' ? Number(challenge.target) : challengeValue(challenge, checkins)
  return {
    ...challenge,
    current,
    percent: Math.min(100, Math.round((current / Math.max(1, Number(challenge.target))) * 100))
  }
}

async function listChallenges(coupleId) {
  const result = await db.collection('fitness_challenges').where({ coupleId }).limit(20).get()
  const today = todayInChina()
  return result.data
    .filter(item => item.status === 'completed' || (item.status === 'active' && item.endDate >= today))
    .sort((a, b) => String(b.createdDate || '').localeCompare(String(a.createdDate || '')))
    .slice(0, 6)
}

async function buildDashboard(openid) {
  const context = await getCoupleContext(openid)
  const range = weekRange()
  const [myGoal, partnerGoal, checkins, challenges] = await Promise.all([
    getGoal(context.coupleId, openid),
    getGoal(context.coupleId, context.partnerId),
    getCheckins(context.coupleId, [openid, context.partnerId], range.start, range.end),
    listChallenges(context.coupleId)
  ])
  const myStats = memberStats(checkins, myGoal, openid)
  const partnerStats = context.partnerId ? memberStats(checkins, partnerGoal, context.partnerId) : null
  const members = partnerStats ? [myStats, partnerStats] : [myStats]
  const today = todayInChina()
  const todayMine = checkins.find(item => item.userId === openid && item.date === today) || null
  const todayPartner = checkins.find(item => item.userId === context.partnerId && item.date === today) || null
  return {
    code: 0,
    today,
    week: range,
    me: { name: context.user.nickName || '我', avatarUrl: context.user.avatarUrl || '' },
    partner: context.partnerId ? { name: (context.partner && context.partner.nickName) || 'TA', avatarUrl: (context.partner && context.partner.avatarUrl) || '' } : null,
    myGoal,
    partnerGoal: sanitizePartnerGoal(partnerGoal),
    myStats,
    partnerStats: partnerStats ? sanitizePartnerStats(partnerStats, partnerGoal) : null,
    todayCheckin: todayMine,
    nutritionPlan: buildNutritionPlan(myGoal, todayMine),
    partnerCheckedIn: Boolean(todayPartner),
    partnerToday: sanitizePartnerToday(todayPartner),
    partnerTodayMinutes: todayPartner ? Number(todayPartner.minutes || 0) : 0,
    teamProgress: Math.round(members.reduce((sum, item) => sum + item.progress, 0) / members.length),
    challenges: challenges.map(item => formatChallenge(item, checkins)),
    challengePresets: Object.entries(CHALLENGE_PRESETS).map(([id, item]) => ({ id, ...item }))
  }
}

async function saveGoal(openid, data) {
  const context = await getCoupleContext(openid)
  const goalType = String(data.goalType || '')
  const privacy = String(data.privacy || 'trend')
  if (!GOAL_TYPES.includes(goalType)) throw new Error('请选择正确的健康目标')
  if (!PRIVACY_TYPES.includes(privacy)) throw new Error('隐私设置无效')
  const biologicalSex = String(data.biologicalSex || '')
  if (biologicalSex && !['male', 'female'].includes(biologicalSex)) throw new Error('基础代谢计算参数无效')
  const height = asNumber(data.height, 120, 230, '身高', true)
  const age = asNumber(data.age, 18, 80, '年龄', true)
  const currentWeight = asNumber(data.currentWeight, 30, 300, '当前体重', true)
  const profileParts = [biologicalSex, height, age].filter(value => value !== '' && value !== null)
  if (profileParts.length > 0 && profileParts.length < 3) throw new Error('请完整填写身高、年龄和生理性别')
  if (profileParts.length === 3 && currentWeight === null) throw new Error('计算基础代谢需要填写当前体重')
  const goal = {
    coupleId: context.coupleId,
    userId: openid,
    goalType,
    currentWeight,
    targetWeight: asNumber(data.targetWeight, 30, 300, '目标体重', true),
    height,
    age: age === null ? null : Math.round(age),
    biologicalSex,
    weeklyWorkouts: Math.round(asNumber(data.weeklyWorkouts, 1, 7, '每周运动次数')),
    dailySteps: Math.round(asNumber(data.dailySteps, 1000, 50000, '每日步数')),
    privacy,
    updatedAt: db.serverDate()
  }
  await db.collection('fitness_goals').doc(goalDocId(context.coupleId, openid)).set({ data: goal })
  return { code: 0, goal: { ...goal, configured: true } }
}

function normalizeWorkouts(data) {
  if (!Array.isArray(data.workouts)) {
    const legacyType = String(data.workoutType || 'rest')
    if (legacyType === 'rest' || !Number(data.minutes)) return []
    if (!WORKOUT_TYPES.includes(legacyType)) throw new Error('运动类型无效')
    return [{ id: 'legacy', type: legacyType, startTime: '', minutes: Math.round(asNumber(data.minutes, 1, 600, '运动时长')), calories: Math.round(asNumber(data.calories || 0, 0, 5000, '消耗热量')) }]
  }
  if (data.workouts.length > MAX_DAILY_WORKOUTS) throw new Error(`每天最多添加 ${MAX_DAILY_WORKOUTS} 条运动记录`)
  return data.workouts.map((item, index) => {
    const type = String(item && item.type || '')
    if (!WORKOUT_TYPES.includes(type)) throw new Error(`第 ${index + 1} 条运动类型无效`)
    const startTime = String(item && item.startTime || '').trim()
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) throw new Error(`请选择第 ${index + 1} 条运动的开始时间`)
    const rawId = String(item && item.id || '')
    return {
      id: /^[\w-]{1,40}$/.test(rawId) ? rawId : `workout-${index + 1}`,
      type,
      startTime,
      minutes: Math.round(asNumber(item.minutes, 1, 600, `第 ${index + 1} 条运动时长`)),
      calories: Math.round(asNumber(item.calories, 1, 5000, `第 ${index + 1} 条消耗热量`))
    }
  })
}

function normalizeCheckin(data) {
  const workouts = normalizeWorkouts(data)
  const minutes = workouts.reduce((sum, item) => sum + item.minutes, 0)
  const calories = workouts.reduce((sum, item) => sum + item.calories, 0)
  return {
    workouts,
    workoutCount: workouts.length,
    workoutType: workouts.length ? workouts[0].type : 'rest',
    minutes,
    calories,
    steps: Math.round(asNumber(data.steps || 0, 0, 100000, '今日步数')),
    water: Math.round(asNumber(data.water || 0, 0, 20, '饮水杯数')),
    sleep: asNumber(data.sleep || 0, 0, 24, '睡眠时长'),
    healthyMeal: Boolean(data.healthyMeal),
    weight: asNumber(data.weight, 30, 300, '今日体重', true)
  }
}

async function checkIn(openid, data) {
  const context = await getCoupleContext(openid)
  const date = todayInChina()
  const normalized = normalizeCheckin(data)
  const id = checkinDocId(context.coupleId, openid, date)
  const existing = await readDoc('fitness_checkins', id)
  const savedCheckin = {
    coupleId: context.coupleId,
    userId: openid,
    date,
    ...normalized,
    createdAt: existing && existing.createdAt ? existing.createdAt : db.serverDate(),
    updatedAt: db.serverDate()
  }
  await db.collection('fitness_checkins').doc(id).set({ data: savedCheckin })
  const completed = await completeEligibleChallenges(context, openid)
  const goal = await getGoal(context.coupleId, openid)
  return {
    code: 0,
    id,
    updated: Boolean(existing),
    completed,
    checkin: { ...savedCheckin, createdAt: undefined, updatedAt: undefined },
    nutritionPlan: buildNutritionPlan(goal, savedCheckin)
  }
}

async function createChallenge(openid, data) {
  const context = await getCoupleContext(openid)
  if (!context.partnerId) throw new Error('等 TA 加入空间后再发起双人挑战')
  const presetId = String(data.presetId || '')
  const preset = CHALLENGE_PRESETS[presetId]
  if (!preset) throw new Error('挑战类型无效')
  const today = todayInChina()
  const existing = await listChallenges(context.coupleId)
  if (existing.some(item => item.status === 'active' && item.presetId === presetId && item.endDate >= today)) throw new Error('这个挑战正在进行中')
  const id = hashId(`fitness-challenge:${context.coupleId}:${presetId}:${today}`)
  await db.collection('fitness_challenges').doc(id).set({ data: {
    coupleId: context.coupleId,
    presetId,
    title: preset.title,
    metric: preset.metric,
    target: preset.target,
    unit: preset.unit,
    rewardPoints: preset.rewardPoints,
    startDate: today,
    endDate: addDays(today, 6),
    status: 'active',
    createdBy: openid,
    createdDate: today,
    createdAt: db.serverDate()
  } })
  return { code: 0, id }
}

function balanceDocId(coupleId, userId) {
  return hashId(`balance:${coupleId}:${userId}`)
}

async function ensureBalance(coupleId, userId) {
  if (!userId) return
  const id = balanceDocId(coupleId, userId)
  const current = await readDoc('point_balances', id)
  if (current) return
  let score = 0
  let skip = 0
  while (true) {
    const page = await db.collection('points').where({ coupleId, toUser: userId }).skip(skip).limit(100).get()
    score += page.data.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    if (page.data.length < 100) break
    skip += 100
  }
  await db.runTransaction(async transaction => {
    const ref = transaction.collection('point_balances').doc(id)
    const latest = await ref.get().catch(() => null)
    if (latest && latest.data) return
    await ref.set({ data: { coupleId, userId, score, updatedAt: db.serverDate() } })
  })
}

async function completeChallenge(context, challenge, openid) {
  const userIds = [openid, context.partnerId].filter(Boolean)
  const uniqueUsers = [...new Set(userIds)].slice(0, 2)
  await Promise.all(uniqueUsers.map(userId => ensureBalance(context.coupleId, userId)))
  let awarded = false
  await db.runTransaction(async transaction => {
    const challengeRef = transaction.collection('fitness_challenges').doc(challenge._id)
    const current = await challengeRef.get()
    if (!current.data || current.data.status !== 'active') return
    await challengeRef.update({ data: { status: 'completed', completedAt: db.serverDate() } })
    for (const userId of uniqueUsers) {
      const pointId = hashId(`fitness-reward:${challenge._id}:${userId}`)
      const pointRef = transaction.collection('points').doc(pointId)
      const existingPoint = await pointRef.get().catch(() => null)
      if (existingPoint && existingPoint.data) continue
      await pointRef.set({ data: {
        coupleId: context.coupleId,
        fromUser: 'fitness',
        toUser: userId,
        amount: Number(challenge.rewardPoints || 10),
        reason: `健康挑战：${challenge.title}`.slice(0, 30),
        note: '双人健康挑战完成奖励',
        createdAt: db.serverDate()
      } })
      await transaction.collection('point_balances').doc(balanceDocId(context.coupleId, userId)).update({
        data: { score: _.inc(Number(challenge.rewardPoints || 10)), updatedAt: db.serverDate() }
      })
    }
    awarded = true
  })
  if (awarded) {
    try {
      await Promise.all(uniqueUsers.map(userId => db.collection('notifications').doc(hashId(`fitness-notification:${challenge._id}:${userId}`)).set({ data: {
        coupleId: context.coupleId,
        toUser: userId,
        fromUser: 'fitness',
        fromName: '一起变好',
        type: 'fitness',
        title: '双人健康挑战完成',
        content: `${challenge.title}，双方各获得 ${challenge.rewardPoints || 10} 积分`,
        relatedId: challenge._id,
        read: false,
        createdAt: db.serverDate()
      } })))
    } catch (error) {
      console.error('fitness notification failed:', error)
    }
  }
  return awarded
}

async function completeEligibleChallenges(context, openid) {
  const active = (await listChallenges(context.coupleId)).filter(item => item.status === 'active')
  const completed = []
  for (const challenge of active) {
    const checkins = await getCheckins(context.coupleId, [openid, context.partnerId], challenge.startDate, challenge.endDate)
    if (challengeValue(challenge, checkins) >= Number(challenge.target)) {
      const awarded = await completeChallenge(context, challenge, openid)
      if (awarded) completed.push({ title: challenge.title, points: Number(challenge.rewardPoints || 10) })
    }
  }
  return completed
}

function reportInsight(teamScore, totalMinutes, totalSteps) {
  if (teamScore >= 85) return '这周的节奏很稳定，保持恢复和睡眠，不需要继续加码。'
  if (totalMinutes >= 240) return '运动量已经不错，下周更值得关注步数、饮食和睡眠。'
  if (totalSteps >= 70000) return '日常活动保持得很好，可以安排两次有计划的力量训练。'
  return '先约定两次一起运动的时间，比临时提醒更容易坚持。'
}

async function weeklyReport(openid, data) {
  const context = await getCoupleContext(openid)
  const offset = Math.round(Number(data.offset || 0))
  if (!Number.isInteger(offset) || offset < 0 || offset > 12) throw new Error('周报范围无效')
  const range = weekRange(todayInChina(), offset)
  const [myGoal, partnerGoal, checkins] = await Promise.all([
    getGoal(context.coupleId, openid),
    getGoal(context.coupleId, context.partnerId),
    getCheckins(context.coupleId, [openid, context.partnerId], range.start, range.end)
  ])
  const myStats = memberStats(checkins, myGoal, openid)
  const partnerStats = context.partnerId ? memberStats(checkins, partnerGoal, context.partnerId) : null
  const statsList = partnerStats ? [myStats, partnerStats] : [myStats]
  const teamScore = Math.round(statsList.reduce((sum, item) => sum + item.progress, 0) / statsList.length)
  const totalMinutes = statsList.reduce((sum, item) => sum + item.minutes, 0)
  const totalCalories = statsList.reduce((sum, item) => sum + item.calories, 0)
  const totalSteps = statsList.reduce((sum, item) => sum + item.totalSteps, 0)
  const workouts = statsList.reduce((sum, item) => sum + item.workouts, 0)
  const activeDays = new Set(checkins.map(item => item.date)).size
  let bestHabit = '开始记录'
  if (workouts >= 4) bestHabit = '规律运动'
  if (statsList.reduce((sum, item) => sum + item.stepGoalDays, 0) >= 8) bestHabit = '日常步行'
  if (statsList.reduce((sum, item) => sum + item.healthyMealDays, 0) >= 8) bestHabit = '健康饮食'
  return {
    code: 0,
    report: {
      range,
      teamScore,
      totalMinutes,
      totalCalories,
      totalSteps,
      workouts,
      activeDays,
      bestHabit,
      headline: teamScore >= 80 ? '这一周，你们把坚持变成了日常' : teamScore >= 50 ? '节奏正在形成，继续互相接住' : '从两次约好的共同运动重新开始',
      insight: reportInsight(teamScore, totalMinutes, totalSteps),
      members: [
        { name: context.user.nickName || '我', isMe: true, goal: myGoal, stats: myStats },
        ...(partnerStats ? [{ name: (context.partner && context.partner.nickName) || 'TA', isMe: false, goal: sanitizePartnerGoal(partnerGoal), stats: sanitizePartnerStats(partnerStats, partnerGoal) }] : [])
      ]
    }
  }
}

if (process.env.NODE_ENV === 'test') {
  exports.__test = { buildNutritionPlan, calculateBmr, normalizeCheckin, sanitizePartnerToday, workoutsForCheckin }
}

exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID
    if (!openid) return { code: -1, message: '登录状态无效' }
    const { action, data = {} } = event
    switch (action) {
      case 'dashboard': return buildDashboard(openid)
      case 'saveGoal': return saveGoal(openid, data)
      case 'checkIn': return checkIn(openid, data)
      case 'createChallenge': return createChallenge(openid, data)
      case 'weeklyReport': return weeklyReport(openid, data)
      default: return { code: -1, message: '未知操作' }
    }
  } catch (error) {
    console.error('fitness failed:', error)
    return { code: -1, message: error.message || '健康搭子服务暂时不可用' }
  }
}
