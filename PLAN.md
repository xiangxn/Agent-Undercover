# Agent Undercover · 5 天实施计划（2026-11-05 → 2026-11-09）

> 依据：[prd.md](prd.md)
> 目标：**2026-11-09 20:00 UTC 前**完成可提交版本并提交（算上今天共 5 天）
> 官方截止：**2026-11-14 23:59 UTC**（11-10～11-14 作为缓冲/打磨，不改变 5 天目标）
> 团队：1 人（创意/评估/协调）+ Claude Code（实现/测试/文档）
> 内部功能冻结：**2026-11-08 23:59 UTC**
> 提交目标：**2026-11-09 20:00 UTC**（官方 API 开放到 11-14）

---

## 1. 成功标准（Definition of Done）

- [x] 公开 GitHub repo，含 MIT LICENSE，README 可让陌生人从零跑起来（2026-11-06 匿名 API 200）
- [x] 合约部署在 NEAR Testnet，地址写进 README（`game.agent-undercover.testnet` 已部署并初始化）
- [x] 4 个 Agent 持久子账户，`view_access_keys` 显示只有 scoped FunctionCall key，无 full-access key（2026-11-05 raw RPC 复核：每个账户恰好两个 FunctionCall key）
- [x] `pnpm demo:scripted` 不需要 AI API key，能在 Testnet 跑完一局 5 人局并结算（2026-11-05 复跑 exit 0：Crew 胜，4 winners，5 条描述 / 5 个 reveal）
- [x] `DEMO_MODE=live` 用 NEAR AI Cloud 跑完一局，AI 输出可读、可回放（2026-11-06：GLM 5.3 Flash，连续 5 局浏览器对局；修复推理模型空 content、suspect 带账户后缀、整词校验误判后，最后一局 7/7 AI 决策、0 重试、0 fallback、0 console error；AI 会引用他人描述并指出真人含糊发言）
- [x] 浏览器里 1 真人 + 4 Agent 完整玩一局：质押 → 描述 → commit-reveal 投票 → 放逐 → 结算（2026-11-05 run 20 完整走通）
- [x] 结果页展示：胜方、分账、Agent 余额变化、Explorer 链接、AI 私有推理回放（2026-11-05 run 20：7 张推理卡，0 console error）
- [x] 60–90 秒 demo 视频已发布到 X，满足 HACKATHON.md 的 tag 要求（2026-11-06；82.814s；https://x.com/necklace_btc/status/2118430392734888088）
- [x] 提交 payload 已打印并由 human 确认；2026-11-06 已提交，nearhackathon.com 已可见（未记录 HTTP 201）
- [ ] Hosted demo（加分项）保持可访问到 2026-11-18（截至 2026-11-06 可访问；保留期持续跟进）

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
| S4 | Demo 视频 | 60–90s，含一个完整链上结算瞬间 | human 只录一局原始素材并发布；Claude 自动剪辑/字幕/旁白 |
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
- [x] `DEMO_MODE=live` + `NEAR_AI_API_KEY` 跑完一局；并加固解析（2026-11-06：GLM 5.3 Flash + `reasoning_effort=low`；3 次重试 + INVALID/FALLBACK 落日志；suspect 接受 `名字 (账户)`；密钥词改为整词匹配，避免 `communicates` 误判 `cat`）

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
- [x] README v1（run steps、架构、trust model、track mapping；2026-11-05 已改为当前真实流程；2026-11-06 加入 `docs/screenshots/` 实机截图并嵌入 README）
- [x] Hosted deploy（Backend + Web）（2026-11-05 Render 新账号要求绑卡，改用 Railway：`https://agent-undercover-production.up.railway.app`；`SESSION_FUNDING_NEAR=0.25` 覆盖 0.1 质押 + ~0.1 房间存储，低于 0.22 拒绝启动；重新部署后浏览器 smoke 完整两局：Crew 胜、分账正确、7 张推理卡、0 console error）
- [x] Hosted treasury 充值路径：helper 网页已 404 但 `POST /account` 仍可开户，`scripts/topup-treasury.mjs` 用临时账户 + `deleteAccount` 扫入 treasury；两次充值后曾达约 21.8 NEAR（≈87 局），对局消耗后余额下降，开新局前看 server 预检
- [x] 部署预算保护：treasury/master 余额下限、`MAX_SESSIONS` 上限；server typecheck 通过
- [x] Master 余额自动补充（2026-11-06）：`start_game`/`advance` 的合约存储由 master 支付（约 0.1 NEAR/局），余额低于 0.5 时从 treasury 自动转入 2 NEAR；补款路径已实测，本地对局恢复
- [x] Demo UI 游戏化（2026-11-06）：座位发言气泡 + 打字机、身份卡发牌翻牌、实时票数条、回合裁决卡（EXILED 印章 + 角色翻牌）、结果页 IMPOSTOR CAUGHT/ESCAPED 印章；只向客户端暴露已放逐者角色；本地 3 局验证 + 最终 browser smoke（2 轮、Crew 胜、7 张推理卡、0 console error）
- [x] 回合观感补充（2026-11-06）：每回合开场 `ROUND n` 横幅、最后 10 秒计时器脉冲；截图验证 + 完整一局 smoke（0 console error）
- [x] 结果页 Agent records 负数显示修复（2026-11-06）：终身净收益为负时显示红色 `-1.5583 N earned`，不再出现 `+-`；截图验证
- [ ] **23:59 UTC 功能冻结**
- [x] 验收：1 真人 + 4 Agent 完整一局（2026-11-05 浏览器 smoke：Crew 胜，分账正确，无 console error）；连续 3 局已过；当前工作树 scripted demo 复跑 exit 0；2026-11-05 fresh clone 全流程验证通过

