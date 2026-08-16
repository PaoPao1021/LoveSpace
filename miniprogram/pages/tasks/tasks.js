const { callFunction } = require('../../utils/cloud')
const { formatDate } = require('../../utils/date')

Page({
  data: {
    list: [],
    loaded: false,
    showAdd: false,
    showDetail: false,
    detailTask: null,
    form: { title: '', description: '', rewardPoints: 5, assignee: 'both' },
    assigneeOptions: [
      { value: 'me', label: '我', icon: '🙋' },
      { value: 'partner', label: 'TA', icon: '🙋‍♀️' },
      { value: 'both', label: '双方', icon: '💑' }
    ],
    submitting: false
  },

  onShow() { this.loadTasks() },

  async loadTasks() {
    try {
      const res = await callFunction('task', { action: 'list' })
      if (res.code === 0) {
        const list = (res.list || []).map(item => ({
          ...item,
          assigneeLabel: this.getAssigneeLabel(item.assignee),
          isCompleted: item.status === 'completed',
          timeStr: formatDate(item.createdAt, 'MM-DD HH:mm')
        }))
        this.setData({ list, loaded: true })
      }
    } catch (e) {
      this.setData({ loaded: true })
    }
  },

  getAssigneeLabel(assignee) {
    const map = { me: '我的', partner: 'TA的', both: '双方' }
    return map[assignee] || '双方'
  },

  // ===== 新建任务 =====
  onAdd() {
    this.setData({
      showAdd: true,
      form: { title: '', description: '', rewardPoints: 5, assignee: 'both' }
    })
  },

  onCloseAdd() { this.setData({ showAdd: false }) },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  onAssigneeSelect(e) {
    this.setData({ 'form.assignee': e.currentTarget.dataset.value })
  },

  async onSave() {
    const { title, description, rewardPoints, assignee } = this.data.form
    if (!title.trim()) return wx.showToast({ title: '请输入任务名', icon: 'none' })
    if (this.data.submitting) return
    this.setData({ submitting: true })

    try {
      await callFunction('task', {
        action: 'add',
        data: {
          title: title.trim(),
          description: description.trim(),
          rewardPoints: parseInt(rewardPoints) || 5,
          assignee
        }
      })
      wx.showToast({ title: '任务已发布', icon: 'success' })
      this.setData({ showAdd: false, submitting: false })
      this.loadTasks()
    } catch (e) {
      this.setData({ submitting: false })
    }
  },

  // ===== 查看详情 =====
  async onTapTask(e) {
    const id = e.currentTarget.dataset.id
    try {
      const res = await callFunction('task', { action: 'detail', data: { id } })
      if (res.code === 0) {
        const task = res.data
        task.timeStr = formatDate(task.createdAt, 'YYYY-MM-DD HH:mm')
        if (task.completedAt) {
          task.completedTimeStr = formatDate(task.completedAt, 'YYYY-MM-DD HH:mm')
        }
        this.setData({ showDetail: true, detailTask: task })
      }
    } catch (e) {
      console.error(e)
    }
  },

  onCloseDetail() { this.setData({ showDetail: false }) },

  // ===== 完成任务 =====
  async onComplete() {
    const task = this.data.detailTask
    if (!task || task.isCompleted || this.data.submitting) return

    wx.showModal({
      title: '确认完成',
      content: `完成「${task.title}」可获得 ${task.rewardPoints} 积分`,
      confirmText: '确认完成',
      confirmColor: '#E85D75',
      success: async (res) => {
        if (res.confirm) {
          if (this.data.submitting) return
          this.setData({ submitting: true })
          try {
            await callFunction('task', { action: 'complete', data: { id: task._id } })
            wx.showToast({ title: `完成！+${task.rewardPoints}积分`, icon: 'success' })
            this.setData({ showDetail: false })
            this.loadTasks()
          } finally {
            this.setData({ submitting: false })
          }
        }
      }
    })
  },

  // ===== 删除任务 =====
  async onDelete() {
    const task = this.data.detailTask
    if (!task || this.data.submitting) return
    wx.showModal({
      title: '删除任务',
      content: '确定删除此任务吗？',
      confirmColor: '#E85D75',
      success: async (res) => {
        if (res.confirm) {
          if (this.data.submitting) return
          this.setData({ submitting: true })
          try {
            await callFunction('task', { action: 'delete', data: { id: task._id } })
            wx.showToast({ title: '已删除', icon: 'success' })
            this.setData({ showDetail: false })
            this.loadTasks()
          } finally {
            this.setData({ submitting: false })
          }
        }
      }
    })
  }
})
