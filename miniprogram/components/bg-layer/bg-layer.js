Component({
  data: {
    bgImage: '',
    bgOpacity: 80
  },

  lifetimes: {
    attached() {
      this.loadBg()
    }
  },

  pageLifetimes: {
    show() {
      this.loadBg()
    }
  },

  methods: {
    loadBg() {
      const app = getApp()
      this.setData({
        bgImage: app.globalData.bgImage || '',
        bgOpacity: app.globalData.bgOpacity || 80
      })
    }
  }
})
