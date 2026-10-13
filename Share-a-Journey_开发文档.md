# Share-a-Journey｜单人三天 localhost 演示版施工方案 V3.1

> 修订日期：2026-10-13  
> 需求基线：《第七组 Share-a-Journey 功能页面说明》V1.0  
> 视觉基线：《第七组_界面效果图.zip》内 01–10 共十张独立 PNG、00 总览图及《制作说明》  
> 上版基线：《Share-a-Journey_单人三天localhost演示版施工方案_v3.0.md》  
> **冻结条件：一个人、三天、仅 localhost、网页英文、开发文档中文、功能范围不删减、用于 PPT/课堂可重复演示。**

## 0. 决策与交付定义

**施工目标：用真实 HTML/CSS/JavaScript 重现效果图中的页面结构和可见状态，并让按钮经本地状态机完成实际业务操作；不是把效果图直接贴成静态图片。**

- **运行环境**：VS Code + Live Server，地址以实际端口为准，例如 `http://127.0.0.1:5500/index.html?demo=1`；不安排公网部署、域名、后端或数据库。
- **技术**：一个 `index.html`、一个 `style.css`、原生 JavaScript ES6、CSV 初始数据、`localStorage` 保存本机状态；`JSON.stringify/parse` 仅在 `store.js` 内部使用，不用人工编写 JSON 文件。
- **功能保留**：司机/乘客双向发布；首次一次性资料；组合筛选；公开详情；单条/同类型批量申请；独立记录编号与管理码；My Activity；发布者同意/拒绝；跨申请自动取消；撤回、取消发布、取消已确认同行、到期；帮助说明。
- **效果图定位**：是**界面目标样式与页面状态参考**，不是可执行网站源码。每张图可能呈现不同演示数据与用户状态，不能直接认为十张图属于同一次连续操作。
- **不可能伪装的能力**：真实跨浏览器数据恢复、不同设备即时共享、后端隐私保护、两个客户端真实并发事务，都不在静态 localhost 的能力内。可用“同一浏览器多个虚拟身份 + 共享本地状态”演示**相同业务规则**，说明为 `DEMO_ONLY`。
- **视觉取舍**：达到布局、层级、组件和状态的**一致性**，不追求对 PNG 逐像素还原；禁止因追求阴影/图标细节挤掉正确性验收。

### 0.1 相对 V3.0 必改之处

| 分类 | V3.0 约定 | V3.1 根据效果图冻结的施工要求 |
|---|---|---|
| 首页视图 | 首页含列表与活动区 | 单一 HTML 的 **Browse / My Activity 两个主视图**，顶部导航切换内容、不跳转新页面；Browse 底部保留 My Activity 快捷入口 |
| 首页布局 | 六个功能区 | 顶部横向导航、标题/副标题、四条件搜索面板、3 列卡片、常驻选择操作条（选中时显示）、底部活动入口 |
| 发布与申请 | 同页弹窗 | 弹窗统一结构：遮罩 + 顶部标题/说明 + 正文 + 底部取消/确认；按钮文案与效果图对应 |
| 活动状态 | 直接显示活动区 | My Activity 主视图含三标签 My Posts / My Applications / Received Applications、状态横幅和 Refresh Status |
| 结果反馈 | 通用结果对话框 | **批量申请逐条结果卡**：显示对应路线、Pending、Record ID、Management Code、Copy 与 View My Applications |
| 审批 | Manage 显示操作 | 增加**Received Applications 具体处理面板**，发布摘要及每个申请者行均可 Decline / Accept |
| 演示身份 | Alice/Bob/Carol/David | 截图主要采用 Alex Taylor、Adam Wilson、Mia Chen、Tom Reed 等示例；本版演示剧本优先统一成 Alex 申请 Adam/Mia/Tom，Adam 同意，另外两条自动取消 |
| 测试时间 | CSV 固定未来日期 | 效果图中 `20 Oct 2026` 是视觉样例；初始化演示数据必须生成**相对于演示当天仍在未来**的日期，防止课上全部过期 |
| 可见性文案 | 说明单浏览器边界 | 效果图中 “another browser” 的提示**不原样照搬**；localhost 演示版统一说明“this browser / local demo” |

