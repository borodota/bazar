// ==========================================================================
// VAPEBAZAR — Telegram Relay (Cloudflare Worker)
// ==========================================================================
// Зачем нужен: токен бота больше НЕ лежит в script.js (он раздаётся публично
// через GitHub Pages, и любой мог им завладеть). Теперь токен хранится здесь,
// в секрете воркера, и наружу не виден. Браузер магазина шлёт заказ сюда,
// а воркер уже сам обращается к Telegram своим скрытым токеном.
//
// Защита от злоупотреблений:
//  1. Проверяем подпись Telegram WebApp (initData) — нельзя подделать клиента.
//  2. Слать можно только себе (своему Telegram ID) или админам из списка ниже.
//     Превратить релей в спам-машину через чужой бот не получится.
//
// Деплой: см. relay/README.md
// ==========================================================================

// Кому магазин имеет право слать уведомления о заказах (Telegram ID админов).
// Должны совпадать с ORDER_ADMIN_IDS в script.js.
const ADMIN_IDS = [6163521938, 5289357165];

export default {
    async fetch(request, env, ctx) {
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

        const token = env.BOT_TOKEN;
        if (!token) {
            return json({ ok: false, description: "relay not configured: set BOT_TOKEN secret" }, 500, cors);
        }

        let body;
        try {
            body = await request.json();
        } catch (e) {
            return json({ ok: false, description: "bad json" }, 400, cors);
        }

        // 1. Проверяем подпись Telegram WebApp
        const user = await validateInitData(body.initData || "", token);
        if (!user) {
            return json({ ok: false, description: "initData invalid or missing" }, 403, cors);
        }

        // ── Роутинг по action ──────────────────────────────────────────────────
        const action = body.action || "sendMessage";

        // ── GET AVATAR ─────────────────────────────────────────────────────────
        if (action === "getAvatar") {
            // Юзер авторизован через initData — запрашиваем только его собственное фото.
            const userId = Number(user.id);

            // Кэш на edge: повторные открытия профиля отдаются мгновенно,
            // Telegram не дёргается лишний раз. Ключ — по id пользователя.
            const cache = caches.default;
            const cacheKey = new Request("https://avatar-cache.internal/u/" + userId);
            const hit = await cache.match(cacheKey);
            if (hit) {
                const h = new Headers(hit.headers);
                for (const k in cors) h.set(k, cors[k]);
                return new Response(hit.body, { status: 200, headers: h });
            }

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
            // Берём средний размер (index 1 при наличии, иначе 0)
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

            // Кладём в edge-кэш на сутки (без CORS — их добавим при отдаче).
            const cacheable = new Response(imgBytes, {
                status: 200,
                headers: { "Content-Type": ct, "Cache-Control": "public, max-age=86400" },
            });
            ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));

            const h = new Headers(cacheable.headers);
            for (const k in cors) h.set(k, cors[k]);
            return new Response(imgBytes, { status: 200, headers: h });
        }

        // ── SEND MESSAGE ───────────────────────────────────────────────────────

        // 2. Разрешаем отправку только себе или админам
        const chatId = Number(body.chatId);
        const allowed = chatId === Number(user.id) || ADMIN_IDS.includes(chatId);
        if (!allowed) {
            return json({ ok: false, description: "recipient not allowed" }, 403, cors);
        }

        // 3. Пересылаем в Telegram скрытым токеном
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
    },
};

function json(obj, status, extraHeaders) {
    return new Response(JSON.stringify(obj), {
        status: status,
        headers: Object.assign({ "Content-Type": "application/json" }, extraHeaders || {}),
    });
}

// ── Проверка подписи Telegram WebApp initData ──
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
// hash       = HMAC_SHA256(key=secret_key,  msg=data_check_string)
async function validateInitData(initData, botToken) {
    if (!initData) return null;
    let params;
    try {
        params = new URLSearchParams(initData);
    } catch (e) {
        return null;
    }
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
    const computedHex = toHex(computed);

    if (computedHex !== hash) return null;

    // Свежесть: подпись не старше 24 часов (защита от повторов)
    const authDate = Number(params.get("auth_date") || 0);
    if (authDate && Date.now() / 1000 - authDate > 86400) return null;

    const userRaw = params.get("user");
    try {
        return userRaw ? JSON.parse(userRaw) : {};
    } catch (e) {
        return {};
    }
}

async function hmac(keyBytes, msgBytes) {
    const key = await crypto.subtle.importKey(
        "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, msgBytes);
    return new Uint8Array(sig);
}

function toHex(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
}
