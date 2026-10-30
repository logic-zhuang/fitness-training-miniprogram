# 训练手记项目工作说明

用户已将项目方向改为个人健身记录，后续扩展微信小程序和知识库 Agent。总体说明见 instruction.md，设计见 DESIGN.md，接口与持久化见 docs/FITNESS_SYNC.md。

- 保留 React、FastAPI、PostgreSQL 架构与登录功能，手机优先、浅色、绿色强调。
- 登录后的健身记录来自真实接口，体验页明确标记示例。登录照片通过本人接口保存到账号，体验照片仍在本机；详见 docs/FITNESS_PHOTOS.md。
- 所有模型和请求 Schema 位于 backend/app/models.py，数据库操作位于 crud.py，路由保持简洁。
- API 更新后生成客户端；不得手改 frontend/src/client/*.gen.ts 和 routeTree.gen.ts。
- 数据归属由登录身份确定；保存使用版本校验、事务和幂等回执，保护历史快照。
- 保留完整迁移历史及历史数据库数据，不恢复旧预约/报修的业务入口。
- 修改前检查 Git 状态，保护未提交工作，凭据和数据库文件不得提交。
- Python 使用 Ruff/Mypy，前端使用 Biome/TypeScript。数据库测试只使用独立测试库。
- 以中文说明改了哪里、实际验证结果及待完成范围。
