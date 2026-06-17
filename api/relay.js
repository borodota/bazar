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
    const cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: cors });
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
        body = await request.json();
    } catch (e) {
        return json({ ok: false, description: "bad json" }, 400, cors);
    }

    // Проверяем подпись Telegram WebApp
    const user = await validateInitData(body.initData || "", token);
    if (!user) {
        return json({ ok: false, description: "initData invalid or missing" }, 403, cors);
    }

    const action = body.action || "sendMessage";

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
        const imgResp = await fetch(
            "https://api.telegram.org/file/bot" + token + "/" + fileData.result.file_path
        );
        const imgBytes = await imgResp.arrayBuffer();
        const ct = imgResp.headers.get("Content-Type") || "image/jpeg";
        return new Response(imgBytes, {
            status: 200,
            headers: Object.assign({ "Content-Type": ct, "Cache-Control": "public, max-age=86400" }, cors),
        });
    }

    // ── SEND MESSAGE ──────────────────────────────────────────────────────────
    const chatId = Number(body.chatId);
    const allowed = chatId === Number(user.id) || ADMIN_IDS.includes(chatId);
    if (!allowed) {
        return json({ ok: false, description: "recipient not allowed" }, 403, cors);
    }

    const tgBody = { chat_id: chatId, text: String(body.text || "") };
    if (body.parse_mode) tgBody.parse_mode = body.parse_mode;
    if (body.reply_markup) tgBody.reply_markup = body.reply_markup;

    let data;
    try {
        const resp = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tgBody),
        });
        data = await resp.json();
    } catch (e) {
        return json({ ok: false, description: "telegram unreachable: " + (e.message || e) }, 502, cors);
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
    if (!initData) return null;
    let params;
    try { params = new URLSearchParams(initData); } catch (e) { return null; }
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const pairs = [];
    for (const [k, v] of params.entries()) pairs.push(k + "=" + v);
    pairs.sort();
    const dataCheckString = pairs.join("\n");
    const enc = new TextEncoder();
    const secretKey = await hmac(enc.encode("WebAppData"), enc.encode(botToken));
    const computed = await hmac(secretKey, enc.encode(dataCheckString));
    if (toHex(computed) !== hash) return null;
    const authDate = Number(params.get("auth_date") || 0);
    if (authDate && Date.now() / 1000 - authDate > 86400) return null;
    try { return params.get("user") ? JSON.parse(params.get("user")) : {}; } catch (e) { return {}; }
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
