<div align="center">

# LoveSpace

### 属于你们两个人的私密情侣空间

一款温暖治愈的情侣微信小程序，记录恋爱中的每一个珍贵瞬间

[微信小程序](https://mp.weixin.qq.com/) · [云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html) · [MIT License](LICENSE)

</div>

---

## 设计理念

**晨光奶油** — 像清晨第一缕阳光照在奶油蛋糕上的感觉

- 低饱和马卡龙色系，不刺眼不幼稚
- 贴纸化 UI，像一本会呼吸的恋爱手账
- 毛玻璃拟态 + 微动效，温柔治愈
- 统一的圆角/阴影/间距体系，精致有秩序

---

## 功能一览

| 模块 | 功能 |
|------|------|
| 首页 | 在一起天数 · 恋爱电量 · 纪念日倒计时 · 双人心情 · 每日情话 · 浮动粒子背景 |
| 纪念日 | 创建/编辑纪念日 · 倒计时 · 拍立得风格卡片 |
| 相册 | 分类相册 · 照片上传 · 日杂拼贴网格 |
| 点滴 | 记录生活瞬间 · 标签分类 · 随机回忆 · 时间轴展示 |
| 心情打卡 | 10种心情选择 · 日记输入 · 对方心情查看 · 日历视图 |
| 积分系统 | 快速加分 · 自定义项目 · 积分兑换 · 兑换记录 · 恋爱能量等级 |
| 点菜 | 菜品管理 · 分类筛选 · 随机推荐 · 点餐下单 · 通知对方 |
| 任务 | 指派任务 · 积分奖励 · 完成通知 · 任务详情 |
| 愿望清单 | 创建愿望 · 标记完成 |
| 时光胶囊 | 写给未来的信 · 开启时间设置 |
| 感谢墙 | 记录感谢 · 表达爱意 |
| 回忆时间轴 | 按月分组 · 日期选择 · 图片上传 · 拍立得风格 |
| 设置 | 自定义背景 · 解除绑定 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序原生 (WXML / WXSS / JS) + Vant Weapp |
| 后端 | 微信云开发 (云函数 + 云数据库 + 云存储) |
| 设计 | 自定义贴纸UI系统 · 毛玻璃拟态 · CSS动画 · Canvas粒子 |

**无自建服务器** — 全部运行在微信云开发平台上

---

## 项目结构

```
lovespace/
├── miniprogram/                    # 小程序前端
│   ├── app.js                      # 全局逻辑 + 云初始化
│   ├── app.json                    # 全局配置 + 自定义TabBar
│   ├── app.wxss                    # 晨光奶油设计系统
│   ├── custom-tab-bar/             # 自定义贴纸导航栏
│   │   ├── index.js / .wxml / .wxss / .json
│   ├── components/
│   │   ├── bg-layer/               # 全局背景层
│   │   └── floating-particles/     # 浮动粒子组件
│   ├── pages/
│   │   ├── index/                  # 首页 · 恋爱桌面
│   │   ├── login/                  # 登录 · 邀请码绑定
│   │   ├── profile/                # 个人中心
│   │   ├── album/                  # 相册列表
│   │   ├── album-detail/           # 相册详情
│   │   ├── anniversary/            # 纪念日
│   │   ├── anniversary-detail/     # 纪念日详情
│   │   ├── moments/                # 点点滴滴
│   │   ├── moment-edit/            # 编辑记录
│   │   ├── mood/                   # 心情打卡
│   │   ├── mood-calendar/          # 心情日历
│   │   ├── points/                 # 积分系统
│   │   ├── points-records/         # 积分记录
│   │   ├── menu/                   # 菜品管理
│   │   ├── menu-order/             # 点餐模式
│   │   ├── dish-detail/            # 菜品详情
│   │   ├── order-history/          # 点餐历史
│   │   ├── tasks/                  # 情侣任务
│   │   ├── wishes/                 # 愿望清单
│   │   ├── capsule/                # 时光胶囊
│   │   ├── quiz/                   # 情侣问答
│   │   ├── thanks/                 # 感谢墙
│   │   ├── timeline/               # 回忆时间轴
│   │   └── settings/               # 设置
│   ├── utils/
│   │   ├── cloud.js                # 云函数调用封装
│   │   ├── date.js                 # 日期工具函数
│   │   ├── storage.js              # 本地存储封装
│   │   └── theme.js                # 主题配置 + 数据常量
│   ├── images/                     # 图片资源
│   └── styles/                     # 全局样式
├── cloudfunctions/                 # 云函数
│   ├── login/                      # 登录 + 用户初始化
│   ├── couple/                     # 情侣绑定/解绑/信息
│   ├── user/                       # 用户资料更新
│   ├── anniversary/                # 纪念日CRUD
│   ├── album/                      # 相册CRUD
│   ├── photo/                      # 照片管理
│   ├── moments/                    # 点滴记录CRUD
│   ├── mood/                       # 心情打卡
│   ├── points/                     # 积分系统
│   ├── menu/                       # 菜品管理
│   ├── task/                       # 任务系统
│   ├── wish/                       # 愿望清单
│   ├── capsule/                    # 时光胶囊
│   ├── quiz/                       # 情侣问答
│   ├── thanks/                     # 感谢墙
│   ├── notification/               # 通知系统
│   └── utils/                      # 云函数工具
└── project.config.json             # 项目配置
```

---

## 快速开始

### 1. 注册小程序

在 [微信公众平台](https://mp.weixin.qq.com/) 注册小程序，获取 AppID

### 2. 配置项目

```bash
# 克隆项目
git clone https://github.com/526858590/LoveSpace.git
```

在 `project.config.json` 中填入你的 AppID

### 3. 安装依赖

用微信开发者工具打开项目：

```
工具 → 构建 npm
```

### 4. 开通云开发

```
微信开发者工具 → 云开发 → 开通
```

在 `app.js` 中修改云环境 ID：

```javascript
wx.cloud.init({
  env: 'your-cloud-env-id',  // 替换为你的环境ID
  traceUser: true
})
```

### 5. 部署云函数

右键每个云函数目录 → **上传并部署：云端安装依赖**

需要部署的云函数：
- login
- couple
- user
- anniversary
- album
- photo
- moments
- mood
- points
- menu
- task
- wish
- capsule
- quiz
- thanks
- notification

### 6. 创建数据库集合

在云开发控制台创建以下集合：

```
users, couples, anniversaries, albums, photos,
moments, moods, points, point_exchanges,
point_exchange_records, dishes, orders,
tasks, wishes, capsules, quizzes, thanks,
milestones, notifications
```

### 7. 运行

在微信开发者工具中编译预览

---

## 设计规范

### 配色

| 用途 | 色值 | 说明 |
|------|------|------|
| 页面背景 | `#FCFAF7` | 奶油白 |
| 卡片背景 | `#FFFFFF` | 纯白 |
| 主色调 | `#E8D0D0` | 雾霾粉 |
| 强调色 | `#F2D4D4` | 蜜桃粉 |
| 辅助色 | `#D4C5B0` | 香槟金 |
| 主文字 | `#3C3C3C` | 深灰 |
| 次文字 | `#8A8580` | 中灰 |
| 弱文字 | `#BFBAB5` | 浅灰 |

### 圆角

| 元素 | 圆角值 |
|------|--------|
| 照片 | 12rpx |
| 功能卡片 | 24rpx |
| 小组件卡片 | 28rpx |
| 弹窗顶部 | 36rpx |
| 胶囊按钮 | 999rpx |

### 动效

| 效果 | 时长 | 缓动 |
|------|------|------|
| 卡片点击 | 150ms | ease-out |
| 页面切换 | 300ms | ease-in-out |
| 卡片入场 | 400ms | cubic-bezier |
| 呼吸光晕 | 2-3s | ease-in-out 循环 |
| 心跳动画 | 1.2s | ease-in-out 循环 |
| 浮动粒子 | 6-8s | ease-in 循环 |

---

## 数据库设计

### 核心集合

| 集合 | 用途 | 关键字段 |
|------|------|----------|
| `users` | 用户信息 | `_id(openid)`, `nickName`, `avatarUrl`, `coupleId` |
| `couples` | 情侣关系 | `creator`, `partner`, `startDate`, `inviteCode` |
| `moods` | 心情记录 | `userId`, `coupleId`, `moodType`, `date` |
| `points` | 积分流水 | `coupleId`, `fromUser`, `toUser`, `amount`, `reason` |
| `tasks` | 情侣任务 | `coupleId`, `title`, `assignee`, `status`, `rewardPoints` |
| `moments` | 点滴记录 | `coupleId`, `content`, `images`, `tags`, `eventDate` |

---

## 组件说明

### 自定义 TabBar

位于 `custom-tab-bar/`，使用贴纸风格的小动物图标（🐰🐻🐶🌸），配合毛玻璃底栏和 Q 弹切换动画。

### 浮动粒子

位于 `components/floating-particles/`，支持三种模式：
- `sparkle` — 光点缓慢上升
- `heart` — 小爱心漂浮
- `mix` — 混合粒子

### 背景层

位于 `components/bg-layer/`，支持自定义背景图片，通过 `opacity` 控制透明度。

---

## 协作方式

本小程序仅供两人使用，通过 **邀请码** 绑定：

1. 用户 A 创建空间 → 获得 6 位邀请码
2. 用户 B 输入邀请码 → 完成绑定
3. 绑定后共享所有数据

---

## 许可证

[MIT License](LICENSE)

---

<div align="center">

**用代码记录爱情，用技术守护回忆**

Made with 💕

</div>
