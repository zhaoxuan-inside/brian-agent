# ADR-007 全后端统一五参签名 + AopProxy AOP

> 状态:accepted　日期:2026-09-26(反向登记;对应 hs-project-skill 五段签名)

## 背景
系统观测(计时/日志/trace)需统一收口,禁止业务手写埋点。

## 决策
方法统一 `(input, output, context, metrics?, report?)`,基类 Base/shared/base/(Input/Output/Context/Metrics/Report/BusinessEvent);Access 层经 AopProxy.wrap 统一织入进出入计时与日志;trace_id 贯穿三库。
与 hs-project-skill 五段 `boolean m(input, output, context, metrics, evolution)` 的映射:input/output/context/metrics 同名同义;evolution 职责由 Output.error/error_code + Report 承担;返回值以 Output 对象承载业务结果(等价于 boolean+output 合并)。

## 备选方案
| 方案 | 未选原因 |
|---|---|
| 逐点手写埋点 | 口径漂移、不可维护 |

## 后果
- 正面:观测口径统一;签名可被 scripts/generate-method-index.mjs 静态提取(2942 方法)。
- 负面:切面仅覆盖 Access 入口,Service 内部长段需手动开 span。
