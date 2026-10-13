# PPT 演示剧本（DAY 1 可用版本）

> 地址：`http://127.0.0.1:5500/index.html?demo=1`（Live Server 端口以实际为准，本项目自带的服务器为 `http://127.0.0.1:5599/index.html?demo=1`）
> 统一前提：先点一次 **Reset Demo Data**，六个种子行程的日期会按“演示当天 + 7/8/9 天”重新生成，**永远不会过期**。
> 界面语言为英文；本文件说明为中文。

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

记录号规则：发布 `POST-001` 起，申请 `APP-041` 起（每次 Reset 后重新从 041 开始）。

---

## 1. DAY 1 可完整演示的 7 步（对应效果图 01–06、09、10）

| 顺序 | 身份 / 操作 | 要看到的画面与关键判断 |
|---|---|---|
| 1 | 打开 `?demo=1`，点 **Reset Demo Data** → 确认；确认顶部显示 `Demo person · Alex Taylor` | Browse 出现 6 张卡片、3 列布局，三条 Auckland → Hamilton 司机发布日期都在未来 |
| 2 | 在筛选卡输入 Origin `Auckland`、Destination `Hamilton` → **Search** | 只剩 3 条（图 01 的筛选效果）；提示条写明本次筛选条件；再点 **Clear Filters** 恢复 6 条 |
| 3 | 勾选 Adam 与 Mia 两张卡（同为 Driver） | 绿色操作条出现 `2 journeys selected`，卡片变绿边；再勾一张 **Passenger** 卡 → 被拒绝并提示“一批只能同类型”（这是真实规则，不是写死提示）；点 **Clear Selection** |
| 4 | 点 Adam 卡上的 **View Details** → 弹窗底部 **Apply for this Journey** | 弹出 **Your Details**（图 02）；先故意把邮箱写成 `abc` 提交 → 报错且不发申请；改成 `alex.taylor@example.com` + 电话 → **Save and Continue** |
| 5 | 提交后自动继续原动作 | 结果弹窗 `1 application submitted`，显示 `APP-041` 与独立管理码，状态 `Pending`，**Copy** 可复制（图 05 结构）；点 **View My Applications** 进入 My Activity（图 06 数据） |
| 6 | 回到 Browse，勾选 Mia、Tom 两条 → **Apply to Selected** | `2 applications submitted`，两条不同记录号与不同管理码；Browse 中三条发布**依然可见**且标记 `Pending`（需求 07） |
| 7 | **Manage a Record**：先输入 `POST-001` + 错码 `ZZZZ-9999`，再输入 `DEMO-0001` | 错码：只有一条通用错误，**不显示任何记录**（图 09）；正确码：显示 Auckland → Hamilton 记录摘要 |
| 8 | 顶部 **How It Works** | 六步说明 + “谁能看到你的联系方式” + **本机边界**：另一浏览器/另一台电脑是空的、没有服务器推送（图 10 内容） |

**收尾一句话**：*“刷新页面（F5）再回来，刚才的申请和管理码都还在——因为整份状态存在这个浏览器的 localStorage 里，不在这台机器之外。”*

---

## 2. 演示时最容易被问到的三点（照实回答）

1. **“两个人能同时用吗？”** 不能真实并发。这是单浏览器演示：用顶部 `Switch identity` 依次扮演 Adam 和 Alex，业务规则一样，但不宣称客户端并发原子性。
2. **“换台电脑还能用管理码找回来吗？”** 不能。管理码只在本浏览器的快照里有效，界面文案也这样写（`this local demo`）。这是 `DEMO_ONLY` 边界。
3. **“申请之后发布为什么还在？”** 因为发布者还没审批：`Pending` 不隐藏发布是设计规则（需求 07），只有获批后才会隐藏并从公开列表移除（DAY 2 实现）。

---

## 3. DAY 2 完成后要接上的两步（本版界面已标注为 Day 2）

| 顺序 | 操作 | 预期（DAY 2 实现后） |
|---|---|---|
| A | 切换到 **Adam Wilson** → My Activity / Received Applications → 打开 Alex 的申请 → **Accept** | 图 08：发布摘要、申请者联系方式、Accept/Decline 真实生效；Adam 的发布变 `Confirmed` 并离开公开列表 |
| B | 切回 **Alex** → **Refresh Status** | 图 07：Adam 一条 `Accepted`，Mia/Tom 两条 `Automatically Cancelled` 并写明原因；再演示 Cancel Confirmed Journey 后原发布恢复 `Open`（未过期时） |

演示脚本第 1–3 步（搜索、勾选两条 Driver、填资料）与第 5 步的记录号在 DAY 2 版本中保持不变，可直接续用。
