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
exports.upsertBookedCallItem = exports.upsertWeeklySummaryItem = exports.queryBoardItems = exports.queryBoardColumns = void 0;
var MONDAY_API_URL = 'https://api.monday.com/v2';
var DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.MONDAY_API_TIMEOUT_MS || '12000', 10);
var DEFAULT_MAX_RETRIES = Number.parseInt(process.env.MONDAY_API_MAX_RETRIES || '2', 10);
var DEFAULT_RETRY_BASE_MS = Number.parseInt(process.env.MONDAY_API_RETRY_BASE_MS || '500', 10);
var sleep = function (ms) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, ms); })];
}); }); };
var getMondayToken = function () {
    var token = (process.env.MONDAY_API_TOKEN || '').trim();
    if (!token) {
        throw new Error('MONDAY_API_TOKEN is not configured');
    }
    return token;
};
var requestGraphQl = function (query, variables, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var token, attempt, _loop_1, state_1;
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                token = getMondayToken();
                attempt = 0;
                _loop_1 = function () {
                    var controller, timeout, response, payload, errMsg, error_1, canRetry, delay;
                    return __generator(this, function (_f) {
                        switch (_f.label) {
                            case 0:
                                controller = new AbortController();
                                timeout = setTimeout(function () { return controller.abort(); }, DEFAULT_TIMEOUT_MS);
                                _f.label = 1;
                            case 1:
                                _f.trys.push([1, 4, 6, 7]);
                                return [4 /*yield*/, fetch(MONDAY_API_URL, {
                                        method: 'POST',
                                        headers: {
                                            Authorization: token,
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({ query: query, variables: variables }),
                                        signal: controller.signal,
                                    })];
                            case 2:
                                response = _f.sent();
                                return [4 /*yield*/, response.json()];
                            case 3:
                                payload = (_f.sent());
                                if (!response.ok || ((_a = payload.errors) === null || _a === void 0 ? void 0 : _a.length)) {
                                    errMsg = ((_b = payload.errors) === null || _b === void 0 ? void 0 : _b.map(function (err) { return err.message; }).filter(Boolean).join('; ')) || "Monday API request failed with status ".concat(response.status);
                                    throw new Error(errMsg);
                                }
                                if (!payload.data)
                                    throw new Error('Monday API returned empty data payload');
                                return [2 /*return*/, { value: payload.data }];
                            case 4:
                                error_1 = _f.sent();
                                attempt += 1;
                                canRetry = attempt <= DEFAULT_MAX_RETRIES;
                                (_c = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _c === void 0 ? void 0 : _c.call(logger, 'Monday API request failed', { attempt: attempt, canRetry: canRetry, error: String(error_1) });
                                if (!canRetry) {
                                    (_d = logger === null || logger === void 0 ? void 0 : logger.error) === null || _d === void 0 ? void 0 : _d.call(logger, 'Monday API request exhausted retries', error_1);
                                    throw error_1;
                                }
                                delay = DEFAULT_RETRY_BASE_MS * Math.pow(2, (attempt - 1));
                                return [4 /*yield*/, sleep(delay)];
                            case 5:
                                _f.sent();
                                return [3 /*break*/, 7];
                            case 6:
                                clearTimeout(timeout);
                                return [7 /*endfinally*/];
                            case 7: return [2 /*return*/];
                        }
                    });
                };
                _e.label = 1;
            case 1:
                if (!true) return [3 /*break*/, 3];
                return [5 /*yield**/, _loop_1()];
            case 2:
                state_1 = _e.sent();
                if (typeof state_1 === "object")
                    return [2 /*return*/, state_1.value];
                return [3 /*break*/, 1];
            case 3: return [2 /*return*/];
        }
    });
}); };
var queryBoardColumns = function (boardId, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var query, data;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                query = "\n    query QueryBoardColumns($boardId: [ID!]) {\n      boards(ids: $boardId) {\n        id\n        columns {\n          id\n          title\n          type\n        }\n      }\n    }\n  ";
                return [4 /*yield*/, requestGraphQl(query, { boardId: [boardId] }, logger)];
            case 1:
                data = _c.sent();
                return [2 /*return*/, ((_b = (_a = data.boards) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.columns) || []];
        }
    });
}); };
exports.queryBoardColumns = queryBoardColumns;
var queryBoardItems = function (boardId, updatedSinceCursor, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var hasCursor, pageProjection, query, variables, data, page, items;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                hasCursor = Boolean(updatedSinceCursor);
                pageProjection = "\n    cursor\n    items {\n      id\n      name\n      updated_at\n      column_values {\n        id\n        type\n        text\n        value\n      }\n    }\n  ";
                query = hasCursor
                    ? "\n      query QueryBoardItemsWithCursor($cursor: String!, $limit: Int!) {\n        next_items_page(cursor: $cursor, limit: $limit) {\n          ".concat(pageProjection, "\n        }\n      }\n    ")
                    : "\n      query QueryBoardItemsFirstPage($boardId: [ID!], $limit: Int!) {\n        boards(ids: $boardId) {\n          items_page(limit: $limit) {\n            ".concat(pageProjection, "\n          }\n        }\n      }\n    ");
                variables = hasCursor
                    ? {
                        cursor: updatedSinceCursor,
                        limit: 100,
                    }
                    : {
                        boardId: [boardId],
                        limit: 100,
                    };
                return [4 /*yield*/, requestGraphQl(query, variables, logger)];
            case 1:
                data = _c.sent();
                page = hasCursor ? data.next_items_page : (_b = (_a = data.boards) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.items_page;
                items = ((page === null || page === void 0 ? void 0 : page.items) || []).map(function (item) { return ({
                    id: item.id,
                    name: item.name,
                    updatedAt: item.updated_at,
                    columnValues: item.column_values || [],
                }); });
                return [2 /*return*/, {
                        items: items,
                        nextCursor: (page === null || page === void 0 ? void 0 : page.cursor) || null,
                    }];
        }
    });
}); };
exports.queryBoardItems = queryBoardItems;
var upsertWeeklySummaryItem = function (boardId, weekKey, payload, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var itemName, itemId, action, createMutation, createData, updateMutation;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                itemName = payload.title || "PTBizSMS Weekly Summary - ".concat(weekKey);
                itemId = payload.existingItemId || null;
                action = 'updated';
                if (!!itemId) return [3 /*break*/, 2];
                createMutation = "\n      mutation CreateWeeklySummaryItem($boardId: ID!, $itemName: String!) {\n        create_item(board_id: $boardId, item_name: $itemName) {\n          id\n        }\n      }\n    ";
                return [4 /*yield*/, requestGraphQl(createMutation, { boardId: boardId, itemName: itemName }, logger)];
            case 1:
                createData = _b.sent();
                itemId = ((_a = createData.create_item) === null || _a === void 0 ? void 0 : _a.id) || null;
                if (!itemId)
                    throw new Error('Failed to create monday weekly summary item');
                action = 'created';
                _b.label = 2;
            case 2:
                updateMutation = "\n    mutation AddWeeklySummaryUpdate($itemId: ID!, $body: String!) {\n      create_update(item_id: $itemId, body: $body) {\n        id\n      }\n    }\n  ";
                return [4 /*yield*/, requestGraphQl(updateMutation, { itemId: itemId, body: payload.summaryMarkdown }, logger)];
            case 3:
                _b.sent();
                return [2 /*return*/, { itemId: itemId, action: action }];
        }
    });
}); };
exports.upsertWeeklySummaryItem = upsertWeeklySummaryItem;
var upsertBookedCallItem = function (boardId, payload, logger) { return __awaiter(void 0, void 0, void 0, function () {
    var hasColumnValues, encodedColumnValues, itemId, action, createMutation, createData, error_2, createData, renameMutation, error_3, patchColumnsMutation, error_4, updateMutation;
    var _a, _b, _c, _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                hasColumnValues = Boolean(payload.columnValues && Object.keys(payload.columnValues).length > 0);
                encodedColumnValues = hasColumnValues ? JSON.stringify(payload.columnValues) : null;
                itemId = payload.existingItemId || null;
                action = payload.existingItemId ? 'updated' : 'created';
                if (!!itemId) return [3 /*break*/, 6];
                createMutation = "\n      mutation CreateBookedCallItem($boardId: ID!, $itemName: String!, $columnValues: JSON) {\n        create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {\n          id\n        }\n      }\n    ";
                _f.label = 1;
            case 1:
                _f.trys.push([1, 3, , 5]);
                return [4 /*yield*/, requestGraphQl(createMutation, {
                        boardId: boardId,
                        itemName: payload.itemName,
                        columnValues: encodedColumnValues,
                    }, logger)];
            case 2:
                createData = _f.sent();
                itemId = ((_a = createData.create_item) === null || _a === void 0 ? void 0 : _a.id) || null;
                return [3 /*break*/, 5];
            case 3:
                error_2 = _f.sent();
                if (!hasColumnValues)
                    throw error_2;
                (_b = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _b === void 0 ? void 0 : _b.call(logger, 'Booked call create_item with column values failed; retrying without columns', error_2);
                return [4 /*yield*/, requestGraphQl(createMutation, {
                        boardId: boardId,
                        itemName: payload.itemName,
                        columnValues: null,
                    }, logger)];
            case 4:
                createData = _f.sent();
                itemId = ((_c = createData.create_item) === null || _c === void 0 ? void 0 : _c.id) || null;
                return [3 /*break*/, 5];
            case 5:
                if (!itemId)
                    throw new Error('Failed to create monday booked call item');
                return [3 /*break*/, 10];
            case 6:
                renameMutation = "\n      mutation RenameBookedCallItem($itemId: ID!, $itemName: String!) {\n        change_simple_column_value(item_id: $itemId, column_id: \"name\", value: $itemName) {\n          id\n        }\n      }\n    ";
                _f.label = 7;
            case 7:
                _f.trys.push([7, 9, , 10]);
                return [4 /*yield*/, requestGraphQl(renameMutation, {
                        itemId: itemId,
                        itemName: payload.itemName,
                    }, logger)];
            case 8:
                _f.sent();
                action = 'updated';
                return [3 /*break*/, 10];
            case 9:
                error_3 = _f.sent();
                (_d = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _d === void 0 ? void 0 : _d.call(logger, 'Booked call item rename failed; continuing with update body/columns', error_3);
                return [3 /*break*/, 10];
            case 10:
                if (!(itemId && hasColumnValues)) return [3 /*break*/, 14];
                patchColumnsMutation = "\n      mutation PatchBookedCallColumns($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {\n        change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {\n          id\n        }\n      }\n    ";
                _f.label = 11;
            case 11:
                _f.trys.push([11, 13, , 14]);
                return [4 /*yield*/, requestGraphQl(patchColumnsMutation, {
                        boardId: boardId,
                        itemId: itemId,
                        columnValues: encodedColumnValues,
                    }, logger)];
            case 12:
                _f.sent();
                action = 'updated';
                return [3 /*break*/, 14];
            case 13:
                error_4 = _f.sent();
                (_e = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _e === void 0 ? void 0 : _e.call(logger, 'Booked call column update failed; item update will still be posted', error_4);
                return [3 /*break*/, 14];
            case 14:
                updateMutation = "\n    mutation AddBookedCallUpdate($itemId: ID!, $body: String!) {\n      create_update(item_id: $itemId, body: $body) {\n        id\n      }\n    }\n  ";
                return [4 /*yield*/, requestGraphQl(updateMutation, { itemId: itemId, body: payload.updateMarkdown }, logger)];
            case 15:
                _f.sent();
                return [2 /*return*/, { itemId: itemId, action: action }];
        }
    });
}); };
exports.upsertBookedCallItem = upsertBookedCallItem;
