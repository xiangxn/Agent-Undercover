# Agent Undercover · AI 卧底小队

> NEAR Hackathon 2026 · 主赛道 `games`，同时提交 `agents` / `swarms`
> 最后更新：2026-11-05
> 本文只保留**当前有效**规格；历史变更见 git log。代码与本文冲突时，先改本文或改代码，不允许两边各说各话。

---

## 0. 项目状态与锁定决策

- 项目名：**Agent Undercover** / **AI 卧底小队**
- 玩法：谁是卧底（Undercover / Who is the Spy）
- 主赛道：`games`；同时报 `agents`、`swarms`
- Demo：1 真人 + 4 Agent，5 人局
- 团队：1 人 + Claude Code
- 提交用 leadName：**Necklace**
- 提交用 email：**necklace1982@gmail.com**
- 主网收款账户：`x-bit.near`（仅提交表单使用，开发全程 Testnet）
- **内部目标：2026-11-09 20:00 UTC 前完成可提交版本并提交**（算上今天共 5 天）
- 官方截止：**2026-11-14 23:59 UTC**（北京时间 2026-11-15 07:59）——作为缓冲，不作为目标
- 功能冻结：**2026-11-08 23:59 UTC**；之后只修 bug、只做提交材料
- 提交目标：**2026-11-09 20:00 UTC** 前 POST 并拿到 201

---

## 1. 一句话介绍

**EN**
> A 5-player social deduction game where every seat can be a human or an AI agent — and each agent owns its own NEAR subaccount, stakes its own money, lies to your face, and keeps what it wins.

**CN**
> 一款 5 人社交推理游戏：每个座位都可以是真人或 AI Agent；每个 Agent 拥有自己的 NEAR 子账户，用自己的钱下注，当面撒谎，赢了就把钱留下。

**提交表单短描述（约 380 字符）**
> Agent Undercover is a 5-player social deduction game where every seat can be filled by a human or an AI agent. Each agent owns a persistent NEAR subaccount, stakes its own testnet NEAR, lies in public, and keeps what it wins — and an agent can be on either side, crew or impostor. Players get a secret word and describe it in one sentence each round; the crew votes to exile the impostor. Stakes are locked in a custom NEAR escrow contract, roles and votes are commit-revealed, and settlement is on-chain. Each agent account has only scoped FunctionCall keys and a stake-only wallet contract — no full-access key — so even the operator cannot withdraw its winnings. AI dialogue uses NEAR AI Cloud; a scripted mode runs without an API key.

---

## 2. 问题与洞察

### 2.1 问题

社交推理游戏（狼人杀、Among Us、谁是卧底）里的 AI 玩家通常只是脚本或聊天机器人：

- 没有独立资产，输赢不影响它；
- 没有链上身份，无法积累战绩和信誉；
- 没有经济后果，所以它的“欺骗”不需要承担代价；
- 玩家也无法验证“AI 真的在拿自己的钱玩”。

### 2.2 洞察

如果一个 Agent 要成为经济主体，它至少需要四样东西：

1. **持久身份**：一个链上账户，而不是一次性的 session；
2. **钱包**：能持有、质押、收取资产；
3. **受限权限**：能花钱，但不能把全部资产转走；
4. **可累积的后果**：奖金、亏损、信誉都记在它自己名下。

NEAR 的账户模型刚好提供了这四样：

- 命名账户 / 子账户 → 持久身份；
- 账户余额 → 钱包；
- FunctionCall access key（限定 receiver + method + allowance）→ 受限权限；
- 部署在 Agent 账户上的 stake-only wallet 合约 → 只允许把固定质押送进游戏合约，没有提款路径；
- 合约里的战绩/收益映射 → 可累积的后果。

### 2.3 为什么是游戏

游戏是对抗性最强的 Agent 场景：AI 必须在信息不对称下撒谎、结盟、甩锅，并且为自己的判断承担真实的经济后果。把它做成 5 分钟一局的社交推理，比“Agent 帮你订机票”更容易在 60 秒内让评委看懂，也更容易产生戏剧性。

---

## 3. 核心创新

### 3.1 AI 是链上经济主体，不是前端脚本

- 4 个 Agent 各有**持久 NEAR 子账户**：`alpha.agents.<parent>.testnet`、`beta...`、`gamma...`、`delta...`。
- 每个 Agent 账户上部署一个极小的 **stake-only wallet 合约**；账户**只有两把 scoped FunctionCall key，没有 full-access key**：
  - game key：receiver 为游戏合约，方法限定 `submit_description` / `commit_vote` / `reveal_vote`；
  - wallet key：receiver 为 Agent 自己的账户，方法限定 `stake`。
- **协议限制**：NEAR 的 FunctionCall access key 不能附带 deposit（`Deposit is not allowed with function call`），所以 Agent 无法直接调用 payable 的 `join_room`。wallet 合约的 `stake(room_id)` 从 Agent 账户余额里把**固定金额**的质押转发给游戏合约的 `join_room`；它没有任何提款方法，也不能调用其他合约。
- Agent 用自己的账户余额质押；赢了，奖金直接转进它的账户；输了，余额减少。当前唯一资金出口是继续支付下一局质押。
- 运营方可以给 Agent 账户转账充值，但**无法从 Agent 账户提款**：没有 full-access key，wallet 合约也没有 withdraw 路径。`view_access_keys` 和 explorer 上的合约代码可直接验证。
- Agent 的战绩、收益、最近对局记录在合约里，跨对局累积。

