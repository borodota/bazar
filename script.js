// ==========================================================================
// VAPEBAZAR PREMIUM ENGINE 3.0 — FULL REWORK
// ==========================================================================

window.cart = [];
window.products = [];
window.currentPopupProduct = null;
window.selectedFlavorInPopup = null;
window.currentCategory = "Все";
window.currentDeliveryMethod = "pickup";
window.appliedPromo = null;
window.currentSort = "default";
window.currentFilter = null;
window.wishlist = [];

const PROMO_CODES = {
    "BORO":       { discount: 0.10, label: "Скидка 10% 🎉" },
    "НОВИЧОК10":  { discount: 0.10, label: "Скидка 10% для новичка 🎁" },
};
const MIN_ORDER_AMOUNT = 500;
const DELIVERY_COST = 250;
const FREE_DELIVERY_THRESHOLD = 2000;
const FEATURED_IDS = ["pod_aegis_hero_5", "pod_xros_5_mini", "dis_lost_mary_30000", "liq_anarhia_v2_brand"];
const RELATED_PRODUCTS = {
    "pod_aegis_hero_5":    ["isp_geekvape_b", "liq_anarhia_v2_brand", "rba_base"],
    "pod_xros_5":          ["cart_xros_all", "liq_narcoz", "liq_inflave"],
    "pod_xros_5_mini":     ["cart_xros_all", "liq_oggo_premium", "liq_annima_love"],
    "pod_knight_aio":      ["isp_manto_015", "rba_base", "liq_anarhia_v2_brand"],
    "pod_pasito2_le":      ["cart_pasito2", "isp_smoant_k", "liq_inflave"],
    "dis_lost_mary_30000": ["liq_anarhia_v2_brand", "liq_narcoz"],
    "dis_mfu_40000":       ["liq_podonki", "liq_inflave"],
    "dis_rick_morty_25000":["liq_annima_love", "liq_oggo_premium"],
    "liq_anarhia_v2_brand":["pod_xros_5_mini", "cart_xros_all"],
    "liq_podonki":         ["pod_xros_5_mini", "cart_xros_all"],
    "liq_narcoz":          ["pod_xros_5", "cart_xros_all"],
    "liq_inflave":         ["pod_xros_5", "pod_pasito2_le"],
};

window.tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

// ── ОТПРАВКА ЗАКАЗОВ ──
// tg.sendData() работает ТОЛЬКО если магазин открыт через кнопку клавиатуры
// в чате бота; при открытии через меню/профиль/ссылку данные молча теряются.
// Поэтому шлём через Bot API.
//
// ⚠️ БЕЗОПАСНОСТЬ: токен бота НЕЛЬЗЯ держать в этом файле — он раздаётся
// публично через GitHub Pages. Правильный путь — релей на Cloudflare Worker
// (см. relay/worker.js и relay/README.md): токен живёт там, в секрете.
// После деплоя воркера вставь его адрес в RELAY_URL ниже — и удали BOT_API_TOKEN.
const RELAY_URL = ""; // напр. "https://vapebazar-relay.ИМЯ.workers.dev"
// Fallback на время, пока релей не настроен (RELAY_URL пуст). НЕ безопасно —
// убрать сразу, как только заработает релей.
const BOT_API_TOKEN = "8687110031:AAE9E430W55aRQQuUwDI8hEMjaVliq_gbG4";
const ORDER_ADMIN_IDS = [6163521938, 5289357165];
const MANAGER_TG = "BORO_DOTA";

// ── БОНУСНАЯ ПРОГРАММА ──
const BONUS_RATE = 0.05;        // базовый % (Бронза); реальный % зависит от уровня
const BONUS_MAX_REDEEM = 0.20;  // баллами можно оплатить не больше 20% заказа
const REFERRAL_REWARD = 200;    // баллов пригласившему — начисляет БОТ после 1-го оплаченного заказа друга
const REFERRAL_DISCOUNT = 0.05; // скидка приглашённому на первый заказ
const BONUS_KEY = "vapeBonus";
window.bonusApplied = false;    // списывает ли клиент баллы в текущем заказе

// ── УРОВНИ КЛИЕНТА (по сумме всех покупок) ──
const SPENT_KEY = "vapeTotalSpent";
const LEVELS = [
    { key: "bronze",   name: "Бронза",   min: 0,     rate: 0.05, icon: "🥉", color: "#cd7f32" },
    { key: "silver",   name: "Серебро",  min: 5000,  rate: 0.07, icon: "🥈", color: "#c7cdd6" },
    { key: "gold",     name: "Золото",   min: 15000, rate: 0.10, icon: "🥇", color: "#ffd166" },
    { key: "platinum", name: "Платина",  min: 40000, rate: 0.12, icon: "💠", color: "#7df9ff" }
];

// ── ВРЕМЯ РАБОТЫ МАГАЗИНА ──
const SHOP_OPEN_HOUR = 10;   // открытие 10:00
const SHOP_CLOSE_HOUR = 22;  // закрытие 22:00

function escHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function tgApiSend(chatId, text, replyMarkup) {
    // Безопасный путь: через релей (токен скрыт на сервере воркера)
    const doSend = RELAY_URL
        ? async (body) => {
            const payload = {
                initData: (window.tg && window.tg.initData) || "",
                chatId: body.chat_id,
                text: body.text,
            };
            if (body.parse_mode) payload.parse_mode = body.parse_mode;
            if (body.reply_markup) payload.reply_markup = body.reply_markup;
            const resp = await fetch(RELAY_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            return resp.json();
        }
        // Fallback: прямой вызов Bot API (пока релей не настроен)
        : async (body) => {
            const resp = await fetch("https://api.telegram.org/bot" + BOT_API_TOKEN + "/sendMessage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            return resp.json();
        };

    const body = { chat_id: chatId, text, parse_mode: "HTML" };
    if (replyMarkup) body.reply_markup = replyMarkup;

    let data = await doSend(body);

    // если HTML не распарсился — шлём без разметки
    if (!data.ok) {
        console.warn("tgApiSend HTML failed:", data.description, "— retrying plain");
        const plainBody = { chat_id: chatId, text: text.replace(/<[^>]+>/g, "") };
        if (replyMarkup) plainBody.reply_markup = replyMarkup;
        data = await doSend(plainBody);
    }

    if (!data.ok) throw new Error(data.description || "sendMessage failed");
    return data;
}

// Шлёт текст всем админам; resolve = доставлено хотя бы одному
function notifyAdmins(text, replyMarkup) {
    return Promise.allSettled(ORDER_ADMIN_IDS.map(id => tgApiSend(id, text, replyMarkup)))
        .then(results => {
            if (!results.some(r => r.status === "fulfilled")) {
                const errs = results.map(r => r.reason?.message || "unknown error").join(" | ");
                throw new Error(errs);
            }
        });
}

function tgCurrentUser() {
    try { return (window.tg && window.tg.initDataUnsafe && window.tg.initDataUnsafe.user) || null; } catch (e) { return null; }
}

// ── Хелпер: вибро-отклик ──
function haptic(type) {
    if (!window.tg || !window.tg.HapticFeedback) return;
    try {
        if (type === "light") window.tg.HapticFeedback.impactOccurred("light");
        else if (type === "medium") window.tg.HapticFeedback.impactOccurred("medium");
        else if (type === "success") window.tg.HapticFeedback.notificationOccurred("success");
        else if (type === "error") window.tg.HapticFeedback.notificationOccurred("error");
        else if (type === "select") window.tg.HapticFeedback.selectionChanged();
    } catch (e) {}
}

function fmt(n) { return n.toLocaleString("ru-RU"); }

// ── БОНУСЫ: localStorage как быстрый кэш + зеркало в Telegram CloudStorage ──
function bonusGet() {
    const v = parseInt(localStorage.getItem(BONUS_KEY) || "0", 10);
    return (isNaN(v) || v < 0) ? 0 : v;
}
function bonusSet(v) {
    v = Math.max(0, Math.round(v || 0));
    localStorage.setItem(BONUS_KEY, String(v));
    try {
        if (window.tg && window.tg.CloudStorage && window.tg.CloudStorage.setItem) {
            window.tg.CloudStorage.setItem(BONUS_KEY, String(v), function () {});
        }
    } catch (e) {}
    return v;
}
// При старте подтягиваем баланс из облака (синхрон между устройствами клиента)
function bonusSyncFromCloud(cb) {
    try {
        if (window.tg && window.tg.CloudStorage && window.tg.CloudStorage.getItem) {
            window.tg.CloudStorage.getItem(BONUS_KEY, function (err, val) {
                if (!err && val != null && val !== "") {
                    const cloud = parseInt(val, 10);
                    if (!isNaN(cloud) && cloud > bonusGet()) localStorage.setItem(BONUS_KEY, String(cloud));
                }
                if (cb) cb();
            });
            return;
        }
    } catch (e) {}
    if (cb) cb();
}

// ── УРОВНИ: сумма всех покупок ──
function spentGet() {
    const v = parseInt(localStorage.getItem(SPENT_KEY) || "0", 10);
    return (isNaN(v) || v < 0) ? 0 : v;
}
function spentAdd(amount) {
    const v = spentGet() + Math.max(0, Math.round(amount || 0));
    localStorage.setItem(SPENT_KEY, String(v));
    try {
        if (window.tg && window.tg.CloudStorage && window.tg.CloudStorage.setItem) {
            window.tg.CloudStorage.setItem(SPENT_KEY, String(v), function () {});
        }
    } catch (e) {}
    return v;
}
function spentSyncFromCloud(cb) {
    try {
        if (window.tg && window.tg.CloudStorage && window.tg.CloudStorage.getItem) {
            window.tg.CloudStorage.getItem(SPENT_KEY, function (err, val) {
                if (!err && val != null && val !== "") {
                    const cloud = parseInt(val, 10);
                    if (!isNaN(cloud) && cloud > spentGet()) localStorage.setItem(SPENT_KEY, String(cloud));
                }
                if (cb) cb();
            });
            return;
        }
    } catch (e) {}
    if (cb) cb();
}
function currentLevel() {
    const s = spentGet();
    let lvl = LEVELS[0];
    for (const l of LEVELS) if (s >= l.min) lvl = l;
    return lvl;
}
function nextLevel() {
    const s = spentGet();
    return LEVELS.find(l => l.min > s) || null;
}
function bonusRate() { return currentLevel().rate; }

// ── СНАПШОТЫ ЦЕН ДЛЯ ИЗБРАННОГО (уведомление о снижении) ──
function wishPricesGet() {
    try { return JSON.parse(localStorage.getItem("vapeWishPrices") || "{}"); } catch (e) { return {}; }
}
function wishPricesSet(m) { localStorage.setItem("vapeWishPrices", JSON.stringify(m)); }

// ── ИНИЦИАЛИЗАЦИЯ ──
window.initVapeApp = function () {
    let raw = window.VAPE_PRODUCTS || window.products;
    if (typeof raw !== "undefined") {
        window.products = Array.isArray(raw) ? raw : Object.values(raw).filter(i => i && i.id);
        if (window.products.length > 0) {
            // показываем скелетон пока каталог не отрисован
            window.showSkeletons(6);
            window.renderCategories();
            window.renderFeatured();
            window.renderCombos();
            requestAnimationFrame(() => window.renderProducts(window.products));
        }
    } else {
        window.showSkeletons(6);
        setTimeout(window.initVapeApp, 100);
    }
};

document.addEventListener("DOMContentLoaded", () => {
    // Загрузка сохранённых данных
    try { const s = localStorage.getItem("vapeCart"); if (s) window.cart = JSON.parse(s); } catch(e) {}
    try { window.wishlist = JSON.parse(localStorage.getItem("vapeWishlist") || "[]"); } catch(e) {}

    window.initVapeApp();
    window.updateCartCounters();
    window.initReferralCode();
    window.checkIncomingReferral();
    window.startHeroTimer();
    // сначала возрастной гейт, онбординг — только после подтверждения 18+
    if (window.ageVerified()) {
        window.checkOnboarding();
    } else {
        window.showAgeGate();
    }

    if (window.tg) {
        window.tg.ready();
        window.tg.expand();
        try { window.tg.disableVerticalSwipes && window.tg.disableVerticalSwipes(); } catch (e) {}
        try { window.tg.setHeaderColor && window.tg.setHeaderColor("#07080c"); } catch (e) {}
        try { window.tg.setBackgroundColor && window.tg.setBackgroundColor("#07080c"); } catch (e) {}
        const u = window.tg.initDataUnsafe && window.tg.initDataUnsafe.user;
        if (u) {
            if (u.username) {
                const f = document.getElementById("customerTelegram");
                if (f) f.value = "@" + u.username;
            }
        }
    }
    window.setupProfile();
    bonusSyncFromCloud(() => window.updateBonusUI());
    spentSyncFromCloud(() => window.updateLevelUI());
    window.renderShopStatus();
    setInterval(window.renderShopStatus, 60000);
    window.checkWishlistPriceDrops();
    window.checkAbandonedCart();
    window.switchTab("catalog");
    let scrollTicking = false;
    window.addEventListener("scroll", () => {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(() => {
            const h = document.getElementById("appHeader");
            if (h) {
                const shouldScroll = window.scrollY > 10;
                if (h._scrolled !== shouldScroll) {
                    h.classList.toggle("scrolled", shouldScroll);
                    h._scrolled = shouldScroll;
                }
            }
            scrollTicking = false;
        });
    }, { passive: true });
    window.initSwipeToClose();
    window.initCardTilt();
});

// ── 3D TILT НА КАРТОЧКАХ (оптимизирован: rAF + кеш rect) ──
window.initCardTilt = function () {
    const TILT_SELECTOR = ".product-card, .featured-card";
    let activeCard = null;
    let activeRect = null;
    let pendingX = 0, pendingY = 0;
    let rafScheduled = false;

    function paint() {
        rafScheduled = false;
        if (!activeCard || !activeRect) return;
        const px = pendingX - activeRect.left;
        const py = pendingY - activeRect.top;
        const cx = activeRect.width / 2;
        const cy = activeRect.height / 2;
        const rx = ((py - cy) / cy) * -6;
        const ry = ((px - cx) / cx) * 6;
        activeCard.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale(0.98)`;
    }
    function schedule(x, y) {
        pendingX = x; pendingY = y;
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(paint);
    }
    function reset() {
        if (!activeCard) return;
        const c = activeCard;
        c.style.transition = "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)";
        c.style.transform = "";
        setTimeout(() => { c.style.transition = ""; c.style.willChange = ""; }, 360);
        activeCard = null; activeRect = null;
    }
    document.addEventListener("touchstart", e => {
        const card = e.target.closest(TILT_SELECTOR);
        if (!card) return;
        activeCard = card;
        activeRect = card.getBoundingClientRect();
        card.style.willChange = "transform";
        card.style.transition = "transform 0.10s ease-out";
        const t = e.touches[0];
        schedule(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener("touchmove", e => {
        if (!activeCard) return;
        const t = e.touches[0];
        schedule(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener("touchend", reset, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
};

// ── ТАБЫ ──
window.switchTab = function (target) {
    document.querySelectorAll(".tab-section").forEach(s => {
        s.classList.toggle("active", s.dataset.tab === target);
    });
    document.querySelectorAll(".tab-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.target === target);
    });
    document.body.classList.remove("tab-active-catalog","tab-active-wishlist","tab-active-history","tab-active-profile");
    document.body.classList.add("tab-active-" + target);
    if (target === "wishlist") window.renderWishlistPage();
    if (target === "history") window.renderHistoryPage();
    if (target === "profile") { window.updateBonusUI(); window.updateLevelUI(); }
    window.scrollTo({ top: 0, behavior: "instant" });
    if (window.tg && window.tg.HapticFeedback) {
        try { window.tg.HapticFeedback.selectionChanged(); } catch(e) {}
    }
};

// ── ПРОФИЛЬ ──
window.setupProfile = function () {
    const u = (window.tg && window.tg.initDataUnsafe && window.tg.initDataUnsafe.user) || null;
    const nameEl = document.getElementById("profileName");
    const handleEl = document.getElementById("profileHandle");
    const fallbackEl = document.getElementById("profileAvatarFallback");
    const imgEl = document.getElementById("profileAvatarImg");
    if (u) {
        const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Пользователь";
        if (nameEl) nameEl.innerText = fullName;
        if (handleEl) handleEl.innerText = u.username ? "@" + u.username : "VAPEBAZAR Premium";
        if (fallbackEl) fallbackEl.innerText = (u.first_name || "V").charAt(0).toUpperCase();
        if (u.photo_url && imgEl) {
            imgEl.src = u.photo_url;
            imgEl.onload = () => {
                imgEl.style.display = "block";
                if (fallbackEl) fallbackEl.style.display = "none";
            };
        }
    } else {
        if (nameEl) nameEl.innerText = "Гость";
        if (handleEl) handleEl.innerText = "VAPEBAZAR Premium";
    }
    if (localStorage.getItem("vapeNewsletterSub") === "1") {
        const pSub = document.getElementById("profileNewsletterSub");
        if (pSub) pSub.innerText = "✓ Вы подписаны на акции";
    }
};

window.showOnboardingPromo = function () {
    if (window.tg && window.tg.HapticFeedback) { try { window.tg.HapticFeedback.impactOccurred("light"); } catch(e) {} }
    const overlay = document.getElementById("onboardingOverlay");
    if (overlay) overlay.classList.add("active");
};

// ── СПЕЦЗАКАЗ ──
window._prepayAccepted = false;
window.openSpecialOrder = function () {
    haptic("light");
    const u = window.tg && window.tg.initDataUnsafe && window.tg.initDataUnsafe.user;
    if (u && u.username) {
        const tg = document.getElementById("soTelegram");
        if (tg && !tg.value) tg.value = "@" + u.username;
    }
    document.getElementById("specialOrderPopup").classList.add("active");
    window.setupBackButton(window.closeSpecialOrder);
};
window.closeSpecialOrder = function () {
    const popup = document.getElementById("specialOrderPopup");
    popup.classList.remove("active");
    const drawer = popup.querySelector(".drawer");
    if (drawer) drawer.style.transform = "";
    window.hideBackButton();
};
window.toggleSpecialPrepay = function () {
    window._prepayAccepted = !window._prepayAccepted;
    const el = document.getElementById("prepayCheck");
    if (el) el.classList.toggle("checked", window._prepayAccepted);
    haptic("select");
};
window.submitSpecialOrder = function () {
    const name = (document.getElementById("soName").value || "").trim();
    const link = (document.getElementById("soLink").value || "").trim();
    const details = (document.getElementById("soDetails").value || "").trim();
    const qty = parseInt(document.getElementById("soQty").value || "1");
    const tgUser = (document.getElementById("soTelegram").value || "").trim();
    const phone = (document.getElementById("soPhone").value || "").trim();

    if (!name) { haptic("error"); window.showToast("Укажи название товара"); return; }
    if (!tgUser && !phone) { haptic("error"); window.showToast("Укажи Telegram или телефон"); return; }
    if (!window._prepayAccepted) { haptic("error"); window.showToast("Подтверди согласие на предоплату"); return; }

    haptic("success");
    const payload = {
        type: "special_order",
        product_name: name,
        link: link,
        details: details,
        quantity: qty,
        telegram: tgUser,
        phone: phone,
        prepay_accepted: true
    };
    const user = tgCurrentUser();
    const customerId = user ? user.id : "";
    const usernameText = (user && user.username) ? "@" + user.username : "Скрыт";

    const adminText =
        `📦 <b>СПЕЦЗАКАЗ ПОД ЗАКАЗ</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👤 <b>Клиент:</b> ${escHtml(usernameText)}\n` +
        `🆔 <b>ID:</b> <code>${customerId || "не определён"}</code>\n` +
        `📞 <b>Телефон:</b> <code>${escHtml(phone || "—")}</code>\n` +
        `💬 <b>Telegram:</b> ${escHtml(tgUser || usernameText)}\n\n` +
        `🏷️ <b>Товар:</b> ${escHtml(name)}\n` +
        `🎨 <b>Детали:</b> ${escHtml(details || "—")}\n` +
        `🔗 <b>Ссылка:</b> ${escHtml(link || "—")}\n` +
        `#️⃣ <b>Кол-во:</b> ${qty} шт.\n\n` +
        `⚠️ Клиент согласен на предоплату.`;
    const kbSo = customerId ? { inline_keyboard: [[{ text: "📞 Связаться", url: "tg://user?id=" + customerId }]] } : undefined;

    window.showToast("Отправляем заявку…");
    notifyAdmins(adminText, kbSo).then(() => {
        if (customerId) {
            tgApiSend(customerId,
                `✅ <b>Заявка на спецзаказ принята!</b>\n\n` +
                `Менеджер свяжется в течение 1–2 часов чтобы согласовать сумму предоплаты и сроки.\n\n` +
                `🧑‍💻 @${MANAGER_TG}`
            ).catch(() => {});
        }
        window.showToast("Заявка отправлена ✓");
        setTimeout(() => {
            window.closeSpecialOrder();
            document.getElementById("soName").value = "";
            document.getElementById("soLink").value = "";
            document.getElementById("soDetails").value = "";
            document.getElementById("soQty").value = "1";
            document.getElementById("soPhone").value = "";
            window._prepayAccepted = false;
            document.getElementById("prepayCheck").classList.remove("checked");
        }, 800);
    }).catch((err) => {
        haptic("error");
        console.error("Special order send error:", err);
        alert(`⚠️ Не удалось отправить заявку.\n\nОшибка: ${err.message}\n\nНапишите напрямую: @${MANAGER_TG}`);
    });
};

// Цветовая тема карточки по категории
function _catTheme(cat) {
    if (!cat) return "default";
    if (cat.includes("Apple")) return "apple";
    if (cat.includes("Samsung")) return "samsung";
    if (cat.includes("Консоли")) return "gaming";
    return "default";
}

// ── КАТЕГОРИИ ──
window.renderCategories = function () {
    const container = document.getElementById("categories");
    if (!container) return;
    const cats = ["Все"];
    window.products.forEach(p => { if (p.category && !cats.includes(p.category)) cats.push(p.category); });
    container.innerHTML = "";
    cats.forEach(cat => {
        const btn = document.createElement("div");
        btn.className = `cat-btn ${cat === window.currentCategory ? "active" : ""}`;
        btn.innerText = cat;
        btn.onclick = () => {
            haptic("select");
            window.currentCategory = cat;
            document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            window.filterVapeProducts();
            window.scrollTo({ top: 0, behavior: "smooth" });
        };
        container.appendChild(btn);
    });
};

// ── ХИТЫ ──
window.renderFeatured = function () {
    const section = document.getElementById("featuredSection");
    const list = document.getElementById("featuredList");
    if (!section || !list) return;
    const featured = window.products.filter(p => FEATURED_IDS.includes(p.id) || p.isNew);
    if (featured.length === 0) return;
    section.style.display = "block";
    list.innerHTML = "";
    featured.slice(0, 8).forEach(p => {
        const card = document.createElement("div");
        card.className = "featured-card";
        card.dataset.catTheme = _catTheme(p.category);
        const imgSrc = p.image ? `img/${p.image}` : "";
        const fcLetter = p.name ? p.name.charAt(0).toUpperCase() : "V";
        const fcImg = imgSrc
            ? `<img src="${imgSrc}" alt="" style="width:100%;height:100%;object-fit:contain;padding:7px;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <div class="fc-placeholder" style="display:none;">${fcLetter}</div>`
            : `<div class="fc-placeholder">${fcLetter}</div>`;
        let badge = "";
        if (p.isNew) badge = '<div class="fc-badge new">New</div>';
        else if (p.tags && p.tags.some(t => t.includes("ХИТ") || t.includes("HOT"))) badge = '<div class="fc-badge hot">Хит</div>';
        card.innerHTML = `
            ${badge}
            <div class="fc-img">${fcImg}</div>
            <div class="fc-name">${p.name}</div>
            <div class="fc-footer">
                <div class="fc-price">${fmt(p.price)} ₽</div>
                <button class="fc-add"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>`;
        card.onclick = () => { haptic("light"); window.handleCardClick(p.id); };
        const addBtn = card.querySelector(".fc-add");
        if (addBtn) {
            addBtn.onclick = (e) => {
                e.stopPropagation();
                haptic("light");
                window.handleCardClick(p.id);
            };
        }
        list.appendChild(card);
    });
};

// ── ВЫГОДНЫЕ НАБОРЫ (КОМБО) ──
window.renderCombos = function () {
    const section = document.getElementById("combosSection");
    const list = document.getElementById("combosList");
    if (!section || !list) return;
    const combos = window.VAPE_COMBOS || [];
    if (!combos.length) { section.style.display = "none"; return; }
    section.style.display = "block";
    list.innerHTML = "";
    combos.forEach(c => {
        const save = (c.oldPrice || 0) - c.price;
        const card = document.createElement("div");
        card.className = "combo-card";
        card.innerHTML = `
            <div class="combo-top">
                <span class="combo-emoji">${c.emoji || "🎁"}</span>
                ${save > 0 ? `<span class="combo-save">выгода ${fmt(save)} ₽</span>` : ""}
            </div>
            <div class="combo-name">${c.name}</div>
            <div class="combo-items">${(c.items || []).map(i => "• " + i).join("<br>")}</div>
            <div class="combo-footer">
                <div class="combo-prices">
                    ${c.oldPrice ? `<span class="combo-old">${fmt(c.oldPrice)} ₽</span>` : ""}
                    <span class="combo-price">${fmt(c.price)} ₽</span>
                </div>
                <button class="combo-add" onclick="window.addCombo('${c.id}')">В корзину</button>
            </div>`;
        list.appendChild(card);
    });
};

window.addCombo = function (comboId) {
    const c = (window.VAPE_COMBOS || []).find(x => x.id === comboId);
    if (!c) return;
    haptic("success");
    const existing = window.cart.find(i => i.id === c.id);
    if (existing) existing.quantity += 1;
    else window.cart.push({
        id: c.id,
        name: (c.emoji ? c.emoji + " " : "") + c.name,
        price: c.price,
        flavor: "Набор: " + (c.items || []).join(", "),
        quantity: 1
    });
    window.updateCartCounters();
    window.animateFlyToCart();
    window.showToast("Набор добавлен в корзину 🎁");
};

// ── СТАТУС МАГАЗИНА (открыто/закрыто по времени) ──
window.getShopStatus = function () {
    const h = new Date().getHours();
    const open = h >= SHOP_OPEN_HOUR && h < SHOP_CLOSE_HOUR;
    return {
        open,
        text: open ? "Открыто" : "Закрыто",
        sub: open ? `до ${SHOP_CLOSE_HOUR}:00` : `с ${SHOP_OPEN_HOUR}:00`
    };
};
window.renderShopStatus = function () {
    const el = document.getElementById("shopStatus");
    if (!el) return;
    const s = window.getShopStatus();
    el.className = "shop-status " + (s.open ? "open" : "closed");
    el.innerHTML = `<span class="ss-dot"></span><span class="ss-text">${s.text}</span><span class="ss-sub">${s.sub}</span>`;
};

// ── ДОЖИМ БРОШЕННОЙ КОРЗИНЫ ──
window.checkAbandonedCart = function () {
    const banner = document.getElementById("cartReminder");
    if (!banner) return;
    const ts = parseInt(localStorage.getItem("vapeCartTs") || "0", 10);
    // показываем, если корзина не пуста и заполнена больше 20 минут назад (значит уходил и вернулся)
    if (window.cart.length > 0 && ts && (Date.now() - ts > 20 * 60 * 1000)) {
        const { total } = window.calcOrderTotals();
        const qty = window.cart.reduce((s, i) => s + i.quantity, 0);
        const txt = document.getElementById("cartReminderText");
        if (txt) txt.innerHTML = `🛒 В корзине <b>${qty} ${window.plural(qty, "товар", "товара", "товаров")}</b> на <b>${fmt(total)} ₽</b> — заверши заказ!`;
        banner.style.display = "flex";
    }
};
window.dismissCartReminder = function () {
    const b = document.getElementById("cartReminder");
    if (b) b.style.display = "none";
};

// ── УВЕДОМЛЕНИЕ О СНИЖЕНИИ ЦЕНЫ В ИЗБРАННОМ ──
window.checkWishlistPriceDrops = function () {
    const snaps = wishPricesGet();
    let dropped = 0;
    (window.wishlist || []).forEach(id => {
        const p = window.products.find(x => x.id === id);
        if (p && snaps[id] != null && p.price < snaps[id]) dropped++;
    });
    if (dropped > 0) {
        setTimeout(() => window.showToast(`🔻 Цена снизилась на ${dropped} ${window.plural(dropped, "товаре", "товарах", "товарах")} из избранного!`, 4500), 1200);
        const wishTab = document.querySelector('.tab-btn[data-target="wishlist"]');
        if (wishTab && !wishTab.classList.contains("active")) wishTab.style.color = "var(--neon-green)";
    }
};

// ── СКЕЛЕТОН-КАРТОЧКИ ──
window.showSkeletons = function (count) {
    const grid = document.getElementById("products");
    if (!grid) return;
    grid.innerHTML = Array.from({ length: count }, () =>
        `<div class="skeleton-card">
            <div class="skeleton-box skeleton-img"></div>
            <div class="skeleton-box skeleton-line"></div>
            <div class="skeleton-box skeleton-line short"></div>
        </div>`
    ).join("");
};

// ── РЕНДЕР ТОВАРОВ ──
window.renderProducts = function (list) {
    const grid = document.getElementById("products");
    if (!grid) return;
    grid.innerHTML = "";
    if (!list || list.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:span 2;text-align:center;color:var(--text-secondary);margin:30px 0 10px;font-size:14px;font-weight:600;">😕 Ничего не найдено</div>
            <div class="no-results-cta" onclick="window.openSpecialOrder()">
                <div class="nrc-icon">📦</div>
                <div class="nrc-text">
                    <div class="nrc-title">Закажи под заказ</div>
                    <div class="nrc-sub">Привезём из Москвы за 7–14 дней. Нужна предоплата.</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </div>`;
        return;
    }
    list.forEach((p, idx) => {
        const card = document.createElement("div");
        card.className = "product-card";
        card.dataset.productId = p.id;
        card.dataset.catTheme = _catTheme(p.category);
        card.style.animationDelay = Math.min(idx * 35, 350) + "ms";
        const imgSrc = p.image ? `img/${p.image}` : "";
        const letter = p.name ? p.name.charAt(0).toUpperCase() : "V";
        const qty = window.getCartQty(p.id);

        let tags = "";
        if (p.preOrder) tags += '<span class="tag tag-preorder">📦 Под заказ</span>';
        if (p.isNew || (p.tags && p.tags.some(t => t.includes("NEW")))) tags += '<span class="tag tag-new">New</span>';
        if (p.tags && p.tags.some(t => t.includes("ХИТ") || t.includes("HOT"))) tags += '<span class="tag tag-hot">Хит</span>';
        if (p.oldPrice) tags += '<span class="tag tag-sale">Скидка</span>';
        if (p.lowStock) tags += `<span class="tag tag-low">🔥 ${p.lowStock} шт.</span>`;

        const oldPriceHtml = p.oldPrice ? `<span class="product-old-price">${fmt(p.oldPrice)} ₽</span>` : "";
        const isWished = (window.wishlist || []).includes(p.id);
        const viewersHtml = p.viewers ? `<span class="viewers-badge">👁 ${p.viewers} смотрят</span>` : "";

        card.innerHTML = `
            ${tags ? `<div class="product-tags">${tags}</div>` : ""}
            <button class="wish-btn${isWished ? " wished" : ""}" onclick="event.stopPropagation();window.toggleWishlist('${p.id}')">♡</button>
            <div class="product-image-wrapper">
                ${imgSrc ? `<img src="${imgSrc}" class="product-img" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ""}
                <div class="product-img-placeholder" style="${imgSrc ? "display:none;" : "display:flex;"}">${letter}</div>
            </div>
            ${viewersHtml}
            <div class="product-name">${p.name}</div>
            <div class="product-brand">${p.brand || ""}</div>
            <div class="product-footer">
                <div class="product-price-wrap">${oldPriceHtml}<div class="product-price">${fmt(p.price)} ₽</div></div>
                <div class="card-action" id="action-${p.id}"></div>
            </div>`;
        card.onclick = () => { haptic("light"); window.handleCardClick(p.id); };
        grid.appendChild(card);
        window.renderCardAction(p);
    });

    // Постоянный CTA в конце каталога: нет нужного товара — напиши, найдём под заказ
    const cta = document.createElement("div");
    cta.className = "no-results-cta";
    cta.style.gridColumn = "span 2";
    cta.style.marginTop = "10px";
    cta.onclick = () => { haptic("light"); window.openSpecialOrder(); };
    cta.innerHTML = `
        <div class="nrc-icon">🔎</div>
        <div class="nrc-text">
            <div class="nrc-title">Не нашёл нужное?</div>
            <div class="nrc-sub">Напиши — найдём под заказ и предложим лучшую цену.</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
    grid.appendChild(cta);
};

// Кнопка + или степпер на карточке
window.renderCardAction = function (p) {
    const wrap = document.getElementById(`action-${p.id}`);
    if (!wrap) return;
    const qty = window.getCartQty(p.id);
    const hasFlavors = p.flavors && p.flavors.length > 0;

    if (qty === 0) {
        wrap.innerHTML = `<button class="add-btn" id="addbtn-${p.id}">+</button>`;
        wrap.querySelector(".add-btn").onclick = (e) => {
            e.stopPropagation();
            haptic("light");
            // Если у товара есть вкусы — открываем попап для выбора. Иначе сразу в корзину.
            if (hasFlavors) window.handleCardClick(p.id);
            else window.quickAdd(p.id);
        };
    } else {
        // Степпер показываем только для товаров без вкусов (иначе непонятно какой вкас менять)
        if (hasFlavors) {
            wrap.innerHTML = `<button class="add-btn has-items" style="background:var(--neon-green-soft);border-color:rgba(0,232,122,0.3);color:var(--neon-green);">+</button>`;
            wrap.querySelector(".add-btn").onclick = (e) => { e.stopPropagation(); haptic("light"); window.handleCardClick(p.id); };
        } else {
            wrap.innerHTML = `
                <div class="card-stepper">
                    <button id="minus-${p.id}">−</button>
                    <span>${qty}</span>
                    <button id="plus-${p.id}">+</button>
                </div>`;
            wrap.querySelector(`#minus-${p.id}`).onclick = (e) => { e.stopPropagation(); haptic("light"); window.quickChange(p.id, -1); };
            wrap.querySelector(`#plus-${p.id}`).onclick = (e) => { e.stopPropagation(); haptic("light"); window.quickChange(p.id, 1); };
        }
    }
};

// Быстрое добавление без вкусов
window.quickAdd = function (productId) {
    const p = window.products.find(p => p.id === productId);
    if (!p) return;
    const existing = window.cart.find(i => i.id === productId && i.flavor === "Стандарт");
    if (existing) existing.quantity += 1;
    else window.cart.push({ id: p.id, name: p.name, price: p.price, flavor: "Стандарт", quantity: 1 });
    window.updateCartCounters();
    window.renderCardAction(p);
    window.markCardInCart(productId);
    window.animateFlyToCart();
    window.showToast("Добавлено в корзину");
};

window.quickChange = function (productId, delta) {
    const item = window.cart.find(i => i.id === productId && i.flavor === "Стандарт");
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) {
        window.cart = window.cart.filter(i => !(i.id === productId && i.flavor === "Стандарт"));
    }
    const p = window.products.find(p => p.id === productId);
    window.updateCartCounters();
    window.renderCardAction(p);
    window.markCardInCart(productId);
};

