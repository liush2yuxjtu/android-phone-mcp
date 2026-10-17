## 改了什么

<!-- 简述本 PR 改动 -->

## 为什么

<!-- 动机 / 背景 -->

## Verify 报告

> **必填。** 合并门槛：verify 报告 PASS 才合并（替代 CI）。

| 字段 | 内容 |
| --- | --- |
| verify skill 路径 | `.cursor/skills/verify/SKILL.md` |
| 运行所在 commit SHA | <!-- 填写完整 SHA --> |
| 执行的命令 | <!-- 列出实际跑过的命令 --> |

### 检查结果

| 检查 | 结果 | 说明 / 关键输出摘录或 artifact 链接 |
| --- | --- | --- |
| package (`npm test && npm run build`) | ✅ / ❌ / ⏭️ | |
| adb_mcp | ✅ / ❌ / ⏭️ | |
| qr_camera | ✅ / ❌ / ⏭️ | |

**结论：** PASS / FAIL / BLOCKED

## 风险与回滚

<!-- 风险、影响面、如何回滚 -->

## 合并门槛

verify 报告 PASS 才合并（替代 CI）
