const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const crypto = require('crypto')

async function assertSafeText(...values) {
  const content = values.map(value => String(value || '').trim()).filter(Boolean).join('\n').slice(0, 1000)
  if (!content) return
  try {
    const result = await cloud.openapi.security.msgSecCheck({ content })
    const suggest = result && result.result && result.result.suggest
    if (suggest && suggest !== 'pass') throw new Error('CONTENT_RISKY')
  } catch (error) {
    const code = Number(error.errCode || error.errcode)
    if (code === 87014 || String(error.message || '').includes('87014') || error.message === 'CONTENT_RISKY') throw new Error('内容包含不适合发布的信息，请修改后重试')
    console.error('msgSecCheck failed:', error)
    throw new Error('内容安全检查暂时不可用，请稍后重试')
  }
}

exports.main = async (event) => {
  try {
    const { action, data = {} } = event || {}
    const openid = cloud.getWXContext().OPENID
    if (!openid) return { code: -1, message: '登录状态无效' }

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
  } catch (error) {
    console.error('points failed:', error)
    return { code: -1, message: error.message || '积分服务暂时不可用' }
  }
}

function hashId(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32)
}

function requestDocId(openid, requestId, prefix) {
  const normalized = String(requestId || '').trim()
  if (normalized && !/^[A-Za-z0-9_-]{8,80}$/.test(normalized)) throw new Error('请求标识无效')
  const token = normalized || `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`
  return hashId(`${prefix}:${openid}:${token}`)
}

function balanceDocId(coupleId, userId) {
  return hashId(`balance:${coupleId}:${userId}`)
}

async function sumPointLedger(coupleId, userId) {
  let total = 0
  let skip = 0
  while (true) {
    const page = await db.collection('points').where({ coupleId, toUser: userId }).skip(skip).limit(100).get()
    total += page.data.reduce((sum, record) => sum + Number(record.amount || 0), 0)
    if (page.data.length < 100) return total
    skip += 100
  }
}

async function ensureBalance(coupleId, userId) {
  if (!userId) return 0
  const id = balanceDocId(coupleId, userId)
  try {
    const existing = await db.collection('point_balances').doc(id).get()
    if (existing.data && existing.data.coupleId === coupleId && existing.data.userId === userId) {
      return Number(existing.data.score || 0)
    }
  } catch (error) {
    // 首次上线时从历史流水回填余额。
  }

  const initialScore = await sumPointLedger(coupleId, userId)
  let finalScore = initialScore
  await db.runTransaction(async transaction => {
    const ref = transaction.collection('point_balances').doc(id)
    const current = await ref.get().catch(() => null)
    if (current && current.data) {
      finalScore = Number(current.data.score || 0)
      return
    }
    await ref.set({
      data: { coupleId, userId, score: initialScore, updatedAt: db.serverDate() }
    })
  })
  return finalScore
}

async function getCoupleInfo(openid) {
  const user = await db.collection('users').doc(openid).get()
  if (!user.data || !user.data.coupleId) throw new Error('请先绑定你们的空间')
  const couple = await db.collection('couples').doc(user.data.coupleId).get()
  if (couple.data.creator !== openid && couple.data.partner !== openid) throw new Error('无权访问该空间')
  return {
    coupleId: user.data.coupleId,
    partnerId: couple.data.creator === openid ? couple.data.partner : couple.data.creator
  }
}

async function addPoints(openid, data) {
  const { coupleId, partnerId } = await getCoupleInfo(openid)
  const amount = Number(data.amount)
  const reason = String(data.reason || '').trim()
  if (!partnerId) return { code: -1, message: '等待对方加入后再使用积分' }
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1000) return { code: -1, message: '积分需要是 -1000 到 1000 之间的非零整数' }
  if (!reason || reason.length > 30) return { code: -1, message: '原因需要 1-30 个字' }
  await assertSafeText(reason, data.note)
  await ensureBalance(coupleId, partnerId)
  const pointId = requestDocId(openid, data.requestId, 'point')
  let duplicated = false
  await db.runTransaction(async transaction => {
    const pointRef = transaction.collection('points').doc(pointId)
    const balanceRef = transaction.collection('point_balances').doc(balanceDocId(coupleId, partnerId))
    const existing = await pointRef.get().catch(() => null)
    if (existing && existing.data) {
      duplicated = true
      return
    }
    await pointRef.set({
      data: {
      coupleId,
      fromUser: openid,
      toUser: partnerId,
      amount,
      reason,
      note: String(data.note || '').slice(0, 200),
      createdAt: db.serverDate()
      }
    })
    await balanceRef.update({ data: { score: _.inc(amount), updatedAt: db.serverDate() } })
  })
  return { code: 0, id: pointId, duplicated }
}

