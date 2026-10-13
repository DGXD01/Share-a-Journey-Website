# Share-a-Journey · 单人三天 localhost 演示版（DAY 1 + DAY 2 已完成）

> 需求基线：《第七组 Share-a-Journey 功能页面说明》V1.0
> 施工基线：《Share-a-Journey_开发文档.md》V3.1（本仓库根目录）
> 当前进度：**DAY 1 搭建 01/02/03/04 → DAY 2 打通 05–09 业务闭环**；剩 DAY 3 视觉收口与交付打包

---

## 1. 这是什么

用真实 `HTML / CSS / 原生 JavaScript` 实现的 Share-a-Journey 本地演示站点：

- 司机（Driver）与乘客（Passenger）**双向发布**；
- 首次填写一次个人资料，之后自动复用；
- 四条件筛选（Origin / Destination / Date / Post Type）与三列卡片浏览；
- 公开详情弹窗（含发布者公开联系方式）与单条 / 批量申请；
- 每条申请都有**独立 Record ID + Management Code**，可用管理码重新打开记录并执行可用操作；
- 发布者审批：**Accept** 一次保存完成四路联动（本申请 `Accepted`、发布 `Confirmed` 并离开 Browse、同发布其他申请 `Not Selected`、该申请人在其他发布的全部 `Pending` 自动 `Automatically Cancelled` 并写明原因）；
- **Decline / Withdraw / Cancel Post / Cancel Confirmed Journey** 都是真实状态变更，取消已确认同行会让未过期的发布重新公开，终态记录永不复活；
- My Activity 三标签（My Posts / My Applications / Received Applications）读取真实本地数据，含 Accepted 绿色横幅与逐条原因；
- 单一 `localStorage` 快照（`sj_demo_state_v2`），刷新、重开浏览器内容一致；到期记录自动 `Expired` 并停止申请/审批；
- `?demo=1` 提供演示身份切换与 Reset Demo Data。

**没有后端、没有数据库、没有登录、没有公网部署**；跨浏览器 / 跨设备共享不属于本版能力，界面文案统一为 `this browser / local demo`，不承诺服务器同步。

---

## 2. 如何运行

任选一种（都必须通过 `http://` 打开，不要双击 `index.html`）：

| 方式 | 命令 / 操作 | 地址 |
|---|---|---|
| VS Code Live Server | 右键 `index.html` → Open with Live Server | `http://127.0.0.1:5500/index.html?demo=1` |
| 仓库自带静态服务器 | `node tools/serve.js 5599` | `http://127.0.0.1:5599/index.html?demo=1` |

- 带 `?demo=1`：显示顶部“Switch identity / Reset Demo Data”演示工具，并默认以 **Alex Taylor** 身份进入。
- 不带 `?demo=1`：不显示演示工具，没有预设身份；第一次发布 / 申请时才要求填 Your Details（真实用户路径）。

> 直接以 `file://` 打开时无法 `fetch` CSV，站点会自动改用与 `data/posts_seed.csv` 完全一致的**内嵌副本**，并在页面顶部显示黄色说明条；这是兜底路径，演示请用上表两种方式。

---

## 3. 目录结构

