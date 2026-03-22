"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeBoardItem = exports.inferBoardMapping = exports.mergeBoardMappings = exports.readBoardMappingFromEnv = exports.coerceBoardMapping = void 0;
var asNullableString = function (value) {
    if (typeof value === 'string' && value.trim().length > 0)
        return value.trim();
    return null;
};
var coerceBoardMapping = function (value) {
    if (typeof value !== 'object' || value === null)
        return null;
    var row = value;
    return {
        callDateColumnId: asNullableString(row.callDateColumnId),
        setterColumnId: asNullableString(row.setterColumnId),
        stageColumnId: asNullableString(row.stageColumnId),
        outcomeColumnId: asNullableString(row.outcomeColumnId),
        phoneColumnId: asNullableString(row.phoneColumnId),
        contactIdColumnId: asNullableString(row.contactIdColumnId),
    };
};
exports.coerceBoardMapping = coerceBoardMapping;
var parseJsonMapping = function (raw) {
    var value = (raw || '').trim();
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch (_a) {
        return null;
    }
};
var readBoardMappingFromEnv = function (raw) {
    return (0, exports.coerceBoardMapping)(parseJsonMapping(raw !== null && raw !== void 0 ? raw : process.env.MONDAY_ACQ_COLUMN_MAP_JSON));
};
exports.readBoardMappingFromEnv = readBoardMappingFromEnv;
var mergeBoardMappings = function (base, override) {
    if (!base && !override)
        return null;
    if (!base)
        return override;
    if (!override)
        return base;
    return {
        callDateColumnId: override.callDateColumnId || base.callDateColumnId,
        setterColumnId: override.setterColumnId || base.setterColumnId,
        stageColumnId: override.stageColumnId || base.stageColumnId,
        outcomeColumnId: override.outcomeColumnId || base.outcomeColumnId,
        phoneColumnId: override.phoneColumnId || base.phoneColumnId,
        contactIdColumnId: override.contactIdColumnId || base.contactIdColumnId,
    };
};
exports.mergeBoardMappings = mergeBoardMappings;
var normalize = function (value) { return value.trim().toLowerCase(); };
var findColumnBySignals = function (columns, signals) {
    var normalizedSignals = signals.map(function (signal) { return signal.toLowerCase(); });
    var _loop_1 = function (column) {
        var haystack = "".concat(normalize(column.id), " ").concat(normalize(column.title), " ").concat(normalize(column.type));
        if (normalizedSignals.some(function (signal) { return haystack.includes(signal); })) {
            return { value: column.id };
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
var inferBoardMapping = function (columns) {
    return {
        callDateColumnId: findColumnBySignals(columns, ['call date', 'date', 'meeting date', 'date4']),
        setterColumnId: findColumnBySignals(columns, ['setter', 'owner', 'assignee', 'people']),
        stageColumnId: findColumnBySignals(columns, ['stage', 'pipeline', 'status']),
        outcomeColumnId: findColumnBySignals(columns, ['outcome', 'result', 'disposition']),
        phoneColumnId: findColumnBySignals(columns, ['phone', 'mobile']),
        contactIdColumnId: findColumnBySignals(columns, ['contact id', 'contactid', 'hubspot id']),
    };
};
exports.inferBoardMapping = inferBoardMapping;
var getValueByColumnId = function (item, columnId) {
    if (!columnId)
        return null;
    var column = item.columnValues.find(function (value) { return value.id === columnId; });
    if (!column)
        return null;
    return { text: column.text, value: column.value };
};
var parseIsoDate = function (candidate) {
    if (!candidate)
        return null;
    var directMatch = candidate.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (directMatch === null || directMatch === void 0 ? void 0 : directMatch[1])
        return directMatch[1];
    var parsed = new Date(candidate);
    if (!Number.isFinite(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
};
var parseMondayDateValue = function (columnValue) {
    if (!columnValue)
        return null;
    var fromText = parseIsoDate(columnValue.text);
    if (fromText)
        return fromText;
    if (columnValue.value) {
        try {
            var parsed = JSON.parse(columnValue.value);
            if (parsed.date)
                return parseIsoDate(parsed.date);
            if (parsed.changed_at)
                return parseIsoDate(parsed.changed_at);
        }
        catch (_a) {
            // ignore malformed JSON and continue with null
        }
    }
    return null;
};
var classifyDisposition = function (stage, outcome) {
    var text = "".concat(stage || '', " ").concat(outcome || '').toLowerCase();
    if (!text.trim())
        return null;
    if (/\bno[\s-]?show\b/.test(text))
        return 'no_show';
    if (/\bcancel|cancelled|canceled|resched/i.test(text))
        return 'cancelled';
    if (/\bbooked|appointment|strategy call booked|showed|closed won\b/.test(text))
        return 'booked';
    return 'other';
};
var normalizePhone = function (value) {
    if (!value)
        return null;
    var digits = value.replace(/\D/g, '');
    return digits.length >= 7 ? digits : null;
};
var normalizeBoardItem = function (item, mapping) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    var updatedAt = new Date(item.updatedAt);
    if (!Number.isFinite(updatedAt.getTime()))
        return null;
    var stage = ((_b = (_a = getValueByColumnId(item, mapping.stageColumnId)) === null || _a === void 0 ? void 0 : _a.text) === null || _b === void 0 ? void 0 : _b.trim()) || null;
    var outcome = ((_d = (_c = getValueByColumnId(item, mapping.outcomeColumnId)) === null || _c === void 0 ? void 0 : _c.text) === null || _d === void 0 ? void 0 : _d.trim()) || null;
    var setter = ((_f = (_e = getValueByColumnId(item, mapping.setterColumnId)) === null || _e === void 0 ? void 0 : _e.text) === null || _f === void 0 ? void 0 : _f.trim()) || null;
    var callDate = parseMondayDateValue(getValueByColumnId(item, mapping.callDateColumnId));
    var contactId = ((_h = (_g = getValueByColumnId(item, mapping.contactIdColumnId)) === null || _g === void 0 ? void 0 : _g.text) === null || _h === void 0 ? void 0 : _h.trim()) || null;
    var phone = normalizePhone(((_j = getValueByColumnId(item, mapping.phoneColumnId)) === null || _j === void 0 ? void 0 : _j.text) || null);
    var disposition = classifyDisposition(stage, outcome);
    // Business rule: items on this board represent booked calls (this is not our CRM).
    // If mapping fails to detect booked status, default to true so we don't silently drop booked calls.
    var isBooked = true;
    // Prefer stable identifiers when available, but fall back to item name so we can still link
    // to conversations via fuzzy matching (names should match Aloware/Slack per our workflow).
    var contactKey = contactId
        ? "contact:".concat(contactId)
        : phone
            ? "phone:".concat(phone)
            : ((_k = item.name) === null || _k === void 0 ? void 0 : _k.trim())
                ? "name:".concat(item.name.trim())
                : null;
    return {
        itemId: item.id,
        itemName: item.name,
        updatedAt: updatedAt,
        callDate: callDate,
        setter: setter,
        stage: stage,
        disposition: disposition,
        isBooked: isBooked,
        contactKey: contactKey,
        raw: item,
    };
};
exports.normalizeBoardItem = normalizeBoardItem;
