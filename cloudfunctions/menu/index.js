const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const crypto = require('crypto')

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

exports.main = async (event) => {
  try {
    const { action, data = {} } = event || {}
    const openid = cloud.getWXContext().OPENID
    if (!openid) return { code: -1, message: '登录状态无效' }
    switch (action) {
      case 'add': return addDish(openid, data)
      case 'update': return updateDish(openid, data)
      case 'delete': return deleteDish(openid, data)
      case 'list': return listDishes(openid, data)
      case 'get': return getDish(openid, data)
      case 'recommend': return getRecommendation(openid, data)
      case 'markEaten': return markEaten(openid, data)
      case 'addOrder': return addOrder(openid, data)
      case 'listOrders': return listOrders(openid, data)
      case 'addCategory': return addCategory(openid, data)
      case 'listCategories': return listCategories(openid)
      case 'deleteCategory': return deleteCategory(openid, data)
      default: return { code: -1, message: '未知操作' }
    }
  } catch (error) {
    console.error('menu failed:', error)
    return { code: -1, message: error.message || '点菜服务暂时不可用' }
  }
}

function requestDocId(openid, requestId) {
  const normalized = String(requestId || '').trim()
  if (normalized && !/^[A-Za-z0-9_-]{8,80}$/.test(normalized)) throw new Error('请求标识无效')
  const token = normalized || `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`
  return crypto.createHash('sha256').update(`order:${openid}:${token}`).digest('hex').slice(0, 32)
}

function safeImageUrl(value) {
  const url = String(value || '')
  return !url || url.startsWith('cloud://') || url.startsWith('https://') ? url : ''
}

function normalizeSpecs(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 10).map(group => ({
    name: String(group.name || '').trim().slice(0, 20),
    options: Array.isArray(group.options) ? group.options.slice(0, 20).map(option => ({
      name: String(option.name || '').trim().slice(0, 20),
      priceAdd: Math.min(100000, Math.max(0, Number(option.priceAdd) || 0))
    })).filter(option => option.name) : []
  })).filter(group => group.name && group.options.length)
}

function normalizeDishFields(data, partial = false) {
  const fields = {}
  const include = key => !partial || data[key] !== undefined
  if (include('name')) {
    fields.name = String(data.name || '').trim()
    if (!fields.name || fields.name.length > 40) throw new Error('菜品名称需要 1-40 个字')
  }
  if (include('category')) fields.category = String(data.category || '主食').trim().slice(0, 20) || '主食'
  if (include('imageUrl')) fields.imageUrl = safeImageUrl(data.imageUrl)
  if (include('tags')) fields.tags = Array.isArray(data.tags) ? data.tags.map(tag => String(tag).trim().slice(0, 20)).filter(Boolean).slice(0, 10) : []
  if (include('rating')) fields.rating = Math.min(5, Math.max(1, Number(data.rating) || 5))
  if (include('location')) fields.location = String(data.location || '').slice(0, 100)
  if (include('note')) fields.note = String(data.note || '').slice(0, 500)
  if (include('price')) fields.price = Math.min(100000, Math.max(0, Number(data.price) || 0))
  if (include('description')) fields.description = String(data.description || '').slice(0, 1000)
  if (include('specs')) fields.specs = normalizeSpecs(data.specs)
  if (include('isAvailable')) fields.isAvailable = data.isAvailable !== false
  return fields
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  const coupleId = user.data && user.data.coupleId
  if (!coupleId) throw new Error('请先绑定你们的空间')
  return coupleId
}

async function getOwned(openid, collection, id) {
  const coupleId = await getCoupleId(openid)
  const result = await db.collection(collection).doc(id).get()
  if (!result.data || result.data.coupleId !== coupleId) throw new Error('无权操作该记录')
  return result.data
}