### Day 5 · 11-09

**目标：提交材料 + 发布 + 提交（M4）**

- [ ] Hosted demo smoke test（无痕窗口/手机）（2026-11-06 /api/health ok；完整一局未记录）
- [x] README 最终版：Testnet 地址、Explorer、视频、hosted demo、track mapping（2026-11-06 视频已放入 docs/，README 已补链接；待 push）
- [x] 录一局原始素材（human）；Claude 自动剪辑/字幕/旁白，human 审片后发布（2026-11-06，成片 82.8s）
- [x] 发布 X post（human，草稿见第 6 节；2026-11-06：https://x.com/necklace_btc/status/2118430392734888088）
- [x] repo 设为 public（human；2026-11-06 匿名 API 200）
- [x] 生成 requestId，打印完整 payload（**不发送**；requestId 只存本地 `.submission-request-id`，不公开）
- [x] human 确认 payload + consent（2026-11-06）
- [x] 提交（2026-11-06；nearhackathon.com 已可见；通过网页表单，未记录 HTTP 201）
- [ ] 验收：201；保存响应；hosted demo 保留到 11-18（提交已可见；201/响应未保存；保留期至 11-18）

**Slip 规则**：任何一天落后，优先砍第 9 节的功能，不移动 11-09 提交目标；11-10～11-14 是官方缓冲，只修 bug/补材料。

---

## 4. 提交 checklist

### 4.1 Repo / 代码

- [x] 公开 GitHub repo，URL 可匿名访问（`https://github.com/xiangxn/Agent-Undercover`，2026-11-06 匿名 API 200；本地新提交待 push）
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

- [x] 视频 ≤ 90s，展示一个完整链上结算瞬间（82.8s）
- [x] 视频里能看清 Agent 子账户余额变化 / Explorer（分账表 + 账户链接清晰）
- [x] X post 公开，含（2026-11-06 已核验：82.814s 视频附件）：
  - [x] “built at NEAR HACKATHON”
  - [x] `@NEARProtocol`
  - [x] `#NEARHackathon`
  - [ ] （可选）`@NearLegion` `@NearBuilders`
  - [x] 视频或截图附件
  - [x] demo + repo 链接