## 1. 十张效果图 → 施工模块 / 验收映射

| 效果图文件 | 可以直接观察的视觉与文字目标 | 功能实现位置 | 最小验收证据 |
|---|---|---|---|
| `01_首页浏览与批量选择.png` | Logo、Browse/Activity 导航、绿色 Post a Journey、4 条件筛选、6 张示意卡（3×2）、复选框、Apply to Selected、底部活动摘要 | `index.html` / `ui.js` / `app.js` | 两条同类型卡片可选；选中统计与绿色操作条同步；筛选工作 |
| `02_首次填写个人资料.png` | Your Details 对话框、Name/Phone/Email、资料展示范围提示、Save and Continue | `profile-dialog` | 首次触发发布/申请才打开；资料保存后恢复原意图 |
| `03_发布信息弹窗.png` | Post a Journey、双发布类型大单选卡、只读已存联系方式、路线日期时间、Notes、Publish | `post-dialog` | 两类发布均成功，输入校验及凭据结果明确 |
| `04_详情与一键申请.png` | Journey Details、路线双列、日期时间、发布者、公开电话邮箱、Notes、Apply | `details-dialog` | 展示目标记录；点击 Apply 后仅变 Pending，不隐藏发布 |
| `05_批量申请提交结果.png` | “2 applications submitted”、每条 Record ID/Management Code/Copy、Pending、查看申请 | `results-dialog` | 独立编号和码；部分失败逐条说明；Copy 操作真实可用 |
| `06_首页申请待确认状态.png` | My Activity 全宽内容、3 标签、待确认摘要条、列表型数据行、Refresh Status | `activity-view` | 已发申请在 My Applications 中出现，含状态与操作 |
| `07_已同意与其他申请自动取消.png` | 绿色 Accepted 横幅、状态原因、“2 other pending applications...”和 1 Accepted + 2 Automatically Cancelled | `activity-view` / `rules.js` | Accept 后按真实状态快照更新三条记录 |
| `08_发布者查看并处理申请.png` | Received Applications 大弹窗、发布摘要、申请者联系方式、每人 Decline/Accept、Cancel Post | `received-dialog` | 仅发布者视图显示对应申请详情；审批按钮真能改状态 |
| `09_管理码访问记录.png` | Manage a Record、Record ID、Management Code、错误提示与 View Record | `manage-dialog` | 错码不得展示记录、正确码按记录类型打开管理视图 |
| `10_使用帮助弹窗.png` | 6 步 How It Works、联系方式可见范围、主动刷新通知提示 | `help-dialog` | 说明与当前 demo 行为一致、可关闭、手机端可滚动 |

**特别说明**：效果图第 08 张演示的是 Passenger 发布下司机申请，第 07 张演示的是另一组司机发布下乘客申请；它们是不同状态实例。演示数据及角色切换应按业务规则构造，**不能把两张图的姓名与记录号硬拼成同一笔申请**。

## 2. 视觉系统与页面布局（施工级规格）

> 本节尺寸与 HEX 是依据截图风格提出的**建议实现值**，不是 ZIP 中附带的 CSS 源码或逐像素反推的官方规范；可用实际预览微调。

### 2.1 CSS 设计变量

```css
:root {
  --page: #f5f7f8;        /* 整页浅灰 */
  --surface: #ffffff;     /* 卡片和弹窗 */
  --ink: #173041;         /* 主标题 */
  --muted: #718698;       /* 次级文字 */
  --primary: #248879;     /* 青绿按钮、选中线 */
  --primary-soft: #eaf5f0;
  --border: #dce5e9;
  --info-bg: #eff4f6;
  --success-bg: #eaf7ef;
  --warning-bg: #fff4dc;
  --radius: 12px;
  --content-width: 1360px;
  --shadow-dialog: 0 24px 70px rgba(15, 43, 55, .20);
}
```

- 字体：`system-ui, -apple-system, "Segoe UI", Arial, sans-serif`；无 CDN / 外部字体依赖。
- 基础：`box-sizing: border-box`、全页 `min-height: 100vh`、内容居中，顶部白色横栏有细分隔线。
- 行程卡：白底、细灰线边框、约 12px 圆角；选中后绿色边框及勾选框；发布类型 driver 用浅绿徽标，passenger 用浅蓝徽标。
- 状态：`Pending` 暖黄、`Accepted` 浅绿、`Automatically Cancelled` 灰蓝；同时保留**英文状态文字 + 原因**，不能只靠颜色。
- 按钮：主按钮青绿底白字；次要按钮白底灰边框；危险操作（取消发布）用文字/描边强调，不与普通确认同色。

