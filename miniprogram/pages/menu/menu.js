const { callFunction, uploadImage } = require('../../utils/cloud')
const { DISH_CATEGORIES } = require('../../utils/theme')

Page({
  data: {
    loaded: false,
    starValues: [1, 2, 3, 4, 5],
    categories: DISH_CATEGORIES,
    currentCategory: '',
    dishList: [],
    recommendList: [],
    showAdd: false,
    form: {
      name: '',
      category: '主食',
      rating: 5,
      note: '',
      imageUrl: ''
    }
  },

  onShow() {
    this.loadDishes()
  },

  async loadDishes() {
    try {
      const res = await callFunction('menu', {
        action: 'list',
        data: { category: this.data.currentCategory || undefined }
      })
      if (res.code === 0) {
        this.setData({ dishList: res.list, loaded: true })
      }
    } catch (e) {
      this.setData({ loaded: true })
    }
  },

  onCategory(e) {
    this.setData({ currentCategory: e.currentTarget.dataset.cat })
    this.loadDishes()
  },

  async onRecommend() {
    try {
      const res = await callFunction('menu', { action: 'recommend' })
      if (res.code === 0) {
        this.setData({ recommendList: res.list })
      }
    } catch (e) {
      console.error(e)
    }
  },

  onAdd() {
    this.setData({ showAdd: true, form: { name: '', category: '主食', rating: 5, note: '', imageUrl: '' } })
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: async (res) => {
        const filePath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '上传中...' })
        try {
          const fileId = await uploadImage(filePath)
          this.setData({ 'form.imageUrl': fileId })
        } catch (e) {
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  onRemoveImage() {
    this.setData({ 'form.imageUrl': '' })
  },

  onCloseAdd() {
    this.setData({ showAdd: false })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onFormCategory(e) {
    this.setData({ 'form.category': e.currentTarget.dataset.cat })
  },

  onRating(e) {
    this.setData({ 'form.rating': e.currentTarget.dataset.rating })
  },

  async onSave() {
    const { name, category, rating, note, imageUrl } = this.data.form
    if (!name.trim()) {
      wx.showToast({ title: '请输入菜名', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中...' })
    try {
      await callFunction('menu', {
        action: 'add',
        data: { name: name.trim(), category, rating, note, imageUrl }
      })
      wx.showToast({ title: '添加成功', icon: 'success' })
      this.setData({ showAdd: false })
      this.loadDishes()
    } catch (e) {
      console.error(e)
    } finally {
      wx.hideLoading()
    }
  },

  async onMarkEaten(e) {
    const id = e.currentTarget.dataset.id
    await callFunction('menu', { action: 'markEaten', data: { id } })
    wx.showToast({ title: '已记录', icon: 'success' })
    this.loadDishes()
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/dish-detail/dish-detail?id=${e.currentTarget.dataset.id}` })
  },

  goOrderMode() {
    wx.navigateTo({ url: '/pages/menu-order/menu-order' })
  }
})
