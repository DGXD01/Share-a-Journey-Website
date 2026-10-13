# 20 项功能需求清单与实现位置

> 需求来自《第七组 Share-a-Journey 功能页面说明》V1.0，编号沿用施工文档 §7。
> 本文件说明「这条需求在代码里由谁负责」，实测结果见 `TEST_CASES.md`。

| # | 需求 | 实现位置 | 状态 |
|---|---|---|---|
| 01 | 司机与乘客都能发布；反方向角色可以申请 | `rules.js: createPost`（`postType` 双类型）、`applyToPosts`（不限制申请人角色，只禁止申请自己的发布） | 完成 |
| 02 | 首次资料只录一次；取消不继续原操作 | `app.js: startPublishIntent/startApplyIntent` + `uiState.pendingIntent`、`rules.js: saveProfileAndResume`、`ui.js: renderProfileDialog` | 完成 |
| 03 | 已有资料一键申请 | `details-apply-btn` → `startApplyIntent` → `rules.js: applyToPosts` | 完成 |
| 04 | 四条件过滤、空列表、清条件 | `rules.js: filterPosts`、`ui.js: renderBrowse/renderBrowseHint`、`#empty-state` | 完成 |
| 05 | 同类多选、每条独立申请与凭据 | `app.js: handleSelectToggle`（同类型限制）、`rules.js: applyToPosts`（逐条分配 `APP-xxx` 与独立管理码） | 完成 |
| 06 | 批量部分失败，其余正常提交 | `rules.js: applyToPosts` 返回 `results[]`（每项 `ok/error`），一次 `commitState`；`ui.js: renderResults` 逐条渲染失败原因 | 完成 |
| 07 | Pending 不隐藏发布 | `rules.js: isPubliclyVisible` 只看 `status === 'Open'` 与到期时间，不看申请数 | 完成 |
| 08 | 一条获批后发布隐藏，其余申请 `Not Selected` | `rules.js: acceptApplication`（`Confirmed` + `confirmedApplicationId` + `Not Selected`）、`ui.js: renderReceivedDialog` | 完成 |
| 09 | 同申请人其他 `Pending` 自动取消并记原因 | `rules.js: acceptApplication` 的第四步（跨**所有**发布扫描该申请人的 `Pending`） | 完成 |
| 10 | 两名发布者先后同意，只有一个成功 | 双重保障：① 第一次同意已把该申请人在别处的 `Pending` 自动取消；② `canAccept` 再检查 `activeAcceptedFor`（顺序冲突模拟，真实并发为 `DEMO_ONLY`） | 完成（本机顺序模拟） |
| 11 | 拒绝或撤回只改变对应记录 | `rules.js: declineApplication` / `withdrawApplication`（仅 `Pending`，写 `reason`） | 完成 |
| 12 | 发布者取消发布与相关未结束申请 | `rules.js: cancelPost`（发布→`Cancelled`，其 `Pending`/`Accepted` 一并取消） | 完成 |
| 13 | 取消已确认同行，未过期时恢复公开 | `rules.js: cancelJourney`（申请→`Cancelled`；发布未取消且未过期→`Open`；旧终态不复活） | 完成 |
| 14 | 到期后停止申请/同意，保留历史 | `rules.js: expireRecords` + `isPastDeparture`；`canAccept`/`canCancelPost`/`canCancelJourney` 均拒绝已出发的记录 | 完成 |
| 15 | 发布者联系方式公开；申请者信息仅在管理视图可见 | `ui.js: renderDetails`（公开电话/邮箱）与 `renderReceivedDialog`（申请者电话/邮箱，且仅发布者可见） | 完成 |
| 16 | 错误管理码不显示任何记录内容 | `rules.js: verifyManagementCode`（错码与不存在的记录返回**同一条**通用错误文案） | 完成 |
| 17 | 表单必填、同城、过去时间校验 | `rules.js: validateProfile` / `validatePost`（含 NZ 当天已过时间）、`ui.js: fieldError` 关联控件 | 完成 |
| 18 | 双击操作与终态重试不生成重复记录 | `app.js` 的 `busy` 重入保护 + 每次操作的权限谓词二次校验（重复申请、本人发布、非 `Pending` 审批、已过期都会被拒绝） | 完成 |
| 19 | 本机 My Activity 与管理入口；跨浏览器凭据恢复 | `#activity-view`（My Posts / My Applications / Received Applications + 真实操作）、`#manage-dialog`（凭码打开记录并执行可用操作）、`localStorage` 快照 | 本机完成；跨浏览器 **DEMO_ONLY**（文案统一 this browser / local demo） |
| 20 | 手机窄屏与键盘可用 | `css/style.css` 的 720px 断点（卡片单列、数据行转纵向卡、弹窗页脚纵向）、原生 `<dialog>` 的 Tab/Escape、标签方向键、焦点回退 | 完成 |

---

## 状态与字段契约（冻结）

- 发布状态：`Open` / `Confirmed` / `Cancelled` / `Expired`
- 申请状态：`Pending` / `Accepted` / `Declined` / `Not Selected` / `Withdrawn` / `Automatically Cancelled` / `Cancelled` / `Expired`
- `Post`：`postId / ownerProfileId / ownerAlias / postType / name / phone / email / origin / destination / date / time / notes / status / confirmedApplicationId / managementCode / createdAt`
- `Application`：`applicationId / postId / applicantProfileId / applicantName / applicantPhone / applicantEmail / appliedAt / status / reason / managementCode`
- 快照：`{ schemaVersion: 2, profiles, posts, applications, activityRefs, activeProfileId, nextSequence: { post, application, profile }, seededAt }`
  - `activityRefs[profileId] = [{ recordId, managementCode }]`，记录类型由 `POST-` / `APP-` 前缀区分
- 记录动作（`rules.js` 权限谓词与命令一一对应，UI 与规则共用同一判断）：

| 动作 | 谁可以 | 条件 | 影响 |
|---|---|---|---|
| `acceptApplication` | 该发布者 | 发布 `Open` 未出发、申请 `Pending`、申请人无未结束的 `Accepted` | 申请→`Accepted`；发布→`Confirmed`（离开 Browse）；同发布其他 `Pending`→`Not Selected`；该申请人在**其他**发布的全部 `Pending`→`Automatically Cancelled`（写原因）；一次保存 |
| `declineApplication` | 该发布者 | 申请 `Pending` | 仅该申请→`Declined` |
| `withdrawApplication` | 该申请人 | 申请 `Pending` | 仅该申请→`Withdrawn` |
| `cancelPost` | 该发布者 | 发布未 `Cancelled`、未出发 | 发布→`Cancelled`（离开 Browse）；其 `Pending`/`Accepted` 申请→`Cancelled` |
| `cancelJourney` | 该申请人 | 申请 `Accepted`、未出发 | 申请→`Cancelled`；发布未 `Cancelled` 且未出发→回到 `Open`；旧终态不复活 |
- ID 规则：发布 `POST-001` 起（种子 001–006，新建从 007 起），申请 `APP-041` 起（对齐施工文档示例）；管理码 `XXXX-XXXX`（去混淆字符集，`crypto.getRandomValues` 生成；种子固定为 `DEMO-0001`–`DEMO-0006` 便于课堂口播）
- 浏览器存储键：`sj_demo_state_v2`（损坏或版本不符时自动用 CSV 重新播种，不静默丢数据）
