# Stitch 第一轮导出交接

导入日期：2026-10-01。来源：`stitch_workout_log_mobile_ui.zip`。

## 导入结果

- 原始 ZIP 已复制至本目录，解压后的原始结构保存在 `raw/stitch_workout_log_mobile_ui/`。
- 共 24 份 `code.html`、24 个名为 `screen.png` 的文件，以及 1 份设计规范。
- ZIP CRC 校验通过；原始 ZIP 的 SHA-256：`9488ff65377f9ec15550b23958103aa9a40872924ec3109ade0ab61f2708cef6`。
- 原始文件保持不变，未覆盖前端代码。原始 HTML 和示例脚本不直接执行；对应核心设计已拆分为 React 组件，见 [前端说明](../../../../frontend/FITNESS_FRONTEND.md)。
- 23 张截图可解码；`_17/screen.png` 实际是 28 字节错误文本 `<FIFE Image failed to fetch>`，不是图片，但对应 HTML 完整保留。
- `_13` 的 HTML 主体只有空容器，截图也为空白，不能作为完整训练页参考。
- `manifest.json` 提供页面索引、文件大小、图像状态和导入校验记录。

## 页面索引

以下名称根据实际 HTML 和截图整理；编号仅对应导出文件夹，不代表新增的 24 个业务页面。

### 核心页面

- `_1`：[训练首页 HTML](raw/stitch_workout_log_mobile_ui/_1/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_1/screen.png)。
- `_2`：[计划详情 HTML](raw/stitch_workout_log_mobile_ui/_2/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_2/screen.png)。
- `_3`：[历史记录 HTML](raw/stitch_workout_log_mobile_ui/_3/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_3/screen.png)。
- `_4`：[我的 HTML](raw/stitch_workout_log_mobile_ui/_4/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_4/screen.png)。
- `_5`：[基础训练进行中 HTML](raw/stitch_workout_log_mobile_ui/_5/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_5/screen.png)。
- `_6`：[计划编辑 HTML](raw/stitch_workout_log_mobile_ui/_6/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_6/screen.png)。
- `_7`：[动作选择 HTML](raw/stitch_workout_log_mobile_ui/_7/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_7/screen.png)。
- `_8`：[训练总结 HTML](raw/stitch_workout_log_mobile_ui/_8/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_8/screen.png)。
- `_9`：[历史详情与补录 HTML](raw/stitch_workout_log_mobile_ui/_9/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_9/screen.png)。
- `_10`：[身体记录与照片上传 HTML](raw/stitch_workout_log_mobile_ui/_10/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_10/screen.png)。
- `_11`：[照片对比 HTML](raw/stitch_workout_log_mobile_ui/_11/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_11/screen.png)。
- `_12`：[登录注册 HTML](raw/stitch_workout_log_mobile_ui/_12/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_12/screen.png)。

### 训练状态与扩展设计

- `_13`：[训练页空白导出](raw/stitch_workout_log_mobile_ui/_13/code.html)，排除为视觉参考。
- `_14`：[训练录入与数字键盘 HTML](raw/stitch_workout_log_mobile_ui/_14/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_14/screen.png)。
- `_15`：[训练录入与休息倒计时 HTML](raw/stitch_workout_log_mobile_ui/_15/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_15/screen.png)。
- `_16`：[休息提醒设置 HTML](raw/stitch_workout_log_mobile_ui/_16/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_16/screen.png)。
- `_17`：[动作替换面板 HTML](raw/stitch_workout_log_mobile_ui/_17/code.html)。截图导出失败。
- `_18`：[替换后训练状态 HTML](raw/stitch_workout_log_mobile_ui/_18/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_18/screen.png)。
- `_19`：[结束或放弃确认 HTML](raw/stitch_workout_log_mobile_ui/_19/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_19/screen.png)。
- `_20`：[历史筛选空状态 HTML](raw/stitch_workout_log_mobile_ui/_20/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_20/screen.png)。
- `_21`：[恢复草稿 HTML](raw/stitch_workout_log_mobile_ui/_21/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_21/screen.png)。
- `_22`：[补录编辑 HTML](raw/stitch_workout_log_mobile_ui/_22/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_22/screen.png)。
- `_23`：[计划模板库 HTML](raw/stitch_workout_log_mobile_ui/_23/code.html)、[截图](raw/stitch_workout_log_mobile_ui/_23/screen.png)。
- `pr`：[动作详情 HTML](raw/stitch_workout_log_mobile_ui/pr/code.html)、[截图](raw/stitch_workout_log_mobile_ui/pr/screen.png)。

