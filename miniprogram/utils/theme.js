/**
 * 主题配置
 */

const MOOD_TYPES = [
  { type: 'happy', emoji: '😊', label: '开心', color: '#FFD93D' },
  { type: 'love', emoji: '🥰', label: '甜蜜', color: '#FF6B81' },
  { type: 'calm', emoji: '😌', label: '平静', color: '#60A5FA' },
  { type: 'excited', emoji: '🤩', label: '兴奋', color: '#F472B6' },
  { type: 'miss', emoji: '🥺', label: '想念', color: '#A78BFA' },
  { type: 'grateful', emoji: '🙏', label: '感恩', color: '#34D399' },
  { type: 'tired', emoji: '😴', label: '疲惫', color: '#9CA3AF' },
  { type: 'anxious', emoji: '😰', label: '焦虑', color: '#FBBF24' },
  { type: 'sad', emoji: '😢', label: '委屈', color: '#6B7280' },
  { type: 'angry', emoji: '😤', label: '生气', color: '#EF4444' }
]

const POINT_REASONS = [
  { label: '做饭', icon: '🍳', points: 10 },
  { label: '请客', icon: '🍽️', points: 15 },
  { label: '准时回复', icon: '💬', points: 3 },
  { label: '陪伴', icon: '🤗', points: 10 },
  { label: '送礼物', icon: '🎁', points: 20 },
  { label: '认真道歉', icon: '🙇', points: 8 },
  { label: '夸夸对方', icon: '✨', points: 5 },
  { label: '记住喜好', icon: '💕', points: 10 },
  { label: '主动联系', icon: '📞', points: 5 },
  { label: '完成任务', icon: '✅', points: 10 },
  { label: '节日仪式感', icon: '🎉', points: 15 },
  { label: '分担压力', icon: '💪', points: 12 },
  { label: '小惊喜', icon: '🌟', points: 20 }
]

const POINT_LEVELS = [
  { name: '新手情侣', minPoints: 0, icon: '🌱' },
  { name: '甜蜜搭子', minPoints: 100, icon: '🍬' },
  { name: '默契满分', minPoints: 500, icon: '💯' },
  { name: '神仙伴侣', minPoints: 1000, icon: '👼' },
  { name: '灵魂伴侣', minPoints: 2000, icon: '💖' },
  { name: '天作之合', minPoints: 5000, icon: '👑' }
]

const ALBUM_CATEGORIES = [
  { name: '日常', icon: '📱' },
  { name: '约会', icon: '💑' },
  { name: '旅行', icon: '✈️' },
  { name: '美食', icon: '🍜' },
  { name: '自拍', icon: '🤳' },
  { name: '节日', icon: '🎄' }
]

const DISH_CATEGORIES = [
  { name: '主食', icon: '🍚' },
  { name: '甜品', icon: '🍰' },
  { name: '饮料', icon: '🧋' },
  { name: '火锅', icon: '🍲' },
  { name: '烧烤', icon: '🍖' },
  { name: '日料', icon: '🍣' },
  { name: '家常菜', icon: '🥘' },
  { name: '外卖', icon: '🛵' }
]

function getMoodByType(type) {
  return MOOD_TYPES.find(m => m.type === type) || MOOD_TYPES[0]
}

function getLevelByPoints(points) {
  let level = POINT_LEVELS[0]
  for (const l of POINT_LEVELS) {
    if (points >= l.minPoints) level = l
  }
  return level
}

const DEFAULT_SPEC_TEMPLATES = {
  '饮料': [
    { name: '规格', options: [{ name: '中杯', priceAdd: 0 }, { name: '大杯', priceAdd: 5 }] },
    { name: '甜度', options: [{ name: '全糖', priceAdd: 0 }, { name: '半糖', priceAdd: 0 }, { name: '无糖', priceAdd: 0 }] },
    { name: '温度', options: [{ name: '冰', priceAdd: 0 }, { name: '常温', priceAdd: 0 }, { name: '热', priceAdd: 0 }] }
  ],
  '火锅': [
    { name: '锅底', options: [{ name: '清汤', priceAdd: 0 }, { name: '麻辣', priceAdd: 10 }, { name: '鸳鸯', priceAdd: 15 }] }
  ]
}

module.exports = {
  MOOD_TYPES,
  POINT_REASONS,
  POINT_LEVELS,
  ALBUM_CATEGORIES,
  DISH_CATEGORIES,
  DEFAULT_SPEC_TEMPLATES,
  getMoodByType,
  getLevelByPoints
}
