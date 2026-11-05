# Agent Undercover · 5 天实施计划（2026-11-05 → 2026-11-09）

> 依据：[prd.md](prd.md)
> 目标：**2026-11-09 20:00 UTC 前**完成可提交版本并提交（算上今天共 5 天）
> 官方截止：**2026-11-14 23:59 UTC**（11-10～11-14 作为缓冲/打磨，不改变 5 天目标）
> 团队：1 人（创意/评估/协调）+ Claude Code（实现/测试/文档）
> 内部功能冻结：**2026-11-08 23:59 UTC**
> 提交目标：**2026-11-09 20:00 UTC**（官方 API 开放到 11-14）

---

## 1. 成功标准（Definition of Done）

- [ ] 公开 GitHub repo，含 MIT LICENSE，README 可让陌生人从零跑起来
- [x] 合约部署在 NEAR Testnet，地址写进 README（`game.agent-undercover.testnet` 已部署并初始化）
- [x] 4 个 Agent 持久子账户，`view_access_keys` 显示只有 scoped FunctionCall key，无 full-access key（2026-11-05 raw RPC 复核：每个账户恰好两个 FunctionCall key）
- [x] `pnpm demo:scripted` 不需要 AI API key，能在 Testnet 跑完一局 5 人局并结算（2026-11-05 复跑 exit 0：Crew 胜，4 winners，5 条描述 / 5 个 reveal）
- [ ] `DEMO_MODE=live` 用 NEAR AI Cloud 跑完一局，AI 输出可读、可回放
- [x] 浏览器里 1 真人 + 4 Agent 完整玩一局：质押 → 描述 → commit-reveal 投票 → 放逐 → 结算（2026-11-05 run 20 完整走通）
- [x] 结果页展示：胜方、分账、Agent 余额变化、Explorer 链接、AI 私有推理回放（2026-11-05 run 20：7 张推理卡，0 console error）
- [ ] 60–90 秒 demo 视频已发布到 X，满足 HACKATHON.md 的 tag 要求
- [ ] 提交 payload 已打印并由 human 确认，POST 返回 201
- [ ] Hosted demo（加分项）保持可访问到 2026-11-18

---

## 2. 两条工作流

### A. 程序开发（Claude 主力）

| ID | 模块 | 产出 | 目标日 |
|---|---|---|---|
| D1 | 骨架 + 建号 | repo、wasm、Testnet master/contract、4 Agent 账户、最小合约 | 11-05 |
| D2 | 合约 + 脚本局 | 合约 v1、单测、scripted 5 人局上链（M1） | 11-06 |
| D3 | Backend + AI | 房间状态机、Session key、WebSocket、NEAR AI Cloud（M2） | 11-07 |
| D4 | Frontend + 加固 | 浏览器完整一局、结果页/回放、3 连跑（M3） | 11-08 |
| D5 | 部署 + 提交 | Hosted demo、README、视频、X、payload、201（M4） | 11-09 |

### B. 提交材料（human 决策 + Claude 起草/制作）

| ID | 材料 | 产出 | 负责人 |
|---|---|---|---|
| S0 | Repo | 公开 GitHub repo、LICENSE、baseline 说明 | human 创建/公开；Claude 准备 |
| S1 | README | 英文、机器可读、run steps、架构、trust model、track mapping | Claude 起草，human 审 |
| S2 | RULES/ARCHITECTURE | 规则、信任模型、合约接口 | Claude |
| S3 | 测试网地址 | 合约 + Agent 账户 + Explorer 链接 | Claude |
| S4 | Demo 视频 | 60–90s，含一个完整链上结算瞬间 | human 录制/发布；Claude 写脚本/剪辑建议 |
| S5 | X post | 含 built at NEAR HACKATHON、@NEARProtocol、#NEARHackathon、视频 | human 发布；Claude 起草 |
| S6 | Hosted demo | Vercel + Render，保留到 11-18 | Claude 部署；human 确认 |
| S7 | 提交 payload | 完整 JSON、字段校验、requestId | Claude 起草；human 确认后发送 |
| S8 | 截图/备用素材 | 关键页面、Explorer、Agent key 证明 | Claude 准备 |

