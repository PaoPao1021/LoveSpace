const { callFunction, uploadImage } = require('../../utils/cloud')
const { formatDate } = require('../../utils/date')

Page({
  data: {
    list: [],
    loaded: false,
    page: 1,
    hasMore: false,
    // 添加弹窗
    showAdd: false,
    form: {
      eventDate: '',
      title: '',
      content: '',
      images: []
    },
    submitting: false
  },

  onShow() {
    this.setData({ page: 1 })
    this.loadTimeline()
  },

  async loadTimeline() {
    try {
      const res = await callFunction('moments', {
        action: 'list',
        data: { page: this.data.page, pageSize: 20 }
      })
      if (res.code === 0) {
        const list = (res.list || []).map(item => ({
          ...item,
          dateStr: formatDate(item.eventDate || item.createdAt, 'MM-DD'),
          yearStr: formatDate(item.eventDate || item.createdAt, 'YYYY'),
          fullDateStr: formatDate(item.eventDate || item.createdAt, 'YYYY年MM月DD日'),
          contentPreview: (item.content || '').slice(0, 200)
        }))
        // Group by year-month
        const grouped = this.groupByMonth(list)
        this.setData({
          list: this.data.page === 1 ? grouped : [...this.data.list, ...grouped],
          hasMore: res.hasMore,
          loaded: true
        })
      }
    } catch (e) {
      this.setData({ loaded: true })
    }
  },

  groupByMonth(list) {
    const groups = {}
    list.forEach(item => {
      const monthKey = formatDate(item.eventDate || item.createdAt, 'YYYY年MM月')
      if (!groups[monthKey]) {
        groups[monthKey] = { monthLabel: monthKey, items: [] }
      }
      groups[monthKey].items.push(item)
    })
    return Object.values(groups)
  },

  loadMore() {
    this.setData({ page: this.data.page + 1 })
    this.loadTimeline()
  },

  // ===== 添加事件 =====
  onAdd() {
    const today = formatDate(new Date(), 'YYYY-MM-DD')
    this.setData({
      showAdd: true,
      form: { eventDate: today, title: '', content: '', images: [] }
    })
  },

  onCloseAdd() {
    this.setData({ showAdd: false })
  },

  onDateChange(e) {
    this.setData({ 'form.eventDate': e.detail.value })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onChooseImage() {
    const remain = 9 - this.data.form.images.length
    if (remain <= 0) {
      wx.showToast({ title: '最多9张图片', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' })
        try {
          const fileIDs = []
          for (const file of res.tempFiles) {
            const fileID = await uploadImage(file.tempFilePath)
            fileIDs.push(fileID)
          }
          const images = [...this.data.form.images, ...fileIDs]
          this.setData({ 'form.images': images })
        } catch (e) {
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.form.images]
    images.splice(index, 1)
    this.setData({ 'form.images': images })
  },

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    const images = this.data.form.images
    wx.previewImage({ current: url, urls: images })
  },

  async onSave() {
    const { eventDate, title, content, images } = this.data.form
    if (!content.trim() && !title.trim()) {
      wx.showToast({ title: '请输入事件内容或标题', icon: 'none' })
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })

    try {
      await callFunction('moments', {
        action: 'add',
        data: {
          title: title.trim(),
          content: content.trim(),
          images,
          eventDate: `${eventDate} 00:00:00`,
          tags: ['timeline']
        }
      })
      wx.showToast({ title: '添加成功', icon: 'success' })
      this.setData({ showAdd: false, submitting: false })
      this.setData({ page: 1 })
      this.loadTimeline()
    } catch (e) {
      this.setData({ submitting: false })
    }
  },

  // ===== 查看详情 =====
  onTapItem(e) {
    const item = e.currentTarget.dataset.item
    wx.showModal({
      title: item.title || item.fullDateStr,
      content: item.content,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#E85D75'
    })
  },

  // 预览图片
  onPreviewItemImage(e) {
    const { images, index } = e.currentTarget.dataset
    wx.previewImage({ current: images[index], urls: images })
  }
})
