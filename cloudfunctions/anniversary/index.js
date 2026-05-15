const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { action, data } = event
  const openid = cloud.getWXContext().OPENID

  switch (action) {
    case 'add': return addAnniversary(openid, data)
    case 'update': return updateAnniversary(data)
    case 'delete': return deleteAnniversary(data)
    case 'list': return listAnniversaries(openid)
    case 'get': return getAnniversary(data)
    default: return { code: -1, message: '未知操作' }
  }
}

async function addAnniversary(openid, data) {
  const user = await db.collection('users').doc(openid).get()
  if (!user.data.coupleId) return { code: -1, message: '未绑定' }

  const res = await db.collection('anniversaries').add({
    data: {
      coupleId: user.data.coupleId,
      ...data,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function updateAnniversary(data) {
  const { id, ...fields } = data
  await db.collection('anniversaries').doc(id).update({
    data: { ...fields, updatedAt: db.serverDate() }
  })
  return { code: 0 }
}

async function deleteAnniversary(data) {
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

async function getAnniversary(data) {
  const res = await db.collection('anniversaries').doc(data.id).get()
  return { code: 0, data: res.data }
}
