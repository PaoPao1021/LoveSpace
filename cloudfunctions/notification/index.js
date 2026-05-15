const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, data } = event

  switch (action) {
    case 'checkReminders': return checkAnniversaryReminders()
    case 'orderNotify': return orderNotify(openid, data)
    case 'list': return listNotifications(openid)
    case 'read': return markRead(openid, data)
    default: return { code: -1, message: '未知操作' }
  }
}

// 下单通知
async function orderNotify(openid, data) {
  const { items, totalPrice } = data

  // 获取对方 openid
  const partnerId = await getPartnerOpenid(openid)
  if (!partnerId) return { code: 0 }

  // 获取发送者昵称
  const senderName = await getNickName(openid)
  const itemNames = items.map(i => i.name).join('、')

  // 存入通知表
  await db.collection('notifications').add({
    data: {
      coupleId: await getCoupleId(openid),
      toUser: partnerId,
      fromUser: openid,
      fromName: senderName,
      type: 'order',
      title: 'TA想点菜',
      content: `${senderName}想吃${itemNames}，快来做吧~`,
      read: false,
      createdAt: db.serverDate()
    }
  })

  // 发送订阅消息
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: partnerId,
      templateId: 'Q1IwjM7zcg5qC16G5sTmNBCfMkTZ6AYDeyZhqm3nTH8',
      page: 'pages/index/index',
      data: {
        thing1: { value: senderName + '想点菜' },
        thing2: { value: itemNames.slice(0, 20) },
        amount3: { value: totalPrice + '元' }
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

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

// 纪念日提醒（保留原有功能）
async function checkAnniversaryReminders() {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const couples = await db.collection('couples')
    .where({ status: 'active' })
    .get()

  for (const couple of couples.data) {
    const anniversaries = await db.collection('anniversaries')
      .where({ coupleId: couple._id })
      .get()

    for (const ann of anniversaries.data) {
      const annDate = new Date(ann.date)
      const thisYearAnn = new Date(today.getFullYear(), annDate.getMonth(), annDate.getDate())
      if (thisYearAnn < today && ann.isRepeat) {
        thisYearAnn.setFullYear(today.getFullYear() + 1)
      }

      const daysUntil = Math.ceil((thisYearAnn - today) / (1000 * 60 * 60 * 24))

      if (daysUntil >= 0 && daysUntil <= ann.remindDaysBefore) {
        if (couple.creator) {
          await sendReminder(couple.creator, ann.name, daysUntil)
        }
        if (couple.partner) {
          await sendReminder(couple.partner, ann.name, daysUntil)
        }
      }
    }
  }
  return { code: 0 }
}

async function sendReminder(openid, annName, daysUntil) {
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: '',
      page: 'pages/index/index',
      data: {
        thing1: { value: annName },
        number2: { value: daysUntil }
      }
    })
  } catch (e) {
    console.error('发送提醒失败:', e)
  }
}