- [x] Hosted demo 可访问（加分；2026-11-06 /api/health ok），保留到 2026-11-18 持续跟进

### 4.3 表单

- [x] projectName: `Agent Undercover`
- [x] leadName: `Necklace`
- [x] email: `necklace1982@gmail.com`
- [x] size: `1`
- [x] tracks: `["games","agents","swarms"]`
- [x] nearAddress: `x-bit.near`
- [x] projectUrl: `https://github.com/xiangxn/Agent-Undercover`（公开仓库，匿名访问返回 200）
- [x] demoUrl: https://x.com/necklace_btc/status/2118430392734888088
- [x] idea: PRD 12.5 的文案（20–2000 字符；脚本已校验）
- [x] consent: human 逐字确认 HACKATHON.md 的联系声明（2026-11-06）
- [x] requestId: 只生成一次，重试复用（只存本地 `.submission-request-id`，不公开）
- [x] 打印完整 JSON，human 确认后才 POST（2026-11-06）
- [x] 不重复提交；改错走 request-changes（单次提交）

---

## 5. Demo 视频录制脚本（60–90 秒）

> 原则：第一行讲用户问题；只展示一个完整瞬间；NEAR 的角色要具体；结尾给下一步。
>
> 分工：human 只负责录一局原始素材并发 X；Claude 用 ffmpeg + edge-tts 自动完成剪辑、英文字幕、AI 英文旁白（见 §5.9）。视频用**本地 live AI** 录制；hosted demo 保持 scripted 供评委稳定复现，但成片里不能出现 `(scripted)` 标签。

### 5.1 成片规格

- 1920×1080，30 fps，H.264 MP4，60–90 秒，尽量 < 50 MB。
- 英文字幕烧进画面（X 默认静音自动播放，静音也要能看懂）。
- 不出现：私钥、`.env`、终端里的密钥、钱包插件、浏览器个人资料/邮箱、主网账户。只出现 Testnet。
- 最佳剧情是**human 当卧底**：AI 在推理回放里点破你的含糊描述，这是全片最强 10 秒。若随机到好人，也照常录，用 AI 互指的推理卡代替；绝不伪造结果。

### 5.2 录前检查（开录前 10 分钟）

```bash
cd /Users/necklace/work/near/hk

# 重启 server，清掉遗留的内存局和计时器
DEMO_MODE=live pnpm --filter @agent-undercover/server start

# 另开终端确认
curl -s http://localhost:8787/api/health
# 期望：{"ok":true,"games":0}
```

- [ ] 落地页显示 **NEAR AI Cloud · live**，不是 “scripted fallback”；否则 key 或 `DEMO_MODE` 没生效，先修再录。
- [ ] treasury > `TREASURY_FLOOR_NEAR`（0.5），master > 0.5。master 现在会自动从 treasury 补，但 treasury 干了就开不了新局；不足时按 `docs/deploy.md` 充值。
- [ ] 用**新的无痕窗口**打开 `http://localhost:8787`；普通窗口可能从 `sessionStorage` 恢复旧局，必须从落地页开始。
- [ ] Chrome 窗口 1920×1080、页面缩放 125%、隐藏书签栏、只留一个标签页；关掉 Slack、邮箱、含密钥的终端、任何显示姓名/邮箱的窗口。
- [ ] 不开录制彩排一遍，确认流程和 AI 台词落点。每局成本约 0.25 NEAR（treasury）+ 几美分 AI 额度。

### 5.3 录制设置

- macOS QuickTime：**File → New Screen Recording**，框选浏览器区域；能选 30 fps 就选 30 fps。OBS 也可，画布 1920×1080。
- 录浏览器**窗口**，不要录整个桌面，避免 Dock/菜单栏入镜。
- 一局连续录到底，不要在回合之间停；后期再剪。
- 游戏本身无声音，录的时候不用管音频；旁白后期由 edge-tts 生成。
- 原始素材存 `recordings/take-01.mov` 等（本地目录，已加入 `.gitignore`，不提交仓库）。