---

## 3. 5 天日程（UTC / 北京时间 = UTC+8）

> 官方截止 **2026-11-14 23:59 UTC = 11-15 07:59 CST**。我们的目标是 11-09 提交，剩下 5 天是缓冲，不是计划的一部分。

### Day 1 · 11-05（今天）

**目标：repo 能编译、Testnet 能部署、Agent 账户能建**

- [x] PRD / PLAN 定稿
- [x] 目录骨架：`contract/`、`server/`、`web/`、`shared/`、`scripts/`、`docs/`
- [x] 根 `package.json` + `pnpm-workspace.yaml`
- [x] `.gitignore`（`.env`、`.keys/`、`runs/`、`target/`、`node_modules/`、`dist/`）
- [x] LICENSE（MIT）
- [x] `README.md` 骨架（英文标题、one-liner、run 占位）
- [x] 安装 `wasm32-unknown-unknown`
- [x] Testnet master 账户（faucet）+ 合约子账户
- [x] 4 个 Agent 子账户：scoped FunctionCall key，无 full-access key
- [x] 最小合约部署，`get_room_count` 可读
- [x] `RULES.md` / `ARCHITECTURE.md` 初版
- [x] 验收：`cargo test` 通过；合约地址可查；`view_access_keys(agent)` 只有 FunctionCall key

**如果今天建号/部署卡住**：优先保证 master + 合约账户；Agent 账户顺延到 Day 2 上午。

### Day 2 · 11-06

**目标：合约 v1 + 脚本在 Testnet 跑完一局（M1）**

- [x] 合约：create/join/start、description、commit/reveal、tally、reveal_role、advance、settle、refund、views
- [x] 单测：完整 5 人局、平票、错误哈希、重复提交、投自己、超时退款、分账余数
- [x] `scripts/demo-scripted.mjs`：建房间 → 4 Agent join → start → 最多 3 轮 → settle
- [x] 打印交易 hash、Explorer 链接、最终余额、Agent stats
- [x] Backend skeleton：Express + Socket.IO + 合约客户端 + Agent signer
- [x] 验收：一局完整跑通；`Settled`；Agent 余额变化与分账一致；M1 成立

### Day 3 · 11-07

**目标：Backend + AI + 浏览器最小闭环（M2）**

- [x] Session 账户 API：浏览器公钥 → 建号 + 充值（full-access 仅存在于浏览器内存）
- [x] Relay API：广播浏览器签名交易
- [x] 房间管理器：内存状态 + 合约同步
- [x] NEAR AI Cloud 客户端：OpenAI 兼容、超时/重试、无 key fallback
- [x] 4 个 persona；卧底 strategy → utterance 两段式
- [x] 输出校验：长度、不含自己的词、投票合法；失败 fallback
- [x] `runs/<room>.jsonl` 记录 reasoning
- [x] Frontend v1：Landing/Lobby/Game/Result + Socket.IO + session key
- [x] 验收：浏览器能加入并看到状态（2026-11-05 多次完整对局）
- [x] 无 key 自动 fallback（2026-11-05 `DEMO_MODE=live` + 空 `NEAR_AI_API_KEY`，`decideTurn` 返回 `source=scripted`）
- [ ] `DEMO_MODE=live` + `NEAR_AI_API_KEY` 跑完一局（待 human 提供 key）

### Day 4 · 11-08

**目标：完整一局 + 结果页 + 稳定性；功能冻结（M3）**

