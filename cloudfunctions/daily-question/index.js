const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertSafeText(content) {
  try {
    const result = await cloud.openapi.security.msgSecCheck({ content: String(content).slice(0, 500) })
    const suggest = result && result.result && result.result.suggest
    if (suggest && suggest !== 'pass') throw new Error('CONTENT_RISKY')
  } catch (error) {
    const code = Number(error.errCode || error.errcode)
    if (code === 87014 || String(error.message || '').includes('87014') || error.message === 'CONTENT_RISKY') throw new Error('回答包含不适合发布的信息，请修改后重试')
    console.error('msgSecCheck failed:', error)
    throw new Error('内容安全检查暂时不可用，请稍后重试')
  }
}

const QUESTIONS = [
  { question: '如果现在可以和 TA 去任何地方，你最想去哪里？', category: '旅行' },
  { question: '最近 TA 做过哪件小事，让你觉得被爱着？', category: '心动' },
  { question: '如果只留下一张你们的合照，你会选哪一张？', category: '回忆' },
  { question: '今年最想和 TA 一起完成的一件事是什么？', category: '未来' },
  { question: '你最欣赏 TA 身上的哪一种品质？', category: '了解' },
  { question: '你们一起吃过最难忘的一顿饭是什么？', category: '美食' },
  { question: '如果可以重温你们的某一天，你会选哪一天？', category: '时光' },
  { question: '你觉得你们最有默契的一件事是什么？', category: '默契' },
  { question: '今天有什么一直想对 TA 说的话？', category: '表达' },
  { question: 'TA 的哪个小习惯让你觉得特别可爱？', category: '日常' },
  { question: '第一次见面时，你对 TA 的第一印象是什么？', category: '回忆' },
  { question: '最近哪一刻，你最想给 TA 一个拥抱？', category: '关怀' },
  { question: '你现在最感谢 TA 的是什么？', category: '感恩' },
  { question: '你们之间有哪些专属暗号或梗？', category: '默契' },
  { question: '如果这个周末完全空下来，你想和 TA 做什么？', category: '约会' },
  { question: 'TA 让你发生过哪一种好的改变？', category: '成长' },
  { question: '你觉得你们的相处像哪部电影或哪本书？', category: '趣味' },
  { question: '你偷偷为 TA 做过什么、但 TA 可能不知道？', category: '浪漫' },
  { question: '给今天的关系状态打几分？为什么？', category: '连接' },
  { question: '你最喜欢和 TA 一起做的日常小事是什么？', category: '日常' },
  { question: 'TA 说过最让你印象深刻的一句话是什么？', category: '回忆' },
  { question: '你希望你们三年后的普通一天是什么样子？', category: '未来' },
  { question: '如果今天送 TA 一份不用花钱的礼物，会是什么？', category: '浪漫' },
  { question: 'TA 最近可能需要你怎样的支持？', category: '关怀' },
  { question: '你们之间最好笑的一次经历是什么？', category: '快乐' },
  { question: '最近一次被 TA 打动是在什么时候？', category: '心动' },
  { question: '如果能给刚在一起时的你们一句话，会说什么？', category: '时光' },
  { question: '你最想帮 TA 实现的一个愿望是什么？', category: '愿望' },
  { question: '今天你想邀请 TA 一起完成哪件小事？', category: '行动' },
  { question: '最近有什么压力，是你希望 TA 理解的？', category: '倾听' },
  { question: '你觉得被 TA 爱着时，最明显的感受是什么？', category: '连接' }
]

function getTodayInChina() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function getQuestionIndex(day) {
  return Number(day.replace(/-/g, '')) % QUESTIONS.length
}

async function getCoupleContext(openid) {
  const userRes = await db.collection('users').doc(openid).get()
  const coupleId = userRes.data && userRes.data.coupleId
  if (!coupleId) throw new Error('请先绑定你们的空间')

  const coupleRes = await db.collection('couples').doc(coupleId).get()
  const couple = coupleRes.data
  if (!couple || couple.status !== 'active') throw new Error('情侣空间状态异常')
  if (couple.creator !== openid && couple.partner !== openid) throw new Error('无权访问该空间')

  return {
    coupleId,
    partnerId: couple.creator === openid ? couple.partner : couple.creator
  }
}

function shapeResult(record, openid, partnerId, question) {
  const answers = (record && record.answers) || {}
  const myAnswer = answers[openid] || ''
  const rawPartnerAnswer = partnerId ? answers[partnerId] || '' : ''
  const bothAnswered = Boolean(myAnswer && rawPartnerAnswer)
  return {
    code: 0,
    question: (record && record.question) || question.question,
    category: (record && record.category) || question.category,
    myAnswer: myAnswer || null,
    partnerAnswer: bothAnswered ? rawPartnerAnswer : null,
    partnerAnswered: Boolean(rawPartnerAnswer),
    bothAnswered
  }
}

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID
  const { action, data = {} } = event

  try {
    const { coupleId, partnerId } = await getCoupleContext(openid)
    const day = getTodayInChina()
    const question = QUESTIONS[getQuestionIndex(day)]
    const recordId = `daily_${coupleId}_${day.replace(/-/g, '')}`
    const ref = db.collection('daily_questions').doc(recordId)

    if (action === 'getToday' || action === 'reveal') {
      const recordRes = await ref.get().catch(() => null)
      return shapeResult(recordRes && recordRes.data, openid, partnerId, question)
    }

    if (action === 'submit') {
      const answer = String(data.answer || '').trim()
      if (!answer) return { code: -1, message: '写下你的回答后再提交' }
      if (answer.length > 500) return { code: -1, message: '回答最多 500 个字' }
      await assertSafeText(answer)

      await db.runTransaction(async transaction => {
        const transactionRef = transaction.collection('daily_questions').doc(recordId)
        const current = await transactionRef.get().catch(() => null)
        if (current && current.data) {
          await transactionRef.update({
            data: { [`answers.${openid}`]: answer, updatedAt: db.serverDate() }
          })
        } else {
          await transactionRef.set({
            data: {
              coupleId,
              date: day,
              question: question.question,
              category: question.category,
              answers: { [openid]: answer },
              createdAt: db.serverDate(),
              updatedAt: db.serverDate()
            }
          })
        }
      })

      const saved = await ref.get()
      return shapeResult(saved.data, openid, partnerId, question)
    }

    return { code: -1, message: '未知操作' }
  } catch (error) {
    console.error('daily-question failed:', error)
    return { code: -1, message: error.message || '加载今日问题失败' }
  }
}
