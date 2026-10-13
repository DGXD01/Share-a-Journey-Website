# 20 项实测记录（DAY 1 + DAY 2）

> 记录原则：**先执行、后填写**。每条都写明实际步骤、观察到的结果与证据来源。
> 结果取值：`PASS` 实测通过 / `FAIL` 实测失败 / `DEMO_ONLY` 本机可演示但非真实能力。
>
> 测试环境：Windows 11 · Chrome（`--headless=new`，`--lang=en-NZ`，窗口 1440×1000，手机断点 390×844 模拟）· Node v24.14.0 · `http://127.0.0.1:5599/index.html?demo=1`
> 自动化证据（每次都是全新临时浏览器目录 = 冷启动 + 空 localStorage）：
> - `node tools/selfcheck.js` → **130 passed, 0 failed**（纯逻辑：CSV/日期/状态机/Accept 联动/管理码/到期/存储失败）
> - `node tools/e2e.js` → **182 passed, 0 failed**（真浏览器全会话 + 刷新持久化 + 审批联动 + 手机断点 + 键盘 + 控制台零异常）
> - 截图：`docs/screenshots/*.png`

| # | 项目 | 实际步骤（摘要） | 实测结果 | 证据 |
|---|---|---|---|---|
| 01 | 双向发布 + 反方向申请 | Alex（乘客）申请 Adam/Mia/Tom 的 Driver 发布；再以 Driver 类型发布 `Auckland → Wellington` | **PASS** — 两类发布均入库，乘客申请司机发布成功 | e2e「Post a Journey」「Single application」；`03_post_validation.png` |
| 02 | 首次资料只录一次；取消不继续 | 无资料点 Apply → Your Details；先填非法数据（被拦）→ Cancel（0 申请）→ Save and Continue（只发一次并恢复原动作） | **PASS** — 非法时 `applications` 仍为 0；Cancel 后仍为 0 且提示 nothing was saved | e2e「First-time profile」「Cancel a first-time profile」；`02_profile.png` |
| 03 | 已有资料一键申请 | 资料已存后点详情弹窗 Apply | **PASS** — 生成 `APP-041`，状态 `Pending` | e2e「Single application」；`05_results_single.png` |
| 04 | 四条件过滤 / 空列表 / 清条件 | Origin=`auckland`+Destination=`Hamilton` → 3 条；`Nowhere` → 空状态；Clear Filters → 6 条 | **PASS** — 改条件会清空未提交的选择 | e2e「Filters」 |
| 05 | 同类多选 + 独立凭据 | 勾选 POST-002/003 → Apply to Selected | **PASS** — `APP-042`/`APP-043` 两条独立记录与两个不同管理码，一次快照提交 | e2e「Batch application」；`05b_results_batch.png` |
| 06 | 批量部分失败逐条说明 | 规则层 3 选 1 失败；界面层重复提交被拒时结果卡显示 `Not submitted` + 原因 | **PASS** — 成功项入库，失败项单独说明 | selfcheck「Batch application, partial failure」；e2e「a refused application is reported as a failed item」 |
| 07 | Pending 不隐藏发布 | 三条申请后刷新页面 | **PASS** — 三张卡仍在，仅标记 `Pending` 且禁选 | e2e「Persistence across a reload」 |
| 08 | 一条获批后发布隐藏，其余申请 `Not Selected` | Adam 在 Received Applications 点 **Accept**（Alex 与 Zoe 同时申请 POST-001） | **PASS** — `APP-041`→`Accepted`；POST-001→`Confirmed` 且离开 Browse（6→5 张卡）；Zoe 的 `APP-044`→`Not Selected` 并写原因；弹窗原地刷新为 Confirmed | e2e「Publisher approves」「Accept cascade」；`08_received_accept.png`、`08b_received_after_accept.png` |
| 09 | 同申请人其他 Pending 自动取消 | 同一次 Accept 之后检查 Alex 在 Mia/Tom 两条发布上的申请 | **PASS** — `APP-042`/`APP-043`→`Automatically Cancelled`，原因写明 “accepted for journey POST-001”；Mia/Tom 的发布保持 `Open` 不受影响 | e2e「Accept cascade」；`07_accepted_banner.png` |
| 10 | 两名发布者先后同意，仅一个成功 | Adam 同意后，Mia 打开自己发布的 Received Applications 再尝试同意同一申请人 | **PASS（本地顺序模拟）** — Mia 看到该申请已是 `Automatically Cancelled`，界面不再提供 Accept；即使人为把记录改回 Pending，规则仍以 “already confirmed on journey APP-041” 拒绝。**真实客户端并发原子性为 DEMO_ONLY** | e2e「Requirement 10」；selfcheck「Requirement 10」 |
| 11 | 拒绝或撤回只改变对应记录 | ① Liam 申请 Mia 的 POST-002 → Mia Decline；② Liam 申请 Tom 的 POST-003 → 自己在 My Applications 点 Withdraw | **PASS** — `Declined`/`Withdrawn` 仅改目标记录并写原因，两条发布都保持 `Open`；他人记录不受影响（Alex 的 `Cancelled` 历史不变） | e2e「Decline」「Withdraw」 |
| 12 | 发布者取消发布与相关申请 | ① Tom 取消 POST-003（只有历史记录）；② Emma 取消 POST-006（有 Alex 的 Pending） | **PASS** — 发布→`Cancelled` 并离开 Browse；确认对话框会数出 “1 live application”；Alex 的申请→`Cancelled` 且原因写明 “publisher cancelled this journey”；已完成的历史记录保留 | e2e「Cancel Post」「Cancel Post also cancels a live application」 |
| 13 | 取消已确认同行，未过期时恢复公开 | Alex 在 Accepted 横幅点 **Cancel Confirmed Journey** → 确认 | **PASS** — `APP-041`→`Cancelled`；POST-001 回到 `Open` 并重新出现在 Browse（可再次申请）；`Not Selected`/`Automatically Cancelled` 的旧终态不复活 | e2e「Cancel Confirmed Journey」；`07b_after_cancel_reopen.png` |
| 14 | 到期停止申请 / 同意，保留历史 | 规则层把发布日期改到过去后调用 `expireRecords`，再尝试申请 / 同意 / 取消 | **PASS** — 发布→`Expired`、其 Pending 申请→`Expired` 并写原因；`canAccept` / `canCancelPost` / `canCancelJourney` 全部以 “already departed” 拒绝；历史记录仍可查询 | selfcheck「Expiry rule」「Departure time blocks every late action」 |
| 15 | 联系方式可见范围 | 详情弹窗显示发布者公开电话；切换为 Adam 后打开 Received Applications 看到申请人 Alex 的电话/邮箱 | **PASS** — 申请者联系方式只出现在发布者视图；管理码从不出现在公开卡片/详情 | e2e「Details dialog」「Publisher approves」；`04_details.png` |
| 16 | 错误管理码不显示内容 | `POST-001` + 错码 → 报错且结果区为空；正确码（大小写/空格容错）→ 显示记录摘要 | **PASS** — 错码与不存在的记录返回同一条通用文案 | e2e「Manage a Record」；`09_manage_wrong_code.png` |
| 17 | 必填 / 同城 / 过去时间校验 | 手机号 `12`、邮箱 `not-an-email`、同城路线、日期 `2020-01-01` | **PASS** — 四条错误分别提示且不写库 | e2e「First-time profile」「Post a Journey」 |
| 18 | 双击与终态重试不重复 | 连点 View Details ×3、连点 Apply ×2、对已终态记录重复审批 | **PASS** — 只开 1 个弹窗；连点只新增 1 条；对 `Automatically Cancelled`/`Not Selected`/已确认的记录，`canAccept` 等谓词直接拒绝，界面也不渲染按钮 | e2e「Duplicate click protection」「Requirement 10」 |
| 19 | 本机 My Activity 与管理入口；跨浏览器凭据恢复 | Refresh Status 重新读取本地快照；管理入口凭码打开记录并在其中执行撤回/取消 | **PASS**（本机）；跨浏览器凭据恢复 **DEMO_ONLY** — 界面文案统一 `this browser / local demo` | e2e「Manage a Record performs real actions」；`09b_manage_actions.png` |
| 20 | 手机窄屏与键盘可用 | 390×844：卡片单列、数据行转纵向卡片并显示字段名、无横向溢出；键盘：Escape 关闭、焦点回退、←/→ 切标签 | **PASS** | e2e「Mobile layout」「Keyboard and focus」；`20_mobile_browse.png`、`20_mobile_activity.png` |

## 汇总

| 结果 | 数量 | 编号 |
|---|---|---|
| `PASS`（实测通过） | 18 项 | 01–09、11–18、20 |
| `PASS` + `DEMO_ONLY`（同一项两种结论） | 2 项 | 10（顺序冲突模拟通过，真实并发为 DEMO_ONLY）、19（本机通过，跨浏览器为 DEMO_ONLY） |
| `FAIL`（实测失败） | 0 项 | — |

## 三条必须写进报告的限制（不要含糊）

1. **没有真实并发**：需求 10 是“同一浏览器里先后点击”的顺序模拟。localStorage 做不到两个客户端的事务原子性；演示时应当这样说，而不是宣称“两个用户同时抢一个座位”。
2. **没有服务器隔离**：管理码校验发生在浏览器里，能打开该浏览器存储的人可以看到码；“本地 UI 权限验证”不等于生产安全。
3. **数据只在这台机器这个浏览器**：换浏览器/换设备都是空的，`?demo=1` 的 Reset 也只能恢复本机数据。

> DAY 1 曾经把 08–13 标为 `DAY2`；本次已全部实现并重新实测，上表是重测后的结论，未沿用旧结论。
