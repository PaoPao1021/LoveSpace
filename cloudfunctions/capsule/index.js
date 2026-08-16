const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertSafeText(...values) {
  const content = values.map(value => String(value || '').trim()).filter(Boolean).join('\n').slice(0, 5000)
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
      case 'add': return addCapsule(openid, data)
      case 'list': return listCapsules(openid)
      case 'get': return getCapsule(openid, data)
      case 'checkUnlock': return checkUnlock(openid)
      default: return { code: -1, message: '未知操作' }
    }
  } catch (error) {
    console.error('capsule failed:', error)
    return { code: -1, message: error.message || '时光胶囊服务暂时不可用' }
  }
}

function todayInChina() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3])
}

function normalizeImages(value) {
  return Array.isArray(value)
    ? value.map(item => String(item || '')).filter(item => item.startsWith('cloud://') || item.startsWith('https://')).slice(0, 9)
    : []
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  const coupleId = user.data && user.data.coupleId
  if (!coupleId) throw new Error('请先绑定你们的空间')
  return coupleId
}

async function getOwnedCapsule(openid, id) {
  const coupleId = await getCoupleId(openid)
  const capsule = await db.collection('capsules').doc(id).get()
  if (!capsule.data || capsule.data.coupleId !== coupleId) throw new Error('无权查看该胶囊')
  return capsule
}

async function addCapsule(openid, data) {
  const coupleId = await getCoupleId(openid)
  const title = String(data.title || '').trim()
  const content = String(data.content || '').trim()
  const unlockDate = String(data.unlockDate || '')
  const today = todayInChina()
  if (!title || title.length > 50) return { code: -1, message: '标题需要 1-50 个字' }
  if (!content || content.length > 5000) return { code: -1, message: '内容需要 1-5000 个字' }
  if (!isValidDate(unlockDate) || unlockDate <= today) return { code: -1, message: '开启日期需要晚于今天' }
  await assertSafeText(title, content)
  const res = await db.collection('capsules').add({
    data: {
      coupleId,
      author: openid,
      title,
      content,
      images: normalizeImages(data.images),
      voiceFileId: String(data.voiceFileId || '').slice(0, 300),
      unlockDate,
      isUnlocked: false,
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function listCapsules(openid, data) {
  const coupleId = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }

  const res = await db.collection('capsules')
    .where({ coupleId, isUnlocked: true })
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

async function getCapsule(openid, data) {
  const capsule = await getOwnedCapsule(openid, data.id)
  if (!capsule.data.isUnlocked) {
    if (todayInChina() < capsule.data.unlockDate) {
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
  const now = todayInChina()

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
