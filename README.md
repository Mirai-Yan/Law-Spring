# 法脉·刑法学

按学说史组织的刑法学习工具，覆盖英格兰与威尔士、美国、德国、日本、台湾地区、中国大陆六个法域，目前收录 34 个专题：

| 体系位置 | 专题 |
|---|---|
| 刑法基础论 | 法益、罪刑法定原则、刑法学派之争、伤害原则、主观主义与客观主义（英美） |
| 犯罪论体系 | 犯罪论体系（阶层论与四要件）、行为论 |
| 构成要件 | 因果关系与客观归责（含疫学因果关系、污染环境罪）、不作为犯 |
| 主观要件 | 故意、事实认识错误、过失犯的构造 |
| 违法性 | 违法性的本质、正当化的一般原理、正当防卫、紧急避险、偶然防卫、假想防卫、主观的违法要素、不知情的正当化行为人（英美） |
| 责任 | 责任的本质、违法性认识、原因自由行为、责任能力、严格责任与责任主义 |
| 未完成形态 | 实行的着手、不能犯与未遂、中止犯、不能未遂（英美） |
| 共犯论 | 正犯与共犯的区分、共犯的处罚根据 |
| 刑罚论 | 刑罚的正当化根据 |
| 分论与特殊主体 | 财产犯罪的保护法益、单位（法人）犯罪 |

透镜中可以选用的根据论：违法性的本质（结果无价值、二元与一元行为无价值）、刑法的任务（法益保护、规范违反）、学派之争（古典学派、近代学派）、刑罚根据（报应、一般预防、特别预防、并合主义）、责任的本质（心理、规范、功能责任论），以及英美的主观主义与客观主义。

| 功能 | 在哪里 |
|---|---|
| 按法系、法域展开学说演变 | 首页「法系地图」、`/jurisdictions/`、`/jurisdiction/[id]/` |
| 追根溯源：奇点、演化、学者对话、学术谱系 | 专题页的「溯源」「对话」「谱系」标签 |
| 概念之间的关系 | 专题页的「关系」标签、`/graph/` |
| 学术光谱 | `/spectrum/` |
| 根据论透镜 | `/lens/`（单一学说、两说对照、学说 × 问题矩阵） |
| 先决问题：提出一个问题，看它的先决问题与挂钩 | 首页提问框、`/ask/`、`/question/[id]/` |
| 审核 AI 起草的内容 | `/review/`、`npm run review:list` |

