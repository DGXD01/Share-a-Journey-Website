# PPT 演示剧本（DAY 1 + DAY 2 完整闭环）

> 地址：`http://127.0.0.1:5500/index.html?demo=1`（Live Server 端口以实际为准；本项目自带的服务器为 `http://127.0.0.1:5599/index.html?demo=1`）
> 统一前提：先点一次 **Reset Demo Data**。六个种子行程按“演示当天 + 7/8/9 天”重新生成，**永远不会过期**。
> 界面语言英文；本文件说明为中文。整套剧本已由 `tools/e2e.js` 真实跑通（182 项断言），可重复演示。

## 0. 演示人物与固定凭据（Reset 之后）

| 人物 | 角色 | 种子行程 | 管理码（口播用） |
|---|---|---|---|
| Alex Taylor | 乘客 / **申请人（主角）** | 无（首次操作时才填资料） | — |
| Adam Wilson | 司机 | `POST-001` Auckland → Hamilton 08:30 | `DEMO-0001` |
| Mia Chen | 司机 | `POST-002` Auckland → Hamilton 09:00 | `DEMO-0002` |
| Tom Reed | 司机 | `POST-003` Auckland → Hamilton 10:00 | `DEMO-0003` |
| Zoe Parker | 乘客 | `POST-004` Wellington → Palmerston North | `DEMO-0004` |
| Liam Scott | 乘客 | `POST-005` Christchurch → Dunedin | `DEMO-0005` |
| Emma Brown | 司机 | `POST-006` Tauranga → Rotorua | `DEMO-0006` |

记录号规则：发布 `POST-001` 起；申请 `APP-041` 起（每次 Reset 后重新从 041 开始）。管理码格式 `XXXX-XXXX`，校验忽略大小写与空格。

---

## 1. 主剧本九步（对应效果图 01–10）

| 顺序 | 身份 / 操作 | 要看到的画面与关键判断 |
|---|---|---|
| 1 | 打开 `?demo=1` → **Reset Demo Data** → 确认 | Browse 六张卡片、3 列布局，三条 Auckland → Hamilton 司机发布日期都在未来；顶部显示 `Demo person · Alex Taylor` |
| 2 | Origin `Auckland`、Destination `Hamilton` → **Search** → 勾选 Adam、Mia 两张卡 | 只剩 3 条（图 01）；操作条显示 `2 journeys selected`；再勾一张 Passenger 卡会被拒绝（一批只能同类型），随后 **Clear Selection** |
| 3 | 点 Adam 卡 **View Details** → **Apply for this Journey** | 弹出 **Your Details**（图 02）；先故意把邮箱写成 `abc` 提交 → 报错且不发申请；改正确 + 电话 → **Save and Continue** → 结果弹窗 `1 application submitted`，`APP-041` + 独立管理码，**Copy** 可复制（图 05 结构） |
| 4 | 回到 Browse，勾选 Mia、Tom 两条 → **Apply to Selected** → 关闭结果 → **My Activity / My Applications** | `2 applications submitted`（`APP-042`/`APP-043`，两个不同管理码）；图 06 数据：3 条 Pending；Browse 中三条发布**依然可见**且标记 `Pending` |
| 5 | 顶部 `Switch identity` → **Adam Wilson** → My Activity / My Posts → **Manage** | 打开 **Received Applications**（图 08）：发布摘要、管理码、Alex 的电话与邮箱、`Pending` 徽标、**Accept / Decline** 两个真按钮，还有 **Cancel Post** |
| 6 | 在弹窗里点 **Accept** | 弹窗原地变成 `Confirmed`，Alex 那行变 `Accepted`，Accept 按钮消失；提示条说明“另有 2 条待确认申请被自动取消”。Browse 里 Adam 的发布消失（6→5 张卡） |
| 7 | 切回 **Alex Taylor** → My Activity / My Applications | 图 07：绿色 **Accepted** 横幅（“已确认 Auckland → Hamilton，出发 20 Oct 08:30，另外 2 条申请已自动取消”）；列表 `1 Accepted + 2 Automatically Cancelled`，自动取消那两条写明原因 |
| 8 | 点横幅上的 **Cancel Confirmed Journey** → 确认；回 Browse | 确认框提示“发布将重新公开、其他终态记录不会复活”；确认后 `POST-001` 回到 Browse 且可再次申请，`APP-041` 保留为 `Cancelled`，`APP-042/043` 仍是 `Automatically Cancelled` |
| 9 | **Manage a Record**：先 `POST-001` + 错码 `ZZZZ-9999`，再 `POST-006` + `DEMO-0006`；打开 **How It Works** 后手动刷新网页 | 图 09：错码只给一条通用错误、**不显示任何记录**；正确码显示真实记录摘要，并提供该记录真正可用的操作（Cancel Post / Withdraw / Cancel Confirmed Journey）。图 10 六步说明 + 本机边界；刷新后所有记录仍在 |

**收尾一句话**：*“这些状态不是写死的文案：刚才每一次同意、拒绝、撤回、取消都真实写进了这个浏览器的快照，刷新之后一模一样。”*

---

## 2. 三个补充片段（时间够就演，不够就截图）

| 片段 | 操作 | 看点 |
|---|---|---|
| `Not Selected` | 让 Zoe 也申请 Adam 的 POST-001，然后 Adam 接受 Alex | 图 08 里 Zoe 变 `Not Selected`，Alex 变 `Accepted`，一次保存完成全部联动 |
| `Decline` | 切 Liam → 申请 Mia 的 POST-002 → 切 Mia → Decline | 只有这一条变 `Declined`，Mia 的发布仍然 `Open` 可以继续收申请 |
| `Withdraw` | 切 Liam → 申请 Tom 的 POST-003 → 在 My Applications 点 **Withdraw** | 记录变 `Withdrawn`、写原因，发布不受影响；终态记录不会因为再次申请而复活 |

---

## 3. 演示时最容易被问到的四点（照实回答）

1. **“两个人能同时用吗？”** 不能真实并发。这是单浏览器演示：用 `Switch identity` 依次扮演发布者和申请人，业务规则和生产一致，但不宣称客户端并发原子性（需求 10 是顺序冲突模拟，`DEMO_ONLY`）。
2. **“换台电脑还能用管理码找回来吗？”** 不能。管理码只在本浏览器的快照里有效，界面文案也这样写（`this local demo`）。
3. **“申请之后发布为什么还在？”** 因为发布者还没审批：`Pending` 不隐藏发布（需求 07）；只有获批后才会 `Confirmed` 并离开公开列表。
4. **“被自动取消的申请还能被同意吗？”** 不能。规则先看状态：非 `Pending` 一律拒绝，界面也不再给按钮；即使人为把状态改回 `Pending`，只要该申请人已有一条未结束的 `Accepted`，仍然会被拒（e2e 有专门断言）。

---

## 4. 应急操作

- **演示前**：`?demo=1` → Reset Demo Data → 确认浏览器的缩放为 100%，窗口宽度 ≥ 1100px 才是三列布局。
- **讲错或状态乱了**：再 Reset 一次即可，两个故事连续演两轮都从干净状态开始（DAY 3 目标：连演两轮）。
- **想立刻看某个状态**：`docs/screenshots/` 里已有 01–10 各类状态的真机截图，可直接放进 PPT。
