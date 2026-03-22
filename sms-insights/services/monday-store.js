"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertMondayBookedCallPush = exports.getMondayBookedCallPush = exports.getMondayWeeklyReport = exports.upsertMondayWeeklyReport = exports.getLatestMondaySyncStatus = exports.listMondayCallSnapshotsInRange = exports.purgeMondayNormalizedRowsForNonFunnelBoards = exports.upsertMondayMetricFacts = exports.upsertNormalizedMondayLeadRecords = exports.upsertMondayCallColumnValues = exports.upsertMondayCallSnapshot = exports.deleteMondayCallSnapshots = exports.getMondayColumnMapping = exports.saveMondayColumnMapping = exports.upsertMondaySyncState = exports.listMondayActorDirectory = exports.listMondayBoardRegistry = exports.listPendingMondayBookedCallPushes = exports.upsertMondayBoardRegistry = exports.getMondayBoardRegistry = exports.getMondaySyncState = void 0;
var prisma_js_1 = require("./prisma.js");
var getPrisma = function () { return (0, prisma_js_1.getPrismaClient)(); };
// getDb and getPool removal; using getPrisma instead.
var normalizeText = function (value) {
    if (!value)
        return null;
    var trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
var normalizeForMatch = function (value) {
    return (value || "").trim().toLowerCase();
};
var parseIsoDate = function (candidate) {
    var text = normalizeText(candidate);
    if (!text)
        return null;
    var direct = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (direct === null || direct === void 0 ? void 0 : direct[1])
        return direct[1];
    var parsed = new Date(text);
    if (!Number.isFinite(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
};
var toPrismaDate = function (candidate) {
    var isoDate = parseIsoDate(candidate);
    if (!isoDate)
        return null;
    // Prisma @db.Date expects a Date object, but Postgres stores only the date part.
    // We use noon UTC to avoid timezone shifts during string conversion.
    var parsed = new Date("".concat(isoDate, "T12:00:00.000Z"));
    if (!Number.isFinite(parsed.getTime()))
        return null;
    return parsed;
};
var parseNumericMetric = function (value) {
    var text = normalizeText(value);
    if (!text)
        return null;
    var normalized = text
        .replace(/,/g, "")
        .replace(/\$/g, "")
        .replace(/%/g, "")
        .trim();
    if (!normalized)
        return null;
    if (!/^-?\d+(\.\d+)?$/.test(normalized))
        return null;
    var numeric = Number.parseFloat(normalized);
    return Number.isFinite(numeric) ? numeric : null;
};
var parseDateFromColumn = function (column) {
    var _a;
    if (!column)
        return null;
    var fromText = parseIsoDate((_a = column.textValue) !== null && _a !== void 0 ? _a : null);
    if (fromText)
        return fromText;
    if (!column.valueJson || typeof column.valueJson !== "object")
        return null;
    var payload = column.valueJson;
    var fromDate = typeof payload.date === "string" ? parseIsoDate(payload.date) : null;
    if (fromDate)
        return fromDate;
    var fromChangedAt = typeof payload.changed_at === "string"
        ? parseIsoDate(payload.changed_at)
        : null;
    if (fromChangedAt)
        return fromChangedAt;
    return null;
};
var findColumnBySignals = function (columns, signals) {
    var normalizedSignals = signals.map(function (signal) { return signal.toLowerCase(); });
    var _loop_1 = function (column) {
        var haystack = "".concat(normalizeForMatch(column.columnTitle), " ").concat(normalizeForMatch(column.columnId), " ").concat(normalizeForMatch(column.columnType));
        if (normalizedSignals.some(function (signal) { return haystack.includes(signal); })) {
            return { value: column };
        }
    };
    for (var _i = 0, columns_1 = columns; _i < columns_1.length; _i++) {
        var column = columns_1[_i];
        var state_1 = _loop_1(column);
        if (typeof state_1 === "object")
            return state_1.value;
    }
    return null;
};
var findTextBySignals = function (columns, signals) {
    var _a, _b;
    return normalizeText((_b = (_a = findColumnBySignals(columns, signals)) === null || _a === void 0 ? void 0 : _a.textValue) !== null && _b !== void 0 ? _b : null);
};
var classifyOutcomeCategory = function (stage, outcomeLabel, outcomeReason, disposition, isBooked) {
    var text = "".concat(stage || "", " ").concat(outcomeLabel || "", " ").concat(outcomeReason || "").toLowerCase();
    if (/\bbad timing\b/.test(text))
        return "bad_timing";
    if (/\bbad fit\b/.test(text))
        return "bad_fit";
    if (/\bclosed won\b|\bwon\b|\bsale\b|\bsigned\b|\benrolled\b/.test(text))
        return "closed_won";
    if (/\bclosed lost\b|\blost\b/.test(text))
        return "closed_lost";
    if (disposition === "no_show" || /\bno[\s-]?show\b/.test(text))
        return "no_show";
    if (disposition === "cancelled" ||
        /\bcancel|cancelled|canceled|resched/i.test(text))
        return "cancelled";
    if (disposition === "booked" ||
        isBooked ||
        /\bbooked|appointment|strategy call\b/.test(text))
        return "booked";
    if (!text.trim())
        return "unknown";
    return "other";
};
var getMondaySyncState = function (boardId, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, result, error_1;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_sync_state.findUnique({
                        where: { board_id: boardId },
                    })];
            case 2:
                result = _b.sent();
                return [2 /*return*/, result];
            case 3:
                error_1 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to read monday sync state", error_1);
                return [2 /*return*/, null];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.getMondaySyncState = getMondaySyncState;
var getMondayBoardRegistry = function (boardId, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, result, error_2;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_board_registry.findUnique({
                        where: { board_id: boardId },
                    })];
            case 2:
                result = _b.sent();
                return [2 /*return*/, result];
            case 3:
                error_2 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to read monday board registry row", error_2);
                return [2 /*return*/, null];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.getMondayBoardRegistry = getMondayBoardRegistry;
var upsertMondayBoardRegistry = function (params, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, error_3;
    var _a, _b, _c, _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                prisma = getPrisma();
                _f.label = 1;
            case 1:
                _f.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_board_registry.upsert({
                        where: { board_id: params.boardId },
                        update: {
                            board_label: params.boardLabel,
                            board_class: params.boardClass,
                            metric_grain: params.metricGrain,
                            include_in_funnel: params.includeInFunnel === true,
                            include_in_exec: params.includeInExec === true,
                            active: params.active !== false,
                            owner_team: (_a = params.ownerTeam) !== null && _a !== void 0 ? _a : null,
                            notes: (_b = params.notes) !== null && _b !== void 0 ? _b : null,
                            updated_at: new Date(),
                        },
                        create: {
                            board_id: params.boardId,
                            board_label: params.boardLabel,
                            board_class: params.boardClass,
                            metric_grain: params.metricGrain,
                            include_in_funnel: params.includeInFunnel === true,
                            include_in_exec: params.includeInExec === true,
                            active: params.active !== false,
                            owner_team: (_c = params.ownerTeam) !== null && _c !== void 0 ? _c : null,
                            notes: (_d = params.notes) !== null && _d !== void 0 ? _d : null,
                            updated_at: new Date(),
                        },
                    })];
            case 2:
                _f.sent();
                return [3 /*break*/, 4];
            case 3:
                error_3 = _f.sent();
                (_e = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _e === void 0 ? void 0 : _e.call(logger, "Failed to upsert monday board registry row", error_3);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.upsertMondayBoardRegistry = upsertMondayBoardRegistry;
var listPendingMondayBookedCallPushes = function (logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, result, error_4;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_booked_call_pushes.findMany({
                        where: { status: "pending" },
                        orderBy: { updated_at: "asc" },
                    })];
            case 2:
                result = _b.sent();
                return [2 /*return*/, result];
            case 3:
                error_4 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to list pending monday booked call pushes", error_4);
                return [2 /*return*/, []];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.listPendingMondayBookedCallPushes = listPendingMondayBookedCallPushes;
var listMondayBoardRegistry = function (logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, result, error_5;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_board_registry.findMany({
                        orderBy: [{ board_label: "asc" }, { board_id: "asc" }],
                    })];
            case 2:
                result = _b.sent();
                return [2 /*return*/, result];
            case 3:
                error_5 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to list monday board registry", error_5);
                return [2 /*return*/, []];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.listMondayBoardRegistry = listMondayBoardRegistry;
var listMondayActorDirectory = function (logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, result, error_6;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.actor_directory.findMany({
                        where: { active: true },
                        orderBy: [{ role: "asc" }, { canonical_name: "asc" }],
                    })];
            case 2:
                result = _b.sent();
                return [2 /*return*/, result];
            case 3:
                error_6 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to list actor directory", error_6);
                return [2 /*return*/, []];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.listMondayActorDirectory = listMondayActorDirectory;
var upsertMondaySyncState = function (params, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, error_7;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    return __generator(this, function (_k) {
        switch (_k.label) {
            case 0:
                prisma = getPrisma();
                _k.label = 1;
            case 1:
                _k.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_sync_state.upsert({
                        where: { board_id: params.boardId },
                        update: {
                            cursor: (_a = params.cursor) !== null && _a !== void 0 ? _a : null,
                            last_sync_at: (_b = params.lastSyncAt) !== null && _b !== void 0 ? _b : null,
                            status: (_c = params.status) !== null && _c !== void 0 ? _c : null,
                            error: (_d = params.error) !== null && _d !== void 0 ? _d : null,
                            updated_at: new Date(),
                        },
                        create: {
                            board_id: params.boardId,
                            cursor: (_e = params.cursor) !== null && _e !== void 0 ? _e : null,
                            last_sync_at: (_f = params.lastSyncAt) !== null && _f !== void 0 ? _f : null,
                            status: (_g = params.status) !== null && _g !== void 0 ? _g : null,
                            error: (_h = params.error) !== null && _h !== void 0 ? _h : null,
                            updated_at: new Date(),
                        },
                    })];
            case 2:
                _k.sent();
                return [3 /*break*/, 4];
            case 3:
                error_7 = _k.sent();
                (_j = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _j === void 0 ? void 0 : _j.call(logger, "Failed to upsert monday sync state", error_7);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.upsertMondaySyncState = upsertMondaySyncState;
var saveMondayColumnMapping = function (boardId, mapping, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, error_8;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_column_mappings.upsert({
                        where: { board_id: boardId },
                        update: {
                            mapping_json: (mapping !== null && mapping !== void 0 ? mapping : {}),
                            updated_at: new Date(),
                        },
                        create: {
                            board_id: boardId,
                            mapping_json: (mapping !== null && mapping !== void 0 ? mapping : {}),
                            updated_at: new Date(),
                        },
                    })];
            case 2:
                _b.sent();
                return [3 /*break*/, 4];
            case 3:
                error_8 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to save monday column mapping", error_8);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.saveMondayColumnMapping = saveMondayColumnMapping;
var getMondayColumnMapping = function (boardId, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, result, error_9;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                prisma = getPrisma();
                _c.label = 1;
            case 1:
                _c.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_column_mappings.findUnique({
                        where: { board_id: boardId },
                        select: { mapping_json: true },
                    })];
            case 2:
                result = _c.sent();
                return [2 /*return*/, (_a = result === null || result === void 0 ? void 0 : result.mapping_json) !== null && _a !== void 0 ? _a : null];
            case 3:
                error_9 = _c.sent();
                (_b = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _b === void 0 ? void 0 : _b.call(logger, "Failed to read monday column mapping", error_9);
                return [2 /*return*/, null];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.getMondayColumnMapping = getMondayColumnMapping;
var deleteMondayCallSnapshots = function (boardId, itemIds, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, error_10;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                if (!itemIds.length)
                    return [2 /*return*/];
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_call_snapshots.deleteMany({
                        where: {
                            board_id: boardId,
                            item_id: { in: itemIds },
                        },
                    })];
            case 2:
                _b.sent();
                return [3 /*break*/, 4];
            case 3:
                error_10 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to delete monday call snapshots", error_10);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.deleteMondayCallSnapshots = deleteMondayCallSnapshots;
var upsertMondayCallSnapshot = function (input, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, callDate, error_11;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    return __generator(this, function (_p) {
        switch (_p.label) {
            case 0:
                prisma = getPrisma();
                callDate = toPrismaDate(input.callDate);
                _p.label = 1;
            case 1:
                _p.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_call_snapshots.upsert({
                        where: {
                            board_id_item_id: {
                                board_id: input.boardId,
                                item_id: input.itemId,
                            },
                        },
                        update: {
                            item_name: (_a = input.itemName) !== null && _a !== void 0 ? _a : null,
                            updated_at: input.updatedAt,
                            call_date: callDate,
                            setter: (_b = input.setter) !== null && _b !== void 0 ? _b : null,
                            stage: (_c = input.stage) !== null && _c !== void 0 ? _c : null,
                            disposition: (_d = input.disposition) !== null && _d !== void 0 ? _d : null,
                            is_booked: input.isBooked === true,
                            contact_key: (_e = input.contactKey) !== null && _e !== void 0 ? _e : null,
                            raw: ((_f = input.raw) !== null && _f !== void 0 ? _f : null),
                            synced_at: new Date(),
                        },
                        create: {
                            board_id: input.boardId,
                            item_id: input.itemId,
                            item_name: (_g = input.itemName) !== null && _g !== void 0 ? _g : null,
                            updated_at: input.updatedAt,
                            call_date: callDate,
                            setter: (_h = input.setter) !== null && _h !== void 0 ? _h : null,
                            stage: (_j = input.stage) !== null && _j !== void 0 ? _j : null,
                            disposition: (_k = input.disposition) !== null && _k !== void 0 ? _k : null,
                            is_booked: input.isBooked === true,
                            contact_key: (_l = input.contactKey) !== null && _l !== void 0 ? _l : null,
                            raw: ((_m = input.raw) !== null && _m !== void 0 ? _m : null),
                            synced_at: new Date(),
                        },
                    })];
            case 2:
                _p.sent();
                return [3 /*break*/, 4];
            case 3:
                error_11 = _p.sent();
                (_o = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _o === void 0 ? void 0 : _o.call(logger, "Failed to upsert monday call snapshot", error_11);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.upsertMondayCallSnapshot = upsertMondayCallSnapshot;
var upsertMondayCallColumnValues = function (input, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, payload, error_12;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                if (!input.values.length)
                    return [2 /*return*/];
                payload = input.values.map(function (value) {
                    var _a, _b, _c, _d;
                    return ({
                        column_id: value.columnId,
                        column_title: (_a = value.columnTitle) !== null && _a !== void 0 ? _a : null,
                        column_type: (_b = value.columnType) !== null && _b !== void 0 ? _b : null,
                        text_value: (_c = value.textValue) !== null && _c !== void 0 ? _c : null,
                        value_json: (_d = value.valueJson) !== null && _d !== void 0 ? _d : null,
                    });
                });
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.$transaction(function (tx) { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, tx.$queryRawUnsafe("\n        WITH incoming AS (\n          SELECT *\n          FROM jsonb_to_recordset($1::jsonb) AS t(\n            column_id TEXT,\n            column_title TEXT,\n            column_type TEXT,\n            text_value TEXT,\n            value_json JSONB\n          )\n        )\n        INSERT INTO monday_call_column_latest (\n          board_id,\n          item_id,\n          column_id,\n          column_title,\n          column_type,\n          text_value,\n          value_json,\n          item_updated_at,\n          synced_at\n        )\n        SELECT\n          $2,\n          $3,\n          incoming.column_id,\n          incoming.column_title,\n          incoming.column_type,\n          incoming.text_value,\n          incoming.value_json,\n          $4,\n          CURRENT_TIMESTAMP\n        FROM incoming\n        ON CONFLICT (board_id, item_id, column_id)\n        DO UPDATE SET\n          column_title = EXCLUDED.column_title,\n          column_type = EXCLUDED.column_type,\n          text_value = EXCLUDED.text_value,\n          value_json = EXCLUDED.value_json,\n          item_updated_at = EXCLUDED.item_updated_at,\n          synced_at = CURRENT_TIMESTAMP\n        ", JSON.stringify(payload), input.boardId, input.itemId, input.itemUpdatedAt)];
                                case 1:
                                    _a.sent();
                                    return [4 /*yield*/, tx.$queryRawUnsafe("\n        WITH incoming AS (\n          SELECT *\n          FROM jsonb_to_recordset($1::jsonb) AS t(\n            column_id TEXT,\n            column_title TEXT,\n            column_type TEXT,\n            text_value TEXT,\n            value_json JSONB\n          )\n        )\n        INSERT INTO monday_call_column_history (\n          board_id,\n          item_id,\n          column_id,\n          column_title,\n          column_type,\n          text_value,\n          value_json,\n          item_updated_at,\n          synced_at\n        )\n        SELECT\n          $2,\n          $3,\n          incoming.column_id,\n          incoming.column_title,\n          incoming.column_type,\n          incoming.text_value,\n          incoming.value_json,\n          $4,\n          CURRENT_TIMESTAMP\n        FROM incoming\n        ON CONFLICT (board_id, item_id, column_id, item_updated_at)\n        DO UPDATE SET\n          column_title = EXCLUDED.column_title,\n          column_type = EXCLUDED.column_type,\n          text_value = EXCLUDED.text_value,\n          value_json = EXCLUDED.value_json,\n          synced_at = CURRENT_TIMESTAMP\n        ", JSON.stringify(payload), input.boardId, input.itemId, input.itemUpdatedAt)];
                                case 2:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 2:
                _b.sent();
                return [3 /*break*/, 4];
            case 3:
                error_12 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to upsert monday call column values", error_12);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.upsertMondayCallColumnValues = upsertMondayCallColumnValues;
var upsertNormalizedMondayLeadRecords = function (input, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, outcomeLabel, outcomeReason, source, setBy, setter, stage, campaign, sequence, leadStatus, firstTouchDate, callDate, closedDate, outcomeCategory, activityDate, error_13;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                outcomeLabel = findTextBySignals(input.columns, [
                    "outcome",
                    "result",
                    "disposition",
                    "status",
                ]) ||
                    input.stage ||
                    null;
                outcomeReason = findTextBySignals(input.columns, [
                    "reason",
                    "lost reason",
                    "disqual",
                    "close reason",
                    "notes",
                ]);
                source = findTextBySignals(input.columns, [
                    "lead source",
                    "source",
                    "channel",
                    "utm",
                ]);
                setBy = findTextBySignals(input.columns, [
                    "set by",
                    "booked by",
                    "setter",
                ]);
                setter = normalizeText(input.setter) || setBy;
                stage = normalizeText(input.stage);
                campaign = findTextBySignals(input.columns, [
                    "campaign",
                    "offer",
                    "adset",
                    "ad set",
                    "funnel",
                ]);
                sequence = findTextBySignals(input.columns, ["sequence", "cadence"]);
                leadStatus = findTextBySignals(input.columns, ["lead status", "status"]) || stage;
                firstTouchDate = parseDateFromColumn(findColumnBySignals(input.columns, [
                    "first touch",
                    "created date",
                    "lead date",
                    "inbound date",
                ])) || null;
                callDate = normalizeText(input.callDate) ||
                    parseDateFromColumn(findColumnBySignals(input.columns, [
                        "call date",
                        "appointment date",
                        "meeting date",
                    ])) ||
                    null;
                closedDate = parseDateFromColumn(findColumnBySignals(input.columns, [
                    "closed date",
                    "won date",
                    "lost date",
                    "decision date",
                ]));
                outcomeCategory = classifyOutcomeCategory(stage, outcomeLabel, outcomeReason, input.disposition, input.isBooked === true);
                activityDate = callDate ||
                    closedDate ||
                    firstTouchDate ||
                    input.itemUpdatedAt.toISOString().slice(0, 10);
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.$transaction(function (tx) { return __awaiter(void 0, void 0, void 0, function () {
                        var _a, _b, _c;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0: return [4 /*yield*/, tx.$queryRawUnsafe("\n        INSERT INTO lead_outcomes (\n          board_id,\n          item_id,\n          lead_name,\n          contact_key,\n          call_date,\n          setter,\n          set_by,\n          source,\n          stage,\n          outcome_label,\n          outcome_reason,\n          outcome_category,\n          is_booked,\n          item_updated_at,\n          raw,\n          synced_at\n        )\n        VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,CURRENT_TIMESTAMP)\n        ON CONFLICT (board_id, item_id)\n        DO UPDATE SET\n          lead_name = EXCLUDED.lead_name,\n          contact_key = EXCLUDED.contact_key,\n          call_date = EXCLUDED.call_date,\n          setter = EXCLUDED.setter,\n          set_by = EXCLUDED.set_by,\n          source = EXCLUDED.source,\n          stage = EXCLUDED.stage,\n          outcome_label = EXCLUDED.outcome_label,\n          outcome_reason = EXCLUDED.outcome_reason,\n          outcome_category = EXCLUDED.outcome_category,\n          is_booked = EXCLUDED.is_booked,\n          item_updated_at = EXCLUDED.item_updated_at,\n          raw = EXCLUDED.raw,\n          synced_at = CURRENT_TIMESTAMP\n        ", input.boardId, input.itemId, normalizeText(input.itemName), normalizeText(input.contactKey), callDate, setter, setBy, source, stage, outcomeLabel, outcomeReason, outcomeCategory, input.isBooked === true, input.itemUpdatedAt, JSON.stringify((_a = input.raw) !== null && _a !== void 0 ? _a : null))];
                                case 1:
                                    _d.sent();
                                    return [4 /*yield*/, tx.$queryRawUnsafe("\n        INSERT INTO lead_attribution (\n          board_id,\n          item_id,\n          lead_name,\n          contact_key,\n          source,\n          setter,\n          set_by,\n          campaign,\n          sequence,\n          lead_status,\n          first_touch_date,\n          call_date,\n          closed_date,\n          item_updated_at,\n          raw,\n          synced_at\n        )\n        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,$12::date,$13::date,$14,$15::jsonb,CURRENT_TIMESTAMP)\n        ON CONFLICT (board_id, item_id)\n        DO UPDATE SET\n          lead_name = EXCLUDED.lead_name,\n          contact_key = EXCLUDED.contact_key,\n          source = EXCLUDED.source,\n          setter = EXCLUDED.setter,\n          set_by = EXCLUDED.set_by,\n          campaign = EXCLUDED.campaign,\n          sequence = EXCLUDED.sequence,\n          lead_status = EXCLUDED.lead_status,\n          first_touch_date = EXCLUDED.first_touch_date,\n          call_date = EXCLUDED.call_date,\n          closed_date = EXCLUDED.closed_date,\n          item_updated_at = EXCLUDED.item_updated_at,\n          raw = EXCLUDED.raw,\n          synced_at = CURRENT_TIMESTAMP\n        ", input.boardId, input.itemId, normalizeText(input.itemName), normalizeText(input.contactKey), source, setter, setBy, campaign, sequence, leadStatus, firstTouchDate, callDate, closedDate, input.itemUpdatedAt, JSON.stringify((_b = input.raw) !== null && _b !== void 0 ? _b : null))];
                                case 2:
                                    _d.sent();
                                    return [4 /*yield*/, tx.$queryRawUnsafe("\n        INSERT INTO setter_activity (\n          board_id,\n          item_id,\n          activity_date,\n          setter,\n          set_by,\n          source,\n          stage,\n          outcome_category,\n          is_booked,\n          is_closed_won,\n          is_closed_lost,\n          is_bad_timing,\n          is_bad_fit,\n          is_no_show,\n          is_cancelled,\n          item_updated_at,\n          raw,\n          synced_at\n        )\n        VALUES (\n          $1,$2,$3::date,$4,$5,$6,$7,$8,$9,\n          $10,$11,$12,$13,$14,$15,\n          $16,$17::jsonb,CURRENT_TIMESTAMP\n        )\n        ON CONFLICT (board_id, item_id)\n        DO UPDATE SET\n          activity_date = EXCLUDED.activity_date,\n          setter = EXCLUDED.setter,\n          set_by = EXCLUDED.set_by,\n          source = EXCLUDED.source,\n          stage = EXCLUDED.stage,\n          outcome_category = EXCLUDED.outcome_category,\n          is_booked = EXCLUDED.is_booked,\n          is_closed_won = EXCLUDED.is_closed_won,\n          is_closed_lost = EXCLUDED.is_closed_lost,\n          is_bad_timing = EXCLUDED.is_bad_timing,\n          is_bad_fit = EXCLUDED.is_bad_fit,\n          is_no_show = EXCLUDED.is_no_show,\n          is_cancelled = EXCLUDED.is_cancelled,\n          item_updated_at = EXCLUDED.item_updated_at,\n          raw = EXCLUDED.raw,\n          synced_at = CURRENT_TIMESTAMP\n        ", input.boardId, input.itemId, activityDate, setter, setBy, source, stage, outcomeCategory, input.isBooked === true, outcomeCategory === "closed_won", outcomeCategory === "closed_lost", outcomeCategory === "bad_timing", outcomeCategory === "bad_fit", outcomeCategory === "no_show", outcomeCategory === "cancelled", input.itemUpdatedAt, JSON.stringify((_c = input.raw) !== null && _c !== void 0 ? _c : null))];
                                case 3:
                                    _d.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 2:
                _b.sent();
                return [3 /*break*/, 4];
            case 3:
                error_13 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to upsert normalized monday lead records", error_13);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.upsertNormalizedMondayLeadRecords = upsertNormalizedMondayLeadRecords;
var IGNORED_SCORECARD_METRIC_TITLES = new Set([
    "subitems",
    "date",
    "metric owner",
    "playbook",
    "progress",
    "plan to correct",
]);
var upsertMondayMetricFacts = function (input, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, metricDate, metricOwner, payload, error_14;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                metricDate = parseIsoDate(input.callDate) ||
                    parseDateFromColumn(findColumnBySignals(input.columns, ["date", "week", "day", "period"])) ||
                    null;
                metricOwner = normalizeText(input.setter) ||
                    findTextBySignals(input.columns, ["metric owner", "owner", "setter"]);
                payload = input.columns
                    .map(function (column) {
                    var _a, _b, _c, _d;
                    var metricName = normalizeText(column.columnTitle);
                    var metricNameNormalized = normalizeForMatch(metricName);
                    if (!metricName ||
                        IGNORED_SCORECARD_METRIC_TITLES.has(metricNameNormalized))
                        return null;
                    var metricText = normalizeText(column.textValue);
                    var metricNumber = parseNumericMetric(metricText);
                    var statusValue = metricText &&
                        (column.columnType === "status" ||
                            column.columnType === "dropdown" ||
                            metricNumber === null)
                        ? metricText
                        : null;
                    if (!metricText && !column.valueJson)
                        return null;
                    return {
                        metric_name: metricName,
                        metric_value_num: metricNumber,
                        metric_value_text: metricText,
                        status_value: statusValue,
                        raw: {
                            columnId: column.columnId,
                            columnTitle: (_a = column.columnTitle) !== null && _a !== void 0 ? _a : null,
                            columnType: (_b = column.columnType) !== null && _b !== void 0 ? _b : null,
                            textValue: (_c = column.textValue) !== null && _c !== void 0 ? _c : null,
                            valueJson: (_d = column.valueJson) !== null && _d !== void 0 ? _d : null,
                        },
                    };
                })
                    .filter(function (row) { return Boolean(row); });
                if (!payload.length)
                    return [2 /*return*/];
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.$queryRawUnsafe("\n      WITH incoming AS (\n        SELECT *\n        FROM jsonb_to_recordset($1::jsonb) AS t(\n          metric_name TEXT,\n          metric_value_num DOUBLE PRECISION,\n          metric_value_text TEXT,\n          status_value TEXT,\n          raw JSONB\n        )\n      )\n      INSERT INTO monday_metric_facts (\n        board_id,\n        item_id,\n        metric_date,\n        metric_owner,\n        metric_name,\n        metric_value_num,\n        metric_value_text,\n        status_value,\n        item_updated_at,\n        raw,\n        synced_at\n      )\n      SELECT\n        $2,\n        $3,\n        $4::date,\n        $5,\n        incoming.metric_name,\n        incoming.metric_value_num,\n        incoming.metric_value_text,\n        incoming.status_value,\n        $6,\n        incoming.raw,\n        CURRENT_TIMESTAMP\n      FROM incoming\n      ON CONFLICT (board_id, item_id, metric_name, item_updated_at)\n      DO UPDATE SET\n        metric_date = EXCLUDED.metric_date,\n        metric_owner = EXCLUDED.metric_owner,\n        metric_value_num = EXCLUDED.metric_value_num,\n        metric_value_text = EXCLUDED.metric_value_text,\n        status_value = EXCLUDED.status_value,\n        raw = EXCLUDED.raw,\n        synced_at = CURRENT_TIMESTAMP\n      ", JSON.stringify(payload), input.boardId, input.itemId, metricDate, metricOwner, input.itemUpdatedAt)];
            case 2:
                _b.sent();
                return [3 /*break*/, 4];
            case 3:
                error_14 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to upsert monday metric facts", error_14);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.upsertMondayMetricFacts = upsertMondayMetricFacts;
var purgeMondayNormalizedRowsForNonFunnelBoards = function (logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, error_15;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.$transaction(function (tx) { return __awaiter(void 0, void 0, void 0, function () {
                        var leadOutcomes, leadAttribution, setterActivity;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, tx.$queryRawUnsafe("\n        DELETE FROM lead_outcomes lo\n        WHERE EXISTS (\n          SELECT 1\n          FROM monday_board_registry br\n          WHERE br.board_id = lo.board_id\n            AND (br.active = FALSE OR br.metric_grain <> 'lead_item' OR br.include_in_funnel = FALSE)\n        )\n        RETURNING 1\n      ")];
                                case 1:
                                    leadOutcomes = _a.sent();
                                    return [4 /*yield*/, tx.$queryRawUnsafe("\n        DELETE FROM lead_attribution la\n        WHERE EXISTS (\n          SELECT 1\n          FROM monday_board_registry br\n          WHERE br.board_id = la.board_id\n            AND (br.active = FALSE OR br.metric_grain <> 'lead_item' OR br.include_in_funnel = FALSE)\n        )\n        RETURNING 1\n      ")];
                                case 2:
                                    leadAttribution = _a.sent();
                                    return [4 /*yield*/, tx.$queryRawUnsafe("\n        DELETE FROM setter_activity sa\n        WHERE EXISTS (\n          SELECT 1\n          FROM monday_board_registry br\n          WHERE br.board_id = sa.board_id\n            AND (br.active = FALSE OR br.metric_grain <> 'lead_item' OR br.include_in_funnel = FALSE)\n        )\n        RETURNING 1\n      ")];
                                case 3:
                                    setterActivity = _a.sent();
                                    return [2 /*return*/, {
                                            leadOutcomesDeleted: Array.isArray(leadOutcomes)
                                                ? leadOutcomes.length
                                                : 0,
                                            leadAttributionDeleted: Array.isArray(leadAttribution)
                                                ? leadAttribution.length
                                                : 0,
                                            setterActivityDeleted: Array.isArray(setterActivity)
                                                ? setterActivity.length
                                                : 0,
                                        }];
                            }
                        });
                    }); })];
            case 2: return [2 /*return*/, _b.sent()];
            case 3:
                error_15 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to purge non-funnel monday normalized rows", error_15);
                return [2 /*return*/, {
                        leadOutcomesDeleted: 0,
                        leadAttributionDeleted: 0,
                        setterActivityDeleted: 0,
                    }];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.purgeMondayNormalizedRowsForNonFunnelBoards = purgeMondayNormalizedRowsForNonFunnelBoards;
var listMondayCallSnapshotsInRange = function (params, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, where, result, error_16;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                where = {
                    updated_at: {
                        gte: params.from,
                        lte: params.to,
                    },
                };
                if (params.boardId)
                    where.board_id = params.boardId;
                return [4 /*yield*/, prisma.monday_call_snapshots.findMany({
                        where: where,
                        orderBy: { updated_at: "desc" },
                    })];
            case 2:
                result = _b.sent();
                return [2 /*return*/, result];
            case 3:
                error_16 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to list monday call snapshots", error_16);
                return [2 /*return*/, []];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.listMondayCallSnapshotsInRange = listMondayCallSnapshotsInRange;
var getLatestMondaySyncStatus = function (boardId, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, result, error_17;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_sync_state.findMany({
                        where: boardId ? { board_id: boardId } : {},
                        orderBy: { updated_at: "desc" },
                        take: 1,
                    })];
            case 2:
                result = _b.sent();
                return [2 /*return*/, result[0] || null];
            case 3:
                error_17 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to read monday sync status", error_17);
                return [2 /*return*/, null];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.getLatestMondaySyncStatus = getLatestMondaySyncStatus;
var upsertMondayWeeklyReport = function (params, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, error_18;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    return __generator(this, function (_k) {
        switch (_k.label) {
            case 0:
                prisma = getPrisma();
                _k.label = 1;
            case 1:
                _k.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_weekly_reports.upsert({
                        where: { week_start: new Date(params.weekStart) },
                        update: {
                            source_board_id: (_a = params.sourceBoardId) !== null && _a !== void 0 ? _a : null,
                            summary_json: ((_b = params.summaryJson) !== null && _b !== void 0 ? _b : {}),
                            monday_item_id: (_c = params.mondayItemId) !== null && _c !== void 0 ? _c : null,
                            synced_at: (_d = params.syncedAt) !== null && _d !== void 0 ? _d : new Date(),
                        },
                        create: {
                            week_start: new Date(params.weekStart),
                            source_board_id: (_e = params.sourceBoardId) !== null && _e !== void 0 ? _e : null,
                            summary_json: ((_f = params.summaryJson) !== null && _f !== void 0 ? _f : {}),
                            monday_item_id: (_g = params.mondayItemId) !== null && _g !== void 0 ? _g : null,
                            synced_at: (_h = params.syncedAt) !== null && _h !== void 0 ? _h : new Date(),
                        },
                    })];
            case 2:
                _k.sent();
                return [3 /*break*/, 4];
            case 3:
                error_18 = _k.sent();
                (_j = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _j === void 0 ? void 0 : _j.call(logger, "Failed to upsert monday weekly report", error_18);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.upsertMondayWeeklyReport = upsertMondayWeeklyReport;
var getMondayWeeklyReport = function (weekStart, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, result, error_19;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_weekly_reports.findUnique({
                        where: { week_start: new Date(weekStart) },
                    })];
            case 2:
                result = _b.sent();
                return [2 /*return*/, result];
            case 3:
                error_19 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to read monday weekly report", error_19);
                return [2 /*return*/, null];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.getMondayWeeklyReport = getMondayWeeklyReport;
var getMondayBookedCallPush = function (slackChannelId, slackMessageTs, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, result, error_20;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prisma = getPrisma();
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_booked_call_pushes.findFirst({
                        where: {
                            slack_channel_id: slackChannelId,
                            slack_message_ts: slackMessageTs,
                        },
                    })];
            case 2:
                result = _b.sent();
                return [2 /*return*/, result];
            case 3:
                error_20 = _b.sent();
                (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, "Failed to read monday booked call push", error_20);
                return [2 /*return*/, null];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.getMondayBookedCallPush = getMondayBookedCallPush;
var upsertMondayBookedCallPush = function (params, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var prisma, error_21;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    return __generator(this, function (_k) {
        switch (_k.label) {
            case 0:
                prisma = getPrisma();
                _k.label = 1;
            case 1:
                _k.trys.push([1, 3, , 4]);
                return [4 /*yield*/, prisma.monday_booked_call_pushes.upsert({
                        where: {
                            board_id_slack_channel_id_slack_message_ts: {
                                board_id: params.boardId,
                                slack_channel_id: params.slackChannelId,
                                slack_message_ts: params.slackMessageTs,
                            },
                        },
                        update: {
                            setter_bucket: params.setterBucket,
                            monday_item_id: (_a = params.mondayItemId) !== null && _a !== void 0 ? _a : null,
                            status: params.status,
                            error: (_b = params.error) !== null && _b !== void 0 ? _b : null,
                            payload_json: ((_c = params.payloadJson) !== null && _c !== void 0 ? _c : {}),
                            pushed_at: (_d = params.pushedAt) !== null && _d !== void 0 ? _d : null,
                            updated_at: new Date(),
                        },
                        create: {
                            board_id: params.boardId,
                            slack_channel_id: params.slackChannelId,
                            slack_message_ts: params.slackMessageTs,
                            setter_bucket: params.setterBucket,
                            monday_item_id: (_e = params.mondayItemId) !== null && _e !== void 0 ? _e : null,
                            status: params.status,
                            error: (_f = params.error) !== null && _f !== void 0 ? _f : null,
                            payload_json: ((_g = params.payloadJson) !== null && _g !== void 0 ? _g : {}),
                            pushed_at: (_h = params.pushedAt) !== null && _h !== void 0 ? _h : null,
                            updated_at: new Date(),
                        },
                    })];
            case 2:
                _k.sent();
                return [3 /*break*/, 4];
            case 3:
                error_21 = _k.sent();
                (_j = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _j === void 0 ? void 0 : _j.call(logger, "Failed to upsert monday booked call push", error_21);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.upsertMondayBookedCallPush = upsertMondayBookedCallPush;