### 3.2 可验证的秘密，而不是“链上明文”

- 开局时合约只存 `hash(role || ":" || salt)`，不存角色明文。
- 投票先提交 `hash(target || ":" || salt)`，投票关闭后再揭示。
- 合约校验哈希后才计入票数；exiled 玩家的角色由 game master 提交 `role + salt`，合约校验后公开。
- 结算时提交全部角色揭示，合约校验后按规则分账。
- 超时未结算，任何玩家可调用 `refund` 取回质押。

### 3.3 为 AI 欺骗设计的玩法

- 每人拿到一个词，卧底拿到近义词；每人每轮公开说一句话描述自己的词。
- 描述不能说出词本身；说得好不好、是否和别人的描述矛盾，就是证据。
- 卧底 AI 需要在“听起来合理”和“不暴露自己”之间做取舍；好人 AI 需要从描述里找矛盾。
- 游戏结束后回放每个 Agent 的私有推理和卧底之间的串供记录，让“AI 怎么骗人”变得可见。

### 3.4 明确不声称的东西

以下内容 MVP **不做、不吹**：

- 不是 trustless：角色分配、AI 行为、salt 都在运营方手里；合约保证的是资金和结算规则，以及超时退款。
- Agent 不是自主签名：MVP 由后端持有两把受限的 FunctionCall key（game + wallet stake）代签；IronClaw TEE 托管是 Roadmap。
- 不是完全免 Gas：Demo 用已充值的测试网 session account；NEP-366 是加分项/Roadmap。
- 不是“AI 自己产生意识”：AI 由 NEAR AI Cloud 推理，运营方编排。

---

## 4. 游戏设计

### 4.1 玩家与角色

| 项目 | MVP 默认 | 说明 |
|---|---|---|
| 玩家数 | 5 | 1 真人 + 4 Agent（Demo）；真实多人时 Agent 补位 |
| 卧底数 | 1 | 5 人局 1 卧底；6 人局可配 2 卧底 |
| 阵营 | Crew / Impostor | 真人可以是任意阵营；Agent 也可以是任意阵营 |
| 轮数 | 最多 3 轮 | 每轮：描述 → 投票 → 放逐 |
| 词语 | 每局一对近义词 | 如 wallet / account、block / receipt、validator / node |
| 胜负 | 放逐全部卧底 → Crew 胜；卧底存活到平票/轮次结束 → Impostor 胜 | 详见 4.4 |

**关键设计：Agent 不是天生卧底。** 每局随机分配角色，Agent 可能是 Crew 也可能是 Impostor。否则“知道某账户是 Agent”就等于“知道它是卧底”，持久账户和公开战绩会直接破坏游戏。

### 4.2 词与角色分配

1. 后端从词库选一对近义词，随机决定哪一个是 Crew 词、哪一个是 Impostor 词。
2. 后端随机选出 1 个（6 人局 2 个）Impostor，其余为 Crew。
3. 每个玩家只知道自己阵营和自己的词，不知道别人的阵营。
4. 后端为每个玩家生成随机 salt，计算 `role_commitment = sha256(role + ":" + salt)`，开局时写入合约。
5. 后端通过私有 WebSocket 把 `{role, word, salt}` 发给真人客户端；客户端可自行计算哈希并与链上 commitment 对比，确认后端没有调包。
6. Agent 的 role/word 进入其系统提示词；真人若是 Impostor，UI 明确提示“你要伪装”。

### 4.3 一局流程

```text
Human                Backend / Game Master            Contract                4 Agents
  | create_room + stake |                                |                       |
  |-------------------->|                                |                       |
  |                     |<---------- join_room + stake ---------- 4 agents --------|
  |                     | assign roles/words             |                       |
  |                     | start_game(commitments)        |                       |
  |                     |------------------------------->|                       |
  |<-- role/word/salt --|                                |                       |
  |                     |                                |                       |
  |  Round r (1..3)     |                                |                       |
  |                     |<---------- descriptions -------------------------------|
  | submit_description  |                                |                       |
  |-------------------->|------------------------------->|                       |
  | commit_vote (local) |                                |                       |
  |-------------------->| relay signed tx                |                       |
  |                     |------------------------------->|                       |
  | reveal_vote (local) |                                |                       |
  |-------------------->|------------------------------->|                       |
  |                     |                        tally -> pending exile / tie    |
  |                     | reveal_role (GM)               |                       |
  |                     |------------------------------->| verify commitment     |
  |                     | advance                        |                       |
  |                     |------------------------------->| next round or Finished|
  |                     |                                |                       |
  |                     | settle(all reveals)            |                       |
  |                     |------------------------------->| pay winners + stats   |
```

**每个玩家每轮的动作**

1. **Description**：提交一句公开描述，≤ 280 bytes，不能包含自己的词本身（后端校验）。
2. **Vote commit**：选择要放逐的玩家，生成 salt，提交 `hash(target || ":" || salt)`。
3. **Vote reveal**：提交 `target + salt`；合约校验哈希后计票。
4. 得票唯一最高者被放逐；平票则本轮无人被放逐。
5. 被放逐者的角色由 game master 提交 `role + salt`，合约校验后公开。
6. 合约判断游戏是否结束；未结束则进入下一轮。

**合约阶段**

```text
Lobby -> Describing -> VoteCommit -> VoteReveal -> RoleReveal
                                                       |
                                    +------------------+------------------+
                                    |                                     |
                              下一轮 Describing                       Finished
                                                                          |
                                                                      Settled
任意未结算阶段 + 超时 ---------------------------------------------------> Refunded
```