- [x] 结果页：胜方、分账、Agent 余额变化、Explorer、AI reasoning 回放
- [x] Agent 战绩/收益展示（可合并到结果页）
- [x] 交易可靠性：FastNear 的 `waitUntil: "NONE"` 会静默丢交易（2026-11-05 用 0.001 NEAR 转账复现）；浏览器改回 `INCLUDED`，create_room/描述/投票失败时轮询链上确认
- [x] 错误文案：`timed out` 正确归入 RPC 超时提示；描述/投票的恢复轮询延长到 25s
- [x] 刷新恢复：Vote commit 阶段刷新页面，`game:watch` 重连并恢复状态（2026-11-05 run 15 完整结算）
- [x] RPC 中继：上游 408/5xx 转成 JSON-RPC error（HTTP 200），避免浏览器 console error；45s 安全超时；FastNear 约 30s 的 408 仍会落链，提前 abort 会取消广播
- [ ] 错误态、重连、超时、空房间、计时器（重连/计时器/刷新恢复已过；空房间与容量上限未压测）
- [x] 连续跑 3 局无手动干预；无 console error（2026-11-05 run 17/18/19 同一 server 进程，全部 Crew 胜、7 张推理卡、exit 0；期间 RPC 408 均由链上恢复）
- [x] 重启 server 后回归：run 20（2026-11-05，Crew 胜，human 卧底，7 张推理卡，0 console error；commit 超时 2 次、reveal 超时 1 次，重试后均恢复）
- [x] README v1（run steps、架构、trust model、track mapping；2026-11-05 已改为当前真实流程）
- [x] Hosted deploy（Backend + Web）（2026-11-05 Render 新账号要求绑卡，改用 Railway：`https://agent-undercover-production.up.railway.app`；`SESSION_FUNDING_NEAR=0.25` 覆盖 0.1 质押 + ~0.1 房间存储，低于 0.22 拒绝启动；重新部署后浏览器 smoke 完整两局：Crew 胜、分账正确、7 张推理卡、0 console error）
- [x] Hosted treasury 充值路径：helper 网页已 404 但 `POST /account` 仍可开户，`scripts/topup-treasury.mjs` 用临时账户 + `deleteAccount` 扫入 treasury；当前约 21.8 NEAR（≈87 局）
- [x] 部署预算保护：treasury/master 余额下限、`MAX_SESSIONS` 上限；server typecheck 通过
- [x] Demo UI 游戏化（2026-11-06）：座位发言气泡 + 打字机、身份卡发牌翻牌、实时票数条、回合裁决卡（EXILED 印章 + 角色翻牌）、结果页 IMPOSTOR CAUGHT/ESCAPED 印章；只向客户端暴露已放逐者角色；本地 3 局验证 + 最终 browser smoke（2 轮、Crew 胜、7 张推理卡、0 console error）
- [ ] **23:59 UTC 功能冻结**
- [x] 验收：1 真人 + 4 Agent 完整一局（2026-11-05 浏览器 smoke：Crew 胜，分账正确，无 console error）；连续 3 局已过；当前工作树 scripted demo 复跑 exit 0；2026-11-05 fresh clone 全流程验证通过

### Day 5 · 11-09

**目标：提交材料 + 发布 + 提交（M4）**

- [ ] Hosted demo smoke test（无痕窗口/手机）
- [ ] README 最终版：Testnet 地址、Explorer、视频、hosted demo、track mapping
- [ ] 录制/剪辑 60–90s 视频（human）
- [ ] 发布 X post（human，草稿见第 6 节）
- [ ] repo 设为 public（human）
- [ ] 生成 requestId，打印完整 payload（**不发送**）
- [ ] human 确认 payload + consent
- [ ] POST 提交，目标 20:00 UTC 前拿到 201
- [ ] 验收：201；保存响应；hosted demo 保留到 11-18

**Slip 规则**：任何一天落后，优先砍第 9 节的功能，不移动 11-09 提交目标；11-10～11-14 是官方缓冲，只修 bug/补材料。

---

## 4. 提交 checklist

