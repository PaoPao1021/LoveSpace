const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { action, data } = event
  const openid = cloud.getWXContext().OPENID

  switch (action) {
    case 'add': return addMood(openid, data)
    case 'getToday': return getTodayMood(openid)
    case 'list': return listMoods(openid, data)
    case 'getCalendar': return getCalendarData(openid, data)
    case 'getPartner': return getPartnerMood(openid, data)
    default: return { code: -1, message: '未知操作' }
  }
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  return { coupleId: user.data.coupleId, user: user.data }
}

async function addMood(openid, data) {
  const { coupleId } = await getCoupleId(openid)
  if (!coupleId) return { code: -1, message: '请先绑定情侣关系' }
  const today = new Date().toISOString().slice(0, 10)

  // 检查今天是否已打卡
  const existing = await db.collection('moods')
    .where({ userId: openid, date: today })
    .get()

  if (existing.data.length > 0) {
    // 更新今天的
    await db.collection('moods').doc(existing.data[0]._id).update({
      data: {
        moodType: data.moodType,
        moodEmoji: data.moodEmoji,
        content: data.content || '',
        images: data.images || [],
        visibility: data.visibility || 'both',
        updatedAt: db.serverDate()
      }
    })
    return { code: 0, id: existing.data[0]._id, updated: true }
  }

  const res = await db.collection('moods').add({
    data: {
      coupleId,
      userId: openid,
      moodType: data.moodType,
      moodEmoji: data.moodEmoji,
      content: data.content || '',
      images: data.images || [],
      visibility: data.visibility || 'both',
      date: today,
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id, updated: false }
}

async function getTodayMood(openid) {
  const today = new Date().toISOString().slice(0, 10)
  const res = await db.collection('moods')
    .where({ userId: openid, date: today })
    .get()
  return { code: 0, data: res.data[0] || null }
}

async function listMoods(openid, data) {
  const { coupleId } = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }

  const { page = 1, pageSize = 30 } = data || {}
  const res = await db.collection('moods')
    .where({ coupleId, visibility: db.command.in(['both', 'self']) })
    .orderBy('date', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  return { code: 0, list: res.data }
}

async function getCalendarData(openid, data) {
  const { coupleId } = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }
  const { year, month } = data

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`

  const res = await db.collection('moods')
    .where({
      coupleId,
      date: db.command.gte(startDate).and(db.command.lte(endDate))
    })
    .get()

  return { code: 0, list: res.data }
}

async function getPartnerMood(openid, data) {
  const { coupleId } = await getCoupleId(openid)
  if (!coupleId) return { code: 0, data: null }

  const couple = await db.collection('couples').doc(coupleId).get()
  const partnerId = couple.data.creator === openid ? couple.data.partner : couple.data.creator
  if (!partnerId) return { code: 0, data: null }

  const date = data.date || new Date().toISOString().slice(0, 10)
  const res = await db.collection('moods')
    .where({ userId: partnerId, date })
    .get()

  return { code: 0, data: res.data[0] || null }
}
