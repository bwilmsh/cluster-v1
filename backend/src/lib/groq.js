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
exports.generateDailyBriefing = generateDailyBriefing;
exports.suggestHabitSlot = suggestHabitSlot;
var GROQ_CHAT_MODEL = process.env.GROQ_DEFAULT_MODEL || 'llama-3.1-8b-instant';
function getGroqApiKey() {
    var key = process.env.GROQ_API_KEY;
    return typeof key === 'string' && key.trim() ? key.trim() : null;
}
function parseGroqSuggestion(content) {
    var _a, _b, _c, _d;
    var text = String(content !== null && content !== void 0 ? content : '').trim();
    if (!text)
        return null;
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            var parsed = JSON.parse(jsonMatch[0]);
            var startTime_1 = String((_a = parsed.startTime) !== null && _a !== void 0 ? _a : '').trim();
            var reason_1 = String((_b = parsed.reason) !== null && _b !== void 0 ? _b : '').trim();
            if (/^\d{2}:\d{2}$/.test(startTime_1) && reason_1) {
                return { startTime: startTime_1, reason: reason_1 };
            }
        }
        catch (_e) {
            // fall through
        }
    }
    var lines = text.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    if (lines.length === 0)
        return null;
    var firstLine = lines[0];
    var match = firstLine.match(/^(\d{2}:\d{2})(?:\s*[-–:|]\s*(.*))?$/);
    if (!match)
        return null;
    var startTime = match[1];
    var inlineReason = (_d = (_c = match[2]) === null || _c === void 0 ? void 0 : _c.trim()) !== null && _d !== void 0 ? _d : '';
    var reason = inlineReason || lines.slice(1).join(' ').trim();
    if (!reason)
        return null;
    return { startTime: startTime, reason: reason };
}
function runGroqChat(messages_1) {
    return __awaiter(this, arguments, void 0, function (messages, temperature) {
        var apiKey, response, payload;
        var _a, _b, _c, _d;
        if (temperature === void 0) { temperature = 0.2; }
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    apiKey = getGroqApiKey();
                    if (!apiKey)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, fetch('https://api.groq.com/openai/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                Authorization: "Bearer ".concat(apiKey),
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                model: GROQ_CHAT_MODEL,
                                temperature: temperature,
                                messages: messages,
                            }),
                        })];
                case 1:
                    response = _e.sent();
                    if (!response.ok)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, response.json().catch(function () { return null; })];
                case 2:
                    payload = (_e.sent());
                    return [2 /*return*/, ((_d = (_c = (_b = (_a = payload === null || payload === void 0 ? void 0 : payload.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.trim()) || null];
            }
        });
    });
}
function generateDailyBriefing(input) {
    return __awaiter(this, void 0, void 0, function () {
        var hasApiKey, compactTasks, compactEvents, systemPrompt, userPrompt, content, singleLine;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    hasApiKey = getGroqApiKey();
                    if (!hasApiKey)
                        return [2 /*return*/, null];
                    compactTasks = input.tasks.slice(0, 15).map(function (task) {
                        var _a, _b;
                        return ({
                            title: task.title,
                            status: (_a = task.status) !== null && _a !== void 0 ? _a : 'todo',
                            start_time: task.start_time,
                            end_time: (_b = task.end_time) !== null && _b !== void 0 ? _b : null,
                        });
                    });
                    compactEvents = input.events.slice(0, 15).map(function (event) {
                        var _a, _b;
                        return ({
                            title: event.title,
                            itemType: (_a = event.itemType) !== null && _a !== void 0 ? _a : 'event',
                            start_time: event.start_time,
                            end_time: (_b = event.end_time) !== null && _b !== void 0 ? _b : null,
                        });
                    });
                    systemPrompt = 'You are Cluster AI. Write exactly one concise sentence (max 22 words) as a practical daily briefing. Be direct, neutral, and useful. No emojis. No markdown. No greeting.';
                    userPrompt = "Today task context: ".concat(JSON.stringify(compactTasks), ". Today event context: ").concat(JSON.stringify(compactEvents), ". Output exactly one sentence summary with no extra commentary.");
                    return [4 /*yield*/, runGroqChat([
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt },
                        ])];
                case 1:
                    content = _a.sent();
                    if (!content)
                        return [2 /*return*/, null];
                    singleLine = content.replace(/\s+/g, ' ').trim();
                    if (!singleLine)
                        return [2 /*return*/, null];
                    return [2 /*return*/, singleLine];
            }
        });
    });
}
function suggestHabitSlot(input) {
    return __awaiter(this, void 0, void 0, function () {
        var systemPrompt, habitNote, noteLine, userPrompt, content;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    systemPrompt = 'You are Cluster, an AI habit scheduler. Return only JSON with startTime in HH:MM format and a short reason sentence. Keep the reason crisp, practical, and free of filler.';
                    habitNote = (_a = input.habitNote) === null || _a === void 0 ? void 0 : _a.trim();
                    noteLine = habitNote ? "AI note from the user: ".concat(habitNote, ".") : '';
                    userPrompt = "You are Cluster. The user has a habit called ".concat(input.habitName, " that takes ").concat(input.durationMinutes, " minutes. ").concat(noteLine, " Here are their calendar events for today: ").concat(JSON.stringify(input.events), ". Find the best available time slot between 6am and 10pm that does not conflict with any existing event, and write the reason as a single natural sentence. Respond with JSON only in this shape: {\"startTime\":\"HH:MM\",\"reason\":\"short note\"}.");
                    return [4 /*yield*/, runGroqChat([
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt },
                        ])];
                case 1:
                    content = _b.sent();
                    if (!content)
                        return [2 /*return*/, null];
                    return [2 /*return*/, parseGroqSuggestion(content)];
            }
        });
    });
}