window.markCardInCart = function (productId) {
    const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
    if (card) card.classList.toggle("in-cart", window.getCartQty(productId) > 0);
};

window.getCartQty = function (productId) {
    return window.cart.filter(i => i.id === productId).reduce((s, i) => s + i.quantity, 0);
};

// ── ПОПАП ТОВАРА ──
window.handleCardClick = function (id) {
    const p = window.products.find(p => p.id === id);
    if (p) window.openVapePopup(p);
};

window.openVapePopup = function (product) {
    window.currentPopupProduct = product;
    window.selectedFlavorInPopup = null;
    document.getElementById("popupName").innerText = product.name;
    document.getElementById("popupBrand").innerText = product.brand || "";
    const imgSrc = product.image ? "img/" + product.image : "";
    const letter = product.name ? product.name.charAt(0).toUpperCase() : "V";
    const img = document.getElementById("popupImg");
    const ph = document.getElementById("popupPlaceholder");
    if (imgSrc) {
        img.src = imgSrc; img.style.display = "block"; ph.style.display = "none";
        img.onerror = () => { img.style.display = "none"; ph.style.display = "flex"; };
    } else { img.style.display = "none"; ph.style.display = "flex"; }
    ph.innerText = letter;
    // цветовая тема плейсхолдера в попапе
    const popupImgWrap = document.getElementById("popupImgWrapper");
    if (popupImgWrap) popupImgWrap.dataset.catTheme = _catTheme(product.category);
    document.getElementById("popupDesc").innerText = product.description || "Премиальное качество.";
    document.getElementById("popupFooterPrice").innerText = `${fmt(product.price)} ₽`;
    const fc = document.getElementById("popupFlavors");
    const fb = document.getElementById("popupFlavorsBlock");
    fc.innerHTML = "";
    if (product.flavors && product.flavors.length > 0) {
        fb.style.display = "block";
        product.flavors.forEach(flavor => {
            const btn = document.createElement("div");
            btn.className = "flavor-badge";
            const name = typeof flavor === "object" ? flavor.name : flavor;
            btn.innerText = name;
            btn.onclick = () => { haptic("select"); window.selectVapeFlavor(name, btn); };
            fc.appendChild(btn);
        });
    } else { fb.style.display = "none"; }
    window.renderRelatedProducts(product.id);
    window.updatePopupStockState(product);
    document.getElementById("productPopup").classList.add("active");
    window.setupBackButton(window.closeVapePopup);
};

