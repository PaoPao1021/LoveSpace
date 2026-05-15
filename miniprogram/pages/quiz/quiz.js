const { callFunction } = require('../../utils/cloud')

const QUIZ_QUESTIONS = [
  { question: 'TA最喜欢吃什么水果？', options: ['草莓', '西瓜', '芒果', '葡萄'] },
  { question: 'TA最讨厌什么行为？', options: ['迟到', '撒谎', '不回消息', '敷衍'] },
  { question: 'TA最喜欢什么颜色？', options: ['粉色', '蓝色', '白色', '紫色'] },
  { question: 'TA的压力解压方式是？', options: ['睡觉', '吃东西', '听歌', '运动'] },
  { question: 'TA的理想约会是？', options: ['看电影', '逛街', '在家待着', '旅行'] }
]

Page({
  data: {
    list: [],
    loaded: false,
    showQuiz: false,
    currentQuiz: null,
    selectedIndex: -1,
    submitted: false
  },

  onShow() { this.loadQuizzes() },

  async loadQuizzes() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('quizzes')
        .where({ coupleId: getApp().globalData.coupleId })
        .orderBy('createdAt', 'desc')
        .get()

      this.setData({ list: res.data, loaded: true })
    } catch (e) {
      this.setData({ loaded: true })
    }
  },

  onStartQuiz() {
    // 随机选一题
    const quiz = QUIZ_QUESTIONS[Math.floor(Math.random() * QUIZ_QUESTIONS.length)]
    this.setData({
      showQuiz: true,
      currentQuiz: quiz,
      selectedIndex: -1,
      submitted: false
    })
  },

  onSelectOption(e) {
    if (this.data.submitted) return
    this.setData({ selectedIndex: e.currentTarget.dataset.index })
  },

  async onSubmit() {
    if (this.data.selectedIndex < 0) {
      wx.showToast({ title: '请选择一个答案', icon: 'none' })
      return
    }

    const { currentQuiz, selectedIndex } = this.data
    const answer = currentQuiz.options[selectedIndex]

    try {
      const db = wx.cloud.database()
      const openid = getApp().globalData.openid
      const coupleId = getApp().globalData.coupleId

      // 查找是否已有这道题
      const existing = await db.collection('quizzes')
        .where({ coupleId, question: currentQuiz.question })
        .get()

      if (existing.data.length > 0) {
        const quiz = existing.data[0]
        const updateData = {}

        if (quiz.user1Answer && quiz.user1Answer !== answer) {
          // 第二个人答题
          updateData.user2Answer = answer
          updateData.user2Id = openid
          updateData.isMatched = quiz.user1Answer === answer
        } else if (!quiz.user1Answer) {
          updateData.user1Answer = answer
          updateData.user1Id = openid
        }

        await db.collection('quizzes').doc(quiz._id).update({ data: updateData })
      } else {
        await db.collection('quizzes').add({
          data: {
            coupleId,
            question: currentQuiz.question,
            options: currentQuiz.options,
            user1Answer: answer,
            user1Id: openid,
            isMatched: false,
            createdAt: new Date().toISOString()
          }
        })
      }

      this.setData({ submitted: true })
      wx.showToast({ title: '提交成功', icon: 'success' })
      this.loadQuizzes()
    } catch (e) {
      console.error(e)
      wx.showToast({ title: '提交失败', icon: 'none' })
    }
  },

  onCloseQuiz() {
    this.setData({ showQuiz: false })
  }
})