async function getScore(openid) {
  const { coupleId, partnerId } = await getCoupleInfo(openid)
  const [myScore, partnerScore] = await Promise.all([
    ensureBalance(coupleId, openid),
    partnerId ? ensureBalance(coupleId, partnerId) : 0
  ])
  return { code: 0, myScore, partnerScore, myId: openid, partnerId }
}

async function listRecords(openid, data) {
  const { coupleId } = await getCoupleInfo(openid)
  const page = Math.max(1, Math.round(Number(data.page) || 1))
  const pageSize = Math.min(50, Math.max(1, Math.round(Number(data.pageSize) || 20)))
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
  const builtIn = {
    '一次按摩': 30, '一杯奶茶': 20, '电影选择权': 50, '免做家务一次': 40,
    '小惊喜': 60, '约会策划权': 80, '赖床特权': 25, '专属大餐': 100
  }
  let item = String(data.item || '').trim()
  let amount = Number(data.amount)
  if (data.exchangeId) {
    const exchange = await db.collection('point_exchanges').doc(data.exchangeId).get()
    if (!exchange.data || exchange.data.coupleId !== coupleId) return { code: -1, message: '兑换项目不存在' }
    item = exchange.data.name
    amount = Number(exchange.data.cost)
  } else if (!builtIn[item] || builtIn[item] !== amount) {
    return { code: -1, message: '兑换项目参数无效' }
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > 10000) return { code: -1, message: '兑换积分无效' }
  await assertSafeText(item, data.note)
  await ensureBalance(coupleId, openid)
  const recordId = requestDocId(openid, data.requestId, 'exchange')
  const pointId = hashId(`exchange-point:${recordId}`)
  let duplicated = false
  await db.runTransaction(async transaction => {
    const recordRef = transaction.collection('point_exchange_records').doc(recordId)
    const existing = await recordRef.get().catch(() => null)
    if (existing && existing.data) {
      duplicated = true
      return
    }

    const balanceRef = transaction.collection('point_balances').doc(balanceDocId(coupleId, openid))
    const balance = await balanceRef.get().catch(() => null)
    const currentScore = Number(balance && balance.data && balance.data.score || 0)
    if (currentScore < amount) throw new Error(`积分不足，还差 ${amount - currentScore}`)

    await transaction.collection('points').doc(pointId).set({
      data: {
        coupleId,
        fromUser: openid,
        toUser: openid,
        amount: -amount,
        reason: `兑换: ${item}`,
        note: String(data.note || '').slice(0, 200),
        createdAt: db.serverDate()
      }
    })
    await recordRef.set({
      data: {
        coupleId,
        userId: openid,
        exchangeId: data.exchangeId || '',
        itemName: item,
        cost: amount,
        createdAt: db.serverDate()
      }
    })
    await balanceRef.update({ data: { score: _.inc(-amount), updatedAt: db.serverDate() } })
  })
  return { code: 0, id: pointId, duplicated }
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
  if (!name || name.length > 30 || cost <= 0 || cost > 10000) return { code: -1, message: '请输入 1-30 字名称和有效积分数' }
  await assertSafeText(name)
  const res = await db.collection('point_exchanges').add({
    data: {
      coupleId,
      name,
      cost,
      icon: String(data.icon || '🎁').slice(0, 8),
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
  const { coupleId } = await getCoupleInfo(openid)
  const item = await db.collection('point_exchanges').doc(data.id).get()
  if (!item.data || item.data.coupleId !== coupleId) return { code: -1, message: '无权删除该项目' }
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