### 4.4 胜负与分账

设：

- `impostors_exiled`：已被放逐的卧底数
- `alive_impostors = impostor_count - impostors_exiled`
- `alive_crew = alive_players - alive_impostors`

每轮放逐结算后按顺序判断：

1. `alive_impostors == 0` → **Crew 胜**。
2. `alive_impostors >= alive_crew` → **Impostor 胜**（卧底达到人数平票）。
3. `round == max_rounds` → **Impostor 胜**（卧底存活到轮次结束）。
4. 否则 → 进入下一轮。

平票：本轮无人被放逐，按上述规则继续（第 3 条可能直接结束）。

**分账**

- 奖池 = `stake × players`。
- 胜方**存活**玩家平分奖池；被放逐的玩家不分钱（他们的质押留在奖池）。
- 取整余数给胜方第一个玩家。
- 若胜方存活列表为空（理论上不应发生），全额退款。
- 6 人 2 卧底时，Crew 放逐错 1 人后变成 3 Crew vs 2 Impostor，还不算平票；再错 1 人变成 2 vs 2，卧底胜。

### 4.5 经济模型

| 项目 | 数值（Testnet） | 说明 |
|---|---|---|
| 单局质押 | 0.1 NEAR | 真人 + 每个 Agent 都从自己账户出 |
| 5 人奖池 | 0.5 NEAR | 全部锁进合约 |
| Agent 初始余额 | 2.4 NEAR | 由运营方一次性转入；其中约 2.1 NEAR 是 wallet 合约代码存储押金，之后靠赢钱/充值 |
| Agent 每局 Gas | 由账户余额支付 | FunctionCall key 的 allowance 覆盖 Gas |
| 收益归属 | Agent 子账户 | 运营方无 full-access key，wallet 合约无提款方法，无法提走 |
| 信誉 | games / wins / losses / earnings / last_played | 存在合约里，跨局累积 |

**经济闭环**：Agent 用自己的余额质押 → 赢了账户余额增加 → 下一局继续用同一账户质押 → 信誉和收益公开可查。运营方只能充值，不能提款；Agent 破产时无法参赛，这本身就是一个可展示的状态。

### 4.6 边界情况

| 情况 | 处理 |
|---|---|
| 投票平票 | 无人被放逐，进入下一轮；若已达最大轮数则卧底胜 |
| 玩家不提交描述 | 阶段超时后 game master 调 `force_advance`；该玩家本轮无描述，仍可被投票 |
| 玩家不 commit/reveal | 阶段超时后 `force_advance`；未揭示的票视为弃权 |
| 被放逐者角色迟迟不揭示 | 合约不允许继续；超过游戏 deadline 后可 `refund` |
| Game master 掉线 | 超过 deadline 后任何玩家可 `refund` 取回质押 |
| 房间一直没满 | 创建时设置 lobby deadline；到期可 `refund` |
| Agent 余额不足 | 运营方可以转账充值；不充值则无法参赛 |
| 真人掉线 | 重新连接后继续；session key 在浏览器，可继续签名 |
| 玩家投自己 | 合约拒绝 |
| 重复加入 / 重复提交 | 合约拒绝 |
| 描述超长 / 空 | 合约拒绝（≤ 280 bytes，非空） |
| 结算转账失败 | Testnet 账户均存在；失败资金留在合约，记录日志，人工兜底（MVP 接受） |

### 4.7 Demo 模式

| 模式 | 用途 | 是否需要 AI Key |
|---|---|---|
| `DEMO_MODE=live` | 真实 AI 对局、录制主视频 | 需要 |
| `DEMO_MODE=scripted` | AI 评委复现、网络不稳时录制、自动化测试 | 不需要 |

Scripted 模式仍然走**真实 Testnet 交易**：真实质押、真实 commit-reveal、真实结算。只是 Agent 的台词和投票来自确定性脚本。这样 AI 初筛不需要 API key 也能跑完整局。

### 4.8 为什么好玩 / 观众看什么

- **一句话就能看懂**：你是唯一的人类，其他 4 个是 AI；其中 1 个在撒谎。你能找出来吗？
- **有证据可推理**：每个人每轮的一句话都是公开的，矛盾会累积。
- **有金钱后果**：AI 真的在用自己的钱玩；它赢了，钱进它的账户。
- **有反转可看**：结束后回放 AI 的私有推理和卧底串供，观众能看到“它当时为什么这么说”。
- **Demo 的黄金 10 秒**：浏览器里 Agent 子账户余额在结算后增加，点开 explorer 看到 `view_access_keys` 只有两把受限 key，以及一个没有提款方法的 wallet 合约。

---

## 5. AI 设计

### 5.1 Agent 人设

| Agent | 人设 | 行为倾向 |
|---|---|---|
| Alpha | 分析师 | 引用别人的描述，逻辑推理，喜欢列点 |
| Beta | 反调者 | 喜欢质疑多数意见，容易带偏节奏 |
| Gamma | 和事佬 | 先认同再补充，降低攻击性，适合卧底伪装 |
| Delta | 混沌者 | 说话跳脱、比喻多，难以被抓住把柄 |

每局随机决定谁是卧底；人设不决定阵营。

### 5.2 输入上下文

每个 Agent 每轮收到：

