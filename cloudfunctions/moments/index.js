const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { action, data } = event
  const openid = cloud.getWXContext().OPENID

  switch (action) {
    case 'add': return addMoment(openid, data)
    case 'update': return updateMoment(data)
    case 'delete': return deleteMoment(data)
    case 'list': return listMoments(openid, data)
    case 'get': return getMoment(data)
    case 'random': return randomMoment(openid)
    default: return { code: -1, message: '未知操作' }
  }
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  return user.data.coupleId
}

async function addMoment(openid, data) {
  const coupleId = await getCoupleId(openid)
  const res = await db.collection('moments').add({
    data: {
      coupleId,
      author: openid,
      title: data.title || '',
      content: data.content,
      images: data.images || [],
      voiceFileId: data.voiceFileId || '',
      tags: data.tags || [],
      relatedId: data.relatedId || '',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function updateMoment(data) {
  const { id, ...fields } = data
  await db.collection('moments').doc(id).update({
    data: { ...fields, updatedAt: db.serverDate() }
  })
  return { code: 0 }
}

async function deleteMoment(data) {
  const moment = await db.collection('moments').doc(data.id).get()
  // 删除关联图片
  if (moment.data.images && moment.data.images.length > 0) {
    await cloud.deleteFile({ fileList: moment.data.images })
  }
  await db.collection('moments').doc(data.id).remove()
  return { code: 0 }
}

async function listMoments(openid, data) {
  const coupleId = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }

  const { page = 1, pageSize = 20, tag } = data || {}
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

async function getMoment(data) {
  const res = await db.collection('moments').doc(data.id).get()
  return { code: 0, data: res.data }
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
