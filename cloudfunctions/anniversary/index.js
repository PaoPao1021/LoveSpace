const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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
      case 'add': return addAnniversary(openid, data)
      case 'update': return updateAnniversary(openid, data)
      case 'delete': return deleteAnniversary(openid, data)
      case 'list': return listAnniversaries(openid)
      case 'get': return getAnniversary(openid, data)
      default: return { code: -1, message: '未知操作' }
    }
  } catch (error) {
    console.error('anniversary failed:', error)
    return { code: -1, message: error.message || '纪念日服务暂时不可用' }
  }
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3])
}

function safeImageUrl(value) {
  const url = String(value || '')
  return !url || url.startsWith('cloud://') || url.startsWith('https://') ? url : ''
}

async function addAnniversary(openid, data) {
  const user = await db.collection('users').doc(openid).get()
  if (!user.data.coupleId) return { code: -1, message: '未绑定' }

  const name = String(data.name || '').trim()
  const date = String(data.date || '')
  if (!name || name.length > 30) return { code: -1, message: '纪念日名称需要 1-30 个字' }
  if (!isValidDate(date)) return { code: -1, message: '日期格式不正确' }
  await assertSafeText(name, data.note)

  const res = await db.collection('anniversaries').add({
    data: {
      coupleId: user.data.coupleId,
      name,
      date,
      type: ['together', 'birthday', 'valentine', 'meet', 'first', 'custom'].includes(data.type) ? data.type : 'custom',
      coverUrl: safeImageUrl(data.coverUrl),
      note: String(data.note || '').slice(0, 500),
      isRepeat: data.isRepeat !== false,
      remindDaysBefore: Math.min(30, Math.max(0, Number(data.remindDaysBefore) || 0)),
      isTop: Boolean(data.isTop),
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function assertOwned(openid, id) {
  if (!id) throw new Error('缺少记录 ID')
  const user = await db.collection('users').doc(openid).get()
  const result = await db.collection('anniversaries').doc(id).get()
  if (!user.data.coupleId || result.data.coupleId !== user.data.coupleId) throw new Error('无权操作该纪念日')
  return result.data
}

async function updateAnniversary(openid, data) {
  await assertOwned(openid, data.id)
  const { id } = data
  const fields = {}
  ;['name', 'date', 'type', 'coverUrl', 'note', 'isRepeat', 'remindDaysBefore', 'isTop'].forEach(key => {
    if (data[key] !== undefined) fields[key] = data[key]
  })
  if (fields.name !== undefined) {
    fields.name = String(fields.name).trim()
    if (!fields.name || fields.name.length > 30) return { code: -1, message: '纪念日名称需要 1-30 个字' }
  }
  if (fields.date !== undefined && !isValidDate(fields.date)) return { code: -1, message: '日期格式不正确' }
  if (fields.note !== undefined) fields.note = String(fields.note).slice(0, 500)
  if (fields.type !== undefined && !['together', 'birthday', 'valentine', 'meet', 'first', 'custom'].includes(fields.type)) fields.type = 'custom'
  if (fields.coverUrl !== undefined) fields.coverUrl = safeImageUrl(fields.coverUrl)
  if (fields.remindDaysBefore !== undefined) fields.remindDaysBefore = Math.min(30, Math.max(0, Number(fields.remindDaysBefore) || 0))
  if (fields.isRepeat !== undefined) fields.isRepeat = Boolean(fields.isRepeat)
  if (fields.isTop !== undefined) fields.isTop = Boolean(fields.isTop)
  await assertSafeText(fields.name, fields.note)
  await db.collection('anniversaries').doc(id).update({
    data: { ...fields, updatedAt: db.serverDate() }
  })
  return { code: 0 }
}

async function deleteAnniversary(openid, data) {
  await assertOwned(openid, data.id)
  await db.collection('anniversaries').doc(data.id).remove()
  return { code: 0 }
}

async function listAnniversaries(openid) {
  const user = await db.collection('users').doc(openid).get()
  if (!user.data.coupleId) return { code: 0, list: [] }

  const res = await db.collection('anniversaries')
    .where({ coupleId: user.data.coupleId })
    .orderBy('isTop', 'desc')
    .orderBy('date', 'asc')
    .get()
  return { code: 0, list: res.data }
}

async function getAnniversary(openid, data) {
  return { code: 0, data: await assertOwned(openid, data.id) }
}