### 4.1 Repo / 代码

- [ ] 公开 GitHub repo，URL 可匿名访问
- [x] LICENSE（MIT）
- [x] README 英文，含：
  - [x] 产品是什么、解决什么问题
  - [x] “do X - see Y” 的可复现步骤
  - [x] `DEMO_MODE=scripted` 无 API key 跑法
  - [x] 架构图 / 信任模型
  - [x] Testnet 合约地址 + Agent 账户 Explorer 链接
  - [x] track mapping（games / agents / swarms）
  - [x] 测试命令与结果
  - [x] baseline / 第三方模板声明
- [x] `.env.example`，无真实 key
- [x] `git log` 可看出 2026-11-01 之后的工作（Q-001/Q-003；全部提交在 2026-11-05）
- [x] 若用了任何模板/旧代码，README 披露（未使用；README “Built with” 已声明）

### 4.2 Demo

- [ ] 视频 ≤ 90s，展示一个完整链上结算瞬间
- [ ] 视频里能看清 Agent 子账户余额变化 / Explorer
- [ ] X post 公开，含：
  - [ ] “built at NEAR HACKATHON”
  - [ ] `@NEARProtocol`
  - [ ] `#NEARHackathon`
  - [ ] （可选）`@NearLegion` `@NearBuilders`
  - [ ] 视频或截图附件
  - [ ] demo + repo 链接
- [ ] Hosted demo 可访问（加分），保留到 2026-11-18

### 4.3 表单

- [ ] projectName: `Agent Undercover`
- [ ] leadName: `Necklace`
- [ ] email: `necklace1982@gmail.com`
- [ ] size: `1`
- [ ] tracks: `["games","agents","swarms"]`
- [ ] nearAddress: `x-bit.near`
- [ ] projectUrl: 公开 repo URL
- [ ] demoUrl: 公开 X post URL
- [ ] idea: PRD 12.5 的文案（20–2000 字符）
- [ ] consent: human 逐字确认 HACKATHON.md 的联系声明
- [ ] requestId: 只生成一次，重试复用
- [ ] 打印完整 JSON，human 确认后才 POST
- [ ] 不重复提交；改错走 request-changes

---

## 5. Demo 视频脚本（60–90 秒）

> 原则：第一行讲用户问题；只展示一个完整瞬间；NEAR 的角色要具体；结尾给下一步。

| 时间 | 画面 | 旁白/字幕 |
|---|---|---|
| 0–5s | 四个 Agent 头像 + 各自 NEAR 子账户余额 | “These four AI agents have their own NEAR wallets. I’m about to play Undercover against them — for real money.” |
| 5–15s | 大厅：我质押 0.1 NEAR；4 个 Agent 从各自子账户 join；奖池 0.5 NEAR | “Five players. Four agents. One of them is lying. Every stake is locked in a NEAR escrow contract.” |
| 15–30s | 第一轮：词卡（我的词 / 我的阵营）；4 条描述出现；卧底那句看似合理 | “Everyone describes their secret word in one sentence. The impostor has a similar word — and has to blend in.” |
| 30–45s | 我投票；commit-reveal 状态；放逐结果：我投错了，一个好人 Agent 被放逐 | “I voted. Commit-reveal hides the votes until everyone has committed. I got it wrong.” |
| 45–60s | 第二轮/结算：卧底存活 → 卧底胜；合约自动分账 | “The impostor survived. The contract pays the winning side — including the AI.” |
| 60–75s | Explorer：卧底 Agent 子账户余额增加；`view_access_keys` 只有 FunctionCall key | “Its winnings go into its own subaccount. It only has a scoped key — even I can’t withdraw its money.” |
| 75–90s | 结果页：AI 私有推理回放 / 卧底串供；结尾 repo + hosted demo | “After the game, you can see exactly how it lied. Built at NEAR HACKATHON. Can you spot the AI?” |

