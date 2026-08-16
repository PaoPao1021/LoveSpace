const { callFunction, createRequestId } = require('../../utils/cloud')
const { DISH_CATEGORIES } = require('../../utils/theme')
const { orderTemplateId } = require('../../config/index')

Page({
  data: {
    categories: [],
    currentCatIndex: 0,
    allDishes: [],
    filteredDishes: [],
    // 购物车
    cart: [],
    cartVisible: false,
    cartTotal: 0,
    cartCount: 0,
    // 规格选择
    showSpec: false,
    specDish: null,
    selectedSpecs: {},
    specQuantity: 1,
    submitting: false
  },

  onLoad() {
    this.loadData()
  },

  async loadData() {
    wx.showLoading({ title: '加载中' })
    try {
      const [catRes, dishRes] = await Promise.all([
        callFunction('menu', { action: 'listCategories' }),
        callFunction('menu', { action: 'list' })
      ])

      let categories = []
      if (catRes.code === 0 && catRes.list.length > 0) {
        categories = catRes.list
      } else {
        categories = DISH_CATEGORIES
      }

      const allDishes = dishRes.code === 0 ? dishRes.list : []
      const filteredDishes = allDishes.filter(d => d.category === categories[0].name)

      this.setData({ categories, allDishes, filteredDishes })
    } catch (e) {
      console.error(e)
    } finally {
      wx.hideLoading()
    }
  },

  onCategoryTap(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const catName = this.data.categories[index].name
    const filteredDishes = this.data.allDishes.filter(d => d.category === catName)
    this.setData({ currentCatIndex: index, filteredDishes })
  },

  onDishTap(e) {
    const id = e.currentTarget.dataset.id
    const dish = this.data.allDishes.find(d => d._id === id)
    if (!dish) return

    if (dish.specs && dish.specs.length > 0) {
      // 有规格，弹出选择
      const selectedSpecs = {}
      dish.specs.forEach(group => {
        if (group.options && group.options.length > 0) {
          selectedSpecs[group.name] = group.options[0].name
        }
      })
      this.setData({ showSpec: true, specDish: dish, selectedSpecs, specQuantity: 1 })
    } else {
      // 无规格，直接加购物车
      this.addToCart(dish, {}, 1)
    }
  },

  onQuickAdd(e) {
    const id = e.currentTarget.dataset.id
    const dish = this.data.allDishes.find(d => d._id === id)
    if (!dish) return
    if (dish.specs && dish.specs.length > 0) {
      const selectedSpecs = {}
      dish.specs.forEach(group => {
        if (group.options && group.options.length > 0) {
          selectedSpecs[group.name] = group.options[0].name
        }
      })
      this.setData({ showSpec: true, specDish: dish, selectedSpecs, specQuantity: 1 })
    } else {
      this.addToCart(dish, {}, 1)
    }
  },

  onSpecOptionTap(e) {
    const { group, option } = e.currentTarget.dataset
    this.setData({ [`selectedSpecs.${group}`]: option })
  },

  onSpecQuantityChange(e) {
    this.setData({ specQuantity: e.detail })
  },

  onCloseSpec() {
    this.setData({ showSpec: false })
  },

  onAddToCart() {
    const { specDish, selectedSpecs, specQuantity } = this.data
    this.addToCart(specDish, selectedSpecs, specQuantity)
    this.setData({ showSpec: false })
  },

  addToCart(dish, selectedSpecs, quantity) {
    const cart = [...this.data.cart]
    // 计算规格加价
    let specPriceAdd = 0
    const specTexts = []
    if (dish.specs) {
      dish.specs.forEach(group => {
        const selected = selectedSpecs[group.name]
        if (selected) {
          const opt = group.options.find(o => o.name === selected)
          if (opt) specPriceAdd += opt.priceAdd || 0
          specTexts.push(selected)
        }
      })
    }

    // 检查是否已有相同规格的菜品
    const specKey = JSON.stringify(selectedSpecs)
    const existIndex = cart.findIndex(c => c.dishId === dish._id && JSON.stringify(c.selectedSpecs) === specKey)

    if (existIndex >= 0) {
      cart[existIndex].quantity += quantity
    } else {
      cart.push({
        dishId: dish._id,
        name: dish.name,
        price: dish.price || 0,
        selectedSpecs,
        specPriceAdd,
        specText: specTexts.join(' / '),
        quantity
      })
    }

    this.calcCart(cart)
    wx.showToast({ title: '已加入', icon: 'success' })
  },

  calcCart(cart) {
    const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0)
    const cartTotal = cart.reduce((sum, c) => sum + (c.price + c.specPriceAdd) * c.quantity, 0)
    this.setData({ cart, cartCount, cartTotal })
  },

  onCartTap() {
    this.setData({ cartVisible: !this.data.cartVisible })
  },

  onCloseCart() {
    this.setData({ cartVisible: false })
  },

  onQuantityChange(e) {
    const index = e.currentTarget.dataset.index
    const cart = [...this.data.cart]
    cart[index].quantity = e.detail
    if (cart[index].quantity <= 0) cart.splice(index, 1)
    this.calcCart(cart)
  },

  onRemoveFromCart(e) {
    const index = e.currentTarget.dataset.index
    const cart = [...this.data.cart]
    cart.splice(index, 1)
    this.calcCart(cart)
  },

  onClearCart() {
    this.calcCart([])
  },

  onPlaceOrder() {
    if (this.data.submitting) return
    if (this.data.cart.length === 0) {
      wx.showToast({ title: '请先选择菜品', icon: 'none' })
      return
    }
    // 先请求订阅消息授权（必须在用户点击事件同步调用）
    if (!orderTemplateId) {
      this._showOrderConfirm()
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [orderTemplateId],
      complete: () => {
        // 无论授权与否，都弹确认框
        this._showOrderConfirm()
      }
    })
  },

  _showOrderConfirm() {
    wx.showModal({
      title: '确认点单',
      content: `共 ${this.data.cartCount} 件，合计 ¥${this.data.cartTotal}\n让TA给你做~`,
      confirmColor: '#E85D75',
      success: async (res) => {
        if (res.confirm) {
          if (this.data.submitting) return
          this.setData({ submitting: true })
          wx.showLoading({ title: '下单中...' })
          try {
            const cartSnapshot = [...this.data.cart]
            const orderResult = await callFunction('menu', {
              action: 'addOrder',
              data: { items: cartSnapshot, note: '', requestId: createRequestId('order') }
            })
            // 通知对方
            callFunction('notification', {
              action: 'orderNotify',
              data: { orderId: orderResult.id }
            }).catch(() => {})
            this.calcCart([])
            this.setData({ cartVisible: false })
            wx.showToast({ title: '下单成功！', icon: 'success' })
          } catch (e) {
            wx.showToast({ title: '下单失败', icon: 'none' })
          } finally {
            wx.hideLoading()
            this.setData({ submitting: false })
          }
        }
      }
    })
  },

  goOrderHistory() {
    wx.navigateTo({ url: '/pages/order-history/order-history' })
  }
})
