const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { action, data } = event
  const openid = cloud.getWXContext().OPENID

  switch (action) {
    case 'add': return addPoints(openid, data)
    case 'getScore': return getScore(openid)
    case 'list': return listRecords(openid, data)
    case 'exchange': return exchangePoints(openid, data)
    case 'getLevel': return getLevel(openid)
    case 'addExchange': return addExchange(openid, data)
    case 'listExchanges': return listExchanges(openid)
    case 'deleteExchange': return deleteExchange(openid, data)
    case 'listExchangeHistory': return listExchangeHistory(openid)
    default: return { code: -1, message: '未知操作' }
  }
}

async function getCoupleInfo(openid) {
  const user = await db.collection('users').doc(openid).get()
  const couple = await db.collection('couples').doc(user.data.coupleId).get()
  return {
    coupleId: user.data.coupleId,
    partnerId: couple.data.creator === openid ? couple.data.partner : couple.data.creator
  }
}

async function addPoints(openid, data) {
  const { coupleId, partnerId } = await getCoupleInfo(openid)
  const res = await db.collection('points').add({
    data: {
      coupleId,
      fromUser: openid,
      toUser: data.toUser || partnerId,
      amount: data.amount,
      reason: data.reason,
      note: data.note || '',
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function getScore(openid) {
  const { coupleId, partnerId } = await getCoupleInfo(openid)
  const receivedRes = await db.collection('points')
    .where({ coupleId, toUser: openid })
    .get()
  const myScore = receivedRes.data.reduce((sum, r) => sum + r.amount, 0)
  const partnerReceivedRes = await db.collection('points')
    .where({ coupleId, toUser: partnerId })
    .get()
  const partnerScore = partnerReceivedRes.data.reduce((sum, r) => sum + r.amount, 0)
  return { code: 0, myScore, partnerScore, myId: openid, partnerId }
}

async function listRecords(openid, data) {
  const { coupleId } = await getCoupleInfo(openid)
  const { page = 1, pageSize = 20 } = data || {}
  const countRes = await db.collection('points').where({ coupleId }).count()
  const res = await db.collection('points')
    .where({ coupleId })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  return { code: 0, list: res.data, total: countRes.total }
}

async function exchangePoints(openid, data) {
  const { coupleId } = await getCoupleInfo(openid)
  const res = await db.collection('points').add({
    data: {
      coupleId,
      fromUser: openid,
      toUser: openid,
      amount: -data.amount,
      reason: `兑换: ${data.item}`,
      note: data.note || '',
      createdAt: db.serverDate()
    }
  })
  // 记录兑换历史
  await db.collection('point_exchange_records').add({
    data: {
      coupleId,
      userId: openid,
      exchangeId: data.exchangeId || '',
      itemName: data.item,
      cost: data.amount,
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function getLevel(openid) {
  const { myScore } = await getScore(openid)
  const levels = [
    { name: '新手情侣', min: 0, icon: '🌱' },
    { name: '甜蜜搭子', min: 100, icon: '🍬' },
    { name: '默契满分', min: 500, icon: '💯' },
    { name: '神仙伴侣', min: 1000, icon: '👼' },
    { name: '灵魂伴侣', min: 2000, icon: '💖' },
    { name: '天作之合', min: 5000, icon: '👑' }
  ]
  let current = levels[0]
  let next = levels[1]
  for (let i = 0; i < levels.length; i++) {
    if (myScore >= levels[i].min) {
      current = levels[i]
      next = levels[i + 1] || null
    }
  }
  return { code: 0, current, next, score: myScore }
}

// ===== 自定义兑换项目 =====
async function addExchange(openid, data) {
  const { coupleId } = await getCoupleInfo(openid)
  const name = String(data.name || '').trim()
  const cost = parseInt(data.cost) || 0
  if (!name || cost <= 0) return { code: -1, message: '请输入名称和有效积分数' }
  const res = await db.collection('point_exchanges').add({
    data: {
      coupleId,
      name,
      cost,
      icon: data.icon || '🎁',
      createdBy: openid,
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function listExchanges(openid) {
  const { coupleId } = await getCoupleInfo(openid)
  const res = await db.collection('point_exchanges')
    .where({ coupleId })
    .orderBy('createdAt', 'desc')
    .get()
  return { code: 0, list: res.data }
}

async function deleteExchange(openid, data) {
  if (!data.id) return { code: -1, message: '缺少ID' }
  await db.collection('point_exchanges').doc(data.id).remove()
  return { code: 0 }
}

async function listExchangeHistory(openid) {
  const { coupleId } = await getCoupleInfo(openid)
  const res = await db.collection('point_exchange_records')
    .where({ coupleId })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get()
  return { code: 0, list: res.data }
}
