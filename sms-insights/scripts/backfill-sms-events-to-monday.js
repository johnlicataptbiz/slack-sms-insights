#!/usr/bin/env tsx
"use strict";
/**
 * Backfill SMS events to Monday.com
 *
 * This script syncs historical SMS events from the database to Monday.com SMS Events board.
 * Usage: npx tsx scripts/backfill-sms-events-to-monday.ts [--days 90] [--board-id BOARD_ID]
 *
 * @example
 * npx tsx scripts/backfill-sms-events-to-monday.ts
 * npx tsx scripts/backfill-sms-events-to-monday.ts --days 30
 * npx tsx scripts/backfill-sms-events-to-monday.ts --board-id 1234567890
 */
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
var monday_sms_sync_js_1 = require("../services/monday-sms-sync.js");
var prisma_js_1 = require("../services/prisma.js");
var args = process.argv.slice(2);
var daysParam = args.find(function (arg) { return arg.startsWith('--days='); });
var boardIdParam = args.find(function (arg) { return arg.startsWith('--board-id='); });
var daysBack = daysParam ? Number.parseInt(daysParam.split('=')[1], 10) : 90;
var boardId = boardIdParam ? boardIdParam.split('=')[1] : process.env.MONDAY_SMS_EVENTS_BOARD_ID;
if (!boardId) {
    console.error('Error: MONDAY_SMS_EVENTS_BOARD_ID environment variable or --board-id argument is required');
    process.exit(1);
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var prisma, logger, cutoffDate, eventCount, result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('🚀 Starting SMS Events backfill to Monday.com');
                    console.log("\uD83D\uDCC5 Days back: ".concat(daysBack));
                    console.log("\uD83D\uDCF1 Board ID: ".concat(boardId));
                    console.log('');
                    prisma = (0, prisma_js_1.getPrisma)();
                    logger = {
                        info: function (msg, data) {
                            console.log('ℹ️  [INFO]', msg, data ? JSON.stringify(data) : '');
                        },
                        debug: function (msg, data) {
                            console.log('🔍 [DEBUG]', msg, data ? JSON.stringify(data) : '');
                        },
                        warn: function (msg, data) {
                            console.log('⚠️  [WARN]', msg, data ? JSON.stringify(data) : '');
                        },
                        error: function (msg, data) {
                            console.error('❌ [ERROR]', msg, data ? JSON.stringify(data) : '');
                        },
                    };
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, 5, 7]);
                    cutoffDate = new Date();
                    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - daysBack);
                    logger.info('Cutoff date', { cutoffDate: cutoffDate.toISOString() });
                    return [4 /*yield*/, prisma.sms_events.count({
                            where: {
                                event_ts: {
                                    gte: cutoffDate,
                                },
                            },
                        })];
                case 2:
                    eventCount = _a.sent();
                    logger.info('Total SMS events to sync', { count: eventCount });
                    if (eventCount === 0) {
                        console.log('✅ No SMS events to sync');
                        return [2 /*return*/];
                    }
                    // Sync the board
                    console.log('');
                    console.log('🔄 Starting sync...');
                    return [4 /*yield*/, (0, monday_sms_sync_js_1.syncMondaySmsBoard)(boardId, logger, { force: true })];
                case 3:
                    result = _a.sent();
                    console.log('');
                    console.log('📊 Sync Result:');
                    console.log("   Status: ".concat(result.status));
                    console.log("   Fetched Items: ".concat(result.fetchedItems));
                    console.log("   Upserted Items: ".concat(result.upsertedItems));
                    console.log("   Started At: ".concat(result.startedAt));
                    console.log("   Finished At: ".concat(result.finishedAt));
                    if (result.error) {
                        console.log("   Error: ".concat(result.error));
                    }
                    if (result.status === 'success') {
                        console.log('');
                        console.log('✅ SMS Events backfill completed successfully!');
                    }
                    else {
                        console.log('');
                        console.log('❌ SMS Events backfill failed');
                        process.exit(1);
                    }
                    return [3 /*break*/, 7];
                case 4:
                    error_1 = _a.sent();
                    console.error('❌ Backfill failed:', error_1);
                    process.exit(1);
                    return [3 /*break*/, 7];
                case 5: return [4 /*yield*/, prisma.$disconnect()];
                case 6:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 7: return [2 /*return*/];
            }
        });
    });
}
main();
