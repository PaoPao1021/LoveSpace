const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 尝试获取用户
    let user = null
    try {
      const res = await db.collection('users').doc(openid).get()
      user = res.data
    } catch (e) {
      // 用户不存在，创建新用户
      user = {
        _id: openid,
        nickName: '',
        avatarUrl: '',
        coupleId: '',
        role: '',
        moodToday: null,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
      const { _id, ...userData } = user
      await db.collection('users').doc(openid).set({ data: userData })
    }

    return {
      code: 0,
      openid,
      userInfo: user
    }
  } catch (e) {
    return { code: -1, message: e.message }
  }
}
