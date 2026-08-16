const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertSafeText(...values) {
  const content = values.map(value => String(value || '').trim()).filter(Boolean).join('\n').slice(0, 1200)
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
      case 'add': return addWish(openid, data)
      case 'update': return updateWish(openid, data)
      case 'delete': return deleteWish(openid, data)
      case 'list': return listWishes(openid)
      default: return { code: -1, message: '未知操作' }
    }
  } catch (error) {
    console.error('wish failed:', error)
    return { code: -1, message: error.message || '愿望服务暂时不可用' }
  }
}

function safeImageUrl(value) {
  const url = String(value || '')
  return !url || url.startsWith('cloud://') || url.startsWith('https://') ? url : ''
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  const coupleId = user.data && user.data.coupleId
  if (!coupleId) throw new Error('请先绑定你们的空间')
  return coupleId
}

async function assertOwned(openid, id) {
  const coupleId = await getCoupleId(openid)
  const result = await db.collection('wishes').doc(id).get()
  if (!result.data || result.data.coupleId !== coupleId) throw new Error('无权操作该愿望')
}

async function addWish(openid, data) {
  const coupleId = await getCoupleId(openid)
  const title = String(data.title || '').trim()
  if (!title || title.length > 80) return { code: -1, message: '愿望标题需要 1-80 个字' }
  await assertSafeText(title, data.description)
  const res = await db.collection('wishes').add({
    data: {
      coupleId,
      title,
      description: String(data.description || '').slice(0, 1000),
      imageUrl: safeImageUrl(data.imageUrl),
      createdBy: openid,
      status: 'todo',
      completedAt: '',
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function updateWish(openid, data) {
  await assertOwned(openid, data.id)
  const { id } = data
  const fields = {}
  if (data.title !== undefined) {
    fields.title = String(data.title).trim()
    if (!fields.title || fields.title.length > 80) return { code: -1, message: '愿望标题需要 1-80 个字' }
  }
  if (data.description !== undefined) fields.description = String(data.description || '').slice(0, 1000)
  if (data.imageUrl !== undefined) fields.imageUrl = safeImageUrl(data.imageUrl)
  if (data.status !== undefined) {
    if (!['todo', 'done'].includes(data.status)) return { code: -1, message: '愿望状态无效' }
    fields.status = data.status
    fields.completedAt = data.status === 'done' ? db.serverDate() : ''
  }
  if (!Object.keys(fields).length) return { code: -1, message: '没有可更新的内容' }
  await assertSafeText(fields.title, fields.description)
  await db.collection('wishes').doc(id).update({ data: fields })
  return { code: 0 }
}

async function deleteWish(openid, data) {
  await assertOwned(openid, data.id)
  await db.collection('wishes').doc(data.id).remove()
  return { code: 0 }
}

async function listWishes(openid) {
  const coupleId = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }

  const res = await db.collection('wishes')
    .where({ coupleId })
    .orderBy('status', 'asc')
    .orderBy('createdAt', 'desc')
    .get()
  return { code: 0, list: res.data }
}
