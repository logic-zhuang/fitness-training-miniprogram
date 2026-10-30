# 训练手记 · 健身打卡微信小程序

一个以 **AI 协作开发工作流** 为核心的个人全栈项目：从产品文档、前端设计到后端实现、自动化测试、人工验收，每个环节都有真实产物可追溯。

- **前端**：原生微信小程序（训练 / 计划 / 历史 / 我的，训练手记闭环）
- **后端**：FastAPI + PostgreSQL + SQLModel + Alembic
- **制作方式**：ChatGPT 写设计与说明文档 → 提示词 + Google Stitch 生成前端 → Agent 按全局约束文档实现后端与数据库 → Agent 自动测试并修复 → 人工真机验收

## 制作工作流

```
① 设计文档      ② 前端（Stitch）      ③ 后端（Agent）        ④ 自动测试            ⑤ 人工验收
ChatGPT 写    提示词 + Google     Agent 按            Agent 运行集成/     真机体验、
产品/交互/     Stitch 生成高       instruction.md     回归测试、Playwright  锁屏恢复、
说明文档       保真页面并导出       设计后端与数据库    界面模拟并修复       微信登录联调
```

### ① 设计文档（ChatGPT）
| 文档 | 内容 |
|------|------|
| [FITNESS_PRODUCT_PLAN.md](FITNESS_PRODUCT_PLAN.md) | 产品定位与范围（私人健身记录工具） |
| [DESIGN.md](DESIGN.md) | UI 与交互设计（白底、深色文字、绿色强调） |
| [docs/design/FITNESS_DAILY_FLOW.md](docs/design/FITNESS_DAILY_FLOW.md) | 每日训练闭环业务规格 |
| [docs/design/FITNESS_NEXT_ITERATION.md](docs/design/FITNESS_NEXT_ITERATION.md) | 迭代数据与交互规格 |

### ② 前端（提示词 + Google Stitch）
- [docs/design/STITCH_PROMPT.md](docs/design/STITCH_PROMPT.md)：两轮完整提示词（统一视觉 / 计划编辑、总结、照片）
- [docs/stitch/round-01/](docs/stitch/round-01/)：Stitch 导出的 24 页高保真设计稿（screen.png）与交接说明
- [miniprogram/](miniprogram/)：按设计稿实现的原生微信小程序

### ③ 后端与数据库（Agent 按全局约束实现）
- [docs/instruction.md](docs/instruction.md)：项目总体说明与**必须遵守的业务规则**（Agent 实现后端的全局约束）
- 技术栈：FastAPI、PostgreSQL、SQLModel、Alembic；接口 /api/v1/fitness/state 原子读写、版本快照与幂等保存

### ④ 自动化测试（Agent 编写并运行）
- [miniprogram-tests/](miniprogram-tests/)：8 个测试文件（后端集成、身体地图、照片、计划进度回归、计划保存、运行时、周看板、工作流）
- [screenshots/](screenshots/)：Playwright 真机模拟截图（320px / 430px 两档，覆盖周计划、总结、训练手记、提交等）
- [docs/FITNESS_V2_ACCEPTANCE.md](docs/FITNESS_V2_ACCEPTANCE.md)、[docs/FITNESS_V3_ACCEPTANCE.md](docs/FITNESS_V3_ACCEPTANCE.md)：两轮验收记录

### ⑤ 人工真机验收
训练闭环 v3：每周安排 → 逐动作记录（重量/次数/时长）→ 动作完成回顾 → 提交训练 → 科学总结 → 照片日志；锁屏/后台恢复计时、草稿保留、跨周不自动补上周。

## 仓库结构

```
├── miniprogram/            # 原生微信小程序（训练/计划/历史/我的 + 身体地图/动作选择器）
├── miniprogram-tests/      # 小程序集成与回归测试（8 个）
├── screenshots/            # Playwright 界面模拟截图（320/430 两档）
├── docs/
│   ├── instruction.md      # 全局约束：业务规则 / 接口 / 保存语义
│   ├── DESIGN.md           # UI 与交互设计
│   ├── FITNESS_PRODUCT_PLAN.md
│   ├── design/             # 业务规格 + Stitch 提示词 + 设计稿（round-01）
│   ├── implementation/     # 页面实现对照图
│   ├── verification/       # 验收截图
│   ├── FITNESS_V2_ACCEPTANCE.md / FITNESS_V3_ACCEPTANCE.md
│   └── ...
└── README.md
```

## 技术栈

- **小程序**：原生微信小程序（WXML / WXSS / JavaScript）
- **后端**：FastAPI + PostgreSQL + SQLModel + Alembic（同一业务规则也应用于 React 网页版）
- **测试**：miniprogram-tests（集成/回归）、Playwright（界面模拟截图）

## 状态说明

- 训练闭环 v3 已实现，通过 85 项自动检查与两轮验收；照片日期日志、微信登录接口已入代码
- **未完成**：真实微信登录、手机真机体验联调、正式发布（需小程序后台备案的 HTTPS 服务地址）
- 开发地址配置：复制 `miniprogram/config.example.js` 为 `miniprogram/config.js`，填入电脑局域网 IP

## 隐私说明

本仓库**已剔除所有密钥与本地环境信息**：`.env`（含微信 AppSecret、数据库密码等）、局域网地址、本地开发路径均不包含。请勿提交真实 `config.js`、`.env` 或数据库文件。
