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
- [ ] 合约部署在 NEAR Testnet，地址写进 README
- [ ] 4 个 Agent 持久子账户，`view_access_keys` 显示只有 scoped FunctionCall key，无 full-access key
- [ ] `pnpm demo:scripted` 不需要 AI API key，能在 Testnet 跑完一局 5 人局并结算
- [ ] `DEMO_MODE=live` 用 NEAR AI Cloud 跑完一局，AI 输出可读、可回放
- [ ] 浏览器里 1 真人 + 4 Agent 完整玩一局：质押 → 描述 → commit-reveal 投票 → 放逐 → 结算
- [ ] 结果页展示：胜方、分账、Agent 余额变化、Explorer 链接、AI 私有推理回放
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
- [ ] 目录骨架：`contract/`、`server/`、`web/`、`shared/`、`scripts/`、`docs/`
- [ ] 根 `package.json` + `pnpm-workspace.yaml`
- [ ] `.gitignore`（`.env`、`.keys/`、`runs/`、`target/`、`node_modules/`、`dist/`）
- [ ] LICENSE（MIT）
- [ ] `README.md` 骨架（英文标题、one-liner、run 占位）
- [ ] 安装 `wasm32-unknown-unknown`
- [ ] Testnet master 账户（faucet）+ 合约子账户
- [ ] 4 个 Agent 子账户：scoped FunctionCall key，无 full-access key
- [ ] 最小合约部署，`get_room_count` 可读
- [ ] `RULES.md` / `ARCHITECTURE.md` 初版
- [ ] 验收：`cargo test` 通过；合约地址可查；`view_access_keys(agent)` 只有 FunctionCall key

**如果今天建号/部署卡住**：优先保证 master + 合约账户；Agent 账户顺延到 Day 2 上午。

### Day 2 · 11-06

**目标：合约 v1 + 脚本在 Testnet 跑完一局（M1）**

- [ ] 合约：create/join/start、description、commit/reveal、tally、reveal_role、advance、settle、refund、views
- [ ] 单测：完整 5 人局、平票、错误哈希、重复提交、投自己、超时退款、分账余数
- [ ] `scripts/demo-scripted.ts`：建房间 → 4 Agent join → start → 3 轮 → settle
- [ ] 打印交易 hash、Explorer 链接、最终余额、Agent stats
- [ ] Backend skeleton：Express + Socket.IO + 合约客户端 + Agent signer
- [ ] 验收：一局完整跑通；`Settled`；Agent 余额变化与分账一致；M1 成立

### Day 3 · 11-07

**目标：Backend + AI + 浏览器最小闭环（M2）**

- [ ] Session 账户 API：浏览器公钥 → 建号 + scoped key + 充值
- [ ] Relay API：广播浏览器签名交易
- [ ] 房间管理器：内存状态 + 合约同步
- [ ] NEAR AI Cloud 客户端：OpenAI 兼容、20s 超时、重试 1 次
- [ ] 4 个 persona；卧底 strategy → utterance 两段式
- [ ] 输出校验：长度、不含自己的词、投票合法；失败 fallback
- [ ] `runs/<room>.jsonl` 记录 reasoning
- [ ] Frontend v1：Landing/Lobby/Game/Result + Socket.IO + session key
- [ ] 验收：浏览器能加入并看到状态；`DEMO_MODE=live` 跑完一局；无 key 自动 fallback

### Day 4 · 11-08

**目标：完整一局 + 结果页 + 稳定性；功能冻结（M3）**

- [ ] 结果页：胜方、分账、Agent 余额变化、Explorer、AI reasoning 回放
- [ ] Agent 战绩/收益展示（可合并到结果页）
- [ ] 错误态、重连、超时、空房间、计时器
- [ ] 连续跑 3 局无手动干预；无 console error
- [ ] README v1（run steps、架构、trust model、track mapping）
- [ ] Hosted deploy 尝试（Backend + Web）；失败不阻塞
- [ ] **23:59 UTC 功能冻结**
- [ ] 验收：1 真人 + 4 Agent 完整一局；fresh clone 的 scripted demo 成功

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
- [ ] LICENSE（MIT）
- [ ] README 英文，含：
  - [ ] 产品是什么、解决什么问题
  - [ ] “do X - see Y” 的可复现步骤
  - [ ] `DEMO_MODE=scripted` 无 API key 跑法
  - [ ] 架构图 / 信任模型
  - [ ] Testnet 合约地址 + Agent 账户 Explorer 链接
  - [ ] track mapping（games / agents / swarms）
  - [ ] 测试命令与结果
  - [ ] baseline / 第三方模板声明
- [ ] `.env.example`，无真实 key
- [ ] `git log` 可看出 2026-11-01 之后的工作（Q-001/Q-003）
- [ ] 若用了任何模板/旧代码，README 披露

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

- [ ] `cargo test`：完整 5 人局
- [ ] 平票 → 无人放逐
- [ ] 错误哈希 → 拒绝
- [ ] 重复 commit/reveal → 拒绝
- [ ] 投自己 → 拒绝
- [ ] 未到 deadline 退款 → 拒绝
- [ ] 超时退款 → 每人拿回 stake
- [ ] 1 卧底被放逐 → Crew 胜；卧底存活到 3 轮 → Impostor 胜
- [ ] 分账总额 == pot；余数处理正确
- [ ] Agent stats 只对 is_agent 更新

### 8.2 端到端

- [ ] `pnpm demo:scripted`：无 AI key，Testnet 完整一局
- [ ] `DEMO_MODE=live`：真实 AI 完整一局
- [ ] 浏览器：1 真人 + 4 Agent 完整一局
- [ ] 断网/无 key → fallback 到 scripted
- [ ] 刷新页面 → 重连并恢复状态
- [ ] 新 clone → 按 README 跑通 scripted

### 8.3 评委可复现性

- [ ] README 的每条命令在干净目录执行过
- [ ] `.env.example` 每个变量有说明
- [ ] 不需要主网、不需要付费服务即可看 scripted demo
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

**下一步**：D1 —— repo 骨架 + Testnet 建号 + 合约 skeleton。立即开始。
