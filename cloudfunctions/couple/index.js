const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const crypto = require('crypto')

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

function createInviteCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const bytes = crypto.randomBytes(6)
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')
}

function hashId(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32)
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3])
}

function todayInChina() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function normalizeProfile(data) {
  const nickName = String(data.nickName || '').trim()
  if (!nickName || nickName.length > 20) throw new Error('昵称需要 1-20 个字')
  const avatarUrl = String(data.avatarUrl || '')
  if (avatarUrl && !avatarUrl.startsWith('cloud://') && !avatarUrl.startsWith('https://')) throw new Error('头像地址无效')
  return { nickName, avatarUrl }
}

exports.main = async (event, context) => {
  try {
    const openid = cloud.getWXContext().OPENID
    const { action, data = {} } = event || {}
    if (!openid) return { code: -1, message: '登录状态无效' }
    switch (action) {
      case 'create': return createCouple(openid, data)
      case 'join': return joinCouple(openid, data)
      case 'getInfo': return getCoupleInfo(openid)
      case 'dissolve': return dissolveCouple(openid)
      default: return { code: -1, message: '未知操作' }
    }
  } catch (error) {
    console.error('couple failed:', error)
    return { code: -1, message: error.message || '情侣空间服务暂时不可用' }
  }
}

async function ensureDefaults(coupleId, startDate) {
  const defaultAlbums = ['日常', '约会', '旅行', '美食', '自拍', '节日']
  for (const name of defaultAlbums) {
    const id = hashId(`default-album:${coupleId}:${name}`)
    let exists = false
    try {
      const current = await db.collection('albums').doc(id).get()
      exists = Boolean(current.data)
    } catch (error) {}
    if (!exists) {
      await db.collection('albums').doc(id).set({ data: {
        coupleId,
        name,
        coverUrl: '',
        photoCount: 0,
        isDefault: true,
        createdAt: db.serverDate()
      } })
    }
  }

  const anniversaryId = hashId(`default-anniversary:${coupleId}`)
  let anniversaryExists = false
  try {
    const current = await db.collection('anniversaries').doc(anniversaryId).get()
    anniversaryExists = Boolean(current.data)
  } catch (error) {}
  if (!anniversaryExists) {
    await db.collection('anniversaries').doc(anniversaryId).set({ data: {
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
    } })
  }
}

// 创建情侣关系（生成邀请码）
async function createCouple(openid, data) {
  const { nickName, avatarUrl } = normalizeProfile(data)
  await assertSafeText(nickName)
  const startDate = String(data.startDate || '')
  if (!isValidDate(startDate) || startDate > todayInChina()) {
    return { code: -1, message: '请选择正确的在一起日期' }
  }

  // 生成6位邀请码
  let inviteCode = createInviteCode()
  for (let i = 0; i < 3; i++) {
    const duplicate = await db.collection('couples').where({ inviteCode, status: 'active' }).count()
    if (!duplicate.total) break
    inviteCode = createInviteCode()
  }

  const coupleId = hashId(`couple:${openid}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`)

  // 关系、用户归属和邀请码锁必须同时写入。
  await db.runTransaction(async transaction => {
    const userRef = transaction.collection('users').doc(openid)
    const coupleRef = transaction.collection('couples').doc(coupleId)
    const inviteRef = transaction.collection('couple_invites').doc(inviteCode)
    const [user, invite] = await Promise.all([userRef.get(), inviteRef.get().catch(() => null)])
    if (!user.data) throw new Error('用户信息不存在，请重新进入小程序')
    if (user.data.coupleId) throw new Error('已经绑定过了')
    if (invite && invite.data) throw new Error('邀请码生成冲突，请重试')

    await coupleRef.set({ data: {
      creator: openid,
      partner: '',
      startDate,
      status: 'active',
      inviteCode,
      schemaVersion: 2,
      createdAt: db.serverDate()
    } })
    await userRef.update({ data: {
      nickName,
      avatarUrl,
      coupleId,
      role: 'creator',
      updatedAt: db.serverDate()
    } })
    await inviteRef.set({ data: {
      coupleId,
      status: 'active',
      createdBy: openid,
      createdAt: db.serverDate()
    } })
  })

  let defaultsReady = true
  try {
    await ensureDefaults(coupleId, startDate)
  } catch (error) {
    defaultsReady = false
    console.error('初始化默认数据失败，将在下次获取空间时重试:', error)
  }

  return { code: 0, coupleId, inviteCode, defaultsReady }
}

