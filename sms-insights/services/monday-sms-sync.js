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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMondaySmsSyncJobs = exports.syncMondaySmsBoard = exports.listMondaySmsSyncBoardIds = exports.mondaySmsConfig = void 0;
var monday_client_js_1 = require("./monday-client.js");
var monday_mapping_js_1 = require("./monday-mapping.js");
var monday_store_js_1 = require("./monday-store.js");
var parseBool = function (value, fallback) {
    if (fallback === void 0) { fallback = false; }
    var normalized = (value || '').trim().toLowerCase();
    if (!normalized)
        return fallback;
    return normalized === 'true';
};
var parseCsv = function (value) {
    return (value || '')
        .split(',')
        .map(function (entry) { return entry.trim(); })
        .filter(function (entry) { return entry.length > 0; });
};
exports.mondaySmsConfig = {
    syncEnabled: parseBool(process.env.MONDAY_SMS_SYNC_ENABLED),
    writebackEnabled: parseBool(process.env.MONDAY_SMS_WRITEBACK_ENABLED),
    outboundEnabled: parseBool(process.env.MONDAY_SMS_OUTBOUND_ENABLED),
    autoWriteEnabled: parseBool(process.env.MONDAY_SMS_AUTO_WRITE_ENABLED, false),
    smsEventsBoardId: (process.env.MONDAY_SMS_EVENTS_BOARD_ID || '').trim(),
    smsSequencesBoardId: (process.env.MONDAY_SMS_SEQUENCES_BOARD_ID || '').trim(),
    smsReportsBoardId: (process.env.MONDAY_SMS_REPORTS_BOARD_ID || '').trim(),
    syncBoardIds: parseCsv(process.env.MONDAY_SMS_SYNC_BOARD_IDS),
    extraBoardIds: parseCsv(process.env.MONDAY_SMS_SYNC_EXTRA_BOARD_IDS),
    backfillDays: Number.parseInt(process.env.MONDAY_SMS_SYNC_BACKFILL_DAYS || '90', 10),
    maxPagesPerRun: Number.parseInt(process.env.MONDAY_SMS_SYNC_MAX_PAGES || '20', 10),
    pollIntervalMs: Number.parseInt(process.env.MONDAY_SMS_SYNC_INTERVAL_MS || "".concat(15 * 60 * 1000), 10),
};
var cutoffDate = function (daysBack) {
    var value = new Date();
    value.setUTCDate(value.getUTCDate() - Math.max(1, daysBack));
    return value;
};
var parseColumnValueJson = function (value) {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch (_a) {
        return value;
    }
};
var resolveSyncBoardIds = function () {
    var baseIds = exports.mondaySmsConfig.syncBoardIds.length > 0
        ? exports.mondaySmsConfig.syncBoardIds
        : [exports.mondaySmsConfig.smsEventsBoardId, exports.mondaySmsConfig.smsSequencesBoardId, exports.mondaySmsConfig.smsReportsBoardId];
    var ids = __spreadArray(__spreadArray([], baseIds, true), exports.mondaySmsConfig.extraBoardIds, true).map(function (value) { return value.trim(); })
        .filter(function (value) { return value.length > 0; });
    return __spreadArray([], new Set(ids), true);
};
var resolveDefaultBoardGovernance = function (boardId) {
    if (boardId === exports.mondaySmsConfig.smsEventsBoardId) {
        return {
            boardLabel: 'SMS Events',
            boardClass: 'sms_events',
            metricGrain: 'event_item',
            includeInFunnel: false,
            includeInExec: true,
            ownerTeam: 'ops',
            notes: 'Auto-classified from SMS events board config',
        };
    }
    if (boardId === exports.mondaySmsConfig.smsSequencesBoardId) {
        return {
            boardLabel: 'SMS Sequences',
            boardClass: 'sms_sequences',
            metricGrain: 'sequence_item',
            includeInFunnel: false,
            includeInExec: true,
            ownerTeam: 'sales',
            notes: 'Auto-classified from SMS sequences board config',
        };
    }
    if (boardId === exports.mondaySmsConfig.smsReportsBoardId) {
        return {
            boardLabel: 'SMS Daily Reports',
            boardClass: 'sms_reports',
            metricGrain: 'report_item',
            includeInFunnel: false,
            includeInExec: true,
            ownerTeam: 'ops',
            notes: 'Auto-classified from SMS reports board config',
        };
    }
    return {
        boardLabel: "Board ".concat(boardId),
        boardClass: 'other',
        metricGrain: 'aggregate_metric',
        includeInFunnel: false,
        includeInExec: true,
        ownerTeam: 'ops',
        notes: 'Auto-registered by monday sms sync',
    };
};
var listMondaySmsSyncBoardIds = function () { return resolveSyncBoardIds(); };
exports.listMondaySmsSyncBoardIds = listMondaySmsSyncBoardIds;
var syncMondaySmsBoard = function (boardId, logger, options) { return __awaiter(void 0, void 0, void 0, function () {
    var startedAt, state, force, initialSync, lastSyncAt, backfillCutoff, _a, columns, persistedRaw, inferred, persisted, envOverride, mapping, columnsById, boardProfile, fallback, cursor, fetchedItems, upsertedItems, pageCount, page, error_1, message, isExpiredCursor, _i, _b, item, normalized, error_2, message;
    var _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                startedAt = new Date().toISOString();
                if (!exports.mondaySmsConfig.syncEnabled) {
                    return [2 /*return*/, {
                            status: 'skipped',
                            boardId: boardId,
                            fetchedItems: 0,
                            upsertedItems: 0,
                            nextCursor: null,
                            startedAt: startedAt,
                            finishedAt: new Date().toISOString(),
                            error: 'MONDAY_SMS_SYNC_ENABLED is false',
                        }];
                }
                return [4 /*yield*/, (0, monday_store_js_1.getMondaySyncState)(boardId, logger)];
            case 1:
                state = _e.sent();
                force = (options === null || options === void 0 ? void 0 : options.force) === true;
                initialSync = force ? true : !(state === null || state === void 0 ? void 0 : state.last_sync_at);
                lastSyncAt = (state === null || state === void 0 ? void 0 : state.last_sync_at) ? new Date(state.last_sync_at) : null;
                backfillCutoff = cutoffDate(exports.mondaySmsConfig.backfillDays);
                return [4 /*yield*/, (0, monday_store_js_1.upsertMondaySyncState)({ boardId: boardId, cursor: (state === null || state === void 0 ? void 0 : state.cursor) || null, status: 'running', error: null }, logger)];
            case 2:
                _e.sent();
                _e.label = 3;
            case 3:
                _e.trys.push([3, 22, , 24]);
                return [4 /*yield*/, Promise.all([
                        (0, monday_client_js_1.queryBoardColumns)(boardId, logger),
                        (0, monday_store_js_1.getMondayColumnMapping)(boardId, logger),
                    ])];
            case 4:
                _a = _e.sent(), columns = _a[0], persistedRaw = _a[1];
                inferred = (0, monday_mapping_js_1.inferBoardMapping)(columns);
                persisted = (0, monday_mapping_js_1.coerceBoardMapping)(persistedRaw);
                envOverride = (0, monday_mapping_js_1.readBoardMappingFromEnv)();
                mapping = (0, monday_mapping_js_1.mergeBoardMappings)((0, monday_mapping_js_1.mergeBoardMappings)(inferred, persisted), envOverride) || inferred;
                if (envOverride) {
                    (_c = logger === null || logger === void 0 ? void 0 : logger.info) === null || _c === void 0 ? void 0 : _c.call(logger, 'Using MONDAY_SMS_COLUMN_MAP_JSON override for monday sms sync mapping', { boardId: boardId });
                }
                return [4 /*yield*/, (0, monday_store_js_1.saveMondayColumnMapping)(boardId, mapping, logger)];
            case 5:
                _e.sent();
                columnsById = new Map(columns.map(function (column) { return [column.id, column]; }));
                return [4 /*yield*/, (0, monday_store_js_1.getMondayBoardRegistry)(boardId, logger)];
            case 6:
                boardProfile = _e.sent();
                if (!!boardProfile) return [3 /*break*/, 9];
                fallback = resolveDefaultBoardGovernance(boardId);
                return [4 /*yield*/, (0, monday_store_js_1.upsertMondayBoardRegistry)({
                        boardId: boardId,
                        boardLabel: fallback.boardLabel,
                        boardClass: fallback.boardClass,
                        metricGrain: fallback.metricGrain,
                        includeInFunnel: fallback.includeInFunnel,
                        includeInExec: fallback.includeInExec,
                        active: true,
                        ownerTeam: fallback.ownerTeam,
                        notes: fallback.notes,
                    }, logger)];
            case 7:
                _e.sent();
                return [4 /*yield*/, (0, monday_store_js_1.getMondayBoardRegistry)(boardId, logger)];
            case 8:
                boardProfile = _e.sent();
                _e.label = 9;
            case 9:
                cursor = (state === null || state === void 0 ? void 0 : state.cursor) || null;
                fetchedItems = 0;
                upsertedItems = 0;
                pageCount = 0;
                _e.label = 10;
            case 10:
                if (!(pageCount < exports.mondaySmsConfig.maxPagesPerRun)) return [3 /*break*/, 20];
                page = void 0;
                _e.label = 11;
            case 11:
                _e.trys.push([11, 13, , 15]);
                return [4 /*yield*/, (0, monday_client_js_1.queryBoardItems)(boardId, cursor, logger)];
            case 12:
                page = _e.sent();
                return [3 /*break*/, 15];
            case 13:
                error_1 = _e.sent();
                message = error_1 instanceof Error ? error_1.message : String(error_1);
                isExpiredCursor = Boolean(cursor) && /cursor.*expired/i.test(message);
                if (!isExpiredCursor)
                    throw error_1;
                (_d = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _d === void 0 ? void 0 : _d.call(logger, 'Monday SMS cursor expired; restarting board pagination from first page', { boardId: boardId });
                cursor = null;
                return [4 /*yield*/, (0, monday_client_js_1.queryBoardItems)(boardId, cursor, logger)];
            case 14:
                page = _e.sent();
                return [3 /*break*/, 15];
            case 15:
                fetchedItems += page.items.length;
                pageCount += 1;
                _i = 0, _b = page.items;
                _e.label = 16;
            case 16:
                if (!(_i < _b.length)) return [3 /*break*/, 19];
                item = _b[_i];
                normalized = (0, monday_mapping_js_1.normalizeBoardItem)(item, mapping);
                if (!normalized)
                    return [3 /*break*/, 18];
                if (!force && initialSync && normalized.updatedAt < backfillCutoff)
                    return [3 /*break*/, 18];
                if (!force && !initialSync && lastSyncAt && normalized.updatedAt <= lastSyncAt)
                    return [3 /*break*/, 18];
                return [4 /*yield*/, (0, monday_store_js_1.upsertMondaySyncState)({
                        boardId: boardId,
                        cursor: cursor,
                        lastSyncAt: new Date(),
                        status: 'success',
                        error: null,
                    }, logger)];
            case 17:
                _e.sent();
                return [2 /*return*/, {
                        status: 'success',
                        boardId: boardId,
                        fetchedItems: fetchedItems,
                        upsertedItems: upsertedItems,
                        nextCursor: cursor,
                        startedAt: startedAt,
                        finishedAt: new Date().toISOString(),
                    }];
            case 18:
                _i++;
                return [3 /*break*/, 16];
            case 19:
                cursor = page.nextCursor;
                if (!cursor)
                    return [3 /*break*/, 20];
                return [3 /*break*/, 10];
            case 20: return [4 /*yield*/, (0, monday_store_js_1.upsertMondaySyncState)({
                    boardId: boardId,
                    cursor: cursor,
                    lastSyncAt: new Date(),
                    status: 'success',
                    error: null,
                }, logger)];
            case 21:
                _e.sent();
                return [2 /*return*/, {
                        status: 'success',
                        boardId: boardId,
                        fetchedItems: fetchedItems,
                        upsertedItems: upsertedItems,
                        nextCursor: cursor,
                        startedAt: startedAt,
                        finishedAt: new Date().toISOString(),
                    }];
            case 22:
                error_2 = _e.sent();
                message = error_2 instanceof Error ? error_2.message : String(error_2);
                return [4 /*yield*/, (0, monday_store_js_1.upsertMondaySyncState)({
                        boardId: boardId,
                        status: 'error',
                        error: message,
                        lastSyncAt: new Date(),
                    }, logger)];
            case 23:
                _e.sent();
                return [2 /*return*/, {
                        status: 'error',
                        boardId: boardId,
                        fetchedItems: 0,
                        upsertedItems: 0,
                        nextCursor: (state === null || state === void 0 ? void 0 : state.cursor) || null,
                        startedAt: startedAt,
                        finishedAt: new Date().toISOString(),
                        error: message,
                    }];
            case 24: return [2 /*return*/];
        }
    });
}); };
exports.syncMondaySmsBoard = syncMondaySmsBoard;
var startMondaySmsSyncJobs = function (logger) {
    var _a, _b;
    if (!exports.mondaySmsConfig.syncEnabled) {
        (_a = logger === null || logger === void 0 ? void 0 : logger.info) === null || _a === void 0 ? void 0 : _a.call(logger, 'Monday SMS jobs disabled');
        return function () { };
    }
    (_b = logger === null || logger === void 0 ? void 0 : logger.info) === null || _b === void 0 ? void 0 : _b.call(logger, 'Starting Monday SMS maintenance jobs', {
        syncEnabled: exports.mondaySmsConfig.syncEnabled,
        outboundEnabled: exports.mondaySmsConfig.outboundEnabled,
        autoWriteEnabled: exports.mondaySmsConfig.autoWriteEnabled,
        boardIds: (0, exports.listMondaySmsSyncBoardIds)(),
        intervalMs: exports.mondaySmsConfig.pollIntervalMs,
    });
    var initialTimer = setTimeout(function () {
        void runMondaySmsMaintenanceCycle(logger);
    }, 10000);
    var interval = setInterval(function () {
        void runMondaySmsMaintenanceCycle(logger);
    }, exports.mondaySmsConfig.pollIntervalMs);
    return function () {
        clearTimeout(initialTimer);
        clearInterval(interval);
    };
};
exports.startMondaySmsSyncJobs = startMondaySmsSyncJobs;
var runMondaySmsMaintenanceCycle = function (logger) { return __awaiter(void 0, void 0, void 0, function () {
    var _i, _a, boardId, syncResult;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _i = 0, _a = (0, exports.listMondaySmsSyncBoardIds)();
                _c.label = 1;
            case 1:
                if (!(_i < _a.length)) return [3 /*break*/, 4];
                boardId = _a[_i];
                return [4 /*yield*/, (0, exports.syncMondaySmsBoard)(boardId, logger)];
            case 2:
                syncResult = _c.sent();
                if (syncResult.status === 'error') {
                    (_b = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _b === void 0 ? void 0 : _b.call(logger, 'Monday SMS sync cycle failed', { boardId: boardId, error: syncResult.error });
                }
                _c.label = 3;
            case 3:
                _i++;
                return [3 /*break*/, 1];
            case 4: return [2 /*return*/];
        }
    });
}); };
