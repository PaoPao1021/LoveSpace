const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function monthRange(year, month) {
  const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+08:00`)
  return { start, end }
}

function monthFromDate(value) {
  if (!value) return 0
  const text = typeof value === 'string' ? value : new Date(value).toISOString()
  const match = text.match(/^\d{4}-(\d{2})-/)
  return match ? Number(match[1]) : new Date(value).getMonth() + 1
}

async function fetchAll(collection, where) {
  const list = []
  let skip = 0
  while (true) {
    const page = await db.collection(collection).where(where).skip(skip).limit(100).get()
    list.push(...page.data)
    if (page.data.length < 100) return list
    skip += 100
  }
}

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID
  const nowInChina = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const year = Number(event.year || nowInChina.getUTCFullYear())
  const month = Number(event.month || nowInChina.getUTCMonth() + 1)

  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return { code: -1, message: '月份参数不正确' }
  }

  try {
    const userRes = await db.collection('users').doc(openid).get()
    const coupleId = userRes.data && userRes.data.coupleId
    if (!coupleId) return { code: -1, message: '请先绑定你们的空间' }

    const coupleRes = await db.collection('couples').doc(coupleId).get()
    const couple = coupleRes.data
    if (couple.creator !== openid && couple.partner !== openid) {
      return { code: -1, message: '无权访问该空间' }
    }
    const partnerId = couple.creator === openid ? couple.partner : couple.creator
    const { start, end } = monthRange(year, month)
    const timeRange = _.gte(start).and(_.lt(end))

    const [myMoods, partnerMoods, points, moments, anniversaries, questions] = await Promise.all([
      fetchAll('moods', { userId: openid, createdAt: timeRange }),
      partnerId ? fetchAll('moods', { userId: partnerId, visibility: 'both', createdAt: timeRange }) : [],
      fetchAll('points', { coupleId, createdAt: timeRange }),
      fetchAll('moments', { coupleId, createdAt: timeRange }),
      fetchAll('anniversaries', { coupleId }),
      fetchAll('daily_questions', { coupleId, createdAt: timeRange })
    ])

    const moodTypes = {}
    ;[...myMoods, ...partnerMoods].forEach(item => {
      if (item.moodType) moodTypes[item.moodType] = (moodTypes[item.moodType] || 0) + 1
    })
    const topMoodEntry = Object.entries(moodTypes).sort((a, b) => b[1] - a[1])[0]
    const partnerMoodDays = new Set(partnerMoods.map(item => item.date))
    const togetherMoodDays = myMoods.filter(item => partnerMoodDays.has(item.date)).length

    const myPoints = points.filter(item => item.toUser === openid)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const partnerPoints = points.filter(item => item.toUser === partnerId)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const exchangeCount = points.filter(item => Number(item.amount || 0) < 0).length
    const questionTogether = questions.filter(item => {
      const answers = item.answers || {}
      return Boolean(answers[openid] && partnerId && answers[partnerId])
    }).length
    const photoCount = moments.reduce((sum, item) => sum + ((item.images && item.images.length) || 0), 0)
    const daysInMonth = new Date(year, month, 0).getDate()
    const connectionScore = Math.min(100, Math.round(
      Math.min(1, togetherMoodDays / 8) * 35 +
      Math.min(1, questionTogether / 12) * 40 +
      Math.min(1, moments.length / 6) * 25
    ))

    return {
      code: 0,
      report: {
        year,
        month,
        daysInMonth,
        connectionScore,
        mood: {
          me: myMoods.length,
          partner: partnerMoods.length,
          together: togetherMoodDays,
          topMood: topMoodEntry ? topMoodEntry[0] : '',
          checkinRate: Math.min(100, Math.round((myMoods.length / daysInMonth) * 100))
        },
        questions: { days: questions.length, together: questionTogether },
        points: { me: myPoints, partner: partnerPoints, total: myPoints + partnerPoints, exchanges: exchangeCount },
        moments: { count: moments.length, photos: photoCount },
        anniversaries: anniversaries
          .filter(item => {
            if (monthFromDate(item.date) !== month) return false
            if (item.isRepeat !== false) return true
            return Number(String(item.date).slice(0, 4)) === year
          })
          .map(item => ({ name: item.name, date: item.date }))
      }
    }
  } catch (error) {
    console.error('monthly-report failed:', error)
    return { code: -1, message: error.message || '生成月报失败' }
  }
}