async function addDish(openid, data) {
  const coupleId = await getCoupleId(openid)
  const fields = normalizeDishFields(data)
  await assertSafeText(fields.name, fields.category, fields.note, fields.description, fields.location, ...fields.tags)
  const res = await db.collection('dishes').add({
    data: {
      coupleId,
      ...fields,
      lastEatenAt: '',
      addedBy: openid,
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function updateDish(openid, data) {
  await getOwned(openid, 'dishes', data.id)
  const { id } = data
  const fields = normalizeDishFields(data, true)
  if (!Object.keys(fields).length) return { code: -1, message: '没有可更新的内容' }
  await assertSafeText(fields.name, fields.category, fields.note, fields.description, fields.location, ...(fields.tags || []))
  fields.updatedAt = db.serverDate()
  await db.collection('dishes').doc(id).update({ data: fields })
  return { code: 0 }
}

async function deleteDish(openid, data) {
  await getOwned(openid, 'dishes', data.id)
  await db.collection('dishes').doc(data.id).remove()
  return { code: 0 }
}

async function listDishes(openid, data) {
  const coupleId = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }

  const { category, tag, keyword } = data || {}
  let where = { coupleId }
  if (category) where.category = category
  if (tag) where.tags = tag
  if (keyword) where.name = db.command.RegExp({ regexp: escapeRegExp(String(keyword).slice(0, 30)), options: 'i' })

  const res = await db.collection('dishes')
    .where(where)
    .orderBy('rating', 'desc')
    .limit(100)
    .get()
  return { code: 0, list: res.data }
}

async function getDish(openid, data) {
  return { code: 0, data: await getOwned(openid, 'dishes', data.id) }
}

async function getRecommendation(openid, data) {
  const coupleId = await getCoupleId(openid)
  const res = await db.collection('dishes')
    .where({ coupleId, rating: db.command.gte(4) })
    .limit(20)
    .get()
  const dishes = res.data.sort(() => Math.random() - 0.5).slice(0, 3)
  return { code: 0, list: dishes }
}

async function markEaten(openid, data) {
  await getOwned(openid, 'dishes', data.id)
  await db.collection('dishes').doc(data.id).update({
    data: { lastEatenAt: new Date().toISOString().slice(0, 10) }
  })
  return { code: 0 }
}

// ===== 订单 =====
async function addOrder(openid, data) {
  const coupleId = await getCoupleId(openid)
  const { items, note } = data
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) return { code: -1, message: '请选择 1-30 个菜品' }
  await assertSafeText(note)
  const safeItems = []
  for (const item of items) {
    const id = item._id || item.id || item.dishId
    if (!id) return { code: -1, message: '订单中存在无效菜品' }
    const dish = await getOwned(openid, 'dishes', id)
    const quantity = Math.min(99, Math.max(1, Math.round(Number(item.quantity) || 1)))
    const selectedSpecs = item.selectedSpecs && typeof item.selectedSpecs === 'object' ? item.selectedSpecs : {}
    const safeSelectedSpecs = {}
    let specPriceAdd = 0
    const specText = []
    ;(dish.specs || []).forEach(group => {
      const selected = selectedSpecs[group.name]
      const option = (group.options || []).find(candidate => candidate.name === selected)
        if (option) {
          specPriceAdd += Number(option.priceAdd || 0)
          specText.push(option.name)
          safeSelectedSpecs[String(group.name).slice(0, 20)] = option.name
        }
    })
    safeItems.push({
      dishId: dish._id,
      name: dish.name,
      price: Math.max(0, Number(dish.price) || 0),
      selectedSpecs: safeSelectedSpecs,
      specPriceAdd,
      specText: specText.join(' / '),
      quantity
    })
  }

  const totalPrice = safeItems.reduce((sum, item) => {
    const specAdd = item.specPriceAdd || 0
    return sum + (item.price + specAdd) * (item.quantity || 1)
  }, 0)

  const orderId = requestDocId(openid, data.requestId)
  let duplicated = false
  await db.runTransaction(async transaction => {
    const ref = transaction.collection('orders').doc(orderId)
    const existing = await ref.get().catch(() => null)
    if (existing && existing.data) {
      if (existing.data.orderedBy !== openid || existing.data.coupleId !== coupleId) throw new Error('订单请求冲突')
      duplicated = true
      return
    }
    await ref.set({ data: {
      coupleId,
      items: safeItems,
      totalPrice,
      note: String(note || '').slice(0, 200),
      status: 'placed',
      orderedBy: openid,
      createdAt: db.serverDate()
    } })
  })
  return { code: 0, id: orderId, totalPrice, items: safeItems, duplicated }
}

async function listOrders(openid, data) {
  const coupleId = await getCoupleId(openid)
  const page = Math.max(1, Math.round(Number(data.page) || 1))
  const pageSize = Math.min(50, Math.max(1, Math.round(Number(data.pageSize) || 20)))
  const res = await db.collection('orders')
    .where({ coupleId })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  return { code: 0, list: res.data }
}

// ===== 自定义分类 =====
async function addCategory(openid, data) {
  const coupleId = await getCoupleId(openid)
  const name = String(data.name || '').trim()
  if (!name || name.length > 20) return { code: -1, message: '分类名称需要 1-20 个字' }
  await assertSafeText(name)
  const res = await db.collection('menu_categories').add({
    data: {
      coupleId,
      name,
      icon: String(data.icon || '🍽️').slice(0, 8),
      sortOrder: Math.min(10000, Math.max(-10000, Number(data.sortOrder) || 0)),
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function listCategories(openid) {
  const coupleId = await getCoupleId(openid)
  const res = await db.collection('menu_categories')
    .where({ coupleId })
    .orderBy('sortOrder', 'asc')
    .get()
  return { code: 0, list: res.data }
}

async function deleteCategory(openid, data) {
  await getOwned(openid, 'menu_categories', data.id)
  await db.collection('menu_categories').doc(data.id).remove()
  return { code: 0 }
}
