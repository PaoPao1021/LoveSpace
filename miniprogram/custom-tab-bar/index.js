Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '首页',
        icon: '⌂'
      },
      {
        pagePath: '/pages/album/album',
        text: '相册',
        icon: '▧'
      },
      {
        pagePath: '/pages/moments/moments',
        text: '点滴',
        icon: '✦'
      },
      {
        pagePath: '/pages/profile/profile',
        text: '我的',
        icon: '○'
      }
    ]
  },

  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path
      const index = data.index
      if (index === this.data.selected) return
      wx.switchTab({
        url,
        success: () => this.setData({ selected: index })
      })
    }
  }
})
