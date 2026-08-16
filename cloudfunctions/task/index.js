const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const crypto = require('crypto')
const ORDER_TEMPLATE_ID = process.env.ORDER_TEMPLATE_ID || 'Q1IwjM7zcg5qC16G5sTmNBCfMkTZ6AYDeyZhqm3nTH8'

async function assertSafeText(...values) {
  const content = values.map(value => String(value || '').trim()).filter(Boolean).join('\n').slice(0, 1000)
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
      case 'add': return addTask(openid, data)
      case 'complete': return completeTask(openid, data)
      case 'list': return listTasks(openid, data)
      case 'detail': return getTaskDetail(openid, data)
      case 'delete': return deleteTask(openid, data)
      default: return { code: -1, message: '未知操作' }
    }
  } catch (error) {
    console.error('task failed:', error)
    return { code: -1, message: error.message || '任务服务暂时不可用' }
  }
}

function hashId(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32)
}

function balanceDocId(coupleId, userId) {
  return hashId(`balance:${coupleId}:${userId}`)
}

async function ensureBalance(coupleId, userId) {
  const id = balanceDocId(coupleId, userId)
  try {
    const existing = await db.collection('point_balances').doc(id).get()
    if (existing.data) return
  } catch (error) {}

  let score = 0
  let skip = 0
  while (true) {
    const page = await db.collection('points').where({ coupleId, toUser: userId }).skip(skip).limit(100).get()
    score += page.data.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    if (page.data.length < 100) break
    skip += 100
  }
  await db.runTransaction(async transaction => {
    const ref = transaction.collection('point_balances').doc(id)
    const current = await ref.get().catch(() => null)
    if (!current || !current.data) {
      await ref.set({ data: { coupleId, userId, score, updatedAt: db.serverDate() } })
    }
  })
}

async function getCoupleId(openid) {
  const user = await db.collection('users').doc(openid).get()
  return user.data.coupleId
}

async function getPartnerId(openid) {
  const user = await db.collection('users').doc(openid).get()
  if (!user.data.coupleId) return null
  const couple = await db.collection('couples').doc(user.data.coupleId).get()
  return couple.data.creator === openid ? couple.data.partner : couple.data.creator
}

async function getNickName(openid) {
  try {
    const user = await db.collection('users').doc(openid).get()
    return user.data.nickName || '你的另一半'
  } catch (e) {
    return '你的另一半'
  }
}

async function addTask(openid, data) {
  const coupleId = await getCoupleId(openid)
  const title = String(data.title || '').trim()
  const rewardPoints = Math.min(100, Math.max(0, Math.round(Number(data.rewardPoints) || 0)))
  const assignee = ['me', 'partner', 'both'].includes(data.assignee) ? data.assignee : 'both'
  if (!coupleId) return { code: -1, message: '请先绑定你们的空间' }
  if (!title || title.length > 50) return { code: -1, message: '任务标题需要 1-50 个字' }
  await assertSafeText(title, data.description)
  const res = await db.collection('tasks').add({
    data: {
      coupleId,
      title,
      description: String(data.description || '').slice(0, 500),
      type: data.type || 'single',
      assignee,
      rewardPoints,
      createdBy: openid,
      status: 'pending',
      completedBy: '',
      dueDate: data.dueDate || '',
      createdAt: db.serverDate()
    }
  })

  // 如果指派给对方或双方，发送通知
  if (assignee === 'partner' || assignee === 'both') {
    const partnerId = await getPartnerId(openid)
    if (partnerId) {
      const senderName = await getNickName(openid)
      await db.collection('notifications').add({
        data: {
          coupleId,
          toUser: partnerId,
          fromUser: openid,
          fromName: senderName,
          type: 'task',
          title: '新任务',
          content: `${senderName}给你指派了一个任务：${title}`,
          relatedId: res._id,
          read: false,
          createdAt: db.serverDate()
        }
      })

      // 发送订阅消息
      try {
        if (!ORDER_TEMPLATE_ID) return { code: 0, id: res._id }
        await cloud.openapi.subscribeMessage.send({
          touser: partnerId,
          templateId: ORDER_TEMPLATE_ID,
          page: 'pages/index/index',
          data: {
            thing1: { value: '新任务：' + title.slice(0, 15) },
            thing2: { value: (data.description || '快去看看').slice(0, 20) },
            amount3: { value: '+' + rewardPoints + '积分' }
          }
        })
      } catch (e) {
        console.log('订阅消息发送跳过:', e.message)
      }
    }
  }

  return { code: 0, id: res._id }
}