- 自己的词、阵营、人设；
- 当前轮数、存活玩家列表；
- 所有历史公开描述与被放逐记录；
- 自己的账户余额和本局质押（让“输赢有代价”进入决策）；
- 若自己是卧底且 6 人局有同伴：同伴身份、私下串供记录；
- 输出格式要求。

### 5.3 输出契约

```json
{
  "description": "one public sentence, <= 280 bytes, must not contain my word",
  "vote": "player_account_or_alias",
  "reasoning": "private reasoning, shown only after the game"
}
```

卧底额外一步：

1. **Strategy call**：`{ "plan": "...", "deflect_to": "...", "why": "..." }`
2. **Utterance call**：根据 plan 生成公开描述和投票。

Crew 可以只做一次 call；时间允许时也做一次 strategy call，形成“策略 → 发言”的两段式，作为 `swarms` 赛道的多 Agent 协作展示。

### 5.4 校验与降级

- 描述不能包含自己的词（大小写不敏感、去空格后包含即拒绝）。
- 描述 ≤ 280 bytes，非空。
- 投票目标必须是存活且不是自己。
- 校验失败 → 带错误信息重试 1 次 → 仍失败则使用该人设的 scripted fallback。
- 单次调用超时 20s；整轮并行调用；整轮超时 45s 则全体 fallback。
- 所有 prompt / 输出 / reasoning 写入 `runs/<room_id>.jsonl`，游戏结束后供回放；游戏中不泄露。

### 5.5 NEAR AI Cloud 接入

- Base URL：`https://cloud-api.near.ai/v1`（OpenAI 兼容）
- API key：环境变量 `NEAR_AI_API_KEY`，绝不入库
- 模型：`NEAR_AI_MODEL` 可配置；默认选一个延迟较低的模型
- 失败重试：1 次；仍失败走 scripted fallback
- 文档中注明：NEAR AI Cloud 提供 TEE 推理；MVP 不强制验证 attestation，IronClaw 是 Roadmap

### 5.6 游戏结束后的“AI 回放”

结果页展示：

- 每个 Agent 每轮的 `reasoning`；
- 卧底 AI 的 strategy plan 和串供记录；
- 每个 Agent 的余额变化、历史战绩；
- 一个时间轴：哪一句话让谁开始怀疑谁。

这是 `swarms` 赛道最有说服力的部分：不是“几个 bot 聊天”，而是有私有策略、有联盟、有经济后果的多 Agent 对抗。

---

## 6. NEAR 原语使用

| 原语 | 在项目中的具体用法 | 为什么不是装饰 |
|---|---|---|
| 自研 Escrow 合约 | 锁定质押、阶段状态机、commit-reveal、结算、退款、Agent 战绩 | 资金和规则的实际承载 |
| 子账户 | 4 个持久 Agent 账户 + 每个真人 session 账户 | 持久身份和独立余额 |
| FunctionCall access key | 每个 Agent 两把：game key 只能调游戏合约的三个方法，wallet key 只能调自己的 `stake`；无 full-access key | 受限权限；运营方也提不走 Agent 的钱 |
| Agent wallet 合约 | 部署在 Agent 账户上，只把固定质押转发给 `join_room`，没有提款方法 | 绕过“FunctionCall key 不能带 deposit”的协议限制 |
| 命名账户 | `alpha.agents.<parent>.testnet` 等可读身份 | Explorer 可直接展示 |
| NEAR AI Cloud | 卧底对话、策略、推理 | AI 能力来源 |
| NEP-366 | Roadmap / 加分项：真人免 Gas | 不放在 MVP 关键路径 |
| IronClaw | Roadmap：TEE 托管 Agent key，自主签名 | 未来去掉后端代签 |
| Confidential Intents | Roadmap：跨链隐私稳定币奖池 | Testnet 无 Intents 环境，不在 MVP 做 |

**关于 NEP-366 的事实**：协议层支持 meta transaction，但钱包侧对 delegate action 的支持不统一；当前生态里 `@fastnear/near-connect`、`near-kit`、NEAR Auth 提供了相关能力，传统 `@near-wallet-selector` 的支持不明确。因此 MVP 不依赖它。

---

## 7. 系统架构

### 7.1 组件

```text
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (React/Vite)                     │
│  Lobby · Game · Result/Replay                                    │
│  · session keypair (private key never leaves browser)            │
│  · signs commit/reveal txs directly or via relay                  │
└───────────────┬───────────────────────────────┬──────────────────┘
                │ WebSocket (state/events)       │ signed txs / RPC
                ▼                               ▼
┌──────────────────────────────┐      ┌──────────────────────────────┐
│   Backend / Game Master      │      │   NEAR Testnet               │
│   Node 22 + TS + Socket.IO   │─────▶│   · Escrow contract          │
│   · room state machine       │      │   · Agent subaccounts        │
│   · role/word assignment     │      │   · Agent wallet contracts   │
│   · AI orchestration         │      │   · Session accounts         │
│   · agent signers            │      └──────────────────────────────┘
│   · settlement worker        │─────▶ NEAR AI Cloud (OpenAI API)
└──────────────────────────────┘
```

### 7.2 职责边界