### 5.4 逐镜头操作表

真实一局约 2 分钟，成片保留 ~75 秒；下表时间是**成片时间**，不是录制时间。

| 成片时间 | 画面 | 操作 |
|---|---|---|
| 0:00–0:06 | 落地页主标题 “Five players. One is lying.” | 无痕窗口打开落地页，标题停 2 秒。 |
| 0:06–0:14 | 创建 session → 大厅 → 4 个 agent 加入 → 奖池 0.50 NEAR | 点 **Stake 0.1 NEAR · Play now**。让 “Creating a disposable Testnet wallet” 露一下，剪辑把 ~10 秒压到 ~2 秒。 |
| 0:14–0:22 | 词卡翻开：CREW / IMPOSTOR + 秘密词 | 等翻牌动画结束，角色停 2 秒。若是卧底，旁白不要念出秘密词。 |
| 0:22–0:36 | 第一轮：你的一句话 → 4 个 agent 气泡依次出现 | 输入并提交；等 4 条都出现，悬停或后期放大其中一条 AI 台词。 |
| 0:36–0:46 | 投票 commit → reveal → 票数条 | 选一个怀疑对象，点 **Commit vote**；等所有人 reveal、票数条走完再切。 |
| 0:46–0:52 | 裁决浮层：被放逐者 + 身份翻牌 | 在 “Beta is exiled / CREW / Wrong seat” 停 2 秒。 |
| 0:52–1:02 | 第二轮或直接结算；结果标题 “IMPOSTOR CAUGHT / ESCAPED” | 若继续，第二轮只留一小段描述，结果一出现就切。 |
| 1:02–1:14 | Private reasoning replay | 滚到 **Private reasoning replay**，停 2 张卡，优先选点破你“含糊描述”的那张；这是“AI 真在推理”的证据。 |
| 1:14–1:20 | Payout + 结尾卡 | 露出分账行和一个 Explorer 链接，切静态结尾卡：repo、hosted demo、“Built at NEAR HACKATHON”。 |

操作注意：

- human 是卧底时，用故意含糊的一句，例如 “It shows up in ordinary life in a way everyone has seen.”；AI 推理卡会点破它，这就是成片的高光。
- human 是好人时，给一句具体但不直白的线索，让 AI 互相盘；推理回放仍然撑得住故事。
- 画面有字时鼠标不要动；只在点击时移动。
- 链上 feed 出现 “thinking (scripted)” 或罐头台词，说明该回合 fallback 了：剪掉或重录，不要当成 live 交付。
- 录制中不要开钱包插件、区块浏览器新标签或终端；需要 Explorer 画面就后期贴静态截图。

### 5.5 英文旁白 / 字幕（约 80 秒）

旁白由 edge-tts（微软 neural 英语语音，免费）按上表分段生成；画面只烧入下面的短字幕（不在画面里重复整段旁白），时间轴由剪辑脚本精确控制，不做语音识别，避免错字。

| 时间 | 旁白 |
|---|---|
| 0:00 | “These four AI agents have their own NEAR wallets — and one of them is about to lie to my face.” |
| 0:08 | “This is Undercover: five players, one impostor. Every stake is locked in a NEAR escrow contract.” |
| 0:15 | “Each agent owns a subaccount, stakes its own Testnet NEAR, and runs on NEAR AI Cloud.” |
| 0:24 | “Everyone describes a secret word in one sentence. The impostor gets a similar word and has to blend in.” |
| 0:37 | “Votes are commit-revealed, so nobody can copy a vote before committing.” |
| 0:47 | “Wrong seat. The impostor is still in the room.” |
| 0:55 | “The contract settles the pot automatically — the winning side takes it, agents included.” |
| 1:03 | “After the game, every agent’s private reasoning is replayable. This is how it decided to lie.” |
| 1:15 | “Agent Undercover. Built at NEAR HACKATHON. Repo and live demo in the post.” |

