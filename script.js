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

// ── ОТПРАВКА ЗАКАЗОВ НАПРЯМУЮ ЧЕРЕЗ BOT API ──
// tg.sendData() работает ТОЛЬКО если магазин открыт через кнопку клавиатуры
// в чате бота; при открытии через меню/профиль/ссылку данные молча теряются.
// Прямой вызов Bot API доставляет заказ при любом способе открытия.
const BOT_API_TOKEN = "8687110031:AAE9E430W55aRQQuUwDI8hEMjaVliq_gbG4";
const ORDER_ADMIN_IDS = [6163521938, 5289357165];
const MANAGER_TG = "BORO_DOTA";

function escHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function tgApiSend(chatId, text, replyMarkup) {
    const resp = await fetch("https://api.telegram.org/bot" + BOT_API_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML", reply_markup: replyMarkup })
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.description || "sendMessage failed");
    return data;
}

// Шлёт текст всем админам; resolve = доставлено хотя бы одному
function notifyAdmins(text, replyMarkup) {
    return Promise.allSettled(ORDER_ADMIN_IDS.map(id => tgApiSend(id, text, replyMarkup)))
        .then(results => {
            if (!results.some(r => r.status === "fulfilled")) {
                throw new Error(results[0] && results[0].reason ? results[0].reason.message : "send failed");
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
    window.checkOnboarding();

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
    }).catch(() => {
        haptic("error");
        alert(`⚠️ Не удалось отправить заявку. Проверьте интернет и попробуйте ещё раз.\nИли напишите напрямую: @${MANAGER_TG}`);
    });
};

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
        const imgSrc = p.image ? `img/${p.image}` : "";
        let badge = "";
        if (p.isNew) badge = '<div class="fc-badge new">New</div>';
        else if (p.tags && p.tags.some(t => t.includes("ХИТ") || t.includes("HOT"))) badge = '<div class="fc-badge hot">Хит</div>';
        card.innerHTML = `
            ${badge}
            <div class="fc-img">${imgSrc ? `<img src="${imgSrc}" alt="" onerror="this.parentElement.innerText='${p.name.charAt(0)}'">` : p.name.charAt(0)}</div>
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
        // стаггер: каждая карточка появляется чуть позже предыдущей
        card.style.animationDelay = Math.min(idx * 35, 350) + "ms";
        const imgSrc = p.image ? `img/${p.image}` : "";
        const letter = p.name ? p.name.charAt(0).toUpperCase() : "V";
        const qty = window.getCartQty(p.id);

        let tags = "";
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
};

window.plural = function (n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
};

// ── РАСЧЁТ ──
window.calcOrderTotals = function () {
    const subtotal = window.cart.reduce((s, i) => s + i.price * i.quantity, 0);
    let discount = 0;
    if (window.appliedPromo) {
        discount = Math.round(subtotal * window.appliedPromo.discount);
    } else if (window.referralDiscountActive) {
        discount = Math.round(subtotal * 0.05);
    }
    const afterDiscount = subtotal - discount;
    const deliveryCost = (window.currentDeliveryMethod === "delivery" && afterDiscount < FREE_DELIVERY_THRESHOLD) ? DELIVERY_COST : 0;
    return { subtotal, discount, deliveryCost, total: afterDiscount + deliveryCost };
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
    const { subtotal, discount, deliveryCost, total } = window.calcOrderTotals();
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.innerText = val; };
    set("cartTotalPrice", `${fmt(total)} ₽`);
    set("sumSubtotal", `${fmt(subtotal)} ₽`);

    const dRow = document.getElementById("sumDiscountRow");
    if (dRow) { dRow.style.display = discount > 0 ? "flex" : "none"; set("sumDiscount", `−${fmt(discount)} ₽`); }

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

    window.updateCartCounters();
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
    } else {
        haptic("error");
        window.appliedPromo = null;
        msg.innerText = "❌ Неверный промокод";
        msg.style.color = "var(--neon-red)";
    }
    window.updateCartTotalDisplay();
};

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
    const { subtotal, discount, deliveryCost, total } = window.calcOrderTotals();
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

    const kb = { inline_keyboard: [
        [ { text: "✅ Принять", callback_data: `st_accept_${orderData.order_id}_${customerId}` },
          { text: "📦 В сборке", callback_data: `st_pack_${orderData.order_id}_${customerId}` } ],
        [ { text: "🚚 Отправлен", callback_data: `st_ship_${orderData.order_id}_${customerId}` },
          { text: "🎯 Выполнен", callback_data: `st_done_${orderData.order_id}_${customerId}` } ],
        [ { text: "❌ Отменить заказ", callback_data: `st_cancel_${orderData.order_id}_${customerId}` } ]
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
                `\n💰 <b>К оплате: ${fmt(total)} ₽</b>\n\n` +
                `📍 ${isPickup ? "Самовывоз: " : "Доставка: "}${escHtml(orderData.address)}\n\n` +
                `🧑‍💻 Наш директор @${MANAGER_TG} свяжется с вами для подтверждения.\n` +
                `🔔 Мы пришлём уведомление, когда статус заказа изменится!`
            ).catch(() => {});
        }
        haptic("success");
        window.saveOrderToHistory(orderData);
        window.referralDiscountActive = false;
        localStorage.setItem("vapeRefUsed", "1");
        window.cart = []; window.appliedPromo = null;
        window.updateCartCounters();
        window.showConfetti();
        window.showToast("✅ Заказ #" + orderData.order_id + " отправлен!");
        setTimeout(() => {
            try { if (window.tg && window.tg.close) { window.tg.close(); return; } } catch (e) {}
            window.closeVapeCart();
        }, 2000);
    }).catch(() => {
        haptic("error");
        alert(`⚠️ Не удалось отправить заказ.\n\nПроверьте интернет и попробуйте ещё раз.\nЕсли не получается — напишите @${MANAGER_TG}, корзина сохранена.`);
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
window.initReferralCode = function () {
    let code = localStorage.getItem("vapeRefCode");
    if (!code) {
        const u = window.tg && window.tg.initDataUnsafe && window.tg.initDataUnsafe.user;
        code = u ? ("VAPE" + u.id).slice(0, 12).toUpperCase() : "VAPE" + Math.random().toString(36).slice(2, 7).toUpperCase();
        localStorage.setItem("vapeRefCode", code);
    }
    window._myRefCode = code;
    const display = document.getElementById("refCodeDisplay");
    if (display) display.innerText = code;
};

window.checkIncomingReferral = function () {
    const startParam = (window.tg && window.tg.initDataUnsafe && window.tg.initDataUnsafe.start_param) || "";
    if (startParam.startsWith("ref_") && !localStorage.getItem("vapeReferredBy")) {
        const refCode = startParam.slice(4);
        localStorage.setItem("vapeReferredBy", refCode);
        window.referralDiscountActive = true;
        setTimeout(() => window.showToast("🎁 Реферальная скидка 5% применена!"), 800);
    } else if (localStorage.getItem("vapeReferredBy") && !localStorage.getItem("vapeRefUsed")) {
        window.referralDiscountActive = true;
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
    if (idx === -1) {
        window.wishlist.push(productId);
        window.showToast("Добавлено в избранное ♥");
    } else {
        window.wishlist.splice(idx, 1);
        window.showToast("Удалено из избранного");
    }
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
    window.wishlist.forEach(id => {
        const p = window.products.find(x => x.id === id);
        if (!p) return;
        const row = document.createElement("div");
        row.className = "wishlist-item";
        const imgSrc = p.image ? `img/${p.image}` : "";
        const letter = p.name.charAt(0).toUpperCase();
        row.innerHTML = `
            <div class="wi-img">${imgSrc ? `<img src="${imgSrc}" alt="" loading="lazy" onerror="this.parentElement.innerText='${letter}'">` : letter}</div>
            <div class="wi-info">
                <div class="wi-name">${p.name}</div>
                <div class="wi-brand">${p.brand || ""}</div>
                <div class="wi-price">${fmt(p.price)} ₽</div>
            </div>
            <button class="fc-add" onclick="window.switchTab('catalog');setTimeout(()=>window.handleCardClick('${p.id}'),300)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>`;
        content.appendChild(row);
    });
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
    const code = window._myRefCode || localStorage.getItem("vapeRefCode") || "VAPESHOP";
    const botName = "vapebazar_bot";
    const shareUrl = `https://t.me/${botName}?start=ref_${code}`;
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
