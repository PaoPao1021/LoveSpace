const { callFunction } = require('../../utils/cloud')

Page({
  data: {
    loading: true,
    submitting: false,
    question: '',
    category: '',
    myAnswer: '',
    partnerAnswer: '',
    partnerAnswered: false,
    bothAnswered: false,
    draft: ''
  },

  onLoad() {
    this.loadQuestion()
  },

  async loadQuestion() {
    this.setData({ loading: true })
    try {
      const result = await callFunction('daily-question', { action: 'getToday' })
      this.setData({
        question: result.question,
        category: result.category,
        myAnswer: result.myAnswer || '',
        partnerAnswer: result.partnerAnswer || '',
        partnerAnswered: result.partnerAnswered,
        bothAnswered: result.bothAnswered,
        draft: result.myAnswer || '',
        loading: false
      })
    } catch (error) {
      this.setData({ loading: false })
    }
  },

  onDraftInput(event) {
    this.setData({ draft: event.detail.value })
  },

  async onSubmit() {
    const answer = this.data.draft.trim()
    if (!answer || this.data.submitting) return

    this.setData({ submitting: true })
    try {
      const result = await callFunction('daily-question', {
        action: 'submit',
        data: { answer }
      })
      this.setData({
        myAnswer: result.myAnswer || answer,
        partnerAnswer: result.partnerAnswer || '',
        partnerAnswered: result.partnerAnswered,
        bothAnswered: result.bothAnswered
      })
      wx.showToast({ title: result.bothAnswered ? '解锁彼此的回答' : '回答已保存', icon: 'success' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onPullDownRefresh() {
    this.loadQuestion().finally(() => wx.stopPullDownRefresh())
  }
})
