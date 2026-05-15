const { callFunction, uploadImage } = require('../../utils/cloud')
const { ALBUM_CATEGORIES } = require('../../utils/theme')

Page({
  data: {
    loaded: false,
    albums: []
  },

  onShow() {
    this.loadAlbums()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  async loadAlbums() {
    try {
      const res = await callFunction('album', { action: 'listAlbums' })
      if (res.code === 0) {
        const emojiMap = {}
        ALBUM_CATEGORIES.forEach(c => { emojiMap[c.name] = c.icon })

        const albums = res.list.map(a => ({
          ...a,
          emoji: emojiMap[a.name] || '📁'
        }))
        this.setData({ albums, loaded: true })
      }
    } catch (e) {
      console.error(e)
      this.setData({ loaded: true })
    }
  },

  goDetail(e) {
    const { id, name } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/album-detail/album-detail?id=${id}&name=${name}` })
  },

  onUpload() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.uploadPhotos(res.tempFiles)
      }
    })
  },

  async uploadPhotos(files) {
    if (this.data.albums.length === 0) {
      wx.showToast({ title: '请先创建相册', icon: 'none' })
      return
    }

    // 选择相册
    const albumNames = this.data.albums.map(a => a.name)
    wx.showActionSheet({
      itemList: albumNames,
      success: async (sheetRes) => {
        const album = this.data.albums[sheetRes.tapIndex]
        wx.showLoading({ title: '上传中...' })

        try {
          const photos = []
          for (const file of files) {
            const fileId = await uploadImage(file.tempFilePath)
            photos.push({ fileId })
          }

          await callFunction('album', {
            action: 'addPhotos',
            data: { albumId: album._id, photos }
          })

          wx.showToast({ title: '上传成功', icon: 'success' })
          this.loadAlbums()
        } catch (e) {
          console.error(e)
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  onAddAlbum() {
    wx.showModal({
      title: '新建相册',
      editable: true,
      placeholderText: '相册名称',
      success: async (res) => {
        if (res.confirm && res.content) {
          await callFunction('album', {
            action: 'addAlbum',
            data: { name: res.content.trim() }
          })
          this.loadAlbums()
        }
      }
    })
  }
})
