// ==========================================================================
// VAPEBAZAR — Telegram Relay (Vercel Edge Function)
// ==========================================================================
// Vercel Edge: тот же Web API что у Cloudflare Workers, но env-переменные
// читаются через process.env, а не через аргумент env.
// Деплой: vercel.com → Import Git Repository → borodota/bazar
//         Settings → Environment Variables → BOT_TOKEN = <токен>
// ==========================================================================

export const config = { runtime: "edge" };

const ADMIN_IDS = [6163521938, 5289357165];

export default async function handler(request) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = new Set([
        "https://borodota.github.io", "https://bazar-amber.vercel.app",
        new URL(request.url).origin,
        ...(process.env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean),
    ]);
    const cors = {
        ...(origin && allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin",
        "Cache-Control": "no-store",
    };

    if (origin && !allowedOrigins.has(origin)) return json({ ok: false, description: "origin not allowed" }, 403, cors);

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
        return json({ ok: false, description: "POST only" }, 405, cors);
    }

    const token = process.env.BOT_TOKEN;
    if (!token) {
        return json({ ok: false, description: "relay not configured: set BOT_TOKEN env var" }, 500, cors);
    }

    let body;
    try {
        const raw = await readLimitedBody(request, 32768);
        if (raw === null) return json({ ok: false, description: "request too large" }, 413, cors);
        body = JSON.parse(raw);
    } catch (e) {
        return json({ ok: false, description: "bad json" }, 400, cors);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json({ ok: false, description: "expected a JSON object" }, 400, cors);
    }

    // Проверяем подпись Telegram WebApp
    const user = await validateInitData(body.initData || "", token);
    if (!user) {
        return json({ ok: false, description: "initData invalid or missing" }, 403, cors);
    }

    const action = body.action || "sendMessage";
    if (!["getAvatar", "sendMessage"].includes(action)) return json({ ok: false, description: "unknown action" }, 400, cors);

    // ── GET AVATAR ────────────────────────────────────────────────────────────
    if (action === "getAvatar") {
        const userId = Number(user.id);
        let photosData;
        try {
            const r = await fetch("https://api.telegram.org/bot" + token + "/getUserProfilePhotos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, limit: 1 }),
            });
            photosData = await r.json();
        } catch (e) {
            return json({ ok: false, description: "telegram unreachable" }, 502, cors);
        }
        if (!photosData.ok || !photosData.result.total_count) {
            return json({ ok: false, description: "no photo" }, 404, cors);
        }
        const sizes = photosData.result.photos[0];
        const chosen = sizes[Math.min(1, sizes.length - 1)];
        let fileData;
        try {
            const r = await fetch("https://api.telegram.org/bot" + token + "/getFile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ file_id: chosen.file_id }),
            });
            fileData = await r.json();
        } catch (e) {
            return json({ ok: false, description: "getFile unreachable" }, 502, cors);
        }
        if (!fileData.ok) {
            return json({ ok: false, description: "getFile failed" }, 500, cors);
        }
        try {
            const imgResp = await fetch(
                "https://api.telegram.org/file/bot" + token + "/" + fileData.result.file_path,
                { signal: AbortSignal.timeout(8000) }
            );
            if (!imgResp.ok) throw new Error("avatar download failed");
            const ct = imgResp.headers.get("Content-Type") || "image/jpeg";
            if (!ct.startsWith("image/")) throw new Error("invalid avatar type");
            return new Response(await imgResp.arrayBuffer(), {
                status: 200, headers: { ...cors, "Content-Type": ct, "Cache-Control": "private, no-store" },
            });
        } catch (_) {
            return json({ ok: false, description: "avatar temporarily unavailable" }, 502, cors);
        }
    }

    // ── SEND MESSAGE ──────────────────────────────────────────────────────────
    const chatId = Number(body.chatId);
    const allowed = chatId === Number(user.id) || ADMIN_IDS.includes(chatId);
    if (!allowed) {
        return json({ ok: false, description: "recipient not allowed" }, 403, cors);
    }

    if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 4096) {
        return json({ ok: false, description: "message must contain 1–4096 characters" }, 400, cors);
    }
    if (body.parse_mode && body.parse_mode !== "HTML") {
        return json({ ok: false, description: "unsupported parse mode" }, 400, cors);
    }
    if (body.reply_markup && !validKeyboard(body.reply_markup, user.id)) {
        return json({ ok: false, description: "invalid order buttons" }, 400, cors);
    }

    const tgBody = { chat_id: chatId, text: String(body.text || "") };
    if (body.parse_mode) tgBody.parse_mode = body.parse_mode;
    if (body.reply_markup) tgBody.reply_markup = body.reply_markup;

    let data;
    try {
        const resp = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
            method: "POST",
            signal: AbortSignal.timeout(8000),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tgBody),
        });
        data = await resp.json();
    } catch (e) {
        return json({ ok: false, description: "telegram temporarily unavailable" }, 502, cors);
    }

    return json(data, 200, cors);
}

