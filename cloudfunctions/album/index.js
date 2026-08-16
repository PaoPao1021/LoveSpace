const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertSafeText(...values) {
  const content = values.map(value => String(value || '').trim()).filter(Boolean).join('\n').slice(0, 3000)
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
      case 'listAlbums': return listAlbums(openid)
      case 'addAlbum': return addAlbum(openid, data)
      case 'updateAlbum': return updateAlbum(openid, data)
      case 'deleteAlbum': return deleteAlbum(openid, data)
      case 'listPhotos': return listPhotos(openid, data)
      case 'addPhotos': return addPhotos(openid, data)
      case 'deletePhoto': return deletePhoto(openid, data)
      case 'toggleFavorite': return toggleFavorite(openid, data)
      default: return { code: -1, message: '未知操作' }
    }
  } catch (error) {
    console.error('album failed:', error)
    return { code: -1, message: error.message || '相册服务暂时不可用' }
  }
}

async function deleteCloudFiles(fileIds) {
  const unique = [...new Set(fileIds.filter(id => String(id || '').startsWith('cloud://')))]
  for (let index = 0; index < unique.length; index += 50) {
    await cloud.deleteFile({ fileList: unique.slice(index, index + 50) })
  }
}

function safeImageUrl(value) {
  const url = String(value || '')
  return !url || url.startsWith('cloud://') || url.startsWith('https://') ? url : ''
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  return (user.data && user.data.coupleId) || ''
}

async function getOwned(openid, collection, id) {
  if (!id) throw new Error('缺少记录 ID')
  const coupleId = await getCoupleId(openid)
  if (!coupleId) throw new Error('请先绑定你们的空间')
  const result = await db.collection(collection).doc(id).get()
  if (!result.data || result.data.coupleId !== coupleId) throw new Error('无权操作该记录')
  return result.data
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
  if (!coupleId) return { code: -1, message: '请先绑定你们的空间' }
  const name = String(data.name || '').trim()
  if (!name || name.length > 30) return { code: -1, message: '相册名称需要 1-30 个字' }
  await assertSafeText(name)
  const res = await db.collection('albums').add({
    data: {
      coupleId,
      name,
      coverUrl: '',
      photoCount: 0,
      createdAt: db.serverDate()
    }
  })
  return { code: 0, id: res._id }
}

async function updateAlbum(openid, data) {
  await getOwned(openid, 'albums', data.id)
  const fields = {}
  if (data.name !== undefined) {
    const name = String(data.name).trim()
    if (!name || name.length > 30) return { code: -1, message: '相册名称需要 1-30 个字' }
    fields.name = name
  }
  if (data.coverUrl !== undefined) fields.coverUrl = safeImageUrl(data.coverUrl)
  if (!Object.keys(fields).length) return { code: -1, message: '没有可更新的内容' }
  await assertSafeText(fields.name)
  const { id } = data
  await db.collection('albums').doc(id).update({ data: fields })
  return { code: 0 }
}

async function deleteAlbum(openid, data) {
  await getOwned(openid, 'albums', data.id)
  // 分页清理，避免相册超过单次查询上限后留下孤儿文件。
  while (true) {
    const photos = await db.collection('photos').where({ albumId: data.id }).limit(100).get()
    if (!photos.data.length) break
    await deleteCloudFiles(photos.data.flatMap(photo => [photo.fileId, photo.thumbFileId]))
    for (const photo of photos.data) await db.collection('photos').doc(photo._id).remove()
  }
  await db.collection('albums').doc(data.id).remove()
  return { code: 0 }
}

async function listPhotos(openid, data) {
  const coupleId = await getCoupleId(openid)
  const albumId = data.albumId
  const page = Math.max(1, Math.round(Number(data.page) || 1))
  const pageSize = Math.min(50, Math.max(1, Math.round(Number(data.pageSize) || 20)))
  if (albumId) await getOwned(openid, 'albums', albumId)
  const where = albumId ? { albumId, coupleId } : { coupleId }

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
  await getOwned(openid, 'albums', albumId)
  if (!Array.isArray(photos) || !photos.length || photos.length > 20) return { code: -1, message: '请选择 1-20 张照片' }
  const normalizedPhotos = photos.map(photo => ({
    fileId: safeImageUrl(photo.fileId),
    thumbFileId: safeImageUrl(photo.thumbFileId),
    description: String(photo.description || '').slice(0, 300),
    location: String(photo.location || '').slice(0, 100),
    tags: Array.isArray(photo.tags) ? photo.tags.map(tag => String(tag).trim().slice(0, 20)).filter(Boolean).slice(0, 10) : []
  }))
  if (normalizedPhotos.some(photo => !photo.fileId)) return { code: -1, message: '照片地址无效' }
  await assertSafeText(...normalizedPhotos.flatMap(photo => [photo.description, photo.location, ...photo.tags]))

  const results = []
  for (const photo of normalizedPhotos) {
    const res = await db.collection('photos').add({
      data: {
        coupleId,
        albumId,
        fileId: photo.fileId,
        thumbFileId: photo.thumbFileId || '',
        description: photo.description,
        location: photo.location,
        tags: photo.tags,
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
      coverUrl: normalizedPhotos[0].fileId
    }
  })

  return { code: 0, ids: results }
}

async function deletePhoto(openid, data) {
  const owned = await getOwned(openid, 'photos', data.id)
  const photo = { data: owned }
  await deleteCloudFiles([owned.fileId, owned.thumbFileId])
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

async function toggleFavorite(openid, data) {
  const owned = await getOwned(openid, 'photos', data.id)
  const photo = { data: owned }
  await db.collection('photos').doc(data.id).update({
    data: { isFavorite: !photo.data.isFavorite }
  })
  return { code: 0, isFavorite: !photo.data.isFavorite }
}