| 组件 | 负责 | 不负责 |
|---|---|---|
| 合约 | 资金、阶段、commit-reveal 校验、票数、胜负、分账、退款、战绩 | 角色分配、AI 生成、私钥 |
| Backend / Game Master | 房间编排、角色/词分配、AI 调用、Agent 签名、阶段推进、结算提交 | 不能改 commitment、不能提走玩家/Agent 资金 |
| Agent worker | 持有该 Agent 的 game key 和 wallet stake key，签名 stake/description/commit/reveal | 不能转账、不能调用其他合约、不能提款 |
| Browser | 展示、收集真人输入、用 session key 签名、验证 commitment | 不持有 master key；session key 只属于该真人的一次性账户 |
| NEAR AI Cloud | LLM 推理 | 不持有任何链上私钥 |

### 7.3 数据流（一轮）

1. Backend 通过 WebSocket 广播 `round_started`。
2. Agent worker 并行调用 AI（或 scripted），得到 `description/vote/reasoning`。
3. Agent 先用自己的 wallet key 调 `stake(room_id)`，由 wallet 合约把质押转发给 `join_room`；再用 game key 调 `submit_description`、`commit_vote`。
4. 真人浏览器用 session key 签 `submit_description`、`commit_vote`，通过 relay 或 RPC 发送。
5. 合约在最后一个 commit 后进入 `VoteReveal`。
6. 各方 `reveal_vote`；合约自动 tally，进入 `RoleReveal`。
7. Backend 调 `reveal_role` 揭示被放逐者；任何人可调 `advance`。
8. 合约进入下一轮或 `Finished`。
9. Backend 调 `settle(all_reveals)`；合约校验并分账、更新战绩。

### 7.4 Repo 结构

```text
agent-undercover/
├── README.md                 # 英文，面向评委 / AI 初筛
├── RULES.md                  # 游戏规则、胜负、先手流程
├── ARCHITECTURE.md           # 架构、信任模型、数据流
├── PRD.md                    # 本文
├── PLAN.md                   # 实施计划与提交清单
├── LICENSE                   # MIT
├── .env.example
├── contract/                 # near-sdk-rs
│   ├── Cargo.toml
│   ├── src/lib.rs
│   └── tests/
├── server/                   # Node 22 + TypeScript
│   ├── src/
│   │   ├── index.ts
│   │   ├── game/             # room state machine, phases, tally
│   │   ├── ai/               # NEAR AI Cloud client, prompts, scripted
│   │   ├── near/             # contract client, agent signers, accounts
│   │   ├── routes/           # REST + relay
│   │   └── ws/               # Socket.IO events
│   └── package.json
├── web/                      # React + Vite + Tailwind
│   ├── src/
│   │   ├── pages/            # Landing, Lobby, Game, Result
│   │   ├── components/
│   │   ├── lib/              # session key, near client, socket
│   │   └── main.tsx
│   └── package.json
├── shared/                   # 词库、类型、常量
├── scripts/                  # 建号、部署、seed、demo
├── docs/
│   ├── demo-script.md
│   ├── submission.md
│   └── trust-model.md
└── runs/                     # 本地 AI 日志，gitignored
```

### 7.5 技术栈

| 层 | 选型 | 版本/备注 |
|---|---|---|
| 合约 | Rust + near-sdk | near-sdk 5.30.x；`wasm32-unknown-unknown` |
| Backend | Node 22 + TypeScript + Express + Socket.IO | near-api-js / near-kit 二选一，优先 near-api-js |
| Frontend | React 18 + Vite + Tailwind | 不引入重型 UI 库 |
| AI | NEAR AI Cloud，OpenAI SDK 兼容 | `cloud-api.near.ai/v1` |
| 部署 | Contract: Testnet；Backend: Render/Fly；Web: Vercel | 所有地址写进 README |
| 测试 | Rust unit tests + 脚本化端到端 | `cargo test` + `pnpm demo:scripted` |

---

## 8. 合约接口（v1）

### 8.1 状态

```text
Contract
├── game_master: AccountId
├── room_count: u64
├── rooms: LookupMap<room_id, Room>
├── role_commitments: LookupMap<(room_id, account), hex_hash>
├── role_reveals: LookupMap<(room_id, account), "crew" | "impostor">
├── descriptions: LookupMap<(room_id, round, account), string>
├── vote_commits: LookupMap<(room_id, round, account), hex_hash>
├── votes: LookupMap<(room_id, round, account), target_account>
├── vote_revealed: LookupMap<(room_id, round, account), bool>
└── agent_stats: LookupMap<account, AgentStats>

Room
├── id, host, stake, max_players, impostor_count, max_rounds
├── players: Vec<Player { account, is_agent, alive }>
├── phase: Lobby | Describing | VoteCommit | VoteReveal | RoleReveal | Finished | Settled | Refunded
├── round, pot, impostors_exiled
├── tally_done, pending_exile: Option<AccountId>
├── winning_side: Option<"crew" | "impostors">
├── exiles: Vec<AccountId>
├── winners: Vec<AccountId>
├── created_at, phase_deadline, game_deadline
```

### 8.2 方法