设计规范：[Calm Utility Editorial](raw/stitch_workout_log_mobile_ui/calm_utility_editorial/DESIGN.md)。

## 接入建议

1. 首先适配 `_1`、`_2`、`_3`、`_4` 的四项主导航和 `_5` 的基础训练记录结构。
2. 将 `_14` 的紧凑录入、上次数据和键盘避让用作训练页优化参考；`_15` 为休息状态参考，不生成多个互相割裂的训练页。
3. 使用 `_6`、`_7`、`_8`、`_9` 和 `_22` 打通计划、动作选择、训练完成及补录。
4. 接入 `_10`、`_11` 的身体记录和照片；`_12` 对接现有邮箱登录与注册。
5. `_19` 和 `_21` 分别作为同一训练流程的确认与草稿恢复状态；`_20` 只采用筛选空状态；`_23` 作为个人模板列表参考。
6. 组间休息提醒和 `pr` 的动作说明可以后续补充，不因设计出现而扩大首版范围。

## 落地时需要统一或修正

- **中文与导航**：部分标题为 Training、Plans、Active Workout 等；部分后续页面变为 Routines/Log/Exercises/Metrics/Settings 五项导航。产品页面统一中文“训练、计划、记录、我的”，独立页面使用返回导航。
- **色彩**：早期页面与设计 YAML 使用 `#EDFEF0` 淡绿背景和 `#005E3A` 主色，设计正文及 `_14/_15` 使用原定 `#F4F6F5`、`#18784E`。接入以根目录 DESIGN.md 的白/浅灰/绿规则统一，不直接覆盖为两套主题。
- **训练页**：不同版本有表格、步进输入、键盘和计时状态。实现一个可复用训练页，展示一致的组、上次数据、备注和保存状态。
- **照片素材**：导出含远程示例照片，不应作为真实用户的体态记录；默认显示用户上传或中性占位。无需下载远程照片来补齐导出。
- **样例统计**：导出日期、组数、训练量、个人最好、身体数值均是样例；未录入数据不补造统计。肌群激活百分比和替换动作的重量自动换算未有项目依据，首版不当作有效建议或自动修改数据。
- **完成状态**：`_8` 同时展示“已生成打卡”和“保存并完成打卡”，还有草稿按钮；真实实现先确认保存成功，再显示完成，不混淆草稿和已打卡。
- **草稿与放弃**：保存/返回不清理草稿；放弃需要确认并只处理当前训练。导出的 `history.back()`、静态提示或演示按钮不代替真实业务。
- **系统键盘**：数字键盘属于输入状态参考，React 网页优先用原生 `inputmode` 和布局避让，不把图片/模拟键盘当系统键盘。
- **可访问性与尺寸**：导出有禁止缩放的 viewport 配置及部分较小操作；实现允许网页缩放，验证小屏文字、44px 触控目标和安全区域。
- **依赖与资源**：HTML 使用 Tailwind CDN、Google 字体和 Material Symbols；项目继续用本地构建 Tailwind、现有组件及 Lucide 图标，避免运行时 CDN 配置与现有样式体系混用。
- **设计规范中的不一致**：“4 列”描述实际列出了 5 个字段，训练表格需根据手机尺寸合并或调整布局，不能机械照抄。

## 当前验证边界

已完成 ZIP CRC 校验、原始文件导入、图像解码检查、截图查看及 HTML/样式静态检查。未执行导出页面脚本、未接真实接口、未完成浏览器或微信真机验收。

原始导出已足够用于后续 React 适配。空白 `_13` 可由完整训练页替代；`_17` 缺图不会阻断接口与组件开发，若希望保留该面板的精确视觉，可后续从 Stitch 补导截图。
