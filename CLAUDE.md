# 啵啵救援队（代号 fishsort）

竖屏休闲消除手游：把困在气泡里的小鱼按种类送回鱼缸。目标平台（用户 2026-11-18 定）：微信小游戏（中国大陆）、Google Play 和 iOS（只上海外，不上中国大陆商店）。三端都要做，上架先后不固定（用户 2026-11-18：可能先上 App Store）。**三端一个仓库、一个主干，不为平台拆分支**，差异只在平台层和每个平台的覆盖配置里（`docs/04` 第 5 节）；上架图片和文案也在仓库里（`store/`，`docs/06`）。APP 才做的功能记在 `docs/07`。

## 文档索引（动手前先读对应文档）

| 文档 | 内容 |
|---|---|
| `docs/01-玩法设计.md` | 核心规则、障碍、道具、外围系统、经济与变现 |
| `docs/02-关卡设计.md` | 难度曲线、关卡数据格式、生成器与可解性校验 |
| `docs/03-美术规范.md` | 原创美术方向、资源规格、Codex 出图流程 |
| `docs/04-技术架构.md` | 引擎、目录结构、分层、平台适配、存档 |
| `docs/05-开发规范.md` | 代码、Git、测试、性能预算、完成标准 |
| `docs/06-平台发布.md` | 三个平台的资质、包体、合规清单 |
| `docs/07-里程碑.md` | 开发顺序与每阶段验收标准 |
| `docs/08-界面规格流程.md` | 界面先写规格、后写代码；审查清单；规格放 `docs/ux/` |
| `docs/09-Cocos迁移与界面重做.md` | 换 Cocos Creator 3.8 与界面重做的需求；定版界面图在本地 `art/ui-final/`（不进仓库） |
| `docs/10-开发底座.md` | 三端一个仓库：平台层、原生工程、`game.json`、打包上架、做新游戏的步骤（这个仓库是以后同类游戏的底座） |

文档是唯一事实来源：改规则或数值时，先改文档再改代码，同一次提交里完成。

## 分工

- **Claude**：全部代码、配置表、关卡工具、文档。
- **Codex**：全部位图美术（鱼、UI、场景、图标）。Claude 在 `art/briefs/` 写出图需求，Codex 产出到 `art/raw/`，流程见 `docs/03-美术规范.md`。
- **用户**：美术方向与界面验收、平台账号与资质、上架提交。

## 硬性约束

1. **原创**：本作只借鉴「气泡取鱼 + 三消装缸」这一品类玩法。名称、鱼的造型与名字、图标、界面布局、场景画面一律原创，不得照着任何现有游戏的截图临摹或让 Codex 以其为参考图。
2. **引擎**：Cocos Creator 3.8.8 + TypeScript（严格模式），工程在 `client/`（2026-11-15 由 Godot 迁来，Godot 旧工程已于 2026-11-16 删除，见 `docs/09`）。
3. **分层**：`client/assets/scripts/core/` 是纯逻辑，不 import `cc`，禁止碰节点、存储、时间、`Math.random`；规则与原 Godot 版逐位一致，由黄金数据测试（`client/tests/golden/`）守着。
4. **平台隔离**：`wx`、原生桥等平台调用只允许出现在 `client/assets/scripts/platform/`，其它代码走 `App.platform` 接口，按能力（`hasCapability`）而不是按平台 id 分支。
5. **数值不进代码**：关卡、鱼种、经济、广告频控、界面手感全部放 `client/assets/resources/config/` 的 JSON。
6. **文案不进代码**：所有玩家可见文字走 `tr()`，翻译在 `i18n/strings.csv`（每种语言一列），生成 `client/assets/resources/i18n/strings.json`。
7. **关卡必须可解**：进包的关卡都要过 `./run.sh level-verify`。
8. **v1.0 无自建服务器**：存档本地 + 平台云存档，排行榜用平台能力。
9. **这一版不做内购；上架的版本有广告**（用户 2026-11-20：「我们真正上架的版本都是有广告的」，金币按「不看广告不够用，看广告加倍」设计，`docs/01` 6.3；2026-11-18 定过「第一版不接广告」，已改口）。总开关是 `game.json` 的 `ads.enabled`（2026-11-20 起 `true`）：iOS、Android 接 AdMob，真实广告位只有上架包（`./package.sh` 的 IPA、AAB）用，其它包用 Google 的测试广告位（`docs/10` 第 5 节；AdMob 的 ID 存在 `docs/06` 第 1 节）；微信只用微信官方的广告（流量主），不用 AdMob 的 ID。界面按 `hasCapability('ads')` 决定广告入口在不在、按 `adsAvailable()` 决定能不能点。微信本来就不能做内购（要版号，个人主体也开不了虚拟支付）；Google Play、iOS 的内购以后再说，清单留在 `docs/07`。
10. **语言**（用户 2026-11-19：App 做欧美、日韩和繁体区，不做中国大陆；跟着同类休闲游戏的常见语言来）：App 带 12 种——英文、简体中文、繁体中文、日文、韩文、德文、法文、西班牙文、葡萄牙文（巴西）、意大利文、俄文、土耳其文；微信版只带简体中文和英文。按系统语言选默认（认不出用英文，微信用简体），设置里可换。各端带哪些语言在 `game.json` 的 `languages`。**每种语言都按当地休闲游戏的说法写，不直译**；文字不缩放，放不下就改短（`docs/10` 第 8 节）。
11. **测试与 CI 从简**：只给 `core/` 的规则、生成器和存档写测试（`client/tests/`）；界面、服务、平台层不写单测。CI 只有一条 PR 流水线，三分钟内跑完，不加构建矩阵、覆盖率、界面自动化。细则见 `docs/05` 第 3、4 节，不要自行加码。
12. **包体**：界面能用代码画的就不用图片（`docs/09` 第 11 节）；进包的 PNG 一律压成调色板（`./run.sh art-compress`，`check` 会查）。微信打包与真机验证用户定为先不管，平台专属功能等接平台时再做。