function json(obj, status, extraHeaders) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: Object.assign({ "Content-Type": "application/json" }, extraHeaders || {}),
    });
}

async function validateInitData(initData, botToken) {
    if (typeof initData !== "string" || !initData || initData.length > 16384) return null;
    let params;
    try { params = new URLSearchParams(initData); } catch (e) { return null; }
    const hash = params.get("hash");
    if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return null;
    const keys = [...params.keys()];
    if (new Set(keys).size !== keys.length) return null;
    params.delete("hash");
    const pairs = [];
    for (const [k, v] of params.entries()) pairs.push(k + "=" + v);
    pairs.sort();
    const dataCheckString = pairs.join("\n");
    const enc = new TextEncoder();
    const secretKey = await hmac(enc.encode("WebAppData"), enc.encode(botToken));
    const computed = await hmac(secretKey, enc.encode(dataCheckString));
    const actual = toHex(computed);
    let mismatch = 0;
    for (let i = 0; i < hash.length; i++) mismatch |= actual.charCodeAt(i) ^ hash.charCodeAt(i);
    if (mismatch) return null;
    const authDate = Number(params.get("auth_date") || 0);
    const age = Date.now() / 1000 - authDate;
    if (!Number.isInteger(authDate) || authDate <= 0 || age > 86400 || age < -60) return null;
    try {
        const user = JSON.parse(params.get("user") || "null");
        return user && Number.isSafeInteger(user.id) && user.id > 0 ? user : null;
    } catch (_) { return null; }
}

async function readLimitedBody(request, limit) {
    if (Number(request.headers.get("Content-Length")) > limit) return null;
    if (!request.body) return "";
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let size = 0, text = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > limit) { await reader.cancel(); return null; }
            text += decoder.decode(value, { stream: true });
        }
        return text + decoder.decode();
    } finally { reader.releaseLock(); }
}

function validKeyboard(markup, userId) {
    if (!Array.isArray(markup.inline_keyboard) || markup.inline_keyboard.length > 8) return false;
    return markup.inline_keyboard.every(row => Array.isArray(row) && row.length <= 4 && row.every(button => {
        if (!button || typeof button.text !== "string" || button.text.length > 64) return false;
        if (button.callback_data) {
            if (typeof button.callback_data !== "string" || new TextEncoder().encode(button.callback_data).length > 64) return false;
            const parts = button.callback_data.split("_");
            if (parts[0] === "st") {
                return ["accept", "pack", "ship", "done", "cancel"].includes(parts[1]) &&
                    /^[A-Za-z0-9-]{1,16}$/.test(parts[2]) && parts[3] === String(userId) &&
                    (parts.length === 5 || (parts[1] === "accept" && parts.length === 8)) &&
                    parts.slice(4).every(v => /^\d{1,16}$/.test(v));
            }
            return false;
        }
        if (typeof button.url !== "string") return false;
        return button.url === "tg://user?id=" + userId || /^https:\/\/t\.me\/[A-Za-z0-9_]+$/.test(button.url);
    }));
}

async function hmac(keyBytes, msgBytes) {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, msgBytes));
}

function toHex(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
}