**录制建议**
- 1080p，浏览器缩放 110–125%，字体大。
- 提前跑一遍 scripted 模式确认流程；live AI 作主录制，scripted 作 fallback。
- 视频里不要出现真实私钥、`.env`、主网账户。
- 若一局太长，剪辑只保留关键描述和结算；不要伪造结果。

---

## 6. X post 草稿

> These 4 AI agents have their own NEAR wallets — and they just took my money in a game of Undercover.
>
> I built **Agent Undercover** at @NEARProtocol #NEARHackathon: a 5-player social deduction game where AI agents stake their own funds, lie to your face, and keep what they win. Stakes and payouts are enforced by a NEAR escrow contract; each agent has a scoped key, so even I can't withdraw its winnings.
>
> Can you spot the AI? Demo + repo: [hosted demo] · [repo]
>
> Built at NEAR HACKATHON.

**Human 发布前检查**
- 第一行是钩子，不是项目名堆砌
- 含 built at NEAR HACKATHON / @NEARProtocol / #NEARHackathon
- 附件是视频（或至少截图）
- 链接可匿名打开
- 发布后把 URL 填进提交表单的 `demoUrl`

---

## 7. 提交 payload 模板

> 不要直接发送。先生成 requestId，打印，human 确认。
>
> 2026-11-05 已加 `scripts/prepare-submission.mjs`：校验字段、从 PRD §12.5 读取 `idea`、把 requestId 存到 `.submission-request-id`（gitignored，重试复用），只打印 JSON / 表单字段 / curl，不发送。用法：
> `node scripts/prepare-submission.mjs --project-url <repo> --demo-url <X post> --consent`

```json
{
  "requestId": "<uuidgen | tr A-Z a-z>",
  "projectName": "Agent Undercover",
  "leadName": "Necklace",
  "email": "necklace1982@gmail.com",
  "size": "1",
  "tracks": ["games", "agents", "swarms"],
  "nearAddress": "x-bit.near",
  "projectUrl": "https://github.com/<user>/agent-undercover",
  "demoUrl": "<X post URL>",
  "idea": "<PRD 12.5 文案>",
  "consent": true
}
```

**发送前**
- [ ] `projectUrl` 匿名可访问
- [ ] `demoUrl` 公开可访问
- [ ] `nearAddress` 是主网命名账户（`x-bit.near`）
- [ ] `size` 精确为 `1`
- [ ] `tracks` 每个 id 合法、不重复
- [ ] `idea` 20–2000 字符
- [ ] human 已逐字确认 consent 声明
- [ ] 同一 requestId 只用于重试

**发送后**
- 201 → 保存响应，告诉 human，完成
- 400 → 按 `fields` 修，复用 requestId 重发
- 409 → 不要换 repo/email 绕过；走 request-changes
- 403 → 不在提交窗口或跨站；告诉 human，不重试
- 503 → 等一分钟，复用 requestId

---

## 8. 测试计划

### 8.1 合约

- [x] `cargo test`：完整 5 人局
- [x] 平票 → 无人放逐
- [x] 错误哈希 → 拒绝
- [x] 重复 commit/reveal → 拒绝（单测）
- [x] 投自己 → 拒绝（单测）
- [x] 未到 deadline 退款 → 拒绝（单测）
- [x] 超时退款 → 每人拿回 stake
- [x] 1 卧底被放逐 → Crew 胜（单测）
- [x] 卧底存活到轮次上限 → Impostor 胜（单测）
- [x] 分账总额 == pot；余数处理正确
- [x] Agent stats 只对 is_agent 更新
- [x] `cargo clippy --all-targets -- -D warnings` 通过（2026-11-05）
- [x] wallet 合约 5 个单测通过（`pnpm test:wallet`）

### 8.2 端到端