烧入字幕（每段一句）：

1. `5 players · 1 impostor · 0.5 NEAR pot`
2. `Each agent stakes its own NEAR`
3. `One sentence each — the impostor must blend in`
4. `Commit-reveal votes, tallied on-chain`
5. `Every agent's private reasoning, replayed`
6. `Built at NEAR HACKATHON`

### 5.6 剪辑清单（Claude 用 ffmpeg 自动执行）

1. 创建 session 的 ~10 秒压到 1–2 秒，但保留 “Creating a disposable Testnet wallet” 让人看清。
2. 阶段间的空等剪掉或 1.5–2× 加速；不要剪断句子或票数条动画。
3. 最多保留 3 条完整 AI 台词，其余半露即可；观众只需要一个“AI 在读空气”的瞬间。
4. 词卡、票数条、点破你的推理卡各加 105–110% 轻微放大。
5. 加字幕和旁白；加 BGM 时音量压在旁白之下。
6. 结尾卡：`github.com/xiangxn/Agent-Undercover` + hosted demo URL + `Built at NEAR HACKATHON`，停 4 秒。
7. 导出 1920×1080 H.264、30 fps；静音看一遍、有声看一遍，两个版本都要成立。

### 5.7 重录与预算

- 每条 take 新建一个 Testnet session：treasury 出 ~0.25 NEAR，master 付合约存储，AI 额度几美分。
- 预算 3 条 take。每条前看落地页 live 标签和 server 日志；局没打完就重启 server 再录。
- 该重录就重录：词卡错过、票数条没走完、出现 scripted fallback、通知挡住桌面。
- 录视频不要跑 `pnpm demo:scripted`；scripted 只用于评委复现，不是成片。

### 5.8 发布与交接

1. human 上传视频到 X，按 §6 草稿发布；必须含 built at NEAR HACKATHON、@NEARProtocol、#NEARHackathon，并附视频。
2. 用无痕窗口确认视频能播、repo 和 hosted 链接匿名可开。
3. 把 post URL 发回来，作为提交表单的 `demoUrl`；repo 仍是 `https://github.com/xiangxn/Agent-Undercover`。
4. 打印完整 payload、human 逐字确认 consent 之前，不提交黑客松表单。

### 5.9 自动化后期流水线（Claude 执行）

human 唯一要交的输入：`recordings/take-01.mov`（整局、不剪、不配音；`recordings/` 已 gitignore）。Claude 用 `scripts/video/build-demo-video.mjs` 出片：

1. 抽帧看片，把每个阶段的源时间写进 `recordings/edit.json`（镜头表、字幕、旁白）。
2. edge-tts 用 neural 英语语音生成旁白；脚本探测每段时长并检查是否重叠/超出。
3. 脚本一次完成：裁剪、变速、轻微放大、旁白混音、Pillow 渲染的字幕/结尾卡 PNG 叠加、1080p/30fps/H.264 导出。
4. human 静音看一遍、有声看一遍；要改只改 `edit.json` 重跑，源素材不动。

用法见 `scripts/video/README.md`。

**硬规则**：只用 Testnet；不签主网交易；不把 `.env`/私钥/原始录屏提交进仓库；不把 scripted take 说成 live AI；X 发布和表单提交都由 human 执行。

---

## 6. X post 草稿

> I voted wrong twice. These 4 AI agents still caught the liar — and the escrow paid me anyway.
>
> **Agent Undercover**: 5 players, 1 impostor. Four AI agents stake their own Testnet NEAR, lie to your face, and keep what they win. Commit-reveal votes and payouts are enforced by a NEAR escrow contract; each agent has a scoped key, so even I can't withdraw its winnings.
>
> In this game I was Crew. I missed Gamma's tell — it called the secret cat “loyal” — and voted for Alpha. Alpha and Beta voted Gamma and caught the impostor.
>
> Repo: https://github.com/xiangxn/Agent-Undercover
> Live demo: https://agent-undercover-production.up.railway.app
>
> Built at NEAR HACKATHON · @NEARProtocol · #NEARHackathon

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
> `node scripts/prepare-submission.mjs --project-url https://github.com/xiangxn/Agent-Undercover --demo-url <X post> --consent`
>
> requestId 不写进公开文档、截图或 X post；需要重试时从 `.submission-request-id` 读取。

