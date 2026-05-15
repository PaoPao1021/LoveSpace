const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { action, data } = event
  const openid = cloud.getWXContext().OPENID

  switch (action) {
    case 'add': return addDish(openid, data)
    case 'update': return updateDish(data)
    case 'delete': return deleteDish(data)
    case 'list': return listDishes(openid, data)
    case 'get': return getDish(data)
    case 'recommend': return getRecommendation(openid, data)
    case 'markEaten': return markEaten(data)
    case 'addOrder': return addOrder(openid, data)
    case 'listOrders': return listOrders(openid, data)
    case 'addCategory': return addCategory(openid, data)
    case 'listCategories': return listCategories(openid)
    case 'deleteCategory': return deleteCategory(data)
    default: return { code: -1, message: '未知操作' }
  }
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  return user.data.coupleId
}

async function addDish(openid, data) {
  const coupleId = await getCoupleId(openid)
  const res = await db.collection('dishes').add({
    data: {
      coupleId,
      name: data.name,
      category: data.category || '主食',
      imageUrl: data.imageUrl || '',
      tags: data.tags || [],
      rating: data.rating || 5,
      lastEatenAt: '',
      location: data.location || '',
      note: data.note || '',
      price: data.price || 0,
      description: data.description || '',
      specs: data.specs || [],
      isAvailable: data.isAvailable !== false,
      addedBy: openid,
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function updateDish(data) {
  const { id, ...fields } = data
  await db.collection('dishes').doc(id).update({ data: fields })
  return { code: 0 }
}

async function deleteDish(data) {
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
  if (keyword) where.name = db.command.RegExp({ regexp: keyword, options: 'i' })

  const res = await db.collection('dishes')
    .where(where)
    .orderBy('rating', 'desc')
    .limit(100)
    .get()
  return { code: 0, list: res.data }
}

async function getDish(data) {
  const res = await db.collection('dishes').doc(data.id).get()
  return { code: 0, data: res.data }
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

async function markEaten(data) {
  await db.collection('dishes').doc(data.id).update({
    data: { lastEatenAt: new Date().toISOString().slice(0, 10) }
  })
  return { code: 0 }
}

// ===== 订单 =====
async function addOrder(openid, data) {
  const coupleId = await getCoupleId(openid)
  const { items, note } = data
  if (!items || items.length === 0) return { code: -1, message: '请选择菜品' }

  const totalPrice = items.reduce((sum, item) => {
    const specAdd = item.specPriceAdd || 0
    return sum + (item.price + specAdd) * (item.quantity || 1)
  }, 0)

  const res = await db.collection('orders').add({
    data: {
      coupleId,
      items,
      totalPrice,
      note: note || '',
      status: 'placed',
      orderedBy: openid,
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function listOrders(openid, data) {
  const coupleId = await getCoupleId(openid)
  const { page = 1, pageSize = 20 } = data || {}
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
  const res = await db.collection('menu_categories').add({
    data: {
      coupleId,
      name: data.name,
      icon: data.icon || '🍽️',
      sortOrder: data.sortOrder || 0,
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

async function deleteCategory(data) {
  await db.collection('menu_categories').doc(data.id).remove()
  return { code: 0 }
}
