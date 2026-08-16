const { callFunction, uploadImages } = require('../../utils/cloud')

Page({
  data: {
    id: '',
    form: {
      title: '',
      content: '',
      images: [],
      tags: []
    },
    presetTags: ['日常', '美食', '旅行', '搞笑', '感动', '第一次', '吵架和好', '约定']
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id })
      this.loadDetail(options.id)
    }
  },

  async loadDetail(id) {
    const res = await callFunction('moments', { action: 'get', data: { id } })
    if (res.code === 0) {
      this.setData({
        form: {
          title: res.data.title || '',
          content: res.data.content || '',
          images: res.data.images || [],
          tags: res.data.tags || []
        }
      })
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onChooseImage() {
    const remaining = 9 - this.data.form.images.length
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' })
        try {
          const paths = res.tempFiles.map(f => f.tempFilePath)
          const fileIds = await uploadImages(paths)
          this.setData({
            'form.images': [...this.data.form.images, ...fileIds]
          })
        } catch (e) {
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  onRemoveImg(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.form.images]
    images.splice(index, 1)
    this.setData({ 'form.images': images })
  },

  onToggleTag(e) {
    const tag = e.currentTarget.dataset.tag
    let tags = [...this.data.form.tags]
    const idx = tags.indexOf(tag)
    if (idx > -1) {
      tags.splice(idx, 1)
    } else {
      tags.push(tag)
    }
    this.setData({ 'form.tags': tags })
  },

  async onSave() {
    const { title, content, images, tags } = this.data.form
    if (!content.trim() && images.length === 0) {
      wx.showToast({ title: '写点什么吧', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })
    try {
      if (this.data.id) {
        await callFunction('moments', {
          action: 'update',
          data: { id: this.data.id, title, content, images, tags }
        })
      } else {
        await callFunction('moments', {
          action: 'add',
          data: { title, content, images, tags }
        })
      }
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      console.error(e)
    } finally {
      wx.hideLoading()
    }
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      confirmColor: '#E85D75',
      success: async (res) => {
        if (res.confirm) {
          await callFunction('moments', { action: 'delete', data: { id: this.data.id } })
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1500)
        }
      }
    })
  }
})
