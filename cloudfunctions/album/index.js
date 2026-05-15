const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { action, data } = event
  const openid = cloud.getWXContext().OPENID

  switch (action) {
    case 'listAlbums': return listAlbums(openid)
    case 'addAlbum': return addAlbum(openid, data)
    case 'updateAlbum': return updateAlbum(data)
    case 'deleteAlbum': return deleteAlbum(data)
    case 'listPhotos': return listPhotos(data)
    case 'addPhotos': return addPhotos(openid, data)
    case 'deletePhoto': return deletePhoto(data)
    case 'toggleFavorite': return toggleFavorite(data)
    default: return { code: -1, message: '未知操作' }
  }
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  return user.data.coupleId
}

async function listAlbums(openid) {
  const coupleId = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }

  const res = await db.collection('albums')
    .where({ coupleId })
    .orderBy('createdAt', 'asc')
    .get()
  return { code: 0, list: res.data }
}

async function addAlbum(openid, data) {
  const coupleId = await getCoupleId(openid)
  const res = await db.collection('albums').add({
    data: {
      coupleId,
      name: data.name,
      coverUrl: '',
      photoCount: 0,
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function updateAlbum(data) {
  const { id, ...fields } = data
  await db.collection('albums').doc(id).update({ data: fields })
  return { code: 0 }
}

async function deleteAlbum(data) {
  // 先删除该相册下所有照片
  const photos = await db.collection('photos')
    .where({ albumId: data.id })
    .get()
  for (const photo of photos.data) {
    await cloud.deleteFile({ fileList: [photo.fileId] })
    if (photo.thumbFileId) await cloud.deleteFile({ fileList: [photo.thumbFileId] })
  }
  await db.collection('photos').where({ albumId: data.id }).remove()
  await db.collection('albums').doc(data.id).remove()
  return { code: 0 }
}

async function listPhotos(data) {
  const { albumId, coupleId, page = 1, pageSize = 20 } = data
  const where = coupleId ? { coupleId } : { albumId }

  const countRes = await db.collection('photos').where(where).count()
  const res = await db.collection('photos')
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

async function addPhotos(openid, data) {
  const coupleId = await getCoupleId(openid)
  const { albumId, photos } = data

  const results = []
  for (const photo of photos) {
    const res = await db.collection('photos').add({
      data: {
        coupleId,
        albumId,
        fileId: photo.fileId,
        thumbFileId: photo.thumbFileId || '',
        description: photo.description || '',
        location: photo.location || '',
        tags: photo.tags || [],
        uploadedBy: openid,
        isFavorite: false,
        createdAt: db.serverDate()
      }
    })
    results.push(res._id)
  }

  // 更新相册封面和数量
  const countRes = await db.collection('photos').where({ albumId }).count()
  await db.collection('albums').doc(albumId).update({
    data: {
      photoCount: countRes.total,
      coverUrl: photos[0].fileId
    }
  })

  return { code: 0, ids: results }
}

async function deletePhoto(data) {
  const photo = await db.collection('photos').doc(data.id).get()
  await cloud.deleteFile({ fileList: [photo.data.fileId] })
  if (photo.data.thumbFileId) {
    await cloud.deleteFile({ fileList: [photo.data.thumbFileId] })
  }
  await db.collection('photos').doc(data.id).remove()

  // 更新相册数量
  const countRes = await db.collection('photos')
    .where({ albumId: photo.data.albumId })
    .count()
  await db.collection('albums').doc(photo.data.albumId).update({
    data: { photoCount: countRes.total }
  })
  return { code: 0 }
}

async function toggleFavorite(data) {
  const photo = await db.collection('photos').doc(data.id).get()
  await db.collection('photos').doc(data.id).update({
    data: { isFavorite: !photo.data.isFavorite }
  })
  return { code: 0, isFavorite: !photo.data.isFavorite }
}