```json
{
  "requestId": "<from .submission-request-id>",
  "projectName": "Agent Undercover",
  "leadName": "Necklace",
  "email": "necklace1982@gmail.com",
  "size": "1",
  "tracks": ["games", "agents", "swarms"],
  "nearAddress": "x-bit.near",
  "projectUrl": "https://github.com/xiangxn/Agent-Undercover",
  "demoUrl": "https://x.com/necklace_btc/status/2118430392734888088",
  "idea": "<PRD 12.5 文案>",
  "consent": true
}
```

**发送前**
- [x] `projectUrl` 匿名可访问（2026-11-06 已验证）
- [x] `demoUrl` 公开可访问（2026-11-06 fxtwitter 200）
- [x] `nearAddress` 是主网命名账户（`x-bit.near`）
- [x] `size` 精确为 `1`
- [x] `tracks` 每个 id 合法、不重复
- [x] `idea` 20–2000 字符
- [x] human 已逐字确认 consent 声明
- [x] 同一 requestId 只用于重试

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
- [x] `DEMO_MODE=live`：真实 AI 完整一局（2026-11-06 浏览器连续 5 局，末局 7/7 AI 决策、0 重试）
- [x] 浏览器：1 真人 + 4 Agent 完整一局（2026-11-05）
- [x] 无 key → fallback 到 scripted（2026-11-05 `DEMO_MODE=live` 验证）
- [x] AI 请求失败 → fallback 到 scripted（2026-11-05 用不可达 endpoint 验证）；真实 AI 成功路径 2026-11-06 已验证
- [x] 刷新页面 → 重连并恢复状态（2026-11-05）
- [x] 新 clone → 按 README 跑通 scripted（2026-11-05 `/tmp/au-fresh`：install、web build、server typecheck、9 个合约测试、scripted 局 all exit 0）

### 8.3 评委可复现性

- [x] README 的每条命令在干净目录执行过（2026-11-05：install / build / typecheck / test / demo / dev:server 健康检查）
- [x] `.env.example` 每个变量有说明（2026-11-05 补 `TREASURY_FLOOR_NEAR` / `MAX_SESSIONS`）
- [x] 不需要主网、不需要付费服务即可看 scripted demo（Testnet faucet 免费；`DEMO_MODE=scripted` 无 AI key）
- [x] 合约地址和交易 hash 可在 Explorer 打开（docs/testnet.md 已列 nearblocks 地址与交易链接）
- [x] 视频链接、hosted demo 链接、repo 链接都可匿名访问（2026-11-06：repo 200、hosted health ok、X 视频已核验）

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
- Human：创意/玩法取舍、GitHub repo 公开、录一局游戏素材、审片、发布 X、最终确认 payload/consent、主网账户（已给）。
- Claude：合约、脚本、backend、AI、frontend、测试、文档、部署配置、视频自动剪辑/字幕/旁白（ffmpeg + edge-tts）、payload 草稿。
- 涉及 **push / 公开 repo / 发 X / 提交表单** 的动作，Claude 只准备，不执行；必须 human 明确确认。

---

## 12. 当前状态

- 提交已完成：2026-11-06 在 nearhackathon.com 已可见；X post 已发布并核验（82.814s 视频、tag、repo + hosted demo 链接）
- 剩余维护：commit/push README 和视频；hosted demo 保持在线到 2026-11-18；不重复提交

**下一步**：commit/push 视频和 README；评审期保持 Railway demo 与 X 帖可访问。