window.selectVapeFlavor = function (name, el) {
    window.selectedFlavorInPopup = name;
    document.querySelectorAll(".flavor-badge").forEach(b => b.classList.remove("active"));
    el.classList.add("active");
};

window.closeVapePopup = function () {
    const popup = document.getElementById("productPopup");
    popup.classList.remove("active");
    const drawer = popup.querySelector(".drawer");
    if (drawer) drawer.style.transform = "";
    window.hideBackButton();
};

window.addToCart = function () {
    if (!window.currentPopupProduct) return;
    const p = window.currentPopupProduct;
    if (p.flavors && p.flavors.length > 0 && !window.selectedFlavorInPopup) {
        haptic("error");
        window.showToast("Выберите вкус или цвет");
        return;
    }
    const flavor = window.selectedFlavorInPopup || "Стандарт";
    const existing = window.cart.find(i => i.id === p.id && i.flavor === flavor);
    if (existing) existing.quantity += 1;
    else window.cart.push({ id: p.id, name: p.name, price: p.price, flavor, quantity: 1 });
    haptic("success");
    window.updateCartCounters();
    window.renderCardAction(p);
    window.markCardInCart(p.id);
    window.closeVapePopup();
    window.animateFlyToCart();
    window.showToast("Добавлено в корзину");
};

// ── ТОСТ + АНИМАЦИЯ ──
window.showToast = function (text, duration) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.innerText = text;
    t.classList.add("show");
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => t.classList.remove("show"), duration || 2000);
};
// тап по тосту — скрыть сразу
document.addEventListener("DOMContentLoaded", () => {
    const t = document.getElementById("toast");
    if (t) t.addEventListener("click", () => { clearTimeout(window._toastTimer); t.classList.remove("show"); });
});

window.animateFlyToCart = function () {
    const dot = document.getElementById("flyDot");
    const bar = document.getElementById("cartBar");
    if (!dot || !bar) return;
    const r = bar.getBoundingClientRect();
    const sx = window.innerWidth / 2, sy = window.innerHeight / 2;
    const ex = r.left + 40, ey = r.top + r.height / 2;
    dot.style.cssText = `left:${sx}px;top:${sy}px;opacity:1;transform:scale(1);transition:none;`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        dot.style.cssText = `left:${ex}px;top:${ey}px;opacity:0;transform:scale(0.3);transition:all 0.55s cubic-bezier(0.4,0,0.2,1);`;
    }));
};

window.updateCartCounters = function () {
    const qty = window.cart.reduce((s, i) => s + i.quantity, 0);
    const el = document.getElementById("cartCount");
    if (el) { el.innerText = qty; el.classList.toggle("show", qty > 0); }
    const { total } = window.calcOrderTotals();
    const bt = document.getElementById("cartBarTotal");
    if (bt) bt.innerText = `${fmt(total)} ₽`;
    const sub = document.getElementById("cartBarSub");
    if (sub) sub.innerText = qty > 0 ? `${qty} ${window.plural(qty, "товар", "товара", "товаров")}` : "Пусто";
    const bar = document.getElementById("cartBar");
    if (bar) bar.classList.toggle("hidden", qty === 0);
    try { localStorage.setItem("vapeCart", JSON.stringify(window.cart)); } catch(e) {}
    // отметка времени для «дожима» брошенной корзины
    try {
        if (window.cart.length > 0) {
            if (!localStorage.getItem("vapeCartTs")) localStorage.setItem("vapeCartTs", String(Date.now()));
        } else {
            localStorage.removeItem("vapeCartTs");
        }
    } catch (e) {}
};

window.plural = function (n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
};

// Товары «под заказ» (телефоны Apple) — тонкая маржа: на них НЕ действуют
// промокоды, реферальная скидка и баллы (ни начисление, ни списание).
window.isBonusable = function (item) {
    const p = window.products.find(x => x.id === item.id);
    return !(p && (p.preOrder || p.noBonus));
};

// ── РАСЧЁТ ──
window.calcOrderTotals = function () {
    const subtotal = window.cart.reduce((s, i) => s + i.price * i.quantity, 0);
    // сумма товаров, на которые распространяются скидки и баллы (без телефонов)
    const bonusableSubtotal = window.cart.reduce((s, i) => window.isBonusable(i) ? s + i.price * i.quantity : s, 0);
    let discount = 0;
    if (window.appliedPromo) {
        discount = Math.round(bonusableSubtotal * window.appliedPromo.discount);
    } else if (window.referralDiscountActive) {
        discount = Math.round(bonusableSubtotal * REFERRAL_DISCOUNT);
    }
    const afterDiscount = subtotal - discount;
    const deliveryCost = (window.currentDeliveryMethod === "delivery" && afterDiscount < FREE_DELIVERY_THRESHOLD) ? DELIVERY_COST : 0;
    // баллы лояльности: списать можно не больше 20% от суммы БОНУСНЫХ товаров и не больше баланса
    const maxRedeem = Math.max(0, Math.min(bonusGet(), Math.floor((bonusableSubtotal - discount) * BONUS_MAX_REDEEM)));
    const bonusUsed = window.bonusApplied ? maxRedeem : 0;
    const total = Math.max(0, afterDiscount - bonusUsed + deliveryCost);
    return { subtotal, bonusableSubtotal, discount, deliveryCost, maxRedeem, bonusUsed, total };
};