### 2.2 Browse 主视图

```text
<header> Brand | Browse | My Activity | Manage a Record | How It Works | + Post a Journey | Demo Person
<main>
  <section class="hero"> eyebrow / title / intro </section>
  <form id="filter-form"> origin / destination / date / postType / Search / Clear Filters </form>
  <section id="browse-view">
    <h2>Available journeys</h2> + result-count + sort-label
    <div id="journey-grid"> 3-column grid cards </div>
    <section id="selection-bar"> number / type / Clear Selection / Apply to Selected </section>
    <section id="activity-shortcut"> My Activity + counters + open view </section>
  </section>
  <section id="activity-view" hidden> ... </section>
</main>
<footer> Group 7 design concept · Fictional data · Local demo </footer>
```

- 桌面约 `≥1100px`：3 列；中等宽度 `720–1099px`：2 列；窄屏 `<720px`：1 列。
- 筛选面板为单张白卡，四个字段 + Search / Clear Filters，可在窄屏自动换行；卡片应允许标题换行，不能截断较长城市名 `Palmerston North`。
- 由用户主动选择行程：改变任何已应用筛选条件要清空尚未提交选择；同一批次只能选择同一种 Post Type；本人发布显示 `Your Post` 并禁选，已有有效待确认申请显示 `Pending`。
- 列表默认仅显示 Open 且未到期，按出发时间升序；无结果文案 `No journeys found`，提供 Clear Filters 与 Post a Journey。
- `My Activity` 顶部导航切换**同一 DOM 页内视图**，不变更 URL 或加载新 HTML；回到 Browse 保留此前搜索条件。

### 2.3 My Activity 主视图

- 页面一级标题 `My Activity`，旁边 `Refresh Status`；内层是 3 个 Tab：`My Posts`、`My Applications`、`Received Applications`，有真实数量徽章。
- My Applications：状态摘要横幅 + 记录表。字段按图为 Journey / Publisher、Departure、Record ID、Application Status、Action；手机端将各行变为纵向卡片而非强行放下五列。
- 收到申请既可通过 Tab 查看摘要，也可点某条 `Manage` 打开 `Received Applications` 弹窗（图 08）审批；一个人只能操作自己的发布。
- Accepted 横幅含 `View Confirmed Journey` 与 `Cancel Confirmed Journey`；自动取消的其他申请保留并写清楚原因。
- Refresh Status 对本地状态重新读取并重新渲染，不要制造虚假的远程拉取动画或声称服务器更新。

### 2.4 弹窗组件统一规范

- 全部使用原生 `<dialog>` + `showModal()`；使用 `::backdrop` 半透明灰蓝蒙层，保留背景但不可交互。
- 对话框结构统一：`dialog-header`（眉题/标题/简介/关闭 X）→ `dialog-body`（可滚动）→ `dialog-footer`（说明 / Cancel / 主动作）。
- 对话框宽度按内容取约 520–860px；`max-width: calc(100vw - 32px)`；`max-height: calc(100dvh - 32px)`；正文 `overflow-y: auto`，底部操作栏始终可见。
- 打开后聚焦标题或首个可输入元素；关闭后焦点回到触发按钮；支持 Tab/Enter/Escape，错误消息使用文字显示并关联对应控件。
- 发布表单未保存关闭时先提示放弃修改；普通详情、帮助与结果弹窗关闭后不改变首页筛选。
- 截图中大图标、头像和车图标可用简单内联 SVG / CSS 图形，不引入图标库；头像可使用首字母圆形占位。

## 3. 组件 / 事件 / 数据的冻结契约

### 3.1 DOM ID（禁止临时改名）

