# LoveSpace 上线清单

这份清单只保留必须由小程序后台、云开发控制台或真机完成的步骤。代码侧的语法、权限校验、并发幂等和原生模板编译由 `scripts/validate-project.ps1` 自动检查。

## 1. 账号与环境

- 确认 `project.config.json` 的 AppID 属于准备发布的主体。
- 确认 `miniprogram/config/index.js` 的 `cloudEnvId` 是正式云环境，不是测试环境。
- 确认正式环境已与当前微信小程序 AppID 关联。
- 在微信公众平台补全服务类目、名称、图标、简介、用户隐私保护指引和小程序备案信息。
- 隐私指引至少说明：头像/昵称、相册图片、情侣共同记录、云存储和订阅消息的用途、保存方式与删除方式。

## 2. 数据库

创建以下 24 个集合：

```text
users, couples, couple_invites, anniversaries, albums, photos,
moments, moods, daily_questions, points, point_exchanges,
point_exchange_records, point_balances, dishes, orders,
tasks, wishes, capsules, quizzes, notifications, menu_categories,
fitness_goals, fitness_checkins, fitness_challenges
```

所有集合的客户端权限设置为“所有用户不可读写”。情侣共同数据不应使用 `_openid` 作为客户端授权依据，全部访问由云函数检查 `coupleId` 和成员身份。

建议创建以下复合索引：

- `couples`: `inviteCode + status + partner`
- `anniversaries`: `coupleId + isTop + date`
- `albums`: `coupleId + createdAt`
- `photos`: `albumId + createdAt`
- `moments`: `coupleId + createdAt`、`coupleId + tags + createdAt`
- `moods`: `userId + date`、`coupleId + date`
- `daily_questions`: `coupleId + createdAt`
- `points`: `coupleId + toUser`、`coupleId + createdAt`
- `point_balances`: `coupleId + userId`
- `notifications`: `coupleId + toUser + read + createdAt`
- `tasks`: `coupleId + status + createdAt`
- `orders`: `coupleId + createdAt`
- `fitness_challenges`: `coupleId`

## 3. 云函数

上传并部署这 17 个云函数，选择“云端安装依赖”：

```text
login, couple, user, anniversary, album, moments, mood, points,
menu, task, wish, capsule, quiz, notification,
daily-question, monthly-report, fitness
```

部署带 `config.json` 的函数时必须同步上传配置，否则文本安全检查和订阅消息会因缺少 OpenAPI 权限失败。`notification` 部署后再执行“上传触发器”，确认 `dailyAnniversaryReminder` 已创建。

云函数运行时环境变量：

- `ORDER_TEMPLATE_ID`：点单/任务通知模板 ID；当前代码保留项目原模板作为回退值。
- `ANNIVERSARY_TEMPLATE_ID`：纪念日提醒模板 ID；未配置时仍会生成站内通知，但不会发送订阅消息。

模板字段必须与代码一致：

- 点单/任务：`thing1`、`thing2`、`amount3`
- 纪念日：`thing1`、`number2`

## 4. 内容与图片安全

- 用户输入的主要文本已在写入前调用 `security.msgSecCheck`，发布前用正常文本和违规测试文本各验证一次。
- 图片目前保存到云存储并校验归属与协议。正式审核前，应按主体类目在微信后台配置图片/音视频内容安全方案；若启用 `mediaCheckAsync`，需要补齐结果回调、失败状态和人工复核流程。
- 云存储权限设置为禁止任意公共写入；上传路径按情侣空间分区。

## 5. 自动检查

在项目根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-project.ps1
```

检查必须以退出码 0 结束。若本机安装了微信开发者工具，脚本会额外调用微信原生 WXML/WXSS 编译器。

## 6. 双账号真机验收

使用两个从未绑定过的测试微信账号，在两部真机上完整执行：

1. A 创建空间，B 使用邀请码加入；重复使用邀请码必须失败。
2. 双方分别回答每日问题；单方完成时看不到对方答案，双方完成后同时揭晓。
3. 双方心情均可见；“仅自己”记录在对方首页、列表和日历中均不可见。
4. 新建、编辑、删除纪念日和点滴；上传、预览、删除照片。
5. 连续快速点击加分、兑换和完成任务；不得重复记账，余额不得变为非法负数。
6. 点单后只生成一条站内通知；拒绝订阅授权时点单仍成功。
7. 创建未来胶囊；到期前任何列表或详情接口都不能返回正文。
8. A 解除空间；双方重新进入后均处于未绑定状态，旧数据不可通过新空间访问。
9. 弱网、断网、切后台和重复进入页面时，无永久 loading、白屏或重复提交。
10. 双方设置不同健康目标和体重隐私；“仅自己”不得向对方返回体重或趋势，“仅趋势”不得返回具体体重。
11. 双方反复更新同一天健康打卡，记录不得重复；完成挑战时每人只增加一次积分。
12. Android 与 iOS 各检查一次安全区、长昵称、空数据、键盘顶起和大图上传。

## 7. 提审前最后确认

- 体验版无控制台错误，云函数日志无连续 5xx/超时/权限错误。
- 所有订阅消息文案、页面路径和模板字段与公众平台配置一致。
- 代码包大小、分包和资源域名检查通过。
- 删除测试数据、测试模板 ID和无效云文件；保留数据库备份。
- 上传体验版并完成成员验收后，再提交审核；不要直接从开发版跳到正式发布。
