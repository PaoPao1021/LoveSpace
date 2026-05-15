const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { action, data } = event
  const openid = cloud.getWXContext().OPENID

  switch (action) {
    case 'add': return addTask(openid, data)
    case 'complete': return completeTask(openid, data)
    case 'list': return listTasks(openid, data)
    case 'detail': return getTaskDetail(openid, data)
    case 'delete': return deleteTask(openid, data)
    default: return { code: -1, message: '未知操作' }
  }
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
  const res = await db.collection('tasks').add({
    data: {
      coupleId,
      title: data.title,
      description: data.description || '',
      type: data.type || 'single',
      assignee: data.assignee || 'both',
      rewardPoints: data.rewardPoints || 5,
      createdBy: openid,
      status: 'pending',
      completedBy: '',
      dueDate: data.dueDate || '',
      createdAt: db.serverDate()
    }
  })

  // 如果指派给对方或双方，发送通知
  if (data.assignee === 'partner' || data.assignee === 'both') {
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
          content: `${senderName}给你指派了一个任务：${data.title}`,
          relatedId: res._id,
          read: false,
          createdAt: db.serverDate()
        }
      })

      // 发送订阅消息
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: partnerId,
          templateId: 'Q1IwjM7zcg5qC16G5sTmNBCfMkTZ6AYDeyZhqm3nTH8',
          page: 'pages/index/index',
          data: {
            thing1: { value: '新任务：' + data.title.slice(0, 15) },
            thing2: { value: (data.description || '快去看看').slice(0, 20) },
            amount3: { value: '+' + (data.rewardPoints || 5) + '积分' }
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
  const taskRes = await db.collection('tasks').doc(data.id).get()
  const task = taskRes.data

  // 检查是否已完成
  if (task.status === 'completed') {
    return { code: -1, message: '任务已完成' }
  }

  await db.collection('tasks').doc(data.id).update({
    data: {
      status: 'completed',
      completedBy: openid,
      completedAt: db.serverDate()
    }
  })

  // 自动加积分（给完成者加分）
  if (task.rewardPoints > 0) {
    const coupleId = await getCoupleId(openid)
    await db.collection('points').add({
      data: {
        coupleId,
        fromUser: openid,
        toUser: openid,
        amount: task.rewardPoints,
        reason: `完成任务: ${task.title}`,
        note: '',
        createdAt: db.serverDate()
      }
    })
  }

  // 通知创建者任务已完成
  if (task.createdBy && task.createdBy !== openid) {
    const completerName = await getNickName(openid)
    const coupleId = await getCoupleId(openid)
    await db.collection('notifications').add({
      data: {
        coupleId,
        toUser: task.createdBy,
        fromUser: openid,
        fromName: completerName,
        type: 'task_complete',
        title: '任务完成',
        content: `${completerName}完成了任务：${task.title}`,
        read: false,
        createdAt: db.serverDate()
      }
    })
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
  if (taskRes.data.createdBy !== openid) {
    return { code: -1, message: '只有创建者可以删除' }
  }
  await db.collection('tasks').doc(data.id).remove()
  return { code: 0 }
}
