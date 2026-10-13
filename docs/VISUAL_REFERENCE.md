# 01–10 效果图 → 实现映射与视觉取舍

> 施工基线：`Share-a-Journey_开发文档.md` V3.1 第 1、2、9 节。
> **重要前提**：本工作目录中没有收到《第七组_界面效果图.zip》里的 01–10 原始 PNG，因此本次施工严格按施工文档 §2「视觉系统与页面布局（施工级规格）」的文字尺寸、HEX、结构与英文标签实现，并用真实浏览器截图（`docs/screenshots/`）作为视觉证据。收到原始 PNG 后请放入 `docs/reference/`，再对照微调间距与阴影；`docs/reference/` 已预留。

---

## 1. 逐图映射

| 效果图 | 目标结构 | 实现位置 | 本版状态 | 证据截图 |
|---|---|---|---|---|
| 01 首页浏览与批量选择 | Logo / Browse·Activity 导航 / 绿色 Post a Journey / 4 条件筛选 / 3×2 卡片 / 复选框 / Apply to Selected / 底部活动摘要 | `index.html`（`app-header`、`filter-form`、`journey-grid`、`selection-bar`、`activity-shortcut`）、`ui.js: renderBrowse/buildCard/renderSelectionBar` | 完成 | `01_browse.png`、`01b_selection.png`、`01c_browse_after_post.png` |
| 02 首次填写个人资料 | Your Details 对话框、Name/Phone/Email、资料展示范围提示、Save and Continue | `#profile-dialog`、`ui.js: renderProfileDialog`、`app.js: startPublishIntent/startApplyIntent/resumePendingIntent` | 完成（含取消不误操作） | `02_profile.png`、`02b_profile_guest.png` |
| 03 发布信息弹窗 | Post a Journey、双发布类型大单选卡、只读已存联系方式、路线日期时间、Notes、Publish | `#post-dialog`、`ui.js: renderPostDialog`、`rules.js: validatePost/createPost` | 完成（含校验与独立凭据） | `03_post_validation.png` |
| 04 详情与一键申请 | Journey Details、路线双列、日期时间、发布者、公开电话邮箱、Notes、Apply | `#details-dialog`、`ui.js: renderDetails` | 完成（Apply 后仅 Pending） | `04_details.png` |
| 05 批量申请提交结果 | “N applications submitted”、逐条 Record ID / Management Code / Copy / Pending / 查看申请 | `#results-dialog`、`ui.js: renderResults`、`rules.js: applyToPosts` | 结构完成（单条与批量，含部分失败） | `05_results_single.png`、`05b_results_batch.png` |
| 06 首页申请待确认状态 | My Activity 全宽、3 标签、待确认摘要条、列表型数据行、Refresh Status | `#activity-view`、`ui.js: renderActivity/renderMyApplications` | 完成（含操作列：Withdraw / Cancel Confirmed Journey） | `06_activity.png` |
| 07 已同意与其他申请自动取消 | 绿色 Accepted 横幅、状态原因、1 Accepted + 2 Automatically Cancelled | `ui.js: renderMyApplications` 的 Accepted 横幅、`rules.js: acceptApplication/activeAcceptedFor` | 完成 | `07_accepted_banner.png`、`07b_after_cancel_reopen.png` |
| 08 发布者查看并处理申请 | Received Applications 大弹窗、发布摘要、申请者联系方式、Decline/Accept、Cancel Post | `#received-dialog`、`ui.js: renderReceivedDialog`、`rules.js: acceptApplication/declineApplication/cancelPost` | 完成（真审批，弹窗原地刷新） | `08_received_accept.png`、`08b_received_after_accept.png` |
| 09 管理码访问记录 | Manage a Record、Record ID、Management Code、错误提示、View Record | `#manage-dialog`、`rules.js: verifyManagementCode`，记录视图内可直接执行可用操作 | 完成（错码不显示记录，且记录视图可撤销/取消） | `09_manage_wrong_code.png`、`09b_manage_actions.png` |
| 10 使用帮助弹窗 | 6 步 How It Works、联系方式可见范围、主动刷新提示 | `#help-dialog`（静态内容，与真实行为一致） | 完成 | `10_help.png` |