async function completeTask(openid, data) {
  if (!data.id) return { code: -1, message: '缺少任务ID' }
  const taskRes = await db.collection('tasks').doc(data.id).get()
  const task = taskRes.data
  const coupleId = await getCoupleId(openid)
  if (!task || task.coupleId !== coupleId) return { code: -1, message: '无权操作该任务' }
  if (task.status === 'completed') {
    return task.completedBy === openid
      ? { code: 0, duplicated: true }
      : { code: -1, message: '任务已由对方完成' }
  }
  const partnerId = await getPartnerId(openid)
  const canComplete = task.assignee === 'both' ||
    (task.assignee === 'me' && task.createdBy === openid) ||
    (task.assignee === 'partner' && task.createdBy === partnerId)
  if (!canComplete) return { code: -1, message: '该任务没有指派给你' }

  const rewardPoints = Math.min(100, Math.max(0, Math.round(Number(task.rewardPoints) || 0)))
  if (rewardPoints > 0) await ensureBalance(coupleId, openid)
  await db.runTransaction(async transaction => {
    const taskRef = transaction.collection('tasks').doc(data.id)
    const current = await taskRef.get()
    if (!current.data || current.data.coupleId !== coupleId) throw new Error('无权操作该任务')
    if (current.data.status === 'completed') {
      if (current.data.completedBy === openid) return
      throw new Error('任务已由对方完成')
    }
    await taskRef.update({
      data: {
        status: 'completed',
        completedBy: openid,
        completedAt: db.serverDate()
      }
    })

    // 任务状态、奖励流水和余额必须同时成功。
    if (rewardPoints > 0) {
      const pointRef = transaction.collection('points').doc(hashId(`task-reward:${data.id}`))
      const point = await pointRef.get().catch(() => null)
      if (point && point.data) throw new Error('任务奖励已发放')
      await pointRef.set({ data: {
        coupleId,
        fromUser: openid,
        toUser: openid,
        amount: rewardPoints,
        reason: `完成任务: ${task.title}`,
        note: '',
        createdAt: db.serverDate()
      } })
      await transaction.collection('point_balances').doc(balanceDocId(coupleId, openid)).update({
        data: { score: _.inc(rewardPoints), updatedAt: db.serverDate() }
      })
    }
  })

  // 通知创建者任务已完成
  if (task.createdBy && task.createdBy !== openid) {
    const completerName = await getNickName(openid)
    const notificationId = hashId(`task-complete:${data.id}:${task.createdBy}`)
    let exists = false
    try {
      const current = await db.collection('notifications').doc(notificationId).get()
      exists = Boolean(current.data)
    } catch (error) {}
    if (!exists) await db.collection('notifications').doc(notificationId).set({ data: {
        coupleId,
        toUser: task.createdBy,
        fromUser: openid,
        fromName: completerName,
        type: 'task_complete',
        title: '任务完成',
        content: `${completerName}完成了任务：${task.title}`,
        relatedId: data.id,
        read: false,
        createdAt: db.serverDate()
    } })
  }

  return { code: 0 }
}

async function listTasks(openid, data) {
  const coupleId = await getCoupleId(openid)
  if (!coupleId) return { code: 0, list: [] }

  const { status } = data || {}
  let where = { coupleId }
  if (status) where.status = status

  const res = await db.collection('tasks')
    .where(where)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()
  return { code: 0, list: res.data }
}

async function getTaskDetail(openid, data) {
  const res = await db.collection('tasks').doc(data.id).get()
  const task = res.data
  const coupleId = await getCoupleId(openid)
  if (!task || task.coupleId !== coupleId) return { code: -1, message: '无权查看该任务' }
  // 获取创建者和完成者昵称
  let creatorName = ''
  let completerName = ''
  if (task.createdBy) {
    try {
      const creator = await db.collection('users').doc(task.createdBy).get()
      creatorName = creator.data.nickName || ''
    } catch (e) {}
  }
  if (task.completedBy) {
    try {
      const completer = await db.collection('users').doc(task.completedBy).get()
      completerName = completer.data.nickName || ''
    } catch (e) {}
  }
  return {
    code: 0,
    data: {
      ...task,
      creatorName,
      completerName,
      isCreator: task.createdBy === openid,
      isCompleter: task.completedBy === openid
    }
  }
}

async function deleteTask(openid, data) {
  const taskRes = await db.collection('tasks').doc(data.id).get()
  const coupleId = await getCoupleId(openid)
  if (!taskRes.data || taskRes.data.coupleId !== coupleId || taskRes.data.createdBy !== openid) {
    return { code: -1, message: '只有创建者可以删除' }
  }
  await db.collection('tasks').doc(data.id).remove()
  return { code: 0 }
}
