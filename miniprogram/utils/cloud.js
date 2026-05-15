/**
 * 云函数调用封装
 */

const db = wx.cloud.database()
const _ = db.command

/**
 * 调用云函数
 */
async function callFunction(name, data = {}) {
  try {
    const res = await wx.cloud.callFunction({ name, data })
    if (res.result && res.result.code === -1) {
      throw new Error(res.result.message || '操作失败')
    }
    return res.result
  } catch (e) {
    console.error(`云函数 ${name} 调用失败:`, e)
    wx.showToast({ title: e.message || '网络错误', icon: 'none' })
    throw e
  }
}

/**
 * 获取当前用户 coupleId
 */
function getCoupleId() {
  const app = getApp()
  return app.globalData.coupleId || ''
}

/**
 * 获取当前用户 openid
 */
function getOpenid() {
  const app = getApp()
  return app.globalData.openid || ''
}

/**
 * 上传图片到云存储
 */
async function uploadImage(filePath) {
  const ext = filePath.split('.').pop()
  const cloudPath = `images/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
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

/**
 * 获取数据库引用
 */
function getDb() {
  return db
}

function getCommand() {
  return _
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
  getCoupleId,
  getOpenid,
  uploadImage,
  uploadImages,
  getTempFileURL,
  getDb,
  getCommand
}
