# LoveSpace - 情侣微信小程序

## 项目概述
仅供两人使用的私密情侣小程序，集成纪念日、相册、心情、积分、点菜等功能。

## 技术栈
- 前端: 微信小程序原生 (WXML/WXSS/JS) + Vant Weapp
- 后端: 微信云开发 (云函数 + 云数据库 + 云存储)
- 无自建服务器

## 项目结构
```
lovespace/
├── miniprogram/          # 小程序前端
│   ├── pages/            # 22个页面
│   ├── utils/            # 工具函数 (cloud.js, date.js, storage.js, theme.js)
│   ├── images/           # 图片资源
│   └── styles/           # 全局样式
├── cloudfunctions/       # 云函数
│   ├── login/            # 登录
│   ├── couple/           # 绑定关系
│   ├── anniversary/      # 纪念日
│   ├── album/            # 相册
│   ├── moments/          # 点点滴滴
│   ├── mood/             # 心情
│   ├── points/           # 积分
│   ├── menu/             # 点菜
│   ├── task/             # 任务
│   ├── wish/             # 愿望
│   ├── capsule/          # 时光胶囊
│   └── notification/     # 通知
└── project.config.json
```

## 数据库集合 (15个)
users, couples, anniversaries, albums, photos, moments, moods, points, dishes, tasks, wishes, capsules, quizzes, thanks, milestones

## 云函数调用方式
```js
const { callFunction } = require('../../utils/cloud')
const res = await callFunction('函数名', { action: '操作', data: { ... } })
```

## 开发流程
1. 在微信公众平台注册小程序获取 AppID
2. 在 `project.config.json` 填入 AppID
3. 微信开发者工具打开项目
4. 工具 -> 构建 npm (安装 Vant Weapp)
5. 开通云开发，创建环境
6. 在 `app.js` 修改云环境 ID
7. 上传并部署所有云函数
8. 在云开发控制台创建数据库集合

## 样式约定
- 主色调: #FF6B81 (粉红)
- 背景色: #FFF5F5
- 圆角: 24rpx (卡片), 999rpx (胶囊按钮)
- 全局变量定义在 `app.wxss`