| 页面/弹窗 | ID | 事件与对应业务 |
|---|---|---|
| 导航与主视图 | `browse-view`, `activity-view`, `nav-browse`, `nav-activity` | `switchView(view)` 保留筛选条件，切换 `hidden` 和 `aria-current` |
| 搜索 | `filter-form`, `origin-filter`, `destination-filter`, `date-filter`, `type-filter` | Search → `filterPosts()`；Clear Filters 重置并清空选择 |
| 结果 | `journey-grid`, `results-count`, `selection-bar`, `selected-count`, `apply-selected-btn` | 卡片渲染、多选、批量申请 |
| 活动 | `activity-tabs`, `my-posts-panel`, `my-applications-panel`, `received-panel`, `refresh-status-btn` | Tab 切换、状态渲染、从本地快照刷新 |
| 个人资料 | `profile-dialog`, `profile-form` | `saveProfileAndResume()` 保存一次资料并恢复挂起动作 |
| 发布 | `post-dialog`, `post-form` | `createPost()`，成功展示发布 ID/码 |
| 详情 | `details-dialog`, `details-body`, `details-apply-btn` | `openDetails(postId)` / `applyToPosts()` |
| 批量结果 | `results-dialog`, `results-body` | 展示逐条成功失败、Copy、View My Applications |
| 管理入口 | `manage-dialog`, `manage-form` | `verifyManagementCode()` 后打开记录管理内容 |
| 收到申请 | `received-dialog`, `received-body` | 仅对应发布者可以 `acceptApplication/declineApplication` |
| 帮助 | `help-dialog` | 六步 How It Works 及本机边界 |
| 演示工具 | `demo-tools`, `demo-person-select`, `demo-reset-btn` | 只在 `?demo=1` 出现；切换虚拟身份/重置 |

### 3.2 事件不能直接改业务状态

```text
用户按钮/表单提交
  ↓（app.js：提取参数、处理 modal/focus、拦截连续点击）
业务纯函数（rules.js）：校验身份/状态/到期 → 计算 nextState + result
  ↓（store.js：成功时一次 commit）
localStorage：单份快照
  ↓
ui.js：renderBrowse / renderActivity / renderDialog / renderResult
```

- `app.js` 管协调；`ui.js` 只显示；`rules.js` 只处理业务规则；`store.js` 只负责读取、初始化、保存与重置。
- 统一使用 `window.SJ` 命名空间和按顺序 `defer` 脚本（或 ES module，二选一，不混用）；本版选 `window.SJ`，学习与调试门槛较低。
- 操作 API：`createPost`、`applyToPosts`、`acceptApplication`、`declineApplication`、`withdrawApplication`、`cancelPost`、`cancelJourney`、`expireRecords`、`getActivity`、`verifyManagementCode`，接口签名沿用 V3.0。
- DOM 写入用户字段使用 `textContent` / `createElement`，不拼接用户输入到 `innerHTML`。任何持久化失败必须显示错误，**禁止弹出虚假的成功提示**。

### 3.3 临时动作和主视图状态

```text
uiState = {
  view: "browse" | "activity",
  activityTab: "my-posts" | "my-applications" | "received",
  filters: { origin, destination, date, postType },
  selectedPostIds: Set,
  pendingIntent: null | { kind: "publish"|"single-apply"|"batch-apply", payload },
  currentDetailsPostId: null | string
}
```

- 没有个人资料时只保存 `pendingIntent` 并打开 Your Details；`Save and Continue` 先存资料再执行原操作，`Cancel` 丢弃 pendingIntent，不误发布/误申请。
- 已有资料点击 Apply 直接执行；批量中的每条申请独立编号/管理码，但**一个批次只提交一次最终状态快照**。
- 重复点击处理：事件处禁按钮 + 状态机二次校验；绝不依赖只禁按钮防重。

## 4. 数据层与演示夹具

### 4.1 CSV 只作为初始化表格

建议 `data/posts_seed.csv` 使用：

