# Stitch 设计导出

此目录保留用户选定的原始设计，后续用于现有 React 前端实现。

已导入：`stitch_workout_log_mobile_ui.zip`。页面索引、文件异常和接入说明见 [round-01/NOTES.md](round-01/NOTES.md)。本轮原始解压结构位于 `round-01/raw/`，未为了示例目录结构重命名导出文件。

推荐按轮次保存，以下为整理结构示例；实际已导入文件以本轮 NOTES.md 为准：

```text
docs/design/stitch/
  README.md
  round-01/
    NOTES.md           所选方案、已确认页面、待调整点和导出日期
    DESIGN.md          Stitch 导出的设计规范（如果提供）
    screens/           页面截图（按页面命名）
    code/              前端代码和样式（保留实际导出结构）
    assets/            图标、图片等资源（如果提供）
  round-02/
    ...
```

- 首轮页面建议命名 home、plan-detail、workout-active、history、profile，便于对应项目根目录 DESIGN.md。
- 原始 ZIP 可保留在轮次目录；解压后也保留导出文件名，必要时在 NOTES.md 写页面映射。
- 工具没有导出某类文件时，保留已有截图或代码即可，不创建假文件。
- 不把导出的包配置、路由或登录实现直接覆盖到现有项目；实现时由开发协作适配组件和业务。
- 用户确认后的变更同步到根目录 DESIGN.md；根目录 instruction.md 决定功能范围。