| 方法 | 调用者 | 阶段 | 说明 |
|---|---|---|---|
| `new(game_master)` | 部署 | — | 初始化 |
| `create_room(room_id, stake, max_players, impostor_count, max_rounds)` | 任何人，payable | — | 创建并自动加入；deposit == stake |
| `join_room(room_id)` | 任何人，payable | Lobby | 精确质押；不能重复；满员拒绝 |
| `start_game(room_id, role_commitments, agent_accounts)` | game_master | Lobby | 校验每个玩家都有 commitment；标记 Agent；进入 Describing |
| `submit_description(room_id, text)` | 存活玩家 | Describing | ≤ 280 bytes；每人每轮一次；全员提交后自动进入 VoteCommit |
| `commit_vote(room_id, commitment)` | 存活玩家 | VoteCommit | hex sha256(target + ":" + salt)；全员后进入 VoteReveal |
| `reveal_vote(room_id, target, salt)` | 存活玩家 | VoteReveal | 校验哈希；不能投自己；全员揭示后自动 tally，进入 RoleReveal |
| `reveal_role(room_id, player, role, salt)` | game_master | RoleReveal | 只允许揭示 pending_exile；校验 commitment；角色只能是 crew/impostor |
| `advance(room_id)` | 任何人 | RoleReveal | pending_exile 必须已揭示或本轮平票；判断胜负/下一轮 |
| `settle(room_id, role_reveals)` | 任何人 | Finished | 校验全部 commitment；按胜方存活列表分账；更新 Agent 战绩 |
| `refund(room_id)` | 任何人 | 任意未结算 + 超时 | 原路退回质押 |
| `force_advance(room_id)` | game_master | 任意阶段 + 超时 | 跳过未提交者；未揭示票视为弃权 |
| `get_room(room_id)` | view | — | RoomView |
| `get_round(room_id, round)` | view | — | 描述 + 已揭示的票 |
| `get_role(room_id, account)` | view | — | 仅返回已揭示的角色 |
| `get_agent_stats(account)` | view | — | 战绩/收益 |
| `get_room_count()` | view | — | 统计 |

**Agent wallet 合约**（独立部署在每个 Agent 账户上，不属于游戏合约）：

| 方法 | 调用者 | 说明 |
|---|---|---|
| `new(game_contract, stake)` | 部署时 | 固定游戏合约地址和质押金额 |
| `stake(room_id)` | Agent 自己的 wallet key | 要求 predecessor == 当前账户、deposit == 0；向 `game_contract.join_room` 转发固定 `stake` |
| `get_game_contract()` / `get_stake()` | view | 验证配置 |

wallet 合约没有提款、转账或调用其他合约的方法。

### 8.3 不变量

1. 合约持有的 NEAR ≥ 所有未结算房间的 `pot` 之和。
2. 一个玩家在一个房间只能加入一次、每轮只能描述一次、commit 一次、reveal 一次。
3. `reveal_vote` 的哈希必须匹配 `commit_vote`；不匹配不计票。
4. `reveal_role` / `settle` 的哈希必须匹配开局 commitment；不匹配 panic。
5. 只有 `game_master` 能 `start_game` / `reveal_role` / `force_advance`。
6. `settle` 的支付总额 ≤ `pot`；余数给第一个赢家。
7. `refund` 只能在超时后调用；已结算/已退款不可重复。
8. Agent 账户的 key 不在游戏合约控制范围内；游戏合约只负责把奖金转给账户。
9. Agent wallet 合约只能向固定的游戏合约 `join_room` 支付固定 `stake`，不能向其他地址转账，也没有提款方法。

### 8.4 事件（可选但建议）

用 `EVENT_JSON:` 前缀写日志，便于前端/索引器：

- `room_created`
- `player_joined`
- `game_started`
- `description_submitted`
- `vote_committed` / `vote_revealed`
- `player_exiled`
- `game_settled`
- `refunded`

MVP 后端可以直接轮询 view 方法；事件是加分项。

---

## 9. 信任模型与安全

### 9.1 信任边界

| 角色 | 能做什么 | 不能做什么 |
|---|---|---|
| 合约 | 保管质押、校验 commit、计票、分账、退款 | 不知道角色/词；不能主动执行；只能被调用 |
| Game master（后端） | 分配角色/词、开局、揭示被放逐者、推进阶段、提交结算 | 不能伪造 commitment 的揭示；不能提走玩家/Agent 资金；掉线时玩家可超时退款 |
| 运营方 / Agent worker | 运行 AI、持有 Agent 的两把 scoped key、签名 Agent 动作 | 不能从 Agent 账户提款（无 full-access key）；不能调用游戏合约方法或自己的 `stake` 以外的方法 |
| 真人（Demo） | 浏览器生成一次性 session 账户的 keypair，自己签带质押的 join 和描述/投票 | 不能改别人的状态；后端只创建并充值该账户，不持有它的私钥 |
| 真人（真实钱包） | 用 Wallet Selector 签名 | 需要自己准备 Testnet NEAR；MVP 可后置 |
| NEAR AI Cloud | 推理 | 不接触私钥 |

### 9.2 明确的中心化点

1. **角色分配在链下**：game master 知道谁是卧底，理论上可以泄露给卧底 AI。MVP 不做可验证角色分配；在 README/视频里明确说明。
2. **salt 在 game master 手里**：如果 game master 不揭示，游戏无法结算；但玩家可以在 deadline 后 `refund`。
3. **AI 行为由运营方编排**：Agent 不是自主的；IronClaw/TEE 是 Roadmap。
4. **真人 session key 由浏览器生成**：Demo 模式下，后端负责创建一次性 session 账户并充值，把该账户的 full-access key 设为浏览器公钥，但从不持有私钥；真人自己签带质押的 join。该账户是 disposable 的，余额只属于这一局真人。

### 9.3 威胁与缓解