// ── КОРЗИНА ──
window.openVapeCart = function () {
    if (window._swipeCloseTimer) { clearTimeout(window._swipeCloseTimer); window._swipeCloseTimer = null; }
    const _popup = document.getElementById("cartPopup");
    const _drawer = _popup && _popup.querySelector(".drawer");
    if (_drawer) _drawer.style.transform = "";
    haptic("light");
    const listEl = document.getElementById("cartItemsList");
    const form = document.getElementById("orderFormBlock");
    const btn = document.getElementById("checkoutBtn");
    const summary = document.getElementById("summaryBlock");
    if (listEl) {
        listEl.innerHTML = "";
        if (window.cart.length === 0) {
            listEl.innerHTML = `<div class="cart-empty"><div class="cart-empty-icon">🛒</div><div class="cart-empty-text">Корзина пуста</div></div>`;
            if (form) form.style.display = "none";
            if (summary) summary.style.display = "none";
            if (btn) { btn.innerText = "В КАТАЛОГ"; btn.onclick = window.closeVapeCart; }
        } else {
            if (form) form.style.display = "block";
            if (summary) summary.style.display = "block";
            if (btn) { btn.innerText = "ОФОРМИТЬ ЗАКАЗ"; btn.onclick = window.checkoutVapeOrder; }
            window.cart.forEach((item, idx) => {
                const row = document.createElement("div");
                row.className = "cart-item";
                row.innerHTML = `
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-flavor">${item.flavor}</div>
                        <div class="cart-item-price">${fmt(item.price)} ₽</div>
                    </div>
                    <div class="cart-stepper">
                        <button onclick="window.changeQty(${idx},-1)">−</button>
                        <span>${item.quantity}</span>
                        <button onclick="window.changeQty(${idx},1)">+</button>
                    </div>`;
                listEl.appendChild(row);
            });
        }
    }
    window.updateCartTotalDisplay();
    document.getElementById("cartPopup").classList.add("active");
    window.updateNewsletterBanner();
    window.setupBackButton(window.closeVapeCart);
};

window.updateCartTotalDisplay = function () {
    const { subtotal, discount, deliveryCost, bonusUsed, total } = window.calcOrderTotals();
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.innerText = val; };
    set("cartTotalPrice", `${fmt(total)} ₽`);
    set("sumSubtotal", `${fmt(subtotal)} ₽`);

    const dRow = document.getElementById("sumDiscountRow");
    if (dRow) { dRow.style.display = discount > 0 ? "flex" : "none"; set("sumDiscount", `−${fmt(discount)} ₽`); }

    const bRow = document.getElementById("sumBonusRow");
    if (bRow) { bRow.style.display = bonusUsed > 0 ? "flex" : "none"; set("sumBonus", `−${fmt(bonusUsed)} ₽`); }

    const delRow = document.getElementById("sumDeliveryRow");
    if (delRow) {
        if (window.currentDeliveryMethod === "delivery") {
            delRow.style.display = "flex";
            set("sumDelivery", deliveryCost === 0 ? "Бесплатно" : `${fmt(deliveryCost)} ₽`);
        } else delRow.style.display = "none";
    }

    const note = document.getElementById("deliveryNote");
    if (note) {
        if (window.currentDeliveryMethod === "delivery") {
            note.style.display = "block";
            if (deliveryCost === 0) { note.innerText = "🎁 Бесплатная доставка!"; note.style.color = "var(--neon-green)"; }
            else { note.innerText = `🚚 Ещё ${fmt(FREE_DELIVERY_THRESHOLD - (subtotal - discount))} ₽ до бесплатной доставки`; note.style.color = "var(--text-secondary)"; }
        } else note.style.display = "none";
    }

    window.updateDeliveryProgress();

    const minNote = document.getElementById("minOrderNote");
    if (minNote) {
        const afterDiscount = subtotal - discount;
        if (afterDiscount > 0 && afterDiscount < MIN_ORDER_AMOUNT) {
            minNote.style.display = "block";
            minNote.innerText = `⚠️ Минимальная сумма заказа ${fmt(MIN_ORDER_AMOUNT)} ₽ — ещё ${fmt(MIN_ORDER_AMOUNT - afterDiscount)} ₽`;
        } else {
            minNote.style.display = "none";
        }
    }

    window.updateBonusUI();
    window.updateCartCounters();
};

// ── БОНУСНЫЙ ТОГГЛ В КОРЗИНЕ + БАЛАНС В ПРОФИЛЕ ──
window.updateBonusUI = function () {
    const bal = bonusGet();
    const pb = document.getElementById("profileBonusBalance");
    if (pb) pb.innerText = fmt(bal);

    const row = document.getElementById("bonusRow");
    if (!row) return;
    const { maxRedeem } = window.calcOrderTotals();
    if (bal > 0 && maxRedeem > 0 && window.cart.length > 0) {
        row.style.display = "flex";
        const sub = document.getElementById("bonusRowSub");
        if (sub) sub.innerText = window.bonusApplied
            ? `Списываем ${fmt(maxRedeem)} ₽`
            : `Доступно ${fmt(maxRedeem)} ₽ из ${fmt(bal)}`;
        const tog = document.getElementById("bonusToggle");
        if (tog) tog.classList.toggle("on", !!window.bonusApplied);
    } else {
        row.style.display = "none";
    }
};

window.toggleBonusRedeem = function () {
    haptic("select");
    window.bonusApplied = !window.bonusApplied;
    window.updateCartTotalDisplay();
};

window.openBonusInfo = function () {
    const bal = bonusGet();
    const rate = Math.round(bonusRate() * 100);
    window.showToast(bal > 0
        ? `💎 У вас ${fmt(bal)} баллов. Списывайте до 20% заказа в корзине. Ваш уровень даёт +${rate}% баллами с заказа.`
        : `💎 Бонусы копятся с заказов: +${rate}% баллами. 1 балл = 1 ₽, можно оплатить до 20% заказа.`, 4500);
};

// ── УРОВЕНЬ КЛИЕНТА В ПРОФИЛЕ ──
window.updateLevelUI = function () {
    const lvl = currentLevel();
    const next = nextLevel();
    const spent = spentGet();
    const card = document.getElementById("levelCard");
    if (!card) return;

    const iconEl = document.getElementById("levelIcon");
    const nameEl = document.getElementById("levelName");
    const rateEl = document.getElementById("levelRate");
    const barEl = document.getElementById("levelProgress");
    const hintEl = document.getElementById("levelHint");

    if (iconEl) iconEl.innerText = lvl.icon;
    if (nameEl) { nameEl.innerText = lvl.name; nameEl.style.color = lvl.color; }
    if (rateEl) rateEl.innerText = `+${Math.round(lvl.rate * 100)}% баллами`;

    if (next) {
        const span = next.min - lvl.min;
        const pct = Math.max(0, Math.min(100, Math.round((spent - lvl.min) / span * 100)));
        if (barEl) { barEl.style.width = pct + "%"; barEl.style.background = lvl.color; }
        if (hintEl) hintEl.innerText = `Ещё ${fmt(next.min - spent)} ₽ до уровня «${next.name}»`;
    } else {
        if (barEl) { barEl.style.width = "100%"; barEl.style.background = lvl.color; }
        if (hintEl) hintEl.innerText = "Максимальный уровень — спасибо! 💚";
    }
};

window.changeQty = function (idx, delta) {
    haptic("light");
    const productId = window.cart[idx].id;
    window.cart[idx].quantity += delta;
    if (window.cart[idx].quantity <= 0) window.cart.splice(idx, 1);
    const p = window.products.find(p => p.id === productId);
    if (p) { window.renderCardAction(p); window.markCardInCart(productId); }
    window.openVapeCart();
};

window.closeVapeCart = function () {
    const popup = document.getElementById("cartPopup");
    popup.classList.remove("active");
    const drawer = popup.querySelector(".drawer");
    if (drawer) drawer.style.transform = "";
    window.hideBackButton();
};

// ── ПРОМОКОД ──
window.applyPromoCode = function () {
    const input = document.getElementById("promoInput");
    const msg = document.getElementById("promoMessage");
    if (!input || !msg) return;
    const code = input.value.trim().toUpperCase();
    const promo = PROMO_CODES[code];
    if (promo) {
        haptic("success");
        window.appliedPromo = promo;
        msg.innerText = `✅ ${promo.label} применена!`;
        msg.style.color = "var(--neon-green)";
        input.disabled = true;
        document.getElementById("promoApplyBtn").disabled = true;
    } else if (!window.referralDiscountActive && _looksLikeRefCode(code)) {
        // Кто-то ввёл реферальный код вручную (например «VAPE61635219» или числовой ID).
        // Применяем как реферальную скидку 5%, если у этого клиента ещё не была скидка.
        const myId = String((window.tg && window.tg.initDataUnsafe && window.tg.initDataUnsafe.user && window.tg.initDataUnsafe.user.id) || "");
        const refId = code.replace(/^VAPE/, ""); // убираем префикс, оставляем числовой ID
        // блок само-реферала, в т.ч. старого усечённого кода (VAPE61635219 ← id 6163521938)
        const isSelf = refId && myId && (refId === myId || myId.startsWith(refId) || refId.startsWith(myId));
        if (refId && !isSelf) {
            haptic("success");
            if (!localStorage.getItem("vapeReferredBy")) {
                localStorage.setItem("vapeReferredBy", refId);
            }
            window.referralDiscountActive = true;
            msg.innerText = "✅ Реферальная скидка 5% применена!";
            msg.style.color = "var(--neon-green)";
            input.disabled = true;
            document.getElementById("promoApplyBtn").disabled = true;
        } else {
            haptic("error");
            msg.innerText = "❌ Нельзя использовать свой же реферальный код";
            msg.style.color = "var(--neon-red)";
        }
    } else if (window.referralDiscountActive && _looksLikeRefCode(code)) {
        haptic("error");
        msg.innerText = "✅ Реферальная скидка уже активна!";
        msg.style.color = "var(--neon-green)";
    } else {
        haptic("error");
        window.appliedPromo = null;
        msg.innerText = "❌ Неверный промокод";
        msg.style.color = "var(--neon-red)";
    }
    window.updateCartTotalDisplay();
};

// Реферальные коды: VAPE + цифры (старый формат) или только цифры (Telegram ID)
function _looksLikeRefCode(code) {
    return /^VAPE\d{4,}$/.test(code) || /^\d{5,}$/.test(code);
}

// ── ДОСТАВКА ──
window.selectDeliveryTab = function (method) {
    haptic("select");
    window.currentDeliveryMethod = method;
    document.getElementById("tabPickup").classList.toggle("active", method === "pickup");
    document.getElementById("tabDelivery").classList.toggle("active", method === "delivery");
    document.getElementById("pickupInfoCard").style.display = method === "pickup" ? "flex" : "none";
    document.getElementById("deliveryAddressWrapper").style.display = method === "delivery" ? "block" : "none";
    window.updateCartTotalDisplay();
};

