const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data } = event

  switch (action) {
    case 'updateProfile': return updateProfile(OPENID, data)
    default: return { code: -1, message: '未知操作' }
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
  }
  if (data.avatarUrl !== undefined) {
    updateData.avatarUrl = data.avatarUrl
  }
  if (Object.keys(updateData).length === 0) {
    return { code: -1, message: '没有需要更新的内容' }
  }
  updateData.updatedAt = db.serverDate()

  await db.collection('users').doc(openid).update({ data: updateData })
  return { code: 0 }
}