```csv
postId,ownerAlias,postType,name,phone,email,origin,destination,daysAhead,time,notes
P001,adam,driver,Adam Wilson,+64 00 000 0001,adam.wilson@example.com,Auckland,Hamilton,7,08:30,One way trip
P002,mia,driver,Mia Chen,+64 00 000 0002,mia.chen@example.com,Auckland,Hamilton,7,09:00,Flexible departure
P003,tom,driver,Tom Reed,+64 00 000 0003,tom.reed@example.com,Auckland,Hamilton,7,10:00,Travelling together
P004,zoe,passenger,Zoe Parker,+64 00 000 0004,zoe.parker@example.com,Wellington,Palmerston North,8,09:30,Looking for a driver
P005,liam,passenger,Liam Scott,+64 00 000 0005,liam.scott@example.com,Christchurch,Dunedin,8,11:00,Looking for transport
P006,emma,driver,Emma Brown,+64 00 000 0006,emma.brown@example.com,Tauranga,Rotorua,9,14:00,Day trip
```

- `daysAhead` **只属于 CSV 演示种子字段**：Reset / 首次初始化时转成 NZ 当地日历日期后写入实际 `Post.date`；正式发布和本地记录仍使用 `YYYY-MM-DD`。这是为避免固定截图日期到期而对 V3.0 种子格式作的施工调整。
- 时间一律当作新西兰大陆当地时间；本地演示可使用 `Intl.DateTimeFormat(..., {timeZone:"Pacific/Auckland"})` 得到当前新西兰日期及时间，生成相对未来日期。不要把浏览器系统时区直接当作新西兰时区。
- 解析 CSV 时支持基本引号/逗号转义，手工录入可暂时限制备注中的换行；新种子只用虚构电话及 `example.com` 邮箱。
- `Reset Demo Data` 恢复稳定的六条展示数据、演示人物及已知凭据；重置有二次确认；现场故事需要 **Alex、Adam、Mia、Tom** 四名角色，另有 Zoe 等用于反向申请。

### 4.2 本地快照（内部结构）

```text
state = {
  schemaVersion: 2,
  profiles: [Profile],
  posts: [Post],
  applications: [Application],
  activityRefs: { profileId: [{recordId, managementCode}] },
  activeProfileId,
  nextSequence
}
```

- `Profile`：profileId/name/phone/email；`Post`：postId/ownerProfileId/postType/name/phone/email/origin/destination/date/time/notes/status/confirmedApplicationId/managementCode；`Application`：applicationId/postId/applicantProfileId/applicantName/applicantPhone/applicantEmail/appliedAt/status/reason/managementCode。
- 本地持久化使用一个 `localStorage` key，如 `sj_demo_state_v2`；`readState/commitState/resetDemoData` 必须检查 schemaVersion、处理解析错误、不重复导入 CSV。
- ID 使用稳定格式例如 `POST-001` 和 `APP-041`，管理码使用 `crypto.getRandomValues()` 等浏览器原生方法生成；初始 fixture 可有固定演示码供脚本使用。**管理码不能出现在公开卡片或详情**。
- `?demo=1` 可切换本地已有演示人物，不改变其本人历史记录归属，不构成真实身份认证。

### 4.3 关键状态与行为约束（沿用 V3.0）

发布状态：`Open`（可公开且未来）/ `Confirmed` / `Cancelled` / `Expired`。申请状态完整保留 `Pending`、`Accepted`、`Declined`、`Not Selected`、`Withdrawn`、`Automatically Cancelled`、`Cancelled`、`Expired`。

**Accept 必须一次计算并一次保存：**

1. 校验操作者是对应发布者、发布仍 Open 未到期、申请仍 Pending、申请人没有另一条尚未结束的 Accepted。
2. 本申请 → Accepted；发布 → Confirmed 并从 Browse 公开卡片列表移除。
3. 同一发布下其他人的 Pending → Not Selected。
4. 同一个申请人对其他发布的全部 Pending → Automatically Cancelled，记录 `reason`；不只取消当前批次内的申请。
5. 一次 `commitState(nextState)`，成功后同时刷新 Browse、My Activity、申请者和发布者视图。

取消规则：`Decline` / `Withdraw` 仅影响目标 Pending；`Cancel Post` 隐藏发布并取消其相关未结束申请；`Cancel Confirmed Journey` 取消已确认申请，尚未过期且发布未 Cancelled 时重新 Open，但旧终态不复活；到达出发时刻未处理 Pending → Expired，不能再次申请/同意。禁止本人申请自己的发布、重复有效申请、一个 Post 两个 Accepted、一个 Profile 两个尚未结束的 Accepted。