// ── ПОИСК ──
window.filterVapeProducts = function () {
    const input = document.getElementById("searchInput");
    const q = (input ? input.value : "").trim().toLowerCase();
    const clearBtn = document.getElementById("searchClear");
    if (clearBtn) clearBtn.style.display = q ? "block" : "none";
    let filtered = window.products.filter(p => {
        const matchCat = window.currentCategory === "Все" || p.category === window.currentCategory;
        const matchQ = !q || (p.name && p.name.toLowerCase().includes(q)) || (p.brand && p.brand.toLowerCase().includes(q));
        return matchCat && matchQ;
    });
    if (window.currentFilter === "sale")    filtered = filtered.filter(p => p.oldPrice);
    else if (window.currentFilter === "instock") filtered = filtered.filter(p => p.inStock !== false);
    else if (window.currentFilter === "new") filtered = filtered.filter(p => p.isNew);
    if (window.currentSort === "price-asc")  filtered = [...filtered].sort((a, b) => a.price - b.price);
    else if (window.currentSort === "price-desc") filtered = [...filtered].sort((a, b) => b.price - a.price);
    const noMods = window.currentSort === "default" && !window.currentFilter;
    const featured = document.getElementById("featuredSection");
    if (featured) featured.style.display = (window.currentCategory === "Все" && !q && noMods) ? "block" : "none";
    const label = document.getElementById("allProductsLabel");
    if (label) label.innerText = q ? "Результаты поиска" : (window.currentCategory === "Все" ? "Все товары" : window.currentCategory);
    window.renderProducts(filtered);
};

window.clearSearch = function () {
    const input = document.getElementById("searchInput");
    if (input) input.value = "";
    window.filterVapeProducts();
};

// ── КНОПКА НАЗАД (Telegram) ──
window.setupBackButton = function (callback) {
    if (!window.tg || !window.tg.BackButton) return;
    try {
        if (window._backCallback) window.tg.BackButton.offClick(window._backCallback);
        window._backCallback = callback;
        window.tg.BackButton.show();
        window.tg.BackButton.onClick(callback);
    } catch (e) {}
};

window.hideBackButton = function () {
    if (!window.tg || !window.tg.BackButton) return;
    try {
        window.tg.BackButton.hide();
        if (window._backCallback) window.tg.BackButton.offClick(window._backCallback);
    } catch (e) {}
};

// ── КОНФЕТТИ ──
window.showConfetti = function () {
    const colors = ["#00f07c","#00c9ff","#ffab00","#ff2d55","#ffffff","#a78bfa"];
    const count = 90;
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;";
    for (let i = 0; i < count; i++) {
        const p = document.createElement("div");
        const size = 6 + Math.random() * 7;
        p.className = "confetti-piece";
        p.style.cssText = [
            `left:${Math.random() * 100}%`,
            `top:-20px`,
            `width:${size}px`,
            `height:${size * 0.55}px`,
            `background:${colors[Math.floor(Math.random() * colors.length)]}`,
            `animation-duration:${1400 + Math.random() * 900}ms`,
            `animation-delay:${Math.random() * 500}ms`,
        ].join(";");
        container.appendChild(p);
    }
    document.body.appendChild(container);
    setTimeout(() => { try { container.remove(); } catch(e) {} }, 3500);
};

// ── PULL-TO-REFRESH ──
(function initPullToRefresh() {
    let startY = 0, pulling = false, triggered = false;
    let ind = null;
    function getInd() {
        if (!ind) {
            ind = document.createElement("div");
            ind.className = "ptr-indicator";
            ind.innerHTML = `<svg class="ptr-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Обновление…`;
            document.body.appendChild(ind);
        }
        return ind;
    }
    document.addEventListener("touchstart", e => {
        if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; triggered = false; }
    }, { passive: true });
    document.addEventListener("touchmove", e => {
        if (!pulling) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 55 && !triggered) { triggered = true; getInd().classList.add("visible"); haptic("light"); }
    }, { passive: true });
    document.addEventListener("touchend", () => {
        if (!pulling) return;
        pulling = false;
        if (triggered) {
            triggered = false;
            setTimeout(() => {
                try { getInd().classList.remove("visible"); } catch(e){}
                if (typeof window.applyFilters === "function") window.applyFilters();
                window.showToast("Каталог обновлён");
            }, 600);
        }
    });
})();

// ── ОФОРМЛЕНИЕ ──
window.checkoutVapeOrder = function () {
    if (!window.cart || window.cart.length === 0) { window.closeVapeCart(); return; }
    const username = (document.getElementById("customerTelegram")?.value || "").trim();
    const phone = (document.getElementById("customerPhone")?.value || "").trim();
    const address = (document.getElementById("deliveryAddress")?.value || "").trim();

    // валидация с подсветкой конкретного поля
    function shakeField(id) {
        const el = document.getElementById(id)?.closest(".input-icon-group");
        if (!el) return;
        el.classList.add("error");
        setTimeout(() => el.classList.remove("error"), 800);
    }
    if (!username) { haptic("error"); shakeField("customerTelegram"); window.showToast("Введите @username"); return; }
    if (!phone)    { haptic("error"); shakeField("customerPhone");    window.showToast("Укажите телефон"); return; }
    if (window.currentDeliveryMethod === "delivery" && !address) {
        haptic("error"); shakeField("deliveryAddress"); window.showToast("Укажите адрес доставки"); return;
    }
    const { subtotal, bonusableSubtotal, discount, deliveryCost, bonusUsed, total } = window.calcOrderTotals();
    if (subtotal < MIN_ORDER_AMOUNT) { haptic("error"); window.showToast(`Минимум ${MIN_ORDER_AMOUNT} ₽ (сейчас ${subtotal} ₽)`); return; }

    const formattedUsername = username.startsWith("@") ? username : "@" + username;
    // нарядный список товаров для сообщений в Telegram
    const itemsList = window.cart.map(i =>
        `▪️ ${i.name} · ${i.flavor}\n      ${i.quantity} шт × ${fmt(i.price)} ₽  =  ${fmt(i.price * i.quantity)} ₽`
    ).join("\n");
    // плоский текст для локальной истории заказов
    let itemsText = window.cart.map(i => `• ${i.name} [${i.flavor}] — ${i.quantity} шт. × ${i.price} ₽ = ${i.price * i.quantity} ₽`).join("\n");
    if (discount > 0) itemsText += `\n🎁 Промокод (${window.appliedPromo.label}): −${discount} ₽`;
    if (deliveryCost > 0) itemsText += `\n🚚 Доставка: ${deliveryCost} ₽`;

    const orderData = {
        order_id: Date.now().toString().slice(-6),
        date: new Date().toLocaleString("ru-RU"),
        name: formattedUsername,
        phone,
        delivery: window.currentDeliveryMethod === "pickup" ? "Самовывоз" : "Доставка",
        address: window.currentDeliveryMethod === "pickup" ? "Марчеканский переулок, 15" : address,
        products: itemsText,
        comment: [
            window.appliedPromo ? `Промокод: ${Object.keys(PROMO_CODES).find(k => PROMO_CODES[k] === window.appliedPromo)}` : null,
            window.referralDiscountActive ? `Реферал: ${localStorage.getItem("vapeReferredBy") || ""}` : null,
            localStorage.getItem("vapeNewsletterSub") === "1" ? "Рассылка: да" : null,
        ].filter(Boolean).join(", ") || "Нет",
        total
    };

    const user = tgCurrentUser();
    const customerId = user ? user.id : "";
    const usernameText = (user && user.username) ? "@" + user.username : formattedUsername;

    const isPickup = window.currentDeliveryMethod === "pickup";
    const promoLabel = window.appliedPromo ? window.appliedPromo.label : "";
    // итоговый блок: товары, скидка, доставка
    const totalsBlock =
        `🧾 Товары: ${fmt(subtotal)} ₽\n` +
        (discount > 0 ? `🎁 Скидка (${escHtml(promoLabel)}): −${fmt(discount)} ₽\n` : "") +
        (bonusUsed > 0 ? `💎 Баллами: −${fmt(bonusUsed)} ₽\n` : "") +
        (isPickup ? "" : `🚚 Доставка: ${deliveryCost > 0 ? fmt(deliveryCost) + " ₽" : "бесплатно 🎉"}\n`);

    const adminText =
        `🆕 <b>НОВЫЙ ЗАКАЗ #${orderData.order_id}</b>\n` +
        `📅 ${orderData.date}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +

        `👤 <b>КЛИЕНТ</b>\n` +
        `├ Telegram: ${escHtml(usernameText)}\n` +
        (usernameText !== formattedUsername ? `├ Указал в форме: ${escHtml(formattedUsername)}\n` : "") +
        `├ Телефон: <code>${escHtml(phone)}</code>\n` +
        `└ ID: <code>${customerId || "не определён"}</code>\n\n` +

        `🛒 <b>СОСТАВ ЗАКАЗА</b>\n` +
        `<blockquote>${escHtml(itemsList)}</blockquote>\n\n` +

        `📍 <b>ПОЛУЧЕНИЕ</b>\n` +
        `├ Способ: ${isPickup ? "🏃 Самовывоз" : "🚚 Доставка курьером"}\n` +
        `└ Адрес: ${escHtml(orderData.address)}\n\n` +

        `💬 Комментарий: <i>${escHtml(orderData.comment)}</i>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        totalsBlock +
        `\n💰 <b>ИТОГО К ПОЛУЧЕНИЮ: ${fmt(total)} ₽</b>\n\n` +
        `📊 Статус: <b>🆕 Новый</b>`;

    // баллы: % зависит от уровня клиента, считаем от реально потраченных на товары денег
    const bonusEarned = Math.max(0, Math.round((bonusableSubtotal - discount - bonusUsed) * bonusRate()));
    // кто пригласил этого клиента (Telegram ID), либо 0 — нужно боту для реф-награды
    const refId = (window.referralDiscountActive && /^\d+$/.test(localStorage.getItem("vapeReferredBy") || "")) ? localStorage.getItem("vapeReferredBy") : "0";

    // В кнопку «Принять» зашиваем earn/redeem/ref — бот сверяет и начисляет баллы
    // СВОИМ источником правды (bonuses.json), а не доверяет браузеру.
    const acceptData = `st_accept_${orderData.order_id}_${customerId}_${total}_${bonusEarned}_${bonusUsed}_${refId}`;
    const kb = { inline_keyboard: [
        [ { text: "✅ Принять", callback_data: acceptData },
          { text: "📦 В сборке", callback_data: `st_pack_${orderData.order_id}_${customerId}_${total}` } ],
        [ { text: "🚚 Отправлен", callback_data: `st_ship_${orderData.order_id}_${customerId}_${total}` },
          { text: "🎯 Выполнен", callback_data: `st_done_${orderData.order_id}_${customerId}_${total}` } ],
        [ { text: "❌ Отменить заказ", callback_data: `st_cancel_${orderData.order_id}_${customerId}_${total}` } ]
    ]};
    if (customerId) kb.inline_keyboard.push([{ text: "📞 Связаться с клиентом", url: "tg://user?id=" + customerId }]);

    window.showToast("Отправляем заказ…");
    notifyAdmins(adminText, kb).then(() => {
        // подтверждение клиенту в чат с ботом (придёт, если клиент запускал бота)
        if (customerId) {
            tgApiSend(customerId,
                `✅ <b>Заказ #${orderData.order_id} принят!</b>\n` +
                `📅 ${orderData.date}\n\n` +
                `🛒 <b>Ваш заказ</b>\n` +
                `<blockquote>${escHtml(itemsList)}</blockquote>\n\n` +
                totalsBlock +
                `\n💰 <b>К оплате: ${fmt(total)} ₽</b>\n` +
                (bonusEarned > 0 ? `💎 +${fmt(bonusEarned)} баллов зачислим после подтверждения\n` : "") +
                `\n📍 ${isPickup ? "Самовывоз: " : "Доставка: "}${escHtml(orderData.address)}\n\n` +
                `🧑‍💻 Наш директор @${MANAGER_TG} свяжется с вами для подтверждения.\n` +
                `🔔 Мы пришлём уведомление, когда статус заказа изменится!`
            ).catch(() => {});
        }
        haptic("success");
        // Оптимистично обновляем баланс в приложении ради приятного UX.
        // ИСТОЧНИК ПРАВДЫ — бот (bonuses.json): он сверяет и фиксирует баллы,
        // когда админ жмёт «Принять», и не даст списать больше реального баланса.
        bonusSet(bonusGet() - bonusUsed + bonusEarned);
        window.bonusApplied = false;
        // копим сумму покупок для уровня (реальные деньги за товары)
        spentAdd(subtotal - discount);
        window.updateLevelUI();
        window.saveOrderToHistory(orderData);
        window.referralDiscountActive = false;
        localStorage.setItem("vapeRefUsed", "1");
        window.cart = []; window.appliedPromo = null;
        window.updateCartCounters();
        window.updateBonusUI();
        window.showConfetti();
        window.showToast(bonusEarned > 0
            ? `✅ Заказ #${orderData.order_id} отправлен! +${fmt(bonusEarned)} баллов 💎`
            : `✅ Заказ #${orderData.order_id} отправлен!`);
        setTimeout(() => {
            try { if (window.tg && window.tg.close) { window.tg.close(); return; } } catch (e) {}
            window.closeVapeCart();
        }, 2000);
    }).catch((err) => {
        haptic("error");
        console.error("Order send error:", err);
        alert(`⚠️ Не удалось отправить заказ.\n\nОшибка: ${err.message}\n\nНапишите @${MANAGER_TG} — корзина сохранена.`);
    });
};

