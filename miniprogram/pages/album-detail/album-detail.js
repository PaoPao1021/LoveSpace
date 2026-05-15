const { callFunction, uploadImage } = require('../../utils/cloud')

Page({
  data: {
    albumId: '',
    albumName: '',
    photos: [],
    page: 1,
    hasMore: false,
    loaded: false
  },

  onLoad(options) {
    this.setData({
      albumId: options.id,
      albumName: options.name || '相册'
    })
    wx.setNavigationBarTitle({ title: options.name || '相册' })
    this.loadPhotos()
  },

  async loadPhotos() {
    try {
      const res = await callFunction('album', {
        action: 'listPhotos',
        data: { albumId: this.data.albumId, page: this.data.page }
      })
      if (res.code === 0) {
        this.setData({
          photos: this.data.page === 1 ? res.list : [...this.data.photos, ...res.list],
          hasMore: res.hasMore,
          loaded: true
        })
      }
    } catch (e) {
      console.error(e)
      this.setData({ loaded: true })
    }
  },

  loadMore() {
    this.setData({ page: this.data.page + 1 })
    this.loadPhotos()
  },

  onPreview(e) {
    const index = e.currentTarget.dataset.index
    const urls = this.data.photos.map(p => p.fileId)
    wx.previewImage({ urls, current: urls[index] })
  },

  async onToggleFav(e) {
    const id = e.currentTarget.dataset.id
    await callFunction('album', { action: 'toggleFavorite', data: { id } })
    this.setData({ page: 1 })
    this.loadPhotos()
  },

  onUpload() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' })
        try {
          const photos = []
          for (const file of res.tempFiles) {
            const fileId = await uploadImage(file.tempFilePath)
            photos.push({ fileId })
          }

          await callFunction('album', {
            action: 'addPhotos',
            data: { albumId: this.data.albumId, photos }
          })

          wx.showToast({ title: '上传成功', icon: 'success' })
          this.setData({ page: 1 })
          this.loadPhotos()
        } catch (e) {
          console.error(e)
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  }
})
