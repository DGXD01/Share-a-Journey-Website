# 20 项实测记录（DAY 1）

> 记录原则：**先执行、后填写**。每条都写明实际步骤、观察到的结果与证据来源。
> 结果取值：`PASS` 实测通过 / `FAIL` 实测失败 / `DEMO_ONLY` 本机可演示但非真实能力 / `DAY2` 本版未实现，已如实标注在界面上。
>
> 测试环境：Windows 11 · Chrome（`--headless=new`，`--lang=en-NZ`，窗口 1440×1000，手机断点 390×844 模拟）· Node v24.14.0 · `http://127.0.0.1:5599/index.html?demo=1`
> 自动化证据：
> - `node tools/selfcheck.js` → **76 passed, 0 failed**（纯逻辑：CSV 解析、NZ 动态日期、状态机、管理码、到期、持久化失败路径）
> - `node tools/e2e.js` → **123 passed, 0 failed**（真实浏览器全会话 + 刷新持久化 + 手机断点 + 键盘 + 控制台零异常）
> - 截图：`docs/screenshots/*.png`

| # | 项目 | 实际步骤（摘要） | 实测结果 | 证据 |
|---|---|---|---|---|
| 01 | 双向发布 + 反方向申请 | Alex（乘客身份）申请 Adam/Mia/Tom 的 Driver 发布；再以 Driver 类型发布 `Auckland → Wellington` | **PASS** — 两类发布均入库（`posts.length` 6→7，`postType` 分别为 passenger/driver），乘客申请司机发布成功 | e2e「Post a Journey」「Single application」；`03_post_validation.png` |
| 02 | 首次资料只录一次；取消不继续 | 无资料时点 Apply → 弹出 Your Details；先填非法数据被拦；`Cancel` 后无任何申请；`Save and Continue` 只发一次 | **PASS** — 非法输入时 `applications` 仍为 0；Cancel 后仍为 0 且提示 nothing was saved；保存后恢复原动作且只创建 1 条 | e2e「First-time profile」「Cancel a first-time profile」；`02_profile.png`、`02b_profile_guest.png` |
| 03 | 已有资料一键申请 | 资料已存后点详情弹窗 Apply | **PASS** — 直接生成 `APP-041`，状态 `Pending` | e2e「Single application」；`05_results_single.png` |
| 04 | 四条件过滤 / 空列表 / 清条件 | Origin=`auckland`+Destination=`Hamilton` → 3 条；Origin=`Nowhere` → 空状态；Clear Filters → 恢复 6 条 | **PASS** — 计数、空状态、清空全部正确；改条件会清空未提交的选择 | e2e「Filters」 |
| 05 | 同类多选 + 独立凭据 | 勾选 POST-002/003（同为 Driver）→ Apply to Selected | **PASS** — 两条 `APP-042`/`APP-043`，两个不同管理码，一次快照提交 | e2e「Batch application」；`05b_results_batch.png` |
| 06 | 批量部分失败逐条说明 | 规则层：3 条中 1 条已申请 → 2 成功 + 1 失败逐条原因；界面层：重复提交被拒时结果卡显示 `Not submitted` 与原因 | **PASS** — 成功项照常入库，失败项单独说明，不整体回滚也不谎报成功 | selfcheck「Batch application, partial failure」；e2e「a refused application is reported as a failed item」 |
| 07 | Pending 不隐藏发布 | 申请后刷新页面，Browse 仍显示 POST-001~003 | **PASS** — 卡片仍在，仅标记 `Pending` 且复选框禁用 | e2e「Persistence across a reload」 |
| 08 | 获批后隐藏 + 其余 `Not Selected` | —— | **DAY2** — 界面上 Accept 按钮禁用并标注 “implemented in the Day 2 build” | `08_received_readonly.png` |
| 09 | 同申请人其他 Pending 自动取消 | —— | **DAY2** — 同上，未实现不伪装 | — |
| 10 | 两名发布者先后同意只有一个成功 | —— | **DAY2 / DEMO_ONLY** | — |
| 11 | 拒绝/撤回只改对应记录 | —— | **DAY2** | — |
| 12 | 取消发布与相关申请 | —— | **DAY2** | — |
| 13 | 取消已确认同行并恢复公开 | —— | **DAY2** | — |
| 14 | 到期停止申请、保留历史 | 规则层构造过期发布 → `expireRecords`；界面层确认过期发布不出现在列表且无法申请 | **PASS** — 发布转 `Expired`、其 Pending 申请转 `Expired` 并写入原因，历史记录仍可查询；启动与 Refresh Status 都会执行 | selfcheck「Expiry rule」 |
| 15 | 联系方式可见范围 | 详情弹窗显示发布者公开电话；切换为 Adam 后打开 Received Applications 看到申请人 Alex 的电话/邮箱 | **PASS** — 申请者联系方式只在发布者视图出现；Alex 自己的 Received 页显示“未发布行程” | e2e「Details dialog」「Received Applications」；`04_details.png`、`08_received_readonly.png` |
| 16 | 错误管理码不显示内容 | 输入 `POST-001` + 错码 → 报错且结果区为空；再输入正确码（允许大小写/空格差异）→ 显示记录摘要 | **PASS** — 错码与不存在的记录返回同一条通用文案，不泄露记录是否存在；管理码不出现在公开卡片 | e2e「Manage a Record」；`09_manage_wrong_code.png` |
| 17 | 必填 / 同城 / 过去时间校验 | 手机号 `12`、邮箱 `not-an-email`、同城路线、日期 `2020-01-01` | **PASS** — 四条错误分别提示且不写库；错误信息与控件用 `aria-describedby` 关联 | e2e「First-time profile」「Post a Journey」 |
| 18 | 双击与终态重试不重复 | 连点 View Details ×3、连点 Apply ×2、连续提交同一申请 | **PASS** — 只打开 1 个弹窗；无资料时连点仍只弹 1 次 Your Details 且 0 申请；有资料时连点只新增 1 条，第二次被状态机以“已有有效申请”拒绝 | e2e「Duplicate click protection」 |
| 19 | My Activity 与管理码入口 | Refresh Status 重新读取本地快照并提示未联系服务器；管理入口可查本机记录 | **PASS**（本机）；跨浏览器凭据恢复 **DEMO_ONLY** — 界面明确写 this browser / local demo | e2e「My Activity」「Manage a Record」；`06_activity.png` |
| 20 | 手机窄屏与键盘可用 | 390×844 模拟：卡片单列、数据行转纵向卡片并显示字段名、无横向溢出；键盘：Escape 关闭弹窗、焦点回到触发按钮、←/→ 切换标签 | **PASS** — 页面无横向滚动；焦点回退在修复后通过（见施工记录第 4 条） | e2e「Mobile layout」「Keyboard and focus」；`20_mobile_browse.png`、`20_mobile_activity.png` |

## 汇总

| 结果 | 数量 | 编号 |
|---|---|---|
| `PASS`（实测通过） | 13 项 | 01、02、03、04、05、06、07、14、15、16、17、18、20 |
| `PASS` + `DEMO_ONLY`（同一项两种结论） | 1 项 | 19（本机 My Activity 与管理码入口通过；跨浏览器恢复为 DEMO_ONLY，界面已声明） |
| `DAY2`（本版未实现，界面如实标注禁用原因） | 6 项 | 08、09、10、11、12、13 |
| `FAIL`（实测失败） | 0 项 | — |

> 说明：08–13 共用同一套 Accept / Decline / Cancel 状态机，DAY 2 实现后必须重新执行本表并更新结果，不得沿用 DAY 1 的结论。测试表中所有 `PASS` 均来自本次真实执行（浏览器会话 + 纯逻辑断言），没有预先填写。