**本地限度**：单浏览器里可按顺序模拟“两个发布者先后审批”的冲突，但不能宣称真实客户端并发原子性；localStorage 中的管理码对可打开浏览器存储的人不保密。图 05/09/10 中暗示“从另一浏览器用管理码恢复”的原文，应调整演示版实际界面文案为：`Use the record ID and code to reopen it in this local demo.`

## 5. 三天施工表（增加视觉基线后的真实工作量）

> **高强度目标约 33–36 有效小时，单人三天每天约 11–12 小时。** 这是有风险的压缩估算，不含完整两页竞品报告、正式 PPT 与四人视频的额外制作工时。视觉以结构一致为验收目标，而非逐像素还原。

### DAY 1：搭建 01 / 02 / 03 / 04 的可用网页（约 11 小时）

| 时间块 | 要实施的代码与视觉 | 验收证据 |
|---|---|---|
| 0–1h | 冻结 CSS tokens、DOM ID、CSV 字段与演示人物，建立本地 Git、`?demo=1` 入口 | 设计契约就绪 |
| 1–3.5h | `index.html` + `style.css`：顶栏、Browse/Activity 双视图、搜索卡、三列卡片、My Activity 快捷入口、dialog 共用外壳 | 图 01 主视觉层次可见；不需要假按钮 |
| 3.5–5.5h | `store.js`：Fetch CSV、daysAhead 初始化、schema/localStorage、reset、演示身份切换 | 冷启动与刷新内容一致，不卡在过期行程 |
| 5.5–8h | Your Details + Post a Journey：一次填写、双类型卡、保存资料展示、校验、发布成功及独立凭据 | 图 02/03 可从按钮真实打开、真实保存 |
| 8–10h | 筛选/排序、卡片渲染、详情弹窗、公开联系方式、单条 Apply UI 入口 | 图 04 结构对应；View Details 不发申请 |
| 10–11h | 手工通过需求 01、02、04、17；commit | **Gate D1：刷新仍能看到新增发布；主界面接近 01–04** |

### DAY 2：实现 05 / 06 / 07 / 08 / 09 的业务闭环（约 12 小时）

| 时间块 | 要实施的代码与视觉 | 验收证据 |
|---|---|---|
| 0–2h | 单条 Apply、首次资料 pendingIntent、管理码生成、提交结果弹窗 | 图 04 Apply → Pending 有真实记录 |
| 2–4h | 多选同类型限制、批量部分失败、逐条凭据结果与 Copy 按钮 | 图 05 的两条 Pending 和两个不同管理码 |
| 4–6h | My Activity：主视图、三 Tab、刷新、Pending 表格/手机卡片 | 图 06 的活动列表结构与真实申请数 |
| 6–9h | Received Applications 弹窗、Accept/Decline/Withdraw、完整联动及原因 | 图 08 可审批；图 07 可复现 Accepted + 2 自动取消 |
| 9–11h | Manage a Record 校验、取消发布/同行、到期规则、恢复公开与历史管理 | 图 09 可验证错误/正确码，终态不复活 |
| 11–12h | 演示身份切换，全链手工验收 03、05–14、16、18；Git commit | **Gate D2：所有业务按钮真实操作且刷新不丢失** |

### DAY 3：复现 10 场景、验收与 PPT 截图（约 10–13 小时）

| 时间块 | 要实施的代码与视觉 | 验收证据 |
|---|---|---|
| 0–2h | How It Works 六步弹窗 + 真实限制文案，修正图 09/10 的跨浏览器误导用语 | 图 10 可用，无虚假跨设备承诺 |
| 2–4h | 视觉收口：页头、间距、弹窗页脚、状态配色、头像、表单与空状态 | 对照 01–10 核对关键结构 |
| 4–6h | 手机单列、Dialog 高度及可滚动、Tab/Escape/focus 回退、表单保留 | 窄屏可实际完成申请与审批 |
| 6–8h | 20 项功能验收记录 PASS/FAIL/DEMO_ONLY；CSV/存储异常、双击与错误码测试 | `docs/TEST_CASES.md` 实填，不预先标 PASS |
| 8–10h | Reset Demo Data → 连续演两轮 PPT 故事，统一动态日期/人物/记录号，截图 01–10 | `docs/DEMO_SCRIPT.md` 与截图一致 |
| 10–13h（缓冲） | 修 Bug、写 README、Git 最终提交、打包源码与展示截图 | **Gate D3：localhost 冷启动、全链两轮通过** |