// ==========================================================================
// VAPEBAZAR EXTENDED FEATURES
// ==========================================================================

// ── СВЯЗАННЫЕ ТОВАРЫ ──
window.renderRelatedProducts = function (productId) {
    const section = document.getElementById("relatedSection");
    const list = document.getElementById("relatedList");
    if (!section || !list) return;
    const relIds = RELATED_PRODUCTS[productId] || [];
    const relProds = relIds.map(id => window.products.find(p => p.id === id)).filter(Boolean);
    if (relProds.length === 0) { section.style.display = "none"; return; }
    list.innerHTML = "";
    relProds.forEach(rp => {
        const card = document.createElement("div");
        card.className = "related-card";
        const letter = rp.name.charAt(0).toUpperCase();
        const imgSrc = rp.image ? `img/${rp.image}` : "";
        card.innerHTML = `
            <div class="rc-img">${imgSrc ? `<img src="${imgSrc}" alt="" onerror="this.parentElement.innerText='${letter}'">` : letter}</div>
            <div class="rc-name">${rp.name}</div>
            <div class="rc-price">${fmt(rp.price)} ₽</div>`;
        card.onclick = () => { haptic("light"); window.openVapePopup(rp); };
        list.appendChild(card);
    });
    section.style.display = "block";
};

// ── УВЕДОМЛЕНИЕ О НАЛИЧИИ ──
window.updatePopupStockState = function (product) {
    const addRow = document.getElementById("popupAddRow");
    const notifyBtn = document.getElementById("notifyBtn");
    if (!addRow || !notifyBtn) return;
    const inStock = product.inStock !== false;
    addRow.style.display = inStock ? "flex" : "none";
    notifyBtn.style.display = inStock ? "none" : "block";
    if (!inStock) {
        const notifs = JSON.parse(localStorage.getItem("vapeNotifications") || "[]");
        if (notifs.includes(product.id)) {
            notifyBtn.innerHTML = "✓ Уведомим вас о наличии";
            notifyBtn.disabled = true;
        } else {
            notifyBtn.innerHTML = "🔔 Уведомить о наличии";
            notifyBtn.disabled = false;
        }
    }
};

window.notifyWhenAvailable = function () {
    const p = window.currentPopupProduct;
    if (!p) return;
    haptic("success");
    const notifs = JSON.parse(localStorage.getItem("vapeNotifications") || "[]");
    if (!notifs.includes(p.id)) notifs.push(p.id);
    localStorage.setItem("vapeNotifications", JSON.stringify(notifs));
    const btn = document.getElementById("notifyBtn");
    if (btn) { btn.innerHTML = "✓ Уведомим вас о наличии"; btn.disabled = true; }
    window.showToast("Мы сообщим, когда товар появится!");
    const nu = tgCurrentUser();
    notifyAdmins(
        `🔔 <b>Запрос наличия</b>\n` +
        `Клиент: ${nu && nu.username ? "@" + nu.username : "Скрыт"}\n` +
        `Товар: ${escHtml(p.name)}\n` +
        `ID: <code>${nu ? nu.id : "не определён"}</code>`
    ).catch(() => {});
};

// ── ПРОГРЕСС-БАР ДОСТАВКИ ──
window.updateDeliveryProgress = function () {
    const fill = document.getElementById("dpFill");
    const text = document.getElementById("dpText");
    const remain = document.getElementById("dpRemain");
    if (!fill) return;
    const { subtotal, discount } = window.calcOrderTotals();
    const current = subtotal - discount;
    const progress = Math.min(current / FREE_DELIVERY_THRESHOLD * 100, 100);
    fill.style.width = progress + "%";
    if (current >= FREE_DELIVERY_THRESHOLD) {
        if (text) { text.innerText = "🎁 Бесплатная доставка доступна!"; text.style.color = "var(--neon-green)"; }
        if (remain) remain.innerText = "";
    } else {
        const left = FREE_DELIVERY_THRESHOLD - current;
        if (text) { text.innerText = "До бесплатной доставки"; text.style.color = ""; }
        if (remain) remain.innerText = `ещё ${fmt(left)} ₽`;
    }
};

// ── РАССЫЛКА ──
window.updateNewsletterBanner = function () {
    const banner = document.getElementById("newsletterBanner");
    if (!banner) return;
    const subscribed = localStorage.getItem("vapeNewsletterSub") === "1";
    banner.style.display = subscribed ? "none" : "flex";
};

window.subscribeNewsletter = function () {
    if (localStorage.getItem("vapeNewsletterSub") === "1") {
        window.showToast("Вы уже подписаны ✓");
        return;
    }
    haptic("success");
    localStorage.setItem("vapeNewsletterSub", "1");
    const btn = document.getElementById("nlBtn");
    if (btn) { btn.innerText = "✓ Вы подписаны"; btn.classList.add("subscribed"); btn.disabled = true; }
    const pSub = document.getElementById("profileNewsletterSub");
    if (pSub) pSub.innerText = "✓ Вы подписаны на акции";
    window.showToast("Подписка оформлена! 🎉");
    const su = tgCurrentUser();
    notifyAdmins(
        `📣 Новая подписка на рассылку: ${su && su.username ? "@" + su.username : "Скрыт"} (<code>${su ? su.id : "не определён"}</code>)`
    ).catch(() => {});
    setTimeout(() => {
        const banner = document.getElementById("newsletterBanner");
        if (banner) banner.style.display = "none";
    }, 2500);
};

// ── ИСТОРИЯ ЗАКАЗОВ ──
window.saveOrderToHistory = function (orderData) {
    try {
        const history = JSON.parse(localStorage.getItem("vapeOrders") || "[]");
        history.unshift(Object.assign({}, orderData, { _savedAt: Date.now() }));
        if (history.length > 30) history.splice(30);
        localStorage.setItem("vapeOrders", JSON.stringify(history));
    } catch (e) {}
};

window.renderHistoryPage = function () {
    const content = document.getElementById("historyContent");
    if (!content) return;
    const history = JSON.parse(localStorage.getItem("vapeOrders") || "[]");
    if (history.length === 0) {
        content.innerHTML = `<div class="order-history-empty"><div class="ohe-icon">🛍️</div><div class="ohe-text">Заказов пока нет</div></div>`;
        return;
    }
    content.innerHTML = "";
    history.forEach(order => {
        const item = document.createElement("div");
        item.className = "history-item";
        item.innerHTML = `
            <div class="hi-header">
                <span class="hi-order-id">Заказ #${order.order_id}</span>
                <span class="hi-date">${order.date}</span>
            </div>
            <div class="hi-total">${fmt(order.total)} ₽</div>
            <div class="hi-items">${order.products}</div>
            <div class="hi-delivery">${order.delivery} · ${order.address}</div>`;
        content.appendChild(item);
    });
};

window.openOrderHistory = function () { window.switchTab("history"); };
window.closeOrderHistory = function () { window.switchTab("catalog"); };

// ── РЕФЕРАЛЬНАЯ СИСТЕМА ──
// Реферальная «личность» = реальный Telegram ID. Именно по нему БОТ начисляет
// награду пригласившему — код из localStorage для этого не годится (его легко
// подделать/очистить). Для гостей без Telegram оставляем случайный код только
// ради отображения.
window.initReferralCode = function () {
    const u = window.tg && window.tg.initDataUnsafe && window.tg.initDataUnsafe.user;
    if (u && u.id) {
        window._myRefId = String(u.id);
    } else {
        let code = localStorage.getItem("vapeRefCode");
        if (!code) {
            code = "VAPE" + Math.random().toString(36).slice(2, 7).toUpperCase();
            localStorage.setItem("vapeRefCode", code);
        }
        window._myRefId = code;
    }
    window._myRefCode = window._myRefId;
    const display = document.getElementById("refCodeDisplay");
    if (display) display.innerText = window._myRefCode;
};

window.checkIncomingReferral = function () {
    const u = window.tg && window.tg.initDataUnsafe && window.tg.initDataUnsafe.user;
    const myId = u && u.id ? String(u.id) : "";
    const startParam = (window.tg && window.tg.initDataUnsafe && window.tg.initDataUnsafe.start_param) || "";
    if (startParam.startsWith("ref_") && !localStorage.getItem("vapeReferredBy")) {
        const refId = startParam.slice(4);
        // защита от само-реферала: нельзя пригласить самого себя
        if (refId && refId !== myId) {
            localStorage.setItem("vapeReferredBy", refId);
            window.referralDiscountActive = true;
            setTimeout(() => window.showToast("🎁 Реферальная скидка 5% применена!"), 800);
        }
    } else if (localStorage.getItem("vapeReferredBy") && !localStorage.getItem("vapeRefUsed")) {
        // повторно скидку не даём, если уже был оплаченный заказ по рефералке
        if (localStorage.getItem("vapeReferredBy") !== myId) window.referralDiscountActive = true;
    }
};