```text
WebAssignment1/                     ← 仓库根目录（即 Live Server 根目录）
├── index.html                      # 唯一页面：顶栏 / Browse / My Activity / 8 个 dialog
├── css/style.css                   # 设计 token、布局、卡片、弹窗、状态徽章、响应式
├── js/
│   ├── store.js                    # CSV 读取与解析、NZ 动态日期、localStorage 快照、ID 与管理码
│   ├── rules.js                    # 纯业务规则：校验、状态计算、查询、管理码校验
│   ├── ui.js                       # 只负责渲染：卡片、列表、弹窗内容、Toast、确认框
│   └── app.js                      # 事件协调、视图切换、pendingIntent、演示身份、初始化
├── data/posts_seed.csv             # 六条虚构演示行程（daysAhead 相对当天生成未来日期）
├── docs/
│   ├── REQUIREMENTS.md             # 20 项功能需求清单与实现位置（含记录动作权限表）
│   ├── VISUAL_REFERENCE.md         # 效果图 01–10 → 实现映射与视觉取舍
│   ├── TEST_CASES.md               # 20 项实测记录（PASS / DEMO_ONLY）与证据索引
│   ├── DEMO_SCRIPT.md              # PPT 演示剧本九步（含可用管理码）
│   ├── DAY1_BUILD_NOTES.md         # DAY 1 施工记录与缺陷修复
│   ├── DAY2_BUILD_NOTES.md         # DAY 2 施工记录、状态机取舍与 DAY 3 接续点
│   ├── reference/                  # 放 01–10 效果图 PNG（设计参考，不参与运行）
│   └── screenshots/                # 真机截图证据（自动化生成）
└── tools/
    ├── serve.js                    # 仅用于本地验证的静态服务器
    ├── selfcheck.js                # 无浏览器：store + rules 的 130 项断言
    └── e2e.js                      # 真 Chrome：182 项端到端断言 + 截图
```

---

## 4. 自检与验收证据

```bash
node tools/selfcheck.js     # 130 passed, 0 failed —— 纯逻辑（CSV/日期/状态机/审批联动/管理码/到期）
node tools/serve.js 5599    # 另开一个终端
node tools/e2e.js           # 182 passed, 0 failed —— 真浏览器全流程 + 截图
```

`tools/e2e.js` 会在真实 Chrome/Edge 上完整走一遍演示剧本：筛选、选卡、批量申请、刷新页面验证持久化、发布新行程、管理码错误/正确、**发布者同意并观察 Not Selected 与自动取消**、取消已确认同行后发布恢复公开、拒绝、撤回、取消发布、手机窄屏、键盘 Escape 与方向键、Reset，并断言**控制台零异常**。截图输出到 `docs/screenshots/`。

---

## 5. 完成程度

**图 01–10 的全部界面类别与业务闭环均已实现，并且都是真操作（非写死文案）**

- 01 浏览与批量选择；02 首次资料；03 发布（双类型 + 校验 + 独立凭据）；04 详情与一键申请；
- 05 逐条结果卡（含部分失败与 Copy）；06 My Activity 三标签与状态摘要；
- 07 Accepted 横幅 + 自动取消原因；08 发布者审批（Accept / Decline / Cancel Post）；
- 09 管理码校验与记录动作；10 How It Works 六步与本机边界；
- 到期规则、终态不复活、重复操作防护、错误管理码不泄露记录。

**明确的能力边界（不得在报告里含糊）**

- 需求 10 是同一浏览器内的**顺序冲突模拟**，不具备真实客户端并发原子性（`DEMO_ONLY`）；
- 需求 19 的**跨浏览器凭据恢复不可用**，数据只在本机这个浏览器（`DEMO_ONLY`）；
- 管理码校验发生在浏览器里，不等于生产级安全隔离。

详见 `docs/TEST_CASES.md`（逐项实测）与 `docs/DAY2_BUILD_NOTES.md`（状态机取舍与 DAY 3 接续点）。

---

## 6. 设计契约（冻结项）

- 颜色 / 圆角 / 内容宽度：`css/style.css` 顶部 `:root`（与施工文档 §2.1 一致）；
- DOM ID：与施工文档 §3.1 完全一致（`browse-view`、`activity-view`、`filter-form`、`journey-grid`、`selection-bar`、`profile-dialog`、`post-dialog`、`details-dialog`、`results-dialog`、`manage-dialog`、`received-dialog`、`help-dialog`、`demo-tools` 等，未改名）；
- 脚本：`window.SJ` 命名空间 + 按顺序 `defer`，不使用 ES module；
- 数据流：事件（app.js）→ 纯规则（rules.js）→ 一次 `commitState`（store.js）→ 渲染（ui.js）；**任何持久化失败都会显示错误，绝不显示虚假成功**；
- 所有用户输入一律用 `textContent` / `createElement` 写入，不拼接 `innerHTML`。
