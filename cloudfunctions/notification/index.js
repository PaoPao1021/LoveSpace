const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const crypto = require('crypto')
const ORDER_TEMPLATE_ID = process.env.ORDER_TEMPLATE_ID || 'Q1IwjM7zcg5qC16G5sTmNBCfMkTZ6AYDeyZhqm3nTH8'
const ANNIVERSARY_TEMPLATE_ID = process.env.ANNIVERSARY_TEMPLATE_ID || ''

exports.main = async (event) => {
  try {
    const openid = cloud.getWXContext().OPENID
    const { action, data = {} } = event || {}
    const isTimer = !openid && (
      process.env.TRIGGER_SRC === 'timer' ||
      event.Type === 'Timer' ||
      event.type === 'timer' ||
      Boolean(event.TriggerName || event.triggerName)
    )
    if (isTimer) return checkAnniversaryReminders()
    if (action === 'checkReminders') {
      return { code: -1, message: '仅允许定时触发器调用' }
    }
    if (!openid) return { code: -1, message: '登录状态无效' }
    switch (action) {
      case 'orderNotify': return orderNotify(openid, data)
      case 'list': return listNotifications(openid)
      case 'read': return markRead(openid, data)
      default: return { code: -1, message: '未知操作' }
    }
  } catch (error) {
    console.error('notification failed:', error)
    return { code: -1, message: error.message || '通知服务暂时不可用' }
  }
}

function hashId(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32)
}

// 下单通知
async function orderNotify(openid, data) {
  if (!data.orderId) return { code: -1, message: '缺少订单ID' }
  const order = await db.collection('orders').doc(data.orderId).get()
  if (!order.data || order.data.orderedBy !== openid) return { code: -1, message: '订单不存在或无权通知' }
  const { items, totalPrice } = order.data
  if (!Array.isArray(items) || !items.length || items.length > 30) return { code: -1, message: '通知内容无效' }

  // 获取对方 openid
  const partnerId = await getPartnerOpenid(openid)
  if (!partnerId) return { code: 0 }

  // 获取发送者昵称
  const senderName = await getNickName(openid)
  const itemNames = items.map(i => String(i.name || '').slice(0, 20)).filter(Boolean).join('、')

  // 同一个订单只生成一次站内通知。
  const notificationId = hashId(`order-notification:${data.orderId}:${partnerId}`)
  let duplicated = false
  await db.runTransaction(async transaction => {
    const ref = transaction.collection('notifications').doc(notificationId)
    const existing = await ref.get().catch(() => null)
    if (existing && existing.data) {
      duplicated = true
      return
    }
    await ref.set({ data: {
      coupleId: order.data.coupleId,
      toUser: partnerId,
      fromUser: openid,
      fromName: senderName,
      type: 'order',
      title: 'TA想点菜',
      content: `${senderName}想和你一起吃：${itemNames}`.slice(0, 100),
      relatedId: data.orderId,
      read: false,
      createdAt: db.serverDate()
    } })
  })
  if (duplicated) return { code: 0, duplicated: true }

  // 发送订阅消息
  try {
    if (!ORDER_TEMPLATE_ID) return { code: 0 }
    await cloud.openapi.subscribeMessage.send({
      touser: partnerId,
      templateId: ORDER_TEMPLATE_ID,
      page: 'pages/index/index',
      data: {
        thing1: { value: senderName + '想点菜' },
        thing2: { value: itemNames.slice(0, 20) },
        amount3: { value: Math.max(0, Number(totalPrice) || 0) + '元' }
      }
    })
  } catch (e) {
    console.log('订阅消息发送跳过:', e.message)
  }

  return { code: 0 }
}

// 获取通知列表
async function listNotifications(openid) {
  const coupleId = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }

  const res = await db.collection('notifications')
    .where({ coupleId, toUser: openid, read: false })
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get()

  return { code: 0, list: res.data }
}