**时间失控时：** 优先简化图标、阴影、动画、无关页脚内容；保留 10 类页面状态及业务规则。绝不以点击后写死文案冒充 Accept 联动、重复申请拦截或管理码校验。

## 6. PPT 可重复演示剧本（统一效果图 01、05、06、07）

| 顺序 | 身份 / 操作 | 要看到的画面与关键判断 |
|---|---|---|
| 准备 | 浏览器打开 `?demo=1`，确认 Reset；切换 Alex Taylor（作为乘客申请人） | Browse 具有 Adam / Mia / Tom 三条 Auckland → Hamilton 司机发布、有效未来日期 |
| 1 | Alex 搜索 Auckland → Hamilton，勾选 Adam、Mia（均为 Driver） | 类似图 01，`2 journeys selected`，Apply to Selected 可点击；更换 Post Type 清空选择 |
| 2 | 触发批量 Apply；若未有资料先填写 Your Details | 类似图 02；真实保存 Name/Phone/Email 后继续原操作 |
| 3 | 提交申请并保存两个管理码；再对 Tom 用单条 Apply | 图 05 两个 Pending 凭据；第三条也 Pending（每条独立 ID/码） |
| 4 | 打开 My Activity / My Applications | 图 06 的 3 条 Pending；Browse 中对应发布仍然可见 |
| 5 | 切换 Adam，打开 Received Applications；Accept Alex | 图 08：发布者主动同意。Adam 发布变 Confirmed，其他候选若存在则 Not Selected |
| 6 | 切回 Alex，Refresh Status | 图 07：Adam Accepted；Mia/Tom Automatically Cancelled，带理由；Adam 公开卡不再展示 |
| 7 | 切 Alex，选择 Cancel Confirmed Journey，再刷新 Browse | 如日期未过期，Adam 的原发布恢复 Open；Mia/Tom 旧申请保持取消，不自动复活 |
| 8 | 打开 Manage a Record，先故意输错管理码，再输入正确管理码 | 图 09 的两种结果；说明本地 UI 权限验证不是生产安全隔离 |
| 9 | 打开 How It Works，讲解 6 步，再手动刷新网页 | 图 10 与持久化效果；说明仅当前浏览器存储，不是多人联网系统 |

若要额外展示 `Not Selected`：可在演示前让另一位申请者对 Adam 的同一发布创建 Pending，Adam 接受 Alex 后该申请变 Not Selected。为了控制展示时间，此项可以在 PPT 截图展示，而不是每次现场输入。

## 7. 功能验收 20 项与视觉对应

| 原需求用例 | 核心检查 | 目标展示图/处理说明 |
|---|---|---|
| 01 | 司机与乘客都能发布、反方向角色申请 | 03、04；LOCAL |
| 02 | 首次资料只录一次，取消不继续操作 | 02；LOCAL |
| 03 | 已有资料一键申请 | 04；LOCAL |
| 04 | 四条件过滤，空列表、清条件 | 01；LOCAL |
| 05 | 同类多选，每条独立申请及凭据 | 01、05；LOCAL |
| 06 | 批量部分失败，其余正常提交 | 05 + 按项错误；LOCAL |
| 07 | Pending 不隐藏发布 | 01、06；LOCAL |
| 08 | 一条获批后发布隐藏，其余申请 Not Selected | 08、07；LOCAL |
| 09 | 同申请人其他 Pending 自动取消 | 07；LOCAL |
| 10 | 两名发布者真正同时同意，仅一个成功 | 本地**顺序冲突模拟**；DEMO_ONLY |
| 11 | 拒绝或撤回只改变对应记录 | 08 + My Activity；LOCAL |
| 12 | 发布者取消发布与相关申请 | 08；LOCAL |
| 13 | 取消已确认同行，未过期时恢复公开 | 07；LOCAL |
| 14 | 到期后停止申请/同意、保留历史 | 时间夹具测试；LOCAL |
| 15 | 发布者联系方式公开，申请者仅管理视图可看 | 04、08；LOCAL UI_ONLY |
| 16 | 错误管理码不显示内容 | 09；LOCAL UI_ONLY |
| 17 | 表单必填、同城、过去时间校验 | 03；LOCAL |
| 18 | 双击操作及终态重试不生成重复 | 03、05、08；LOCAL |
| 19 | 本机 My Activity 与管理入口，跨浏览器凭据恢复 | 06、09；本机 LOCAL，**跨浏览器 DEMO_ONLY** |
| 20 | 手机窄屏与键盘可用 | 全图对应 UI；LOCAL |

