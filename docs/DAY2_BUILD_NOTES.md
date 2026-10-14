# DAY 2 开发记录与 DAY 3 接续点

> 对应施工文档 §5「DAY 2：实现 05 / 06 / 07 / 08 / 09 的业务闭环（约 12 小时）」与 §8.1 的 Gate D2。

## 1. 当日完成内容

计划把这一天切成六个时间块推进，开头两块的代码 DAY 1 已经写完，本日只做回归；其余按交付内容归并如下。

- **单条 Apply、首次资料 `pendingIntent`、管理码生成、提交结果弹窗**：DAY 1 已完成，本日未改动，回归测试仍全绿。
- **多选同类型限制、批量部分失败、逐条凭据与 Copy**：DAY 1 已完成，与单条共用 `applyToPosts`。
- **My Activity 主视图、三 Tab、刷新、Pending 表格与手机卡片**：补上操作列 `Withdraw`、`Cancel Confirmed Journey`、`Cancel Post`，以及 Accepted 绿色横幅（图 07）。
- **Received Applications 弹窗、Accept / Decline / Withdraw 与完整联动及原因**：Accept 一次保存完成四路联动；Decline/Withdraw 只改目标记录；原因写入 `reason` 并显示在列表里。
- **Manage a Record 校验、取消发布 / 同行、到期规则、恢复公开与历史管理**：记录视图内直接执行 Cancel Post / Withdraw / Cancel Confirmed Journey，动作后原地刷新记录；终态不复活。
- **演示身份切换与全链验收 03、05–14、16、18**：全链验收同样改为自动化，`tools/selfcheck.js` 130 项与 `tools/e2e.js` 182 项全部真实执行。

**Gate D2 达成情况**：所有业务按钮都是真实操作且刷新不丢失；`docs/TEST_CASES.md` 里 08–13 已重测改写为 `PASS`。

## 2. 本日新增的规则（`js/rules.js`）

- `canAccept / canDecline / canWithdraw / canCancelPost / canCancelJourney`：五个**权限谓词**。UI 用它们决定按钮是否可用并取 `title` 说明，命令函数在提交时再调用同一个谓词，按钮状态与业务规则不可能不一致。
- `acceptApplication`：一次计算并一次保存，本申请→`Accepted`；发布→`Confirmed` 并写 `confirmedApplicationId`（自动离开 Browse）；同一发布其他 `Pending`→`Not Selected`；**该申请人在任意其他发布上的全部 `Pending`→`Automatically Cancelled`** 并写明原因。
- `declineApplication`：仅目标 `Pending`→`Declined` 加原因，发布保持 `Open`。
- `withdrawApplication`：仅本人 `Pending`→`Withdrawn` 加原因。
- `cancelPost`：发布→`Cancelled` 并隐藏；其 `Pending` / `Accepted` 申请一并→`Cancelled` 加原因。
- `cancelJourney`：已确认申请→`Cancelled`；发布未 `Cancelled` 且未过期→重新 `Open` 并清空 `confirmedApplicationId`；旧终态记录不复活。
- `activeAcceptedFor`：“尚未结束的 Accepted” = 状态 `Accepted` 且发布未取消、**尚未到出发时刻**。据此拒绝“一个人两条有效确认”，也让已经发生过的行程不再阻挡新的申请。

## 3. 关键判定（写进代码的取舍，避免以后争论）

1. **“未结束的 Accepted”以出发时刻为界**：出发时刻一过，这条确认不再阻止该用户申请新行程；记录本身保留 `Accepted`（那是历史，不是垃圾数据），不做“完成后变 Expired”的假动作。
2. **终态永不复活**：`Declined` / `Withdrawn` / `Cancelled` / `Not Selected` / `Automatically Cancelled` / `Expired` 都是终态。发布恢复 `Open` 之后，旧记录仍是旧记录，申请人重新申请会产生**新**的记录号与管理码。
3. **允许在终态之后重新申请**：施工文档只禁止“重复**有效**申请”，因此判断依据是“是否还有 `Pending`/`Accepted`”，而不是“是否申请过”。
4. **危险操作二次确认**：`Cancel Post` 与 `Cancel Confirmed Journey` 都先弹确认框，且确认框会算出真实影响面（“会连带取消 1 条生效中的申请”）。`Decline` / `Withdraw` 只影响单条 `Pending` 且结果立即显示，不再叠加弹窗。
5. **一次提交、全界面刷新**：所有命令返回 `nextState`，由 `app.js` 调用一次 `commitState`，随后 `renderAll()` + `refreshOpenDialogs()`（详情弹窗、发布者弹窗、管理视图都会用新快照重画，不保留旧状态副本）。
6. **列表顺序确定化**：`getActivity` 的排序在 `appliedAt` 相同时按记录号兜底，避免同一分钟创建的记录顺序随机（这个问题在截图审查时被发现）。

## 4. 本日发现并修复的问题

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | 同一分钟创建的多条申请在 My Applications 中顺序不稳定 | `appliedAt` 精度只到分钟，比较函数对相等值不稳定 | 两个排序都加记录号兜底比较（新→旧 / 旧→新） |
| 2 | 危险操作按钮是实心红，跟“普通确认”同色，违反 §2.1“危险操作不与普通确认同色” | 只有一个 `.btn-danger` 实心样式 | `.btn-danger` 改为白底红字描边；确认框里的最终确认改用新的 `.btn-danger-solid` |

## 5. DAY 3 接续点

按施工文档 §5 的 DAY 3 表格，剩下的是**收口与交付**，功能不必再加：

1. **复核 How It Works**：该页已在 DAY 1 落地，这里只需复核六步文案与当前行为一致（现在 Accept 会连带自动取消，帮助里的第 5 步可再点明一次）。
2. **视觉收口**：对照 01–10 微调页头、间距、弹窗页脚、状态配色、头像与空状态；`docs/reference/` 放入原图后逐图比对。
3. **窄屏与键盘**：已有 390px 断言与键位断言，建议补测 720–1099px 两列断点与手机上的完整审批流程（点 Accept/Decline）。
4. **验收记录**：`docs/TEST_CASES.md` 已完成 20 项实填，这里需补 CSV/存储异常、双击、错误码的**人工**复核截图，并按需增补边界用例。
5. **连演两轮**：`Reset Demo Data` → 按 `docs/DEMO_SCRIPT.md` 九步连演两轮，统一动态日期/人物/记录号，再产出 01–10 的 PPT 截图（目前 `docs/screenshots/` 已有可用底图）。
6. **缓冲项**：修 bug、写最终 README、Git 提交、打包源码与截图。

## 6. 复现验证

```bash
node tools/selfcheck.js            # 130 passed, 0 failed
node tools/serve.js 5599           # 后台常驻
node tools/e2e.js                  # 182 passed, 0 failed（真 Chrome + 截图）
```

两套脚本都使用全新的临时浏览器目录，因此每次运行都是冷启动 + 空 localStorage，结论可重复。