| 威胁 | 缓解 |
|---|---|
| 运营方偷看真人投票并通知 AI | 真人在浏览器本地计算 hash 并签名 commit；AI 的票在同一阶段已 commit；运营方最早在 reveal 时看到真人的票 |
| 运营方提走 Agent 奖金 | Agent 账户无 full-access key；两把 scoped key 只能调游戏合约方法和自己的 `stake`；wallet 合约没有提款方法；`view_access_keys` 和合约代码可验证 |
| 玩家不揭示票导致卡死 | `force_advance` 超时跳过；最终 `refund` |
| 玩家重复提交/投自己 | 合约拒绝 |
| 描述泄露自己的词 | 后端内容校验 + AI prompt 约束；合约只能校验长度，文档说明这是 off-chain 规则 |
| 合约余额不足 | 部署时充值足够 Testnet NEAR；描述短、玩家少、轮数少 |
| 私钥泄露 | `.env` / `.keys/` gitignored；Agent key 限权；master key 只在本机 |
| 提交后被判“不可复现” | scripted 模式 + README + 种子脚本 + hosted demo |

---

## 10. MVP 范围

### 10.1 必做（Must）

1. **合约**：5 人房、质押、commit-reveal 角色/投票、tally、放逐、结算、退款、Agent 战绩；Rust 单测。
2. **Agent 账户**：4 个持久子账户，每个部署 stake-only wallet 合约，账户只有两把 scoped FunctionCall key，初始余额，公开战绩页。
3. **Backend**：房间状态机、WebSocket、AI Cloud 并行调用、scripted 模式、Agent 签名、结算 worker。
4. **Frontend**：Landing、Lobby、Game、Result/Replay；浏览器 session key 签名；不要求钱包插件。
5. **Demo**：1 真人 + 4 Agent 一局可完整跑通；结果页展示链上分账和 Agent 余额变化。
6. **交付**：README、RULES.md、ARCHITECTURE.md、LICENSE、`.env.example`、测试网地址、demo 视频、X post、提交表单。

### 10.2 加分（Should）

- Wallet Selector 连接真实 Testnet 钱包。
- Hosted demo（Vercel + Render）。
- Agent 排行榜/收益率页。
- 游戏结束后的 AI reasoning 时间轴。
- NEP-366 免 Gas（限时 4–6 小时，做不完就放弃）。
- 多人房间（2–3 真人 + Agent 补位）。

### 10.3 明确不做（Won't）

- 2–6 人完整匹配/排队系统。
- 每局新建 Agent 子账户。
- NFT、皮肤、赛季、复杂排行榜。
- IronClaw 实际接入（只写 Roadmap）。
- Confidential Intents 实际接入（Testnet 无环境）。
- 移动端、复杂美术、语音。
- 真人自由聊天（MVP 用描述代替；聊天是 stretch）。

---

## 11. 赛道映射

| 赛道 | 评委看什么 | 我们对应什么 |
|---|---|---|
| `games`（主） | 游戏循环、NPC 有钱包、玩家感觉不到链、真实经济 | 5 分钟一局、4 个 Agent 自有账户和质押、session key 免插件、结果页链上分账 |
| `agents` | Agent 赚钱/花钱/谈判/持久身份 | Agent 用自己的余额质押、奖金进自己账户、跨局战绩/收益、scoped keys + stake-only wallet 保证运营方也提不走 |
| `swarms` | 多 Agent 协调、竞争、 emergent economy | 4 个 Agent 各自策略；卧底 AI 私下串供；策略→发言两段式；结束后回放联盟和背叛 |

**提交 tracks**：`["games", "agents", "swarms"]`，主攻 `games`。README 用一张表逐条对应官方 hints，不要只写“我们也支持”。

**差异化**：最接近的竞品 Deceit（Sui 上的 AI 社交推理，NEAR AI 只用于创建 Agent）验证了方向，但结算在 Sui。我们的差异化是 **NEAR 原生托管 + 子账户 + scoped keys + stake-only wallet + Agent 自有余额 + 链上结算**，不是“又一个 AI 狼人杀”。

---

## 12. 提交材料

### 12.1 表单字段（提交前由 human 最终确认）

| 字段 | 值 |
|---|---|
| projectName | Agent Undercover（2–80 字符） |
| leadName | Necklace |
| email | necklace1982@gmail.com |
| size | `1` |
| tracks | `["games", "agents", "swarms"]` |
| nearAddress | `x-bit.near` |
| projectUrl | 公开 GitHub repo（待创建） |
| demoUrl | 公开 X demo post（human 发布后提供） |
| idea | 见 12.5 |
| consent | 仅由 human 在确认联系声明后勾选 |

### 12.2 必须存在的交付物

- [ ] 公开 GitHub repo，含 LICENSE（MIT）
- [ ] README：产品是什么、解决什么问题、评委怎么跑（“do X - see Y”）
- [ ] README：架构图、信任模型、Testnet 地址、track mapping
- [ ] `DEMO_MODE=scripted`：无 API key 可跑完整局
- [ ] 60–90 秒 demo 视频（human 录制/发布）
- [ ] X post：提及 built at NEAR HACKATHON、@NEARProtocol、#NEARHackathon，附视频/截图
- [ ] Hosted demo（加分），保留到 2026-11-18（最好 11-25）
- [ ] 提交 payload 打印给 human 确认后再 POST

### 12.3 时间线

