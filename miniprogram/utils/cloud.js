/**
 * 云函数调用封装
 */

/**
 * 调用云函数
 */
async function callFunction(name, data = {}, options = {}) {
  try {
    const app = getApp()
    if (app && typeof app.ensureReady === 'function') await app.ensureReady()
    const res = await wx.cloud.callFunction({ name, data })
    const result = res && res.result
    if (!result) throw new Error('服务暂时没有响应')
    if (result.code !== undefined && result.code !== 0) {
      throw new Error(result.message || result.msg || '操作失败')
    }
    return result
  } catch (e) {
    console.error(`云函数 ${name} 调用失败:`, e)
    const message = e && e.message ? e.message : '网络开小差了，请稍后重试'
    if (!options.silent) wx.showToast({ title: message, icon: 'none', duration: 2200 })
    throw e
  }
}

/**
 * 为有副作用的请求生成幂等键，避免用户连点或网络重试造成重复写入。
 */
function createRequestId(prefix = 'request') {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now()}_${random}`
}

/**
 * 上传图片到云存储
 */
async function uploadImage(filePath) {
  const app = getApp()
  if (app && typeof app.ensureReady === 'function') await app.ensureReady()
  const match = String(filePath).match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
  const rawExt = match ? match[1].toLowerCase() : 'jpg'
  const ext = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(rawExt) ? rawExt : 'jpg'
  const coupleId = (app.globalData && app.globalData.coupleId) || 'unbound'
  const cloudPath = `images/${coupleId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
  const res = await wx.cloud.uploadFile({
    cloudPath,
    filePath
  })
  return res.fileID
}

/**
 * 批量上传图片
 */
async function uploadImages(filePaths) {
  const tasks = filePaths.map(path => uploadImage(path))
  return Promise.all(tasks)
}

async function getTempFileURL(fileID) {
  if (!fileID) return ''
  if (!fileID.startsWith('cloud://')) return fileID
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: [fileID] })
    const temp = (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) || ''
    return temp || fileID
  } catch (e) {
    console.error('getTempFileURL failed:', e)
    return fileID
  }
}

module.exports = {
  callFunction,
  createRequestId,
  uploadImage,
  uploadImages,
  getTempFileURL
}
