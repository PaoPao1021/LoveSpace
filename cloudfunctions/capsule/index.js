const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { action, data } = event
  const openid = cloud.getWXContext().OPENID

  switch (action) {
    case 'add': return addCapsule(openid, data)
    case 'list': return listCapsules(openid, data)
    case 'get': return getCapsule(data)
    case 'checkUnlock': return checkUnlock(openid)
    default: return { code: -1, message: '未知操作' }
  }
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  return user.data.coupleId
}

async function addCapsule(openid, data) {
  const coupleId = await getCoupleId(openid)
  const res = await db.collection('capsules').add({
    data: {
      coupleId,
      author: openid,
      title: data.title,
      content: data.content,
      images: data.images || [],
      voiceFileId: data.voiceFileId || '',
      unlockDate: data.unlockDate,
      isUnlocked: false,
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function listCapsules(openid, data) {
  const coupleId = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }

  const { showAll } = data || {}
  let where = { coupleId }
  if (!showAll) where.isUnlocked = true

  const res = await db.collection('capsules')
    .where(where)
    .orderBy('unlockDate', 'desc')
    .get()

  // 同时获取未解锁的（只显示基本信息）
  const lockedRes = await db.collection('capsules')
    .where({ coupleId, isUnlocked: false })
    .orderBy('unlockDate', 'asc')
    .get()

  return {
    code: 0,
    unlocked: res.data,
    locked: lockedRes.data.map(c => ({
      _id: c._id,
      title: c.title,
      unlockDate: c.unlockDate,
      author: c.author,
      createdAt: c.createdAt
    }))
  }
}

async function getCapsule(data) {
  const capsule = await db.collection('capsules').doc(data.id).get()
  if (!capsule.data.isUnlocked) {
    const now = new Date()
    const unlock = new Date(capsule.data.unlockDate)
    if (now < unlock) {
      return {
        code: 0,
        data: {
          _id: capsule.data._id,
          title: capsule.data.title,
          unlockDate: capsule.data.unlockDate,
          isUnlocked: false
        }
      }
    }
    // 到期了，自动解锁
    await db.collection('capsules').doc(data.id).update({
      data: { isUnlocked: true }
    })
    capsule.data.isUnlocked = true
  }
  return { code: 0, data: capsule.data }
}

async function checkUnlock(openid) {
  const coupleId = await getCoupleId(openid)
  const now = new Date().toISOString()

  const res = await db.collection('capsules')
    .where({
      coupleId,
      isUnlocked: false,
      unlockDate: db.command.lte(now)
    })
    .get()

  for (const capsule of res.data) {
    await db.collection('capsules').doc(capsule._id).update({
      data: { isUnlocked: true }
    })
  }

  return { code: 0, unlocked: res.data }
}