| 日期（UTC） | 事项 |
|---|---|
| 11-05（Day 1） | PRD/PLAN、repo 骨架、Testnet master、合约 skeleton + 核心方法 |
| 11-06（Day 2） | 合约 v1 + 单测 + Agent 账户 + scripted 链上一局（M1） |
| 11-07（Day 3） | Backend + AI + WebSocket；浏览器最小闭环（M2） |
| 11-08（Day 4） | 前端完整流程 + 结果页/回放 + 稳定性；23:59 功能冻结（M3） |
| 11-09（Day 5） | Hosted deploy、README、视频、X post、repo 公开、提交（M4） |
| 11-10～11-14 | 缓冲：只修 bug/补材料；官方截止 11-14 23:59 UTC |

### 12.4 Human-only 动作

按 HACKATHON.md，以下必须由 human 完成：

- 发布 X demo post（可提供草稿）
- 确认并发送提交 payload（打印完整 JSON 后再确认）
- 确认 consent 声明
- leadName / email 已提供：Necklace / necklace1982@gmail.com（提交前请最终确认）
- 决定 repo 公开/推送（Claude 不擅自 push）
- 主网收款账户已提供：`x-bit.near`

### 12.5 提交用 `idea` 文案（约 980 字符，上限 2000）

> Agent Undercover is a 5-player social deduction game where every seat can be a human or an AI agent. Each agent owns a persistent NEAR subaccount, stakes its own testnet NEAR, lies in public, and keeps what it wins — and an agent can be crew or impostor. Each player gets a secret word; the impostor gets a similar word. Every round, each player describes their word in one public sentence, then the crew votes to exile the impostor. Stakes are locked in a custom NEAR escrow contract; roles and votes are commit-revealed, and settlement is rule-based and permissionless, with a timeout refund. Each agent account holds only scoped FunctionCall keys and a tiny stake-only wallet contract — no full-access key — so even the operator cannot withdraw its funds. AI dialogue is generated with NEAR AI Cloud, and a scripted mode runs the full game without an API key. The MVP runs on NEAR testnet; IronClaw TEE key custody, NEP-366 gasless entry, and Intents prize pools are roadmap.

### 12.6 X post 草稿（human 发布）

> These 4 AI agents have their own NEAR wallets — and they just took my money in a game of Undercover.
>
> I built Agent Undercover at @NEARProtocol #NEARHackathon: a 5-player social deduction game where AI agents stake their own funds, lie to your face, and keep what they win. Stakes and payouts are enforced by a NEAR escrow contract; each agent has only scoped keys and a stake-only wallet with no withdrawal path, so even I can't withdraw its winnings.
>
> Can you spot the AI? Demo + repo: [links]
>
> Built at NEAR HACKATHON.

**注意**：X post 的第一行要讲用户问题/钩子；必须包含 built at NEAR HACKATHON、@NEARProtocol、#NEARHackathon；附视频或截图；demoUrl 必须是这条公开 post。

---

## 13. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 5 天单人做不完 | 高 | 高 | 目标 5 天出可提交版；11-10～11-14 官方截止前作为缓冲；砍掉 Should；先跑通 scripted 端到端 |
| 合约 bug / 资金卡住 | 中 | 高 | 先写单测；Testnet 部署；超时 refund；小金额 |
| NEP-366 钱包不兼容 | 高 | 中 | 不做关键路径；用 session key；限时 4–6h |
| AI 延迟/输出不稳定 | 中 | 中 | 并行、超时、fallback、scripted 录制 |
| Testnet faucet/账户创建失败 | 中 | 高 | 第一天就建号；保存 key；多试几个 faucet |
| 钱包 UX 拖慢 demo | 中 | 中 | Demo 用浏览器 session key；钱包是 Should |
| 评委无法复现 | 中 | 高 | scripted 模式 + README + 种子脚本 + hosted demo |
| 链上存储成本 | 低 | 中 | 描述 ≤ 280 bytes；5 人；3 轮；合约充值 |
| 过度承诺被评委挑战 | 中 | 高 | README 写清 trust model；不声称 trustless/自主 |
| 赛道撞车 | 中 | 中 | 强调 NEAR 原生 scoped keys + stake-only wallet + Agent 自有余额 + 链上结算 |

---

## 14. Roadmap

1. **IronClaw TEE key custody**：Agent 私钥进入 TEE，去掉后端代签；attestation 可验证。
2. **NEP-366 gasless entry**：新玩家无需准备 NEAR；relayer 代付 Gas。
3. **Confidential Intents**：跨链隐私稳定币奖池（主网）。
4. **更多 Agent 人设 / 词库 / 任务类型**。
5. **多人房间匹配**：2–6 真人 + Agent 补位。
6. **Agent 市场**：Agent 可以被其他玩家雇佣/投资，收益分成。
7. **锦标赛/赛季**：Agent 信誉和收益率排行榜。

---

## 15. 术语

| 术语 | 含义 |
|---|---|
| Game master | 后端控制账户，负责开局、角色揭示、阶段推进、结算 |
| Scoped key | FunctionCall access key，限定 receiver/method/allowance |
| Commitment | `sha256(role + ":" + salt)` 或 `sha256(target + ":" + salt)` |
| Reveal | 提交原文 + salt，合约校验后生效 |
| Crew / Impostor | 好人 / 卧底 |
| Pot | 本局所有质押总额 |
| Scripted mode | 不调用 LLM 的确定性 Agent 脚本 |
| Agent wallet | 部署在 Agent 账户上的极小合约，只有 `stake(room_id)` 能把固定质押转发给 `join_room`，没有提款方法 |
| Session account | Demo 中为真人创建的一次性测试网子账户，浏览器持有其 full-access key，后端只负责创建和充值 |
