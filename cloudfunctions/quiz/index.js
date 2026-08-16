const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const crypto = require('crypto')

const QUESTION_BANK = {
  'TA最喜欢吃什么水果？': ['草莓', '西瓜', '芒果', '葡萄'],
  'TA最讨厌什么行为？': ['迟到', '撒谎', '不回消息', '敷衍'],
  'TA最喜欢什么颜色？': ['粉色', '蓝色', '白色', '紫色'],
  'TA的压力解压方式是？': ['睡觉', '吃东西', '听歌', '运动'],
  'TA的理想约会是？': ['看电影', '逛街', '在家待着', '旅行']
}

async function getContext(openid) {
  const user = await db.collection('users').doc(openid).get()
  const coupleId = user.data && user.data.coupleId
  if (!coupleId) throw new Error('请先绑定你们的空间')
  const couple = await db.collection('couples').doc(coupleId).get()
  if (!couple.data || (couple.data.creator !== openid && couple.data.partner !== openid)) throw new Error('无权访问该空间')
  return { coupleId }
}

function quizDocId(coupleId, question) {
  return crypto.createHash('sha256').update(`quiz:${coupleId}:${question}`).digest('hex').slice(0, 32)
}

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID
  const { action, data = {} } = event

  try {
    const { coupleId } = await getContext(openid)
    if (action === 'list') {
      const result = await db.collection('quizzes').where({ coupleId }).orderBy('createdAt', 'desc').limit(30).get()
      const list = result.data.map(item => {
        const hasAnswered = item.user1Id === openid || item.user2Id === openid
        if (hasAnswered || (item.user1Answer && item.user2Answer)) return item
        return { ...item, user1Answer: '', user1Id: '' }
      })
      return { code: 0, list }
    }

    if (action === 'submit') {
      const question = String(data.question || '')
      const options = QUESTION_BANK[question]
      const answer = String(data.answer || '')
      if (!options || !options.includes(answer)) return { code: -1, message: '题目或答案无效' }

      const legacy = await db.collection('quizzes').where({ coupleId, question }).limit(1).get()
      const id = legacy.data.length ? legacy.data[0]._id : quizDocId(coupleId, question)
      await db.runTransaction(async transaction => {
        const ref = transaction.collection('quizzes').doc(id)
        const current = await ref.get().catch(() => null)
        const quiz = current && current.data
        if (!quiz) {
          await ref.set({ data: {
            coupleId,
            question,
            options,
            user1Id: openid,
            user1Answer: answer,
            user2Id: '',
            user2Answer: '',
            isMatched: false,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          } })
          return
        }
        if (quiz.user1Answer && quiz.user2Answer) throw new Error('这道题已经完成')
        let update
        if (!quiz.user1Id || quiz.user1Id === openid) {
          update = { user1Id: openid, user1Answer: answer }
        } else if (!quiz.user2Id || quiz.user2Id === openid) {
          update = { user2Id: openid, user2Answer: answer, isMatched: quiz.user1Answer === answer }
        } else {
          throw new Error('这道题已经完成')
        }
        await ref.update({ data: { ...update, updatedAt: db.serverDate() } })
      })
      return { code: 0 }
    }

    return { code: -1, message: '未知操作' }
  } catch (error) {
    console.error('quiz failed:', error)
    return { code: -1, message: error.message || '操作失败' }
  }
}
