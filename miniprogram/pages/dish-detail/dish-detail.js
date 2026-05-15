const { callFunction } = require('../../utils/cloud')
const { DISH_CATEGORIES } = require('../../utils/theme')

Page({
  data: {
    data: null,
    showEdit: false,
    editForm: { name: '', category: '', rating: 5, note: '', price: 0, description: '', specs: [] },
    categories: DISH_CATEGORIES
  },

  onLoad(options) {
    this.loadDetail(options.id)
  },

  async loadDetail(id) {
    const res = await callFunction('menu', { action: 'get', data: { id } })
    if (res.code === 0) this.setData({ data: res.data })
  },

  onDelete() {
    wx.showModal({
      title: '确认删除', confirmColor: '#FF6B81',
      success: async (res) => {
        if (res.confirm) {
          await callFunction('menu', { action: 'delete', data: { id: this.data.data._id } })
          wx.navigateBack()
        }
      }
    })
  },

  onEdit() {
    const d = this.data.data
    this.setData({
      showEdit: true,
      editForm: {
        name: d.name || '',
        category: d.category || '主食',
        rating: d.rating || 5,
        note: d.note || '',
        price: d.price || 0,
        description: d.description || '',
        specs: d.specs ? JSON.parse(JSON.stringify(d.specs)) : []
      }
    })
  },

  onCloseEdit() { this.setData({ showEdit: false }) },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`editForm.${field}`]: e.detail.value })
  },

  onEditCategory(e) {
    this.setData({ 'editForm.category': e.currentTarget.dataset.cat })
  },

  onEditRating(e) {
    this.setData({ 'editForm.rating': parseInt(e.currentTarget.dataset.rating) })
  },

  // 规格编辑
  onAddSpecGroup() {
    const specs = [...this.data.editForm.specs, { name: '', options: [] }]
    this.setData({ 'editForm.specs': specs })
  },

  onRemoveSpecGroup(e) {
    const idx = parseInt(e.currentTarget.dataset.index)
    const specs = [...this.data.editForm.specs]
    specs.splice(idx, 1)
    this.setData({ 'editForm.specs': specs })
  },

  onAddSpecOption(e) {
    const idx = parseInt(e.currentTarget.dataset.index)
    const specs = [...this.data.editForm.specs]
    specs[idx].options.push({ name: '', priceAdd: 0 })
    this.setData({ 'editForm.specs': specs })
  },

  onRemoveSpecOption(e) {
    const gi = parseInt(e.currentTarget.dataset.gi)
    const oi = parseInt(e.currentTarget.dataset.oi)
    const specs = [...this.data.editForm.specs]
    specs[gi].options.splice(oi, 1)
    this.setData({ 'editForm.specs': specs })
  },

  onSpecGroupNameInput(e) {
    const idx = parseInt(e.currentTarget.dataset.index)
    const specs = [...this.data.editForm.specs]
    specs[idx].name = e.detail.value
    this.setData({ 'editForm.specs': specs })
  },

  onSpecOptionNameInput(e) {
    const gi = parseInt(e.currentTarget.dataset.gi)
    const oi = parseInt(e.currentTarget.dataset.oi)
    const specs = [...this.data.editForm.specs]
    specs[gi].options[oi].name = e.detail.value
    this.setData({ 'editForm.specs': specs })
  },

  onSpecOptionPriceInput(e) {
    const gi = parseInt(e.currentTarget.dataset.gi)
    const oi = parseInt(e.currentTarget.dataset.oi)
    const specs = [...this.data.editForm.specs]
    specs[gi].options[oi].priceAdd = parseInt(e.detail.value) || 0
    this.setData({ 'editForm.specs': specs })
  },

  async onSaveEdit() {
    const { editForm } = this.data
    if (!editForm.name.trim()) {
      wx.showToast({ title: '请输入菜名', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中...' })
    try {
      await callFunction('menu', {
        action: 'update',
        data: {
          id: this.data.data._id,
          name: editForm.name.trim(),
          category: editForm.category,
          rating: editForm.rating,
          note: editForm.note,
          price: parseFloat(editForm.price) || 0,
          description: editForm.description,
          specs: editForm.specs
        }
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.setData({ showEdit: false })
      this.loadDetail(this.data.data._id)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  }
})
