Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '首页',
        sticker: '🐰',
        bgClass: 'sticker-bg-blush'
      },
      {
        pagePath: '/pages/album/album',
        text: '相册',
        sticker: '🐻',
        bgClass: 'sticker-bg-cream'
      },
      {
        pagePath: '/pages/moments/moments',
        text: '点滴',
        sticker: '🐶',
        bgClass: 'sticker-bg-lavender'
      },
      {
        pagePath: '/pages/profile/profile',
        text: '我的',
        sticker: '🌸',
        bgClass: 'sticker-bg-peach'
      }
    ]
  },

  lifetimes: {
    attached() {
    }
  },

  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path
      const index = data.index
      wx.switchTab({ url })
      this.setData({ selected: index })
    }
  }
})
