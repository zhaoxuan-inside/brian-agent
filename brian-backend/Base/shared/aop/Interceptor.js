"use strict";
/**
 * @fileoverview AOP 拦截器接口定义。
 *
 * 定义四个切入点：两个在方法执行前，两个在方法执行后。
 * 所有组件的方法都通过 AopProxy 代理，支持注入多个拦截器。
 *
 * 切入点执行顺序：
 * 1. beforeExecute（方法执行前 #1）：方法调用最开始的钩子
 * 2. preExecute（方法执行前 #2）：方法实际执行前的钩子
 * 3. [方法执行]
 * 4. postExecute（方法执行后 #1）：方法成功返回后的钩子
 * 5. afterExecute（方法执行后 #2）：方法执行完成后的钩子（无论成功或失败）
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=Interceptor.js.map