- [x] `pnpm demo:scripted`：无 AI key，Testnet 完整一局
- [ ] `DEMO_MODE=live`：真实 AI 完整一局
- [x] 浏览器：1 真人 + 4 Agent 完整一局（2026-11-05）
- [x] 无 key → fallback 到 scripted（2026-11-05 `DEMO_MODE=live` 验证）
- [x] AI 请求失败 → fallback 到 scripted（2026-11-05 用不可达 endpoint 验证）；真实 AI 成功路径待 `NEAR_AI_API_KEY`
- [x] 刷新页面 → 重连并恢复状态（2026-11-05）
- [x] 新 clone → 按 README 跑通 scripted（2026-11-05 `/tmp/au-fresh`：install、web build、server typecheck、9 个合约测试、scripted 局 all exit 0）

### 8.3 评委可复现性

- [x] README 的每条命令在干净目录执行过（2026-11-05：install / build / typecheck / test / demo / dev:server 健康检查）
- [x] `.env.example` 每个变量有说明（2026-11-05 补 `TREASURY_FLOOR_NEAR` / `MAX_SESSIONS`）
- [x] 不需要主网、不需要付费服务即可看 scripted demo（Testnet faucet 免费；`DEMO_MODE=scripted` 无 AI key）
- [ ] 合约地址和交易 hash 可在 Explorer 打开
- [ ] 视频链接、hosted demo 链接、repo 链接都可匿名访问

---

## 9. 砍功能优先级（落后时按顺序砍）

1. Wallet Selector（保留 session key demo）
2. Agent 排行榜/收益率页（合并到结果页）
3. AI reasoning 时间轴（保留基础版）
4. NEP-366
5. Hosted demo（但保留视频）
6. 2 卧底/6 人配置
7. 自由聊天
8. 移动端适配

**绝不砍**：合约、scripted e2e、浏览器完整一局、结果页链上分账、README、视频、X post、提交。

---

## 10. 风险与应对

| 风险 | 触发信号 | 应对 |
|---|---|---|
| 5 天做不完 | Day 2 结束还没跑通脚本局 | 立即砍 Should；只保留 5 人/1 卧底/3 轮；用 11-10～11-14 官方缓冲 |
| 合约卡住 | 单测/部署反复失败 | 缩小合约：先不做 force_advance/事件；退款兜底 |
| Testnet 建号失败 | faucet 403/超时 | 换 faucet；用 near-cli-rs；提前多建一个备用 master |
| AI 太慢 | 一轮 > 45s | 并行、换快模型、scripted 录制 |
| 钱包 UX 拖累 | session key 签名失败 | 退回后端代签（仅 demo），README 说明；钱包后置 |
| Hosted 部署失败 | Render/Vercel 构建失败 | 本地 demo + 视频；hosted 作为加分不阻塞提交 |
| 评委无法复现 | README 步骤缺 env | 加 scripted 一键脚本；录屏时用干净目录验证 |
| 过度承诺被问 | 评委问“真的 trustless 吗” | README trust model 直接承认中心化点 + 超时退款 |

---

## 11. 每日协作方式

每天结束前用这个模板同步：

```text
日期：
完成：
未完成：
阻塞：
需要 human 决策：
明天第一件事：
```

**分工**
- Human：创意/玩法取舍、GitHub repo 公开、录制视频、发布 X、最终确认 payload/consent、主网账户（已给）。
- Claude：合约、脚本、backend、AI、frontend、测试、文档、部署配置、视频脚本、payload 草稿。
- 涉及 **push / 公开 repo / 发 X / 提交表单** 的动作，Claude 只准备，不执行；必须 human 明确确认。

---

## 12. 现在唯一还缺的输入

- GitHub 账号/仓库名（Day 5 用；本地开发不阻塞）

其余已锁定：项目名 Agent Undercover；leadName Necklace；email necklace1982@gmail.com；payout `x-bit.near`。

**下一步**：D4 —— 浏览器完整一局加固、连续 3 局、README v1、hosted deploy。
