"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureIndex = exports.ensureColumn = exports.newPatch = exports.newRecord = exports.toDataObject = exports.VisualScope = exports.OperationType = exports.Direction = exports.Logic = exports.Operator = void 0;
/**
 * @fileoverview 查询对象统一导出。
 */
var QueryObjects_1 = require("./QueryObjects");
Object.defineProperty(exports, "Operator", { enumerable: true, get: function () { return QueryObjects_1.Operator; } });
Object.defineProperty(exports, "Logic", { enumerable: true, get: function () { return QueryObjects_1.Logic; } });
Object.defineProperty(exports, "Direction", { enumerable: true, get: function () { return QueryObjects_1.Direction; } });
Object.defineProperty(exports, "OperationType", { enumerable: true, get: function () { return QueryObjects_1.OperationType; } });
Object.defineProperty(exports, "VisualScope", { enumerable: true, get: function () { return QueryObjects_1.VisualScope; } });
var RecordBuilder_1 = require("./RecordBuilder");
Object.defineProperty(exports, "toDataObject", { enumerable: true, get: function () { return RecordBuilder_1.toDataObject; } });
Object.defineProperty(exports, "newRecord", { enumerable: true, get: function () { return RecordBuilder_1.newRecord; } });
Object.defineProperty(exports, "newPatch", { enumerable: true, get: function () { return RecordBuilder_1.newPatch; } });
var SchemaHelpers_1 = require("./SchemaHelpers");
Object.defineProperty(exports, "ensureColumn", { enumerable: true, get: function () { return SchemaHelpers_1.ensureColumn; } });
Object.defineProperty(exports, "ensureIndex", { enumerable: true, get: function () { return SchemaHelpers_1.ensureIndex; } });
//# sourceMappingURL=index.js.map