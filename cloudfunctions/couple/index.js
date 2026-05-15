const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, data } = event

  switch (action) {
    case 'create':
      return createCouple(openid, data)
    case 'join':
      return joinCouple(openid, data)
    case 'getInfo':
      return getCoupleInfo(openid)
    case 'dissolve':
      return dissolveCouple(openid)
    default:
      return { code: -1, message: '未知操作' }
  }
}

// 创建情侣关系（生成邀请码）
async function createCouple(openid, data) {
  const { startDate, nickName, avatarUrl } = data

  // 检查是否已绑定
  const userRes = await db.collection('users').doc(openid).get()
  if (userRes.data.coupleId) {
    return { code: -1, message: '已经绑定过了' }
  }

  // 生成6位邀请码
  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase()

  // 创建情侣关系
  const coupleRes = await db.collection('couples').add({
    data: {
      creator: openid,
      partner: '',
      startDate,
      status: 'active',
      inviteCode,
      createdAt: db.serverDate()
    }
  })

  const coupleId = coupleRes._id

  // 更新创建者信息
  await db.collection('users').doc(openid).update({
    data: {
      nickName,
      avatarUrl,
      coupleId,
      role: 'creator',
      updatedAt: db.serverDate()
    }
  })

  // 创建默认相册
  const defaultAlbums = ['日常', '约会', '旅行', '美食', '自拍', '节日']
  for (const name of defaultAlbums) {
    await db.collection('albums').add({
      data: {
        coupleId,
        name,
        coverUrl: '',
        photoCount: 0,
        createdAt: db.serverDate()
      }
    })
  }

  // 创建默认纪念日
  await db.collection('anniversaries').add({
    data: {
      coupleId,
      name: '在一起纪念日',
      date: startDate,
      type: 'together',
      coverUrl: '',
      note: '',
      isRepeat: true,
      remindDaysBefore: 3,
      isTop: true,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })

  return { code: 0, coupleId, inviteCode }
}

// 加入情侣关系
async function joinCouple(openid, data) {
  const { inviteCode, nickName, avatarUrl } = data

  // 查找邀请码对应的couple
  const coupleRes = await db.collection('couples')
    .where({ inviteCode, status: 'active', partner: '' })
    .get()

  if (coupleRes.data.length === 0) {
    return { code: -1, message: '邀请码无效或已使用' }
  }

  const couple = coupleRes.data[0]

  // 检查是否已绑定
  const userRes = await db.collection('users').doc(openid).get()
  if (userRes.data.coupleId) {
    return { code: -1, message: '你已经绑定过了' }
  }

  // 更新couple
  await db.collection('couples').doc(couple._id).update({
    data: { partner: openid }
  })

  // 更新加入者信息
  await db.collection('users').doc(openid).update({
    data: {
      nickName,
      avatarUrl,
      coupleId: couple._id,
      role: 'partner',
      updatedAt: db.serverDate()
    }
  })

  return { code: 0, coupleId: couple._id }
}

// 获取情侣信息
async function getCoupleInfo(openid) {
  const userRes = await db.collection('users').doc(openid).get()
  const user = userRes.data

  if (!user.coupleId) {
    return { code: 0, couple: null, user }
  }

  const coupleRes = await db.collection('couples').doc(user.coupleId).get()
  const couple = coupleRes.data

  // 获取对方信息
  const partnerId = couple.creator === openid ? couple.partner : couple.creator
  let partner = null
  if (partnerId) {
    const partnerRes = await db.collection('users').doc(partnerId).get()
    partner = partnerRes.data
  }

  // 服务端转换 cloud:// 头像为临时 HTTPS 链接
  const fileIDs = []
  if (user && user.avatarUrl && user.avatarUrl.startsWith('cloud://')) {
    fileIDs.push(user.avatarUrl)
  }
  if (partner && partner.avatarUrl && partner.avatarUrl.startsWith('cloud://')) {
    fileIDs.push(partner.avatarUrl)
  }

  if (fileIDs.length > 0) {
    try {
      const tempRes = await cloud.getTempFileURL({ fileList: fileIDs })
      if (tempRes.fileList) {
        tempRes.fileList.forEach(item => {
          if (item.tempFileURL) {
            if (user && user.avatarUrl === item.fileID) user.avatarUrl = item.tempFileURL
            if (partner && partner.avatarUrl === item.fileID) partner.avatarUrl = item.tempFileURL
          }
        })
      }
    } catch (e) {
      console.error('getTempFileURL in getCoupleInfo failed:', e)
    }
  }

  return { code: 0, couple, user, partner }
}

// 解除绑定
async function dissolveCouple(openid) {
  const userRes = await db.collection('users').doc(openid).get()
  const coupleId = userRes.data.coupleId

  if (!coupleId) {
    return { code: -1, message: '未绑定' }
  }

  await db.collection('couples').doc(coupleId).update({
    data: { status: 'dissolved' }
  })

  // 清除双方coupleId
  const coupleRes = await db.collection('couples').doc(coupleId).get()
  const { creator, partner } = coupleRes.data

  await db.collection('users').doc(creator).update({
    data: { coupleId: '', role: '', updatedAt: db.serverDate() }
  })
  if (partner) {
    await db.collection('users').doc(partner).update({
      data: { coupleId: '', role: '', updatedAt: db.serverDate() }
    })
  }

  return { code: 0 }
}