window.openReferral = function () {
    haptic("light");
    window.initReferralCode();
    const stats = document.getElementById("refStats");
    if (stats) {
        const referredBy = localStorage.getItem("vapeReferredBy");
        if (referredBy && !localStorage.getItem("vapeRefUsed")) {
            stats.innerText = "✓ Скидка 5% активна на ваш следующий заказ";
            stats.style.color = "var(--neon-green)";
        } else {
            const inviteCount = parseInt(localStorage.getItem("vapeInviteCount") || "0");
            stats.innerText = inviteCount > 0 ? `Ты пригласил ${inviteCount} ${window.plural(inviteCount, "друга", "друзей", "друзей")}` : "";
            stats.style.color = "var(--text-secondary)";
        }
    }
    document.getElementById("referralPopup").classList.add("active");
    window.setupBackButton(window.closeReferral);
};

window.closeReferral = function () {
    const popup = document.getElementById("referralPopup");
    popup.classList.remove("active");
    const drawer = popup.querySelector(".drawer");
    if (drawer) drawer.style.transform = "";
    window.hideBackButton();
};

// ── ИЗБРАННОЕ ──
window.toggleWishlist = function (productId) {
    haptic("light");
    window.wishlist = window.wishlist || [];
    const idx = window.wishlist.indexOf(productId);
    const snaps = wishPricesGet();
    if (idx === -1) {
        window.wishlist.push(productId);
        const p = window.products.find(x => x.id === productId);
        if (p) snaps[productId] = p.price;  // запоминаем цену для отслеживания снижения
        window.showToast("Добавлено в избранное ♥");
    } else {
        window.wishlist.splice(idx, 1);
        delete snaps[productId];
        window.showToast("Удалено из избранного");
    }
    wishPricesSet(snaps);
    localStorage.setItem("vapeWishlist", JSON.stringify(window.wishlist));
    document.querySelectorAll(`.wish-btn`).forEach(btn => {
        const onclick = btn.getAttribute("onclick") || "";
        if (onclick.includes(`'${productId}'`)) btn.classList.toggle("wished", window.wishlist.includes(productId));
    });
    const wishTab = document.querySelector('.tab-btn[data-target="wishlist"]');
    if (wishTab) wishTab.style.color = window.wishlist.length > 0 && !wishTab.classList.contains("active") ? "var(--neon-red)" : "";
};

window.renderWishlistPage = function () {
    const content = document.getElementById("wishlistContent");
    if (!content) return;
    window.wishlist = window.wishlist || [];
    if (window.wishlist.length === 0) {
        content.innerHTML = `<div class="order-history-empty"><div class="ohe-icon">♡</div><div class="ohe-text">Список избранного пуст</div></div>`;
        return;
    }
    content.innerHTML = "";
    const snaps = wishPricesGet();
    window.wishlist.forEach(id => {
        const p = window.products.find(x => x.id === id);
        if (!p) return;
        const row = document.createElement("div");
        row.className = "wishlist-item";
        const imgSrc = p.image ? `img/${p.image}` : "";
        const letter = p.name.charAt(0).toUpperCase();
        const dropped = (snaps[id] != null && p.price < snaps[id]);
        const priceHtml = dropped
            ? `<div class="wi-price"><span class="wi-old">${fmt(snaps[id])} ₽</span> <span class="wi-new">${fmt(p.price)} ₽</span> <span class="wi-drop">🔻 −${fmt(snaps[id] - p.price)}</span></div>`
            : `<div class="wi-price">${fmt(p.price)} ₽</div>`;
        row.innerHTML = `
            <div class="wi-img">${imgSrc ? `<img src="${imgSrc}" alt="" loading="lazy" onerror="this.parentElement.innerText='${letter}'">` : letter}</div>
            <div class="wi-info">
                <div class="wi-name">${p.name}</div>
                <div class="wi-brand">${p.brand || ""}</div>
                ${priceHtml}
            </div>
            <button class="fc-add" onclick="window.switchTab('catalog');setTimeout(()=>window.handleCardClick('${p.id}'),300)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>`;
        content.appendChild(row);
    });
    // клиент увидел изменения — обновляем снапшоты на текущие цены
    window.wishlist.forEach(id => {
        const p = window.products.find(x => x.id === id);
        if (p) snaps[id] = p.price;
    });
    wishPricesSet(snaps);
};

window.openWishlist = function () { window.switchTab("wishlist"); };
window.closeWishlist = function () { window.switchTab("catalog"); };

// ── ФИЛЬТРЫ И СОРТИРОВКА ──
window.selectFilterChip = function (el, type, value) {
    haptic("select");
    if (type === "sort") {
        window.currentSort = (window.currentSort === value) ? "default" : value;
    } else {
        window.currentFilter = (window.currentFilter === value) ? null : value;
    }
    window.updateFilterChips();
    window.filterVapeProducts();
    window.scrollTo({ top: 0, behavior: "smooth" });
};

window.resetFilters = function () {
    haptic("select");
    window.currentSort = "default";
    window.currentFilter = null;
    window.updateFilterChips();
    window.filterVapeProducts();
    window.scrollTo({ top: 0, behavior: "smooth" });
};

window.updateFilterChips = function () {
    document.querySelectorAll(".filter-chip").forEach(b => b.classList.remove("active"));
    if (window.currentSort === "default" && !window.currentFilter) {
        document.querySelector(".filter-chip[data-reset]") && document.querySelector(".filter-chip[data-reset]").classList.add("active");
    } else {
        document.querySelectorAll(`.filter-chip[data-value="${window.currentSort}"], .filter-chip[data-value="${window.currentFilter}"]`).forEach(b => b.classList.add("active"));
    }
};

// ── ВОЗРАСТНОЙ ГЕЙТ 18+ ──
window.ageVerified = function () { return localStorage.getItem("vapeAgeVerified") === "1"; };

window.showAgeGate = function () {
    const g = document.getElementById("ageGate");
    if (!g) return;
    g.style.display = "flex";
    requestAnimationFrame(() => g.classList.add("active"));
};

window.confirmAge = function () {
    haptic("success");
    localStorage.setItem("vapeAgeVerified", "1");
    const g = document.getElementById("ageGate");
    if (g) {
        g.classList.remove("active");
        setTimeout(() => { g.style.display = "none"; }, 350);
    }
    window.checkOnboarding();  // онбординг — только после подтверждения возраста
};

window.denyAge = function () {
    haptic("error");
    const box = document.getElementById("ageGateBox");
    if (box) box.innerHTML =
        '<div class="ob-emoji">🚫</div>' +
        '<div class="ob-title">Доступ запрещён</div>' +
        '<div class="ob-sub">Магазин доступен только лицам старше 18 лет.<br>Возвращайтесь, когда вам исполнится 18.</div>';
};

// ── ТАЙМЕР АКЦИИ НА HERO-БАННЕРЕ (отсчёт до конца дня) ──
window.startHeroTimer = function () {
    const elH = document.getElementById("htH");
    const elM = document.getElementById("htM");
    const elS = document.getElementById("htS");
    if (!elH || !elM || !elS) return;
    const pad = (n) => String(n).padStart(2, "0");
    function tick() {
        const now = new Date();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        const diff = Math.max(0, Math.floor((end - now) / 1000));
        elH.textContent = pad(Math.floor(diff / 3600));
        elM.textContent = pad(Math.floor((diff % 3600) / 60));
        elS.textContent = pad(diff % 60);
    }
    tick();
    if (window._heroTimerInt) clearInterval(window._heroTimerInt);
    window._heroTimerInt = setInterval(tick, 1000);
};

// ── ОНБОРДИНГ ──
window.checkOnboarding = function () {
    if (localStorage.getItem("vapeOnboarded")) return;
    const overlay = document.getElementById("onboardingOverlay");
    if (overlay) setTimeout(() => overlay.classList.add("active"), 500);
};

window.closeOnboarding = function () {
    haptic("success");
    localStorage.setItem("vapeOnboarded", "1");
    const overlay = document.getElementById("onboardingOverlay");
    if (overlay) {
        overlay.classList.remove("active");
        setTimeout(() => { overlay.style.display = "none"; }, 400);
    }
};

// ── SWIPE TO CLOSE ──
window.initSwipeToClose = function () {
    const closeMap = {
        "productPopup":  () => window.closeVapePopup(),
        "cartPopup":     () => window.closeVapeCart(),
        "referralPopup": () => window.closeReferral(),
        "specialOrderPopup": () => window.closeSpecialOrder(),
    };
    document.querySelectorAll(".overlay").forEach(overlay => {
        const drawer = overlay.querySelector(".drawer");
        if (!drawer) return;
        let startY = 0, lastY = 0, dragging = false;
        drawer.addEventListener("touchstart", e => {
            startY = e.touches[0].clientY; lastY = startY; dragging = true;
            drawer.style.transition = "none";
        }, { passive: true });
        drawer.addEventListener("touchmove", e => {
            if (!dragging) return;
            lastY = e.touches[0].clientY;
            const dy = Math.max(0, lastY - startY);
            drawer.style.transform = `translateY(${dy}px)`;
        }, { passive: true });
        drawer.addEventListener("touchend", () => {
            dragging = false;
            drawer.style.transition = "";
            if (lastY - startY > 100) {
                const fn = closeMap[overlay.id];
                if (fn) {
                    drawer.style.transform = "translateY(100%)";
                    window._swipeCloseTimer = setTimeout(() => {
                        window._swipeCloseTimer = null;
                        fn();
                    }, 200);
                }
            } else {
                drawer.style.transform = "";
            }
        });
    });
};

// ── ПОДДЕРЖКА ──
window.openSupport = function () {
    haptic("light");
    const url = "https://t.me/BORO_DOTA";
    if (window.tg && window.tg.openTelegramLink) {
        try { window.tg.openTelegramLink(url); return; } catch(e) {}
    }
    window.open(url, "_blank");
};

window.shareReferral = function () {
    haptic("medium");
    if (!window._myRefId) window.initReferralCode();
    const refId = window._myRefId || window._myRefCode || "VAPESHOP";
    const botName = "vapebazar_bot";
    // startapp открывает Mini App и передаёт ref_<id> в start_param — так скидка
    // 5% применяется у друга автоматически, а бот узнаёт, кто кого пригласил.
    const shareUrl = `https://t.me/${botName}?startapp=ref_${refId}`;
    const text = `🛍 Заходи в VAPEBAZAR — лучший вейп-магазин!\nПо моей ссылке получишь скидку 5% на первый заказ 🎁`;
    if (window.tg && window.tg.openTelegramLink) {
        try {
            window.tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`);
            const count = parseInt(localStorage.getItem("vapeInviteCount") || "0");
            localStorage.setItem("vapeInviteCount", count + 1);
            return;
        } catch (e) {}
    }
    if (navigator.share) {
        navigator.share({ title: "VAPEBAZAR", text, url: shareUrl }).catch(() => {});
    } else {
        navigator.clipboard && navigator.clipboard.writeText(shareUrl)
            .then(() => window.showToast("Ссылка скопирована!"))
            .catch(() => window.showToast("Скопируй: " + shareUrl));
    }
};