---

## 2. 与本施工文档一致的实现要点

1. **双主视图**：`Browse` 与 `My Activity` 在同一 DOM 内切换 `hidden`，不改 URL、不加载新页面；返回 Browse 保留此前筛选条件（`app.js: switchView` + `uiState.filters` 常驻）。
2. **布局**：顶栏白底细分隔线；标题/副标题；单张筛选白卡（四字段 + Search/Clear Filters）；3 列卡片（`≥1100px`）/2 列（`720–1099px`）/1 列（`<720px`）；常驻选择操作条（有选中才出现，`position: sticky`）；底部 My Activity 快捷入口。
3. **卡片**：白底细边 12px 圆角；选中后绿色边框 + 勾选；`Driver` 浅绿徽标、`Passenger` 浅蓝徽标；本人发布显示 `Your Post` 并禁选；已有有效申请显示 `Pending` 并禁选；城市名允许换行（`Palmerston North` 实测不截断）。
4. **弹窗组件统一**：全部 `native <dialog> + showModal()`、`::backdrop` 半透明灰蓝、`dialog-header / dialog-body / dialog-footer` 三段式、宽度 560 / 680 / 860 三档、`max-width: calc(100vw - 32px)`、`max-height: calc(100dvh - 32px)`、正文可滚动而底部操作栏常驻。
5. **状态不靠颜色**：`Pending` 暖黄、`Accepted` 浅绿、`Automatically Cancelled` 灰蓝，同时始终保留状态英文文字与原因说明。
6. **键盘与焦点**：打开后焦点进入弹窗标题，关闭（含 Escape）后焦点回到触发按钮；Tab 可遍历；`My Activity` 标签支持 ←/→/Home/End。
7. **本机边界文案**：全部使用 `this browser / local demo`，管理码弹窗写明 `Use the record ID and code to reopen it in this local demo.`，How It Works 明确“另一浏览器或另一台电脑是空的”。

---

## 3. 有意的偏差与说明（都不是功能删减）

| 项 | 说明 |
|---|---|
| 效果图原图缺失 | 见本文件开头：按施工文档 §2 文字规格实现，结构、层级、英文标签一致，不追求逐像素还原。 |
| 头像与大图标 | 按要求用 CSS 首字母圆形头像 + 内联 SVG，无图标库、无 CDN、无外部字体。 |
| 日期输入控件 | `<input type="date">` 是浏览器原语控件，其占位与格式跟随**浏览器界面语言**，不跟随页面文案；在英文界面下显示 `dd/mm/yyyy`。证据截图使用 `--lang=en-NZ` 启动浏览器以保证与英文页面一致。 |
| 管理码位置 | 公开卡片与公开详情**不出现**管理码；仅发布者/申请者自己的 My Activity、发布成功结果卡与管理码弹窗中可见。 |
| 效果图 05 的提前实现 | 批量申请与逐条凭据属于 DAY 2 计划，但它与单条申请共用 `applyToPosts`，DAY 1 顺手完成后即被自动化测试覆盖。 |
| 危险操作按钮 | 按 §2.1「危险操作用文字/描边强调，不与普通确认同色」：`Cancel Post` / `Cancel Confirmed Journey` 用白底红字描边（`.btn-danger`），只有确认框里的最终确认是实心红（`.btn-danger-solid`）。 |
| 审批反馈方式 | 图 08 的审批不弹“结果大对话框”，而是**弹窗原地刷新**（发布变 `Confirmed`、被接受那行变 `Accepted`、其他人变 `Not Selected`）并用一条 Toast 说明连带影响。原因：审批是就地操作，原地反馈比再叠一层弹窗更不容易让人迷失。 |
