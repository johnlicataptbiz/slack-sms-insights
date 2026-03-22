"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.getPrismaRuntimeStatus = exports.getPrisma = exports.getPrismaClient = void 0;
var client_1 = require("@prisma/client");
var extension_accelerate_1 = require("@prisma/extension-accelerate");
var prismaAccelerate;
var prismaDirect;
var prismaMode;
var prismaDetail;
var resolvePrismaConfig = function () {
    var accelerateUrl = (process.env.PRISMA_ACCELERATE_URL || '').trim();
    var databaseUrl = (process.env.DATABASE_URL || '').trim();
    if (accelerateUrl) {
        if (accelerateUrl.startsWith('prisma+postgres://')) {
            return { url: accelerateUrl, mode: 'accelerate' };
        }
        if (databaseUrl) {
            return {
                url: databaseUrl,
                mode: databaseUrl.startsWith('prisma+postgres://') ? 'accelerate' : 'direct',
                detail: 'PRISMA_ACCELERATE_URL ignored (expected prisma+postgres://), using DATABASE_URL',
            };
        }
        throw new Error('PRISMA_ACCELERATE_URL must start with prisma+postgres://');
    }
    if (databaseUrl) {
        return {
            url: databaseUrl,
            mode: databaseUrl.startsWith('prisma+postgres://') ? 'accelerate' : 'direct',
        };
    }
    throw new Error('Missing PRISMA_ACCELERATE_URL or DATABASE_URL');
};
var createPrismaClient = function (config) {
    if (config.mode === 'accelerate') {
        // @ts-ignore - Prisma 7 uses accelerateUrl
        return new client_1.PrismaClient({ accelerateUrl: config.url }).$extends((0, extension_accelerate_1.withAccelerate)());
    }
    // Direct connection - For Prisma 7, we need to provide an accelerateUrl even for direct connections
    // or use an adapter. Since we don't have an adapter, we'll tell it to use accelerate mode
    // but with the regular DATABASE_URL
    if (config.url.startsWith('postgresql://')) {
        // Convert to accelerate format for Prisma 7 compatibility
        var accelerateUrl = config.url.replace('postgresql://', 'prisma+postgres://');
        // @ts-ignore - Prisma 7 uses accelerateUrl
        return new client_1.PrismaClient({ accelerateUrl: accelerateUrl }).$extends((0, extension_accelerate_1.withAccelerate)());
    }
    // Fallback: try direct connection with minimal config
    return new client_1.PrismaClient({
        log: ['error', 'warn'],
    });
};
var getPrismaClient = function () {
    if (prismaMode === 'accelerate' && prismaAccelerate) {
        return prismaAccelerate;
    }
    if (prismaMode === 'direct' && prismaDirect) {
        return prismaDirect;
    }
    var config = resolvePrismaConfig();
    prismaMode = config.mode;
    prismaDetail = config.detail;
    var client = createPrismaClient(config);
    if (config.mode === 'accelerate') {
        prismaAccelerate = client;
        return prismaAccelerate;
    }
    prismaDirect = client;
    return prismaDirect;
};
exports.getPrismaClient = getPrismaClient;
exports.getPrisma = exports.getPrismaClient;
var getPrismaRuntimeStatus = function () { return __awaiter(void 0, void 0, void 0, function () {
    var accelerateUrl, databaseUrl, configured, client, queryArgs, baseDetail, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                accelerateUrl = (process.env.PRISMA_ACCELERATE_URL || '').trim();
                databaseUrl = (process.env.DATABASE_URL || '').trim();
                configured = accelerateUrl || databaseUrl;
                if (!configured) {
                    return [2 /*return*/, {
                            status: 'warn',
                            configured: false,
                            detail: 'Prisma database URL is not configured',
                        }];
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 6, , 7]);
                client = (0, exports.getPrismaClient)();
                queryArgs = { select: { id: true }, take: 1 };
                if (!(prismaMode === 'accelerate')) return [3 /*break*/, 3];
                return [4 /*yield*/, client.conversation.findMany(__assign(__assign({}, queryArgs), { cacheStrategy: { ttl: 60 } }))];
            case 2:
                _a.sent();
                return [3 /*break*/, 5];
            case 3: return [4 /*yield*/, client.conversation.findMany(queryArgs)];
            case 4:
                _a.sent();
                _a.label = 5;
            case 5:
                baseDetail = prismaMode === 'accelerate' ? 'Prisma Accelerate query check passed (cached)' : 'Prisma query check passed';
                return [2 /*return*/, {
                        status: 'ok',
                        configured: true,
                        detail: prismaDetail ? "".concat(baseDetail, " \u00B7 ").concat(prismaDetail) : baseDetail,
                    }];
            case 6:
                error_1 = _a.sent();
                console.error('Prisma runtime status check failed:', error_1);
                if (error_1 instanceof Error) {
                    if (error_1.message.includes('prisma+postgres://')) {
                        return [2 /*return*/, {
                                status: 'warn',
                                configured: false,
                                detail: error_1.message,
                            }];
                    }
                    if (error_1.message.includes('Missing PRISMA_ACCELERATE_URL')) {
                        return [2 /*return*/, {
                                status: 'warn',
                                configured: false,
                                detail: error_1.message,
                            }];
                    }
                    if (error_1.message.includes('PrismaClient') &&
                        (error_1.message.includes('PrismaClientOptions') || error_1.message.includes('datasourceUrl'))) {
                        return [2 /*return*/, {
                                status: 'warn',
                                configured: true,
                                detail: "Prisma runtime configuration warning: ".concat(error_1.message),
                            }];
                    }
                }
                return [2 /*return*/, {
                        status: 'error',
                        configured: true,
                        detail: "Prisma query failed: ".concat(error_1 instanceof Error ? error_1.message : String(error_1)),
                    }];
            case 7: return [2 /*return*/];
        }
    });
}); };
exports.getPrismaRuntimeStatus = getPrismaRuntimeStatus;
