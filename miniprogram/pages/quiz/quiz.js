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
      const res = await callFunction('quiz', { action: 'list' })
      this.setData({ list: res.list || [], loaded: true })
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
      await callFunction('quiz', {
        action: 'submit',
        data: { question: currentQuiz.question, answer }
      })

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