标记仅是计划的**目标类别**，不是测试结果。测试表里必须在亲自执行后填写 `PASS / FAIL / DEMO_ONLY`，并附实际步骤与截图。

## 8. 源码目录、交付与硬性限制

```text
Share-a-Journey/
├── index.html
├── css/style.css
├── js/
│   ├── store.js                  # CSV / localStorage / fixture
│   ├── rules.js                  # 状态机、联动与校验
│   ├── ui.js                     # 视图、卡片、弹窗、状态
│   └── app.js                    # 事件、初始化、模式切换
├── data/posts_seed.csv          # 虚构示例行程
├── assets/                     # 如需 logo.svg / 轻量 SVG 图标
├── docs/
│   ├── REQUIREMENTS.md          # 完整原需求
│   ├── VISUAL_REFERENCE.md      # 01–10 场景映射和视觉取舍
│   ├── TEST_CASES.md            # 20 项实测记录
│   └── DEMO_SCRIPT.md           # PPT 操作说明
└── README.md                    # localhost 启动 / 范围声明
```

建议将上传 ZIP 的 `01–10` PNG 单独放在仓库 `docs/reference/`（**设计参考，不是网站运行时图片**）；本施工文档按原始文件名索引，无须把 5.9 MB 的界面截图加载到网站首页。

### 8.1 Definition of Done

- [ ] 截图 01–10 的界面类别都存在可互动的对应真实网页；页面结构、关键英文标签、主要视觉层级一致。
- [ ] 首页 Browse / My Activity 双主视图互相切换；三种活动 Tab 正常；所有弹窗可打开、取消、关闭。
- [ ] 发布、搜索、申请、批量部分成功、管理码、审批联动、取消、到期规则有**真实本地数据变化**；刷新后可重现。
- [ ] `Accept` 一次保存完整状态联动，不遗漏 `Not Selected` 和 `Automatically Cancelled`；不生成重复有效记录。
- [ ] `localhost` 两轮完整演练无致命 Console 异常；手机/键盘可完成关键操作；`?demo=1` 可重置。
- [ ] PPT 截图对应相同日期、用户、记录编号，图例中的 20 Oct 2026 不被误用成过期后还可申请的实时演示数据。
- [ ] UI 说明明确 `local demo` / `same browser`，不再承诺纯静态 localhost 可以实现跨浏览器/跨设备数据恢复或真正隐私认证。
- [ ] 交付源码、README、实测清单、演示步骤；不额外安排公网部署。

## 9. 设计依据与变更边界

- **上传 ZIP 直接提供的信息**：十类视觉场景及示意文案；浅灰/白/深蓝/青绿风格；主导航、三列卡片、双主视图、批量结果、状态徽章、审批对话框。其《制作说明》注明截图来自本地 HTML/CSS 和浏览器导出，**ZIP 未包含网页完整 JS/服务端业务代码**。
- **功能说明明确要求**：无登录注册、双向发布、首次资料复用、同类多选、独立管理码、发布者审批后隐藏、同申请人其他待确认自动取消、不增加费用/座位数、八种申请状态及 20 项验收。
- **本施工方案的工程性补充**：DOM ID、CSS token 建议值、组件函数拆分、动态日期种子、演示人物切换、单仓快照与三个阶段 Gate。这些是为了单人三天按图实现而做的实施约定，不是原图暗示的真实后端能力。

**最终判断：V3.1 不改变 V3.0 的技术栈与功能边界，但把效果图转为可检查的施工蓝图。先搭出与 01–04 相符的真实页面骨架，再把 05–09 的状态机走通，最后落实 10 的帮助、响应式和 PPT 演示。**
