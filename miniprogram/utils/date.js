/**
 * 日期工具函数
 */

/**
 * 格式化日期
 */
function formatDate(date, format = 'YYYY-MM-DD') {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  const second = String(d.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second)
}

/**
 * 计算两个日期之间的天数差
 */
function daysBetween(date1, date2) {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  d1.setHours(0, 0, 0, 0)
  d2.setHours(0, 0, 0, 0)
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24))
}

/**
 * 计算距离目标日期还有多少天（正数=未来，负数=过去）
 */
function daysUntil(targetDate) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return daysBetween(today, new Date(targetDate))
}

/**
 * 计算已经过去多少天
 */
function daysSince(startDate) {
  return Math.abs(daysBetween(new Date(startDate), new Date()))
}

/**
 * 获取下一个纪念日日期（循环纪念日）
 */
function getNextAnniversaryDate(anniversaryDate) {
  const today = new Date()
  const ann = new Date(anniversaryDate)
  const thisYear = today.getFullYear()

  let next = new Date(thisYear, ann.getMonth(), ann.getDate())
  if (next < today) {
    next = new Date(thisYear + 1, ann.getMonth(), ann.getDate())
  }
  return next
}

/**
 * 友好的时间描述
 */
function timeAgo(dateStr) {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date

  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)}天前`
  return formatDate(dateStr, 'MM-DD')
}

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
function getToday() {
  return formatDate(new Date(), 'YYYY-MM-DD')
}

/**
 * 获取当前时间字符串
 */
function getNow() {
  return formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
}

/**
 * 获取星期几
 */
function getWeekDay(date) {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  return '星期' + days[new Date(date).getDay()]
}

/**
 * 获取月份天数
 */
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

module.exports = {
  formatDate,
  daysBetween,
  daysUntil,
  daysSince,
  getNextAnniversaryDate,
  timeAgo,
  getToday,
  getNow,
  getWeekDay,
  getDaysInMonth
}
