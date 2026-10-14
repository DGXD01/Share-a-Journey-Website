# DAY 1 开发记录与 DAY 2 接续点

> 对应施工文档 §5「DAY 1：搭建 01 / 02 / 03 / 04 的可用网页（约 11 小时）」与 §8.1 的 Gate D1。

## 1. 当日完成内容

计划把这一天切成六个时间块推进，实际执行下来按交付内容归并如下。

- **冻结 CSS token、DOM ID、CSV 字段与演示人物**：`css/style.css` 的 `:root` 与施工文档 §2.1 一致；DOM ID 全部沿用 §3.1；CSV 11 列含 `daysAhead`；Git 已初始化并提交，`?demo=1` 入口可用。
- **`index.html` + `style.css`**：顶栏、双主视图、搜索卡、三列卡片、My Activity 快捷入口、dialog 共用外壳全部完成，另外加了 My Activity 三标签、状态摘要与响应式。
- **`store.js`**：Fetch CSV、`daysAhead` 初始化、schema 与 localStorage 处理、reset、演示身份切换，另外补了 CSV 兜底副本、结构校验、`reload()`、`storageAvailable()` 和提交失败上报。
- **Your Details 与 Post a Journey**：一次填写、双类型卡、只读联系方式、校验、发布凭据，另外含 `pendingIntent` 恢复和放弃草稿的二次确认。
- **筛选/排序、卡片渲染、详情弹窗、公开联系方式、单条 Apply**：排序按出发时间升序；详情弹窗不发申请，只有 Apply 才发。
- **验收方式**：原计划手工验收需求 01、02、04、17，实际改为自动化验收，需求 01–07、14–18、20 全部由 `tools/e2e.js` 真实执行并留截图。

**Gate D1 达成情况**：刷新后新增发布与申请仍在（e2e 有专门一步 reload 验证）；主界面结构与图 01–04 一致（见 `docs/screenshots/`）。

## 2. 开发过程中发现并修复的缺陷（都由验证脚本抓到，不是事后补记）

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | 填写资料后没有任何申请产生 | `app.js` 的重入锁 `busy` 在 `handleProfileSubmit` 的 `finally` 才释放，而 `resumePendingIntent()` 在其**之内**调用，`performApply` 被自己挡住直接 return | 保存成功后先释放 `busy`，再执行挂起动作（`js/app.js`） |
| 2 | 点 “Apply to Selected” 毫无反应 | `Array.prototype.slice.call(Set)` 对 `Set`（无 `length`）返回 `[]`，批量入口拿到空数组 | 改为 `Array.from(uiState.selectedPostIds)` |
| 3 | 未选中任何行程时，绿色操作条仍然画在页面上（显示 `0 journeys selected`） | 类规则 `.selection-bar{display:flex}` 覆盖了 UA 的 `[hidden]{display:none}` | `css/style.css` 增加全局 `[hidden]{display:none !important}`；并把 e2e 断言从“属性为 true”改为“计算样式为 none” |
| 4 | 用 Escape 关闭弹窗后焦点没有回到触发按钮 | 原生 `<dialog>` 的 Escape 走浏览器默认关闭路径，绕过了 `closeDialog()` 里的焦点回退 | `ui.js` 为每个 dialog 挂 `close` 事件统一 `restoreFocus()` |
| 5 | 整页空白（无卡片、无提示） | `ui.js` 里一处 `[[...]` 多写一个中括号导致语法错误，整个脚本未执行 | `node --check` 全量语法检查 + 修复；已纳入验证流程 |
| 6 | 页面文案与弹窗信息不一致（错误提示写 ISO 日期 `2026-10-13`） | 格式化分散在 `ui.js` | 统一到 `SJ.store.formatDateNZ()`，`rules.js` 与 `ui.js` 共用 |

## 3. 与施工文档的有意偏差

