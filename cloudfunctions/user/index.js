const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertSafeText(content) {
  if (!String(content || '').trim()) return
  try {
    const result = await cloud.openapi.security.msgSecCheck({ content: String(content).slice(0, 20) })
    const suggest = result && result.result && result.result.suggest
    if (suggest && suggest !== 'pass') throw new Error('CONTENT_RISKY')
  } catch (error) {
    const code = Number(error.errCode || error.errcode)
    if (code === 87014 || String(error.message || '').includes('87014') || error.message === 'CONTENT_RISKY') throw new Error('昵称包含不适合发布的信息，请修改后重试')
    console.error('msgSecCheck failed:', error)
    throw new Error('内容安全检查暂时不可用，请稍后重试')
  }
}

exports.main = async (event, context) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const { action, data = {} } = event || {}
    if (!OPENID) return { code: -1, message: '登录状态无效' }
    switch (action) {
      case 'updateProfile': return updateProfile(OPENID, data)
      default: return { code: -1, message: '未知操作' }
    }
  } catch (error) {
    console.error('user failed:', error)
    return { code: -1, message: error.message || '用户服务暂时不可用' }
  }
}

async function updateProfile(openid, data) {
  const updateData = {}
  if (data.nickName !== undefined) {
    const nickName = String(data.nickName).trim()
    if (!nickName || nickName.length > 20) {
      return { code: -1, message: '昵称需要1-20个字符' }
    }
    updateData.nickName = nickName
    await assertSafeText(nickName)
  }
  if (data.avatarUrl !== undefined) {
    const avatarUrl = String(data.avatarUrl || '')
    if (avatarUrl && !avatarUrl.startsWith('cloud://') && !avatarUrl.startsWith('https://')) {
      return { code: -1, message: '头像地址无效' }
    }
    updateData.avatarUrl = avatarUrl
  }
  if (Object.keys(updateData).length === 0) {
    return { code: -1, message: '没有需要更新的内容' }
  }
  updateData.updatedAt = db.serverDate()

  await db.collection('users').doc(openid).update({ data: updateData })
  return { code: 0 }
}
