# 泡泡海湾（代号 fishsort）

竖屏休闲消除手游：把困在气泡里的小鱼按种类送回鱼缸。目标平台：微信小游戏、抖音小游戏；v0 只做小游戏，Google Play（Android）放到之后，APP 才做的功能记在 `docs/07`。

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

文档是唯一事实来源：改规则或数值时，先改文档再改代码，同一次提交里完成。

## 分工

- **Claude**：全部代码、配置表、关卡工具、文档。
- **Codex**：全部位图美术（鱼、UI、场景、图标）。Claude 在 `art/briefs/` 写出图需求，Codex 产出到 `art/raw/`，流程见 `docs/03-美术规范.md`。
- **用户**：美术方向与界面验收、平台账号与资质、上架提交。

## 硬性约束

1. **原创**：本作只借鉴「气泡取鱼 + 三消装缸」这一品类玩法。名称、鱼的造型与名字、图标、界面布局、场景画面一律原创，不得照着任何现有游戏的截图临摹或让 Codex 以其为参考图。
2. **引擎**：Godot 4.7.x + GDScript（全量静态类型），Compatibility 渲染器。不用 C#（Web 导出不支持）。
3. **分层**：`src/core/` 是纯逻辑，只继承 `RefCounted`，禁止碰 `Node`、autoload、文件、时间、全局随机函数。
4. **平台隔离**：`JavaScriptBridge`（`wx` / `tt`）与安卓插件调用只允许出现在 `src/platform/`，其它代码走 `Platform` 接口，按能力而不是按平台 id 分支。
5. **数值不进代码**：关卡、鱼种、经济、广告频控全部放 `config/` 的 JSON。
6. **文案不进代码**：所有玩家可见文字走 `tr()`，翻译在 `i18n/`（`zh_CN`、`en`）。
7. **关卡必须可解**：进包的关卡都要过 `tools/level` 的校验器。
8. **v1.0 无自建服务器**：存档本地 + 平台云存档，排行榜用平台能力。
9. **国内小游戏 v1.0 只做广告变现**，不接内购（内购需要版号）。内购只在 Google Play 版本开启。
10. **测试与 CI 从简**：只给 `src/core` 的规则、生成器和存档迁移写测试；界面、服务、平台层不写单测。CI 只有一条 PR 流水线，三分钟内跑完，不加构建矩阵、覆盖率、界面自动化。细则见 `docs/05` 第 3、4 节，不要自行加码。
11. **Godot 上小游戏是未验证的风险**：见 `docs/04` 第 2 节。M0 验证通过前，不投入小游戏平台专属功能的开发。

## 项目管理

GitHub 仓库 `crazyniu/fishsort`：issue 记任务，milestone 对应 `docs/07` 的 M0–M6，PR 关联 issue 后 squash 合并。约定见 `docs/05` 第 5 节。

## 开发流程

界面先行：**每个界面先写 `docs/ux/` 规格并经用户确认（见 `docs/08`）** → 美术方向确认 → 每个界面用假数据做出可点击、带动效的外壳并由用户验收 → 再接入 `src/core` 逻辑。未验收的界面不接逻辑。外壳完成后按 `docs/08` 第 3 节清单截图审查。

## 常用命令

统一入口是根目录的 `run.sh`，不另建 Makefile。新增命令加到 `run.sh` 里。

```bash
./run.sh                       # 启动游戏试玩（金币、生命、技能已加满）
FISHSORT_LEVEL=65 ./run.sh      # 同上，并直接跳到第 65 关（截图、验收用）
FISHSORT_AUTOPLAY=1 ./run.sh   # 同上，局内由机器人代打（看结算、宝箱等画面用）
./run.sh real                  # 按真实存档进度试玩
./run.sh editor                # 打开 Godot 编辑器
./run.sh test                  # src/core 单元测试（headless）
./run.sh lint                  # gdlint + gdformat --check
./run.sh check                 # lint + test，与 CI 相同
./run.sh level-gen             # 生成关卡
./run.sh level-verify          # 全量关卡校验（慢，本地或发版前跑）
./run.sh level-verify-changed  # 只校验改动的关卡（CI 用）
```

Godot 可执行文件由 `run.sh` 自动查找：`GODOT` 环境变量 → PATH → macOS 的 `/Applications/Godot*.app`。用户在 macOS 上试玩，开发机与 CI 是 Linux。

## 测试环境分工（硬性）

12. **Linux 开发机只写代码，不跑 Godot / Blender**：试玩、截图、界面验收、`./run.sh` 的各命令、Blender 出图或导出，一律去用户的 Mac 上做。Claude 用 `orca` CLI 驱动 Orca 环境 `Mac-Image-Worker`（仓库 `/Users/apple/Documents/projects/fishsort`，Godot 在 `/Applications/Godot.app`），不需要用户手动操作。
13. **代码同步只走 git**：Linux 上提交并推送，Mac 上 `git pull --ff-only`。Mac 看不到未推送的改动。在 Mac 上除 git 同步和 `./run.sh` 外不改文件、不装软件，不碰 `game` 等其它项目。
14. 开终端、读输出、取运行画面、操作界面、收尾清理的具体命令见 `docs/05` 第 9 节。测完关掉自己开的终端并结束试玩进程。
