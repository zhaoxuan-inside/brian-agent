"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyHandleResult = exports.DEFAULT_HANDLE_RESULT_TYPE = exports.HandleResultType = exports.ContextSource = exports.CollectionSource = exports.InfoType = exports.Report = exports.Metrics = exports.Output = exports.Context = exports.Input = void 0;
/**
 * @fileoverview 基础类与全局枚举统一导出。
 */
var Input_1 = require("./Input");
Object.defineProperty(exports, "Input", { enumerable: true, get: function () { return Input_1.Input; } });
var Context_1 = require("./Context");
Object.defineProperty(exports, "Context", { enumerable: true, get: function () { return Context_1.Context; } });
var Output_1 = require("./Output");
Object.defineProperty(exports, "Output", { enumerable: true, get: function () { return Output_1.Output; } });
var Metrics_1 = require("./Metrics");
Object.defineProperty(exports, "Metrics", { enumerable: true, get: function () { return Metrics_1.Metrics; } });
var Report_1 = require("./Report");
Object.defineProperty(exports, "Report", { enumerable: true, get: function () { return Report_1.Report; } });
var InfoEnums_1 = require("./InfoEnums");
Object.defineProperty(exports, "InfoType", { enumerable: true, get: function () { return InfoEnums_1.InfoType; } });
Object.defineProperty(exports, "CollectionSource", { enumerable: true, get: function () { return InfoEnums_1.CollectionSource; } });
Object.defineProperty(exports, "ContextSource", { enumerable: true, get: function () { return InfoEnums_1.ContextSource; } });
Object.defineProperty(exports, "HandleResultType", { enumerable: true, get: function () { return InfoEnums_1.HandleResultType; } });
Object.defineProperty(exports, "DEFAULT_HANDLE_RESULT_TYPE", { enumerable: true, get: function () { return InfoEnums_1.DEFAULT_HANDLE_RESULT_TYPE; } });
Object.defineProperty(exports, "classifyHandleResult", { enumerable: true, get: function () { return InfoEnums_1.classifyHandleResult; } });
//# sourceMappingURL=index.js.map