// 加入情侣关系
async function joinCouple(openid, data) {
  const { nickName, avatarUrl } = normalizeProfile(data)
  await assertSafeText(nickName)
  const inviteCode = String(data.inviteCode || '').trim().toUpperCase()
  if (!/^[23456789A-HJ-NP-Z]{6}$/.test(inviteCode)) return { code: -1, message: '邀请码格式不正确' }

  // 查找邀请码对应的couple
  const coupleRes = await db.collection('couples')
    .where({ inviteCode, status: 'active', partner: '' })
    .get()

  if (coupleRes.data.length === 0) {
    return { code: -1, message: '邀请码无效或已使用' }
  }

  const couple = coupleRes.data[0]
  if (couple.creator === openid) return { code: -1, message: '不能加入自己创建的空间' }

  // 检查是否已绑定
  const userRes = await db.collection('users').doc(openid).get()
  if (userRes.data.coupleId) {
    return { code: -1, message: '你已经绑定过了' }
  }

  // 更新couple
  await db.runTransaction(async transaction => {
    const coupleRef = transaction.collection('couples').doc(couple._id)
    const userRef = transaction.collection('users').doc(openid)
    const [currentCouple, currentUser] = await Promise.all([coupleRef.get(), userRef.get()])
    if (!currentCouple.data || currentCouple.data.status !== 'active') throw new Error('邀请码无效')
    if (currentCouple.data.creator === openid) throw new Error('不能加入自己创建的空间')
    if (currentCouple.data.partner) throw new Error('邀请码已被使用')
    if (currentUser.data.coupleId) throw new Error('你已经绑定过了')
    await coupleRef.update({ data: { partner: openid } })
    await userRef.update({
      data: {
        nickName,
        avatarUrl,
        coupleId: couple._id,
        role: 'partner',
        updatedAt: db.serverDate()
      }
    })
    const inviteRef = transaction.collection('couple_invites').doc(inviteCode)
    const invite = await inviteRef.get().catch(() => null)
    if (invite && invite.data) await inviteRef.update({ data: { status: 'used', usedBy: openid, usedAt: db.serverDate() } })
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
  if (!couple || (couple.creator !== openid && couple.partner !== openid) || couple.status !== 'active') {
    return { code: -1, message: '情侣空间状态异常，请联系客服处理' }
  }

  if (couple.schemaVersion === 2) {
    try { await ensureDefaults(user.coupleId, couple.startDate) } catch (error) { console.error('修复默认数据失败:', error) }
  }

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

  const coupleRes = await db.collection('couples').doc(coupleId).get()
  const { creator, partner } = coupleRes.data
  if (creator !== openid && partner !== openid) return { code: -1, message: '无权解除该空间' }

  await db.runTransaction(async transaction => {
    const coupleRef = transaction.collection('couples').doc(coupleId)
    const current = await coupleRef.get()
    if (!current.data || current.data.status !== 'active') throw new Error('空间已经解除')
    if (current.data.creator !== openid && current.data.partner !== openid) throw new Error('无权解除该空间')
    await coupleRef.update({ data: { status: 'dissolved', dissolvedAt: db.serverDate(), dissolvedBy: openid } })
    await transaction.collection('users').doc(current.data.creator).update({
      data: { coupleId: '', role: '', updatedAt: db.serverDate() }
    })
    if (current.data.partner) {
      await transaction.collection('users').doc(current.data.partner).update({
        data: { coupleId: '', role: '', updatedAt: db.serverDate() }
      })
    }
    if (current.data.inviteCode) {
      const inviteRef = transaction.collection('couple_invites').doc(current.data.inviteCode)
      const invite = await inviteRef.get().catch(() => null)
      if (invite && invite.data) await inviteRef.update({ data: { status: 'dissolved', updatedAt: db.serverDate() } })
    }
  })

  return { code: 0 }
}
