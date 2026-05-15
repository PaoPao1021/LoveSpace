const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { action, data } = event
  const openid = cloud.getWXContext().OPENID

  switch (action) {
    case 'add': return addWish(openid, data)
    case 'update': return updateWish(data)
    case 'delete': return deleteWish(data)
    case 'list': return listWishes(openid)
    default: return { code: -1, message: '未知操作' }
  }
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  return user.data.coupleId
}

async function addWish(openid, data) {
  const coupleId = await getCoupleId(openid)
  const res = await db.collection('wishes').add({
    data: {
      coupleId,
      title: data.title,
      description: data.description || '',
      imageUrl: data.imageUrl || '',
      status: 'todo',
      completedAt: '',
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function updateWish(data) {
  const { id, ...fields } = data
  if (fields.status === 'done') fields.completedAt = new Date().toISOString()
  await db.collection('wishes').doc(id).update({ data: fields })
  return { code: 0 }
}

async function deleteWish(data) {
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
