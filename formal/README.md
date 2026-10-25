# formal/ — android-phone-mcp 最小 TLA+ Spec

## 建模什么

对应产品约束（见仓库 README / `PhoneSession` / `phone_*` tools）：

1. **单设备**：由 `ANDROID_SERIAL` 或 `phone_connect(device=…)` 选定一台 ADB 设备。
2. **操作**：`connect` / `observe` / `tap` / `swipe` / `type` / `key` / `launch` 抽象为 `Op`。
3. **排他**：同一 serial 上至多一个 in-flight ADB op；忙则 reject（`busy`），未连接则 reject（`disconnected`）。模型用 reject 而非真实队列，保持 Spec 小。

> 说明：当前实现主要是串行 await 单次工具调用；本 Spec 描述**期望的安全属性**（并发客户端/重叠调用时仍应成立），便于后续加锁或队列时对照。

## 不变量（产品语义）

| 不变量 | 含义 |
| --- | --- |
| `Inv_AtMostOneInflight` | 同一 serial 不会有两个并发 ADB op |
| `Inv_DisconnectedImpliesIdle` | 断开时不能有 in-flight op |
| `Inv_InflightImpliesConnected` | 有 in-flight 时设备必须已连接 |
| `Inv_RejectReason` | 拒绝原因仅 `busy` / `disconnected` / `ok` |
| `TypeOK` | 状态类型正确 |

## 如何跑 TLC

```bash
java -cp tla2tools.jar tlc2.TLC -config Spec.cfg Spec.tla
```

当前 CI / 本 box **未安装 TLC**；Spec 为纯 TLA+。

## 范围

不建模 uiautomator dump、坐标、多 serial 选择逻辑细节。只覆盖 **单 serial 排他** 与 **断开时禁止 op**。
