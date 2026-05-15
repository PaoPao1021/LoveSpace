/**
 * 本地缓存封装
 */

const PREFIX = 'ls_'

function set(key, value, expireMs) {
  const data = {
    value,
    timestamp: Date.now(),
    expire: expireMs || 0
  }
  wx.setStorageSync(PREFIX + key, JSON.stringify(data))
}

function get(key) {
  try {
    const raw = wx.getStorageSync(PREFIX + key)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.expire && Date.now() - data.timestamp > data.expire) {
      wx.removeStorageSync(PREFIX + key)
      return null
    }
    return data.value
  } catch (e) {
    return null
  }
}

function remove(key) {
  wx.removeStorageSync(PREFIX + key)
}

function clear() {
  try {
    const res = wx.getStorageInfoSync()
    res.keys.forEach(key => {
      if (key.startsWith(PREFIX)) {
        wx.removeStorageSync(key)
      }
    })
  } catch (e) {
    console.error('清除缓存失败:', e)
  }
}

module.exports = { set, get, remove, clear }