## 运行

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run validate   # 校验 content/ 下的全部 YAML
npm test           # 单元测试（先决图算法、检索、真实内容）
npm run build      # 先校验，再构建
npm start          # 运行构建好的网站（http://localhost:4000）
```

网站以 Node 服务器方式运行（需要 `/api/case`、`/api/ask` 调用大模型）。部署时需要能运行 Node.js 的主机；国内访问建议使用国内云服务器。

### 部署到 Netlify（线上演示版）

1. 把项目推到 GitHub（私有仓库即可）。`.gitignore` 已排除 `.env.local`、`content/_private/`、`.cache/`、`data/`，密钥、原文锚点、书籍缓存和用户数据库都不会上传。
2. 在 Netlify 选 Import from Git，选这个仓库。构建设置已写在 `netlify.toml`，不用手填。
3. 在 Netlify 后台的 Environment variables 里设置 `DEEPSEEK_API_KEY`，建议同时设置 `ACCESS_CODE`。

`netlify.toml` 里的 `FM_ONLINE_DEMO=1` 会把网站构建成线上演示版（见 `src/lib/deploy.ts`）：Netlify 的服务器没有可以长期保存数据的磁盘，所以账号与同步、个人资料库、建议与纠错在线上版关闭，相关接口返回 503；练习进度、主题和收藏仍保存在浏览器里。其余页面和 AI 功能照常可用。不要用拖拽文件夹的方式上传，那只适用于纯静态网站。

注意：`npm run dev` 运行时不要同时执行 `npm run build`，两者共用 `.next/` 缓存。如果开发服务器因此报 500，停掉它，删除 `.next/` 后重启即可。

## 内容怎么组织

全部内容都在 `content/` 下的 YAML 文件里。每个文件可以包含任意几种实体的数组，加载时会合并。

```
content/
  core.yaml                       法域，以及第一批专题（违法性本质）的概念与概念关系
  questions/*.yaml                第一批专题的问题与先决关系
  theories.yaml、theories-2.yaml  学说（根据论问题上的一个答案）
  positions.yaml                  第一批专题的透镜数据：学说 × 问题 → 结论与推演链
  jurisdictions/*.yaml            各法域的学者、文献、演化事件（scholars-2.yaml 为第二批新增学者）
  dialogues-spectra.yaml          第一批专题的学者对话与学术光谱
  topics/01-…09-*.yaml            第二批专题：每个文件自成一体，包含概念、问题、先决关系、文献、事件、立场、对话与光谱
```

实体的字段定义在 `src/lib/schema.ts`。几条约定：

- **奇点**：每个概念有且只有一个 `type: origin` 的事件，用 `originOf` 指向该概念，并写明 `originType`。
- **先决关系**：`question` 是下游问题，`requires` 是先决问题。`kind` 取四种之一：`foundational` 根据论先决、`logical` 逻辑先决、`systematic` 体系定位先决、`conceptual` 概念界定先决。`branches` 写先决问题取不同答案时，下游会走向哪里。先决图不能成环，校验器会报出环路。
- **体系位置**：每个概念都有 `area`，用于首页、专题页、透镜矩阵与图谱的分组（取值见 `src/lib/schema.ts` 中的 `AREA_LABEL`）。
- **立场**：`positions` 是「学说 × 问题 → 答案」。`answer: null` 表示没有统一立场；阵营内部的有力异说写在 `alternatives` 里；个别学者偏离阵营的立场写在 `scholarPositions` 里。
- **光谱**：每个位置都是编者定位，必须写 `rationale`。`overlay: true` 表示跨法系类比。
- **wiki 链接**：正文里可以写 `[[scholar:welzel]]`、`[[concept:accidental-defense|偶然防卫]]`，校验器会检查链接是否有效。

## 审核流程

所有内容都由 AI 起草，初始为 `status: draft`，页面上显示「待核实」。没有把握的年份、卷期、出处或立场归属另标 `needsSource: true`。

1. 在 `/review/` 按法域或实体类型筛出待核实条目。也可以用 `npm run review:list`，或 `npm run review:list -- scholars` 只看某一类。
2. 核对原文后，在 YAML 里把 `status` 改为 `verified`，并补上 `sources: [{ work: <文献 id>, pages: "..." }]`。标为 `verified` 却没有出处的条目，校验不会通过。
3. 有疑问的改为 `disputed`，并在 `editorNote` 里写明原因。

最容易出错、需要优先核对的是三类内容：**师承关系**、**学者的立场归属**、**先决树里各分支的结论**。

## 扩展到其他部门法

概念、问题、学说都带有 `domain` 字段（`criminal | civil | administrative`），默认是 `criminal`。法域与学者在各部门法之间共用。

## AI 功能（DeepSeek）

| 功能 | 页面 | 大模型做什么 |
|---|---|---|
| 案例分析 | `/case/` | 理解案情、找出争点，并对应到库内问题；各学说的结论与推演链来自知识库 |
| AI 自由提问 | `/ask/`（库中没有的问题） | 找出相关的库内问题，并起草一棵「AI 推测」的先决树，审核后可存入 `content/_inbox/` |
| 练习与自测 | `/practice/` | 不使用大模型，由知识库自动出题 |

**配置：** 复制 `.env.example` 为 `.env.local`，填入 DeepSeek 开放平台的 `DEEPSEEK_API_KEY`。`.env.local` 不会提交到 git，key 只在服务器端使用。没有 key 时网站照常可用：案例分析只能分析内置的示例案情（使用预置演示结果），自由提问退回检索。

**防止编造：** 提示词附上库内问题索引；返回的问题 id 逐一对照知识库校验，不存在的丢弃；输出中不设引注字段，疑似引注会被提示；AI 生成的内容一律标记为「AI 推测·未入库」。实现见 `src/lib/ai/`。

**演示数据：** `content/_demo/cases.json` 中是三个示例案情。没有 key 时使用其中的预置演示结果（人工整理，页面会标明「非实时 AI 输出」）。配置 key 后运行下面的命令，可以把它们换成真实的 AI 输出，换完后请人工检查：

```bash
npm run demo:refresh
```

AI 的原始返回会缓存在 `.cache/ai/`，相同的输入不会重复调用；现场断网时也能回放已经分析过的案情。

**公开部署：** 在 `.env.local` 或服务器环境变量中设置 `ACCESS_CODE`，AI 接口就需要口令才能调用，避免 key 被滥用；接口另有简单限流。
