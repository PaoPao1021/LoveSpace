const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const crypto = require('crypto')
const MOOD_TYPES = ['happy', 'love', 'calm', 'excited', 'miss', 'grateful', 'tired', 'anxious', 'sad', 'angry']

async function assertSafeText(content) {
  if (!String(content || '').trim()) return
  try {
    const result = await cloud.openapi.security.msgSecCheck({ content: String(content).slice(0, 500) })
    const suggest = result && result.result && result.result.suggest
    if (suggest && suggest !== 'pass') throw new Error('CONTENT_RISKY')
  } catch (error) {
    const code = Number(error.errCode || error.errcode)
    if (code === 87014 || String(error.message || '').includes('87014') || error.message === 'CONTENT_RISKY') throw new Error('内容包含不适合发布的信息，请修改后重试')
    console.error('msgSecCheck failed:', error)
    throw new Error('内容安全检查暂时不可用，请稍后重试')
  }
}

function todayInChina() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

exports.main = async (event) => {
  try {
    const { action, data = {} } = event || {}
    const openid = cloud.getWXContext().OPENID
    if (!openid) return { code: -1, message: '登录状态无效' }
    switch (action) {
      case 'add': return addMood(openid, data)
      case 'getToday': return getTodayMood(openid)
      case 'list': return listMoods(openid, data)
      case 'getCalendar': return getCalendarData(openid, data)
      case 'getPartner': return getPartnerMood(openid, data)
      default: return { code: -1, message: '未知操作' }
    }
  } catch (error) {
    console.error('mood failed:', error)
    return { code: -1, message: error.message || '心情服务暂时不可用' }
  }
}

function moodDocId(openid, date) {
  return crypto.createHash('sha256').update(`mood:${openid}:${date}`).digest('hex').slice(0, 32)
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function normalizeImages(value) {
  return Array.isArray(value)
    ? value.map(item => String(item || '')).filter(item => item.startsWith('cloud://') || item.startsWith('https://')).slice(0, 9)
    : []
}

async function fetchAll(where) {
  const list = []
  let skip = 0
  while (true) {
    const page = await db.collection('moods').where(where).skip(skip).limit(100).get()
    list.push(...page.data)
    if (page.data.length < 100) return list
    skip += 100
  }
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  const coupleId = user.data && user.data.coupleId
  if (!coupleId) return { coupleId: '', user: user.data }
  const couple = await db.collection('couples').doc(coupleId).get()
  if (!couple.data || (couple.data.creator !== openid && couple.data.partner !== openid)) throw new Error('无权访问该空间')
  return { coupleId, user: user.data, couple: couple.data }
}

async function addMood(openid, data) {
  const { coupleId } = await getCoupleId(openid)
  if (!coupleId) return { code: -1, message: '请先绑定情侣关系' }
  const today = todayInChina()
  if (!MOOD_TYPES.includes(data.moodType)) return { code: -1, message: '请选择有效心情' }
  const visibility = ['both', 'self'].includes(data.visibility) ? data.visibility : 'both'
  const content = String(data.content || '').slice(0, 500)
  const images = normalizeImages(data.images)
  const moodEmoji = String(data.moodEmoji || '').slice(0, 8)
  await assertSafeText(content)

  // 检查今天是否已打卡
  const existing = await db.collection('moods')
    .where({ userId: openid, date: today })
    .get()

  if (existing.data.length > 0) {
    // 更新今天的
    await db.collection('moods').doc(existing.data[0]._id).update({
      data: {
        moodType: data.moodType,
        moodEmoji,
        content,
        images,
        visibility,
        updatedAt: db.serverDate()
      }
    })
    return { code: 0, id: existing.data[0]._id, updated: true }
  }

  const id = moodDocId(openid, today)
  await db.collection('moods').doc(id).set({ data: {
      coupleId,
      userId: openid,
      moodType: data.moodType,
      moodEmoji,
      content,
      images,
      visibility,
      date: today,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
  } })
  return { code: 0, id, updated: false }
}

async function getTodayMood(openid) {
  const { coupleId } = await getCoupleId(openid)
  if (!coupleId) return { code: 0, data: null }
  const today = todayInChina()
  const res = await db.collection('moods')
    .where({ userId: openid, date: today })
    .get()
  return { code: 0, data: res.data[0] || null }
}

async function listMoods(openid, data) {
  const { coupleId } = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }

  const page = Math.max(1, Math.round(Number(data.page) || 1))
  const pageSize = Math.min(60, Math.max(1, Math.round(Number(data.pageSize) || 30)))
  const all = await fetchAll({ coupleId })
  const visible = all
    .filter(item => item.userId === openid || item.visibility === 'both')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const start = (page - 1) * pageSize
  return { code: 0, list: visible.slice(start, start + pageSize), total: visible.length, hasMore: start + pageSize < visible.length }
}

async function getCalendarData(openid, data) {
  const { coupleId } = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }
  const year = Number(data.year)
  const month = Number(data.month)
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return { code: -1, message: '月份参数无效' }
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`

  const res = await db.collection('moods')
    .where({
      coupleId,
      date: db.command.gte(startDate).and(db.command.lte(endDate))
    })
    .get()

  return { code: 0, list: res.data.filter(item => item.userId === openid || item.visibility === 'both') }
}

async function getPartnerMood(openid, data) {
  const { coupleId } = await getCoupleId(openid)
  if (!coupleId) return { code: 0, data: null }

  const couple = await db.collection('couples').doc(coupleId).get()
  const partnerId = couple.data.creator === openid ? couple.data.partner : couple.data.creator
  if (!partnerId) return { code: 0, data: null }

  const date = data.date || todayInChina()
  if (!isValidDate(date)) return { code: -1, message: '日期参数无效' }
  const res = await db.collection('moods')
    .where({ userId: partnerId, date, visibility: 'both' })
    .get()

  return { code: 0, data: res.data[0] || null }
}