1. **`nextSequence` 是对象** `{ post, application, profile }`（文档示例为单值）。原因：发布、申请、本地资料三种序列必须互不干扰。
2. **`uiState` 增加 `appliedFilters`**：文档要求“改变任何**已应用**筛选条件要清空尚未提交选择”，需要一份“已应用”的副本做比较；其余字段与 §3.3 一致。
3. **Post / Application 保存联系方式快照**：发布者视图要在以后仍能显示申请人当时的电话邮箱，因此不能只存 `profileId`。
4. **演示人物资料策略**：`Adam/Mia/Tom/Zoe/Liam/Emma` 的种子发布带着 CSV 里的联系方式；**Alex 故意没有已存资料**，用来复现图 02 的首次填写流程（Reset 后依然如此）。
5. **管理码格式**：`XXXX-XXXX`（去掉易混字符 I/O/0/1），种子固定 `DEMO-0001`–`DEMO-0006` 便于课堂口播；校验时忽略大小写、空格与连接符。
6. **新增 `tools/`**：施工文档目录里没有，但 Gate D1 需要可复现的证据，故加入静态服务器与两套断言脚本（不进页面运行时）。
7. **效果图原图未收到**：按施工文档 §2 的文字规格实现，`docs/reference/` 已预留位置（见 `docs/VISUAL_REFERENCE.md`）。

## 4. DAY 2 接续点（已完成，实施记录见 `docs/DAY2_BUILD_NOTES.md`）

> 本节原本是 DAY 1 结束时写给 DAY 2 的施工清单。DAY 2 已按此实施，实际做法与差异记录在 `docs/DAY2_BUILD_NOTES.md`，下面保留原始清单以便对照。

在 `js/rules.js` 增加以下纯函数（施工文档 §4.3），全部遵循「校验 → 计算 nextState → 返回结果」的同一形态，由 `app.js` 一次 `commitState`：

- `acceptApplication(state, {applicationId})`：校验操作者是发布者、发布 `Open` 未过期、申请 `Pending`、申请人无未结束的 `Accepted`；本申请→`Accepted`；发布→`Confirmed` 且 `confirmedApplicationId` 记录；同一发布其他 `Pending`→`Not Selected`；**该申请人在其他发布的全部 `Pending`→`Automatically Cancelled` 并写 `reason`**；一次提交。
- `declineApplication(state, {applicationId})`：仅目标 `Pending`→`Declined`。
- `withdrawApplication(state, {applicationId})`：仅本人 `Pending`→`Withdrawn`。
- `cancelPost(state, {postId})`：发布→`Cancelled` 并隐藏；其相关未结束申请→`Cancelled`。
- `cancelJourney(state, {applicationId})`：已确认申请→`Cancelled`；发布未 `Cancelled` 且未过期→重新 `Open`；旧终态不复活。

界面侧只需把已就绪的结构接上（**不需要改 DOM ID**）：

- `ui.renderReceivedDialog()` 里的 Accept / Decline 按钮：把 `btn.disabled = true` 换成 `data-action="accept-application" / "decline-application"` + `data-application-id`，在 `app.js` 的事件委托里调用上面的规则函数；
- `ui.renderMyApplications()` 增加 `Withdraw` 按钮与图 07 的 `Accepted` 状态横幅（CSS `.status-banner.accepted`、`.badge-accepted`、`.badge-not-selected`、`.badge-automatically-cancelled` 已存在）；
- `ui.renderMyPosts()` 增加 `Cancel Post` / `Cancel Confirmed Journey`（危险操作样式用 `.btn-danger`，不要与普通确认同色）；
- 删除 `ui.renderActivity()` 末尾 `#activity-scope-note` 的 DAY 2 说明，并把 `docs/TEST_CASES.md` 的 08–13 重测后改写结论。

## 5. 复现验证

```bash
node tools/selfcheck.js            # 76 passed, 0 failed（DAY 1 收尾时的用例数）
node tools/serve.js 5599           # 后台常驻
node tools/e2e.js                  # 123 passed, 0 failed（真 Chrome + 截图）
```

`tools/e2e.js` 每次使用全新的临时浏览器用户目录，因此每次都是“冷启动 + 空 localStorage”，结论可重复。用例数在 DAY 2 已扩充到 `selfcheck` 130 项、`e2e` 182 项，见 `docs/DAY2_BUILD_NOTES.md`。
