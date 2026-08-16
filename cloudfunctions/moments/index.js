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
      case 'add': return addMoment(openid, data)
      case 'update': return updateMoment(openid, data)
      case 'delete': return deleteMoment(openid, data)
      case 'list': return listMoments(openid, data)
      case 'get': return getMoment(openid, data)
      case 'random': return randomMoment(openid)
      default: return { code: -1, message: '未知操作' }
    }
  } catch (error) {
    console.error('moments failed:', error)
    return { code: -1, message: error.message || '点滴服务暂时不可用' }
  }
}

function normalizeImages(value) {
  return Array.isArray(value)
    ? value.map(item => String(item || '')).filter(item => item.startsWith('cloud://') || item.startsWith('https://')).slice(0, 9)
    : []
}

function normalizeTags(value) {
  return Array.isArray(value) ? value.map(tag => String(tag).trim().slice(0, 20)).filter(Boolean).slice(0, 10) : []
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  return (user.data && user.data.coupleId) || ''
}

async function getOwnedMoment(openid, id) {
  const coupleId = await getCoupleId(openid)
  if (!coupleId) throw new Error('请先绑定你们的空间')
  const result = await db.collection('moments').doc(id).get()
  if (!result.data || result.data.coupleId !== coupleId) throw new Error('无权操作该记录')
  return result.data
}

async function addMoment(openid, data) {
  const coupleId = await getCoupleId(openid)
  if (!coupleId) return { code: -1, message: '请先绑定你们的空间' }
  const title = String(data.title || '').trim().slice(0, 50)
  const content = String(data.content || '').trim().slice(0, 5000)
  const images = normalizeImages(data.images)
  if (!content && !images.length && !data.voiceFileId) return { code: -1, message: '写点内容或添加一张照片吧' }
  await assertSafeText(title, content, ...(data.tags || []))
  const res = await db.collection('moments').add({
    data: {
      coupleId,
      author: openid,
      title,
      content,
      images,
      voiceFileId: String(data.voiceFileId || '').slice(0, 300),
      tags: normalizeTags(data.tags),
      relatedId: String(data.relatedId || '').slice(0, 64),
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function updateMoment(openid, data) {
  const current = await getOwnedMoment(openid, data.id)
  const { id } = data
  const fields = {}
  ;['title', 'content', 'images', 'voiceFileId', 'tags', 'relatedId'].forEach(key => {
    if (data[key] !== undefined) fields[key] = data[key]
  })
  if (fields.title !== undefined) fields.title = String(fields.title).trim().slice(0, 50)
  if (fields.content !== undefined) fields.content = String(fields.content).trim().slice(0, 5000)
  if (fields.images !== undefined) fields.images = normalizeImages(fields.images)
  if (fields.tags !== undefined) fields.tags = normalizeTags(fields.tags)
  if (fields.voiceFileId !== undefined) fields.voiceFileId = String(fields.voiceFileId || '').slice(0, 300)
  if (fields.relatedId !== undefined) fields.relatedId = String(fields.relatedId || '').slice(0, 64)
  const nextContent = fields.content !== undefined ? fields.content : current.content
  const nextImages = fields.images !== undefined ? fields.images : current.images
  const nextVoice = fields.voiceFileId !== undefined ? fields.voiceFileId : current.voiceFileId
  if (!nextContent && !(nextImages && nextImages.length) && !nextVoice) return { code: -1, message: '写点内容或添加一张照片吧' }
  if (!Object.keys(fields).length) return { code: -1, message: '没有可更新的内容' }
  await assertSafeText(fields.title, fields.content, ...(fields.tags || []))
  await db.collection('moments').doc(id).update({
    data: { ...fields, updatedAt: db.serverDate() }
  })
  return { code: 0 }
}

async function deleteMoment(openid, data) {
  const moment = { data: await getOwnedMoment(openid, data.id) }
  // 删除关联图片
  if (moment.data.images && moment.data.images.length > 0) {
    const files = moment.data.images.filter(id => id && id.startsWith('cloud://'))
    if (files.length) await cloud.deleteFile({ fileList: files })
  }
  await db.collection('moments').doc(data.id).remove()
  return { code: 0 }
}

async function listMoments(openid, data) {
  const coupleId = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }

  const page = Math.max(1, Math.round(Number(data.page) || 1))
  const pageSize = Math.min(50, Math.max(1, Math.round(Number(data.pageSize) || 20)))
  const tag = String(data.tag || '').slice(0, 20)
  let where = { coupleId }
  if (tag) where.tags = tag

  const countRes = await db.collection('moments').where(where).count()
  const res = await db.collection('moments')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  return {
    code: 0,
    list: res.data,
    total: countRes.total,
    hasMore: page * pageSize < countRes.total
  }
}

async function getMoment(openid, data) {
  return { code: 0, data: await getOwnedMoment(openid, data.id) }
}

async function randomMoment(openid) {
  const coupleId = await getCoupleId(openid)
  if (!coupleId) return { code: 0, data: null }

  const countRes = await db.collection('moments')
    .where({ coupleId })
    .count()
  if (countRes.total === 0) return { code: 0, data: null }

  const skip = Math.floor(Math.random() * countRes.total)
  const res = await db.collection('moments')
    .where({ coupleId })
    .skip(skip)
    .limit(1)
    .get()

  return { code: 0, data: res.data[0] || null }
}