## 项目管理

GitHub 仓库 `crazyniu/fishsort`：issue 记任务，milestone 对应 `docs/07` 的 M0–M6，PR 关联 issue 后 squash 合并。约定见 `docs/05` 第 5 节。

## 开发流程

界面先行：**每个界面先写 `docs/ux/` 规格并经用户确认（见 `docs/08`）** → 美术方向确认 → 每个界面用假数据做出可点击、带动效的外壳并由用户验收 → 再接入 `core/` 逻辑。未验收的界面不接逻辑。外壳完成后按 `docs/08` 第 3 节清单截图审查。

## 常用命令

试玩和开发使用根目录的 `run.sh`，独立打包入口为 `package.sh`。

```bash
# Mac 上（需要 Cocos Creator）
./run.sh                       # 先拉当前分支的最新代码，再构建 web-mobile、起本地服务，用独立 Chrome 窗口打开（试玩模式：金币、生命、技能加满，所有关卡都能点开）
./run.sh level 65              # 同上，直接进第 65 关
./run.sh auto                  # 机器人代打，过关自动下一关、输了重打，一直打到最后一关；auto 12 = 从第 12 关打起，auto 12 30 = 打到第 30 关
./run.sh page shop             # 启动后直接打开某一页
./run.sh real                  # 按真实存档进度（可与上面几个连用，如 ./run.sh real level 3）
./run.sh serve                 # 不重新构建，直接打开上次的构建（后面同样可跟 level / auto / page / real）
./run.sh lan                   # 给用户测：构建后服务开在内网，打印 http://<Mac 的内网 IP>:8080/ ，不开本机 Chrome（lan serve = 不重新构建；后面同样可跟试玩参数）
./package.sh                   # 输入平台和产物编号，见 docs/10 第 4 节
./run.sh native-apply          # 按 game.json 改写各平台的构建配置和原生工程（打包时自动跑）
./run.sh editor                # 打开 Cocos Creator
./run.sh cdp logs | eval '<表达式>' | shot <文件> | burst <目录> <张数> <间隔毫秒>   # 读控制台、页面里求值、截图、连拍

# Linux 上也能跑（Node）
./run.sh check                 # 类型检查 + .meta / 图片压缩检查 + 单测，与 CI 相同
./run.sh test                  # 只跑单测
./run.sh level-gen             # 生成关卡（level-gen 26 125 = 指定范围；第 26 关起按普通玩家机器人「花几样才过」生成，docs/02 第 0 节，一关约半分钟，4 段并行）
python3 difficulty.py          # 调难度（Mac 上跑）：菜单里看目标、改参数、后台生成关卡 / 每日挑战关、看进度、停止（docs/02 第 0.5 节）
./run.sh level-route 6 360 --jobs=12 --lab   # 规定路线全量生成（difficulty.py 调的就是它；--daily 生成每日挑战专用难关，--resume 接着上次；量过的每一版存进难度库 client/tools/level/pool/，再生成时离目标 5 个点以内的直接拿，--fresh 不用库）
./run.sh level-fixref          # 查全部关卡的参考解能不能过结构校验，过不了的换一条
./run.sh level-verify          # 全量关卡校验（只查结构，几秒；加 --measure 才复测每关难度，要很久）
./run.sh level-probe 120,199   # 难度探针：随手玩家和细心玩家两个机器人的胜率（docs/02 第 0 节；动难度前先用它量）
./run.sh eco-sim               # 金币的账：一天挣多少、要花多少、要看几次广告（docs/01 第 6 节；动金币和技能奖励前后都要跑）
./run.sh meta                  # 给新资源补 .meta（结果要提交）
./run.sh art-compress          # 包体压缩：PNG 量化、背景音乐转 mp3
./run.sh font-subset           # 按文案重新裁字体
./run.sh native-icons          # 从图标生成各平台应用图标、iOS 启动屏、商店图标（结果要提交）
./store/gen.sh && python3 tools/store/export.py    # 上架图：Codex 整张画（字也画在图里）→ 缩放裁成各商店尺寸（store/images）
```

两个脚本都自动查找 Cocos Creator（`COCOS_CREATOR` 环境变量 → `/Applications/Cocos/Creator/3.8.8/`）。

## 测试环境分工（硬性）

13. **Linux 开发机只写代码，不跑 Cocos / Blender**：构建、试玩、截图、界面验收、Blender 出图或导出，一律去用户的 Mac 上做（Node 的检查、单测、关卡校验可以在 Linux 上跑）。Claude 用 `orca` CLI 驱动 Orca 环境 `Mac-Image-Worker`（仓库 `/Users/apple/Documents/projects/fishsort`，Cocos Creator 3.8.8 在 `/Applications/Cocos/Creator/3.8.8/`），不需要用户手动操作。
14. **代码同步只走 git**：Linux 上提交并推送，Mac 上 `git checkout -- client && git pull --ff-only`（`./run.sh` 试玩、构建、开编辑器前会自动做这一步；`NO_PULL=1` 跳过）。Mac 看不到未推送的改动。在 Mac 上除 git 同步、`./run.sh` 和 `./package.sh` 外不改文件、不装软件，不碰 `game` 等其它项目。
15. 开终端、读输出、取运行画面、操作界面、收尾清理的具体命令见 `docs/05` 第 9 节。测完关掉自己开的终端并结束试玩进程。
16. **交给用户测试时**（用户 2026-11-20）：在 Mac 上跑 `./run.sh lan`，把打印出来的内网地址发给他；这个服务留着给他测，他说测完了再关。