// 标记已读
async function markRead(openid, data) {
  const { id } = data
  if (!id) return { code: -1, message: '缺少通知ID' }
  const notification = await db.collection('notifications').doc(id).get()
  if (!notification.data || notification.data.toUser !== openid) return { code: -1, message: '无权操作该通知' }
  await db.collection('notifications').doc(id).update({
    data: { read: true }
  })
  return { code: 0 }
}

// === 工具函数 ===

async function getPartnerOpenid(openid) {
  const userRes = await db.collection('users').doc(openid).get()
  const user = userRes.data
  if (!user.coupleId) return null

  const coupleRes = await db.collection('couples').doc(user.coupleId).get()
  const couple = coupleRes.data
  return couple.creator === openid ? couple.partner : couple.creator
}

async function getCoupleId(openid) {
  const userRes = await db.collection('users').doc(openid).get()
  return userRes.data.coupleId
}

async function getNickName(openid) {
  try {
    const userRes = await db.collection('users').doc(openid).get()
    return userRes.data.nickName || '你的另一半'
  } catch (e) {
    return '你的另一半'
  }
}

async function fetchAll(collection, where) {
  const list = []
  let skip = 0
  while (true) {
    const page = await db.collection(collection).where(where).skip(skip).limit(100).get()
    list.push(...page.data)
    if (page.data.length < 100) return list
    skip += 100
  }
}

function getChinaToday() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  return {
    year,
    month,
    day,
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    utcDay: Date.UTC(year, month - 1, day)
  }
}

// 纪念日提醒（保留原有功能）
async function checkAnniversaryReminders() {
  const today = getChinaToday()
  const couples = await fetchAll('couples', { status: 'active' })
  let created = 0

  for (const couple of couples) {
    const anniversaries = await fetchAll('anniversaries', { coupleId: couple._id })

    for (const ann of anniversaries) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ann.date || ''))
      if (!match) continue
      let year = ann.isRepeat ? today.year : Number(match[1])
      const month = Number(match[2])
      const day = Number(match[3])
      let target = Date.UTC(year, month - 1, day)
      if (ann.isRepeat && target < today.utcDay) target = Date.UTC(year + 1, month - 1, day)
      const daysUntil = Math.round((target - today.utcDay) / 86400000)
      const remindDaysBefore = Math.min(365, Math.max(0, Number(ann.remindDaysBefore) || 0))

      if (daysUntil >= 0 && daysUntil <= remindDaysBefore) {
        if (couple.creator) {
          created += (await sendReminder(couple.creator, couple._id, ann, daysUntil, today.date)) ? 1 : 0
        }
        if (couple.partner) {
          created += (await sendReminder(couple.partner, couple._id, ann, daysUntil, today.date)) ? 1 : 0
        }
      }
    }
  }
  return { code: 0, created }
}

async function sendReminder(openid, coupleId, anniversary, daysUntil, todayStr) {
  const reminderId = hashId(`anniversary:${anniversary._id}:${openid}:${todayStr}`)
  let duplicated = false
  await db.runTransaction(async transaction => {
    const ref = transaction.collection('notifications').doc(reminderId)
    const existing = await ref.get().catch(() => null)
    if (existing && existing.data) {
      duplicated = true
      return
    }
    const timing = daysUntil === 0 ? '就是今天' : `还有 ${daysUntil} 天`
    await ref.set({ data: {
      coupleId,
      toUser: openid,
      fromUser: '',
      fromName: 'LoveSpace',
      type: 'anniversary',
      title: '纪念日提醒',
      content: `${anniversary.name}${timing}`.slice(0, 100),
      relatedId: anniversary._id,
      read: false,
      createdAt: db.serverDate()
    } })
  })
  if (duplicated) return false

  try {
    if (!ANNIVERSARY_TEMPLATE_ID) return true
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: ANNIVERSARY_TEMPLATE_ID,
      page: 'pages/index/index',
      data: {
        thing1: { value: String(anniversary.name || '纪念日').slice(0, 20) },
        number2: { value: daysUntil }
      }
    })
  } catch (e) {
    console.error('发送提醒失败:', e)
  }
  return true
}
