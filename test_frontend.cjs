const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

// Логика приложения в изолированном JS-контексте. Сеть и Telegram замоканы.
function element(value = '') {
    const classes = new Set();
    return {
        value, checked: false, disabled: false, style: {}, innerHTML: '', children: [], attrs: {},
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle(c, force) { if (force) classes.add(c); else classes.delete(c); } },
        setAttribute(k,v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
        appendChild(child) { this.children.push(child); }, append(...children) { this.children.push(...children); },
        replaceChildren() { this.children = []; }, querySelector() { return null; }, closest() { return null; },
        focus() {}, scrollIntoView() {},
    };
}
function app() {
    const storage = new Map();
    const elements = Object.fromEntries(['customerName','customerTelegram','customerPhone','deliveryAddress','changeCustom','needChange','checkoutBtn','orderSuccessOverlay','historyContent','savedAddrsRow'].map(id => [id, element()]));
    elements.customerName.value = 'Тест';
    elements.customerTelegram.value = '@test';
    elements.customerPhone.value = '+7 (900) 123-45-67';
    elements.deliveryAddress.value = 'Магадан, ул. Тестовая, 1';
    const context = {
        console: { log() {}, warn() {}, error() {} }, TextEncoder, AbortController, URLSearchParams, Intl,
        crypto: webcrypto, location: { search: '' }, navigator: {},
        setTimeout() { return 1; }, clearTimeout() {}, setInterval() {}, clearInterval() {},
        requestAnimationFrame() {}, cancelAnimationFrame() {}, addEventListener() {},
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k) },
        document: { addEventListener() {}, getElementById: id => elements[id] || null, querySelector: () => null, querySelectorAll: () => [], createElement: () => element() },
        fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('script.js','utf8'), context);
    context.products = [{ id: 'test', name: 'Тестовый товар', price: 1000, inStock: true }];
    context.cart = [{ id: 'test', name: 'Тестовый товар', price: 1000, quantity: 1, flavor: 'Стандарт' }];
    context.tg = { initData: 'signed-test-data', initDataUnsafe: { user: { id: 123456789, first_name: 'Тест', username: 'test' } }, showPopup() {} };
    for (const fn of ['showToast','showConfetti','closeVapeCart','showOrderSuccess','updateLevelUI','updateBonusUI']) context[fn] = () => {};
    context.updateCartCounters = () => context.localStorage.setItem('vapeCart', JSON.stringify(context.cart));
    return { context, elements, storage, run: code => vm.runInContext(code, context) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('totals respect pickup, delivery threshold, promo and bonus cap', () => {
    const { context: a, storage } = app();
    assert.equal(a.calcOrderTotals().total, 1000);
    a.currentDeliveryMethod = 'delivery';
    assert.equal(a.calcOrderTotals().total, 1250);
    a.cart[0].quantity = 2;
    assert.equal(a.calcOrderTotals().deliveryCost, 0);
    a.appliedPromo = { discount: .1, label: '10%' };
    storage.set('vapeBonus', '9999');
    a.bonusApplied = true;
    const total = a.calcOrderTotals();
    assert.equal(total.discount, 200);
    assert.equal(total.bonusUsed, 360);
    assert.equal(total.total, 1690);
    a.products[0].preOrder = true;
    assert.equal(a.calcOrderTotals().discount, 0);
    assert.equal(a.calcOrderTotals().bonusUsed, 0);
});

test('referral checkout works without an applied promo object', async () => {
    const { context: a, storage } = app();
    a.referralDiscountActive = true;
    storage.set('vapeReferredBy', '111');
    a.checkoutVapeOrder();
    await flush();
    const history = JSON.parse(storage.get('vapeOrders'));
    assert.equal(history.length, 1);
    assert.equal(history[0].total, 950);
    assert.match(history[0].products, /По приглашению друга/);
});

test('double tap sends one order and releases the checkout button', async () => {
    const { context: a, elements, storage } = app();
    const calls = [];
    a.fetch = async (_, options) => { calls.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ ok: true }) }; };
    a.checkoutVapeOrder(); a.checkoutVapeOrder();
    await flush();
    assert.equal(calls.length, 3, 'Два администратора и одно подтверждение клиенту');
    assert.equal(JSON.parse(storage.get('vapeOrders')).length, 1);
    assert.equal(a._checkoutInFlight, false);
    assert.equal(elements.checkoutBtn.disabled, false);
});

test('failed relay keeps cart and does not manufacture order history', async () => {
    const { context: a, storage, elements } = app();
    a.fetch = async () => { throw new Error('offline'); };
    a.checkoutVapeOrder();
    await flush();
    assert.equal(a.cart.length, 1);
    assert.equal(storage.has('vapeOrders'), false);
    assert.equal(elements.checkoutBtn.disabled, false);
});

test('keyboard transport failure restores bonus, spending, referral and history', () => {
    const { context: a, storage } = app();
    a.location.search = '?source=keyboard';
    a.tg.initData = '';
    a.tg.sendData = () => { throw new Error('not sent'); };
    storage.set('vapeBonus', '100'); storage.set('vapeTotalSpent', '900'); storage.set('vapeOrders', '[]');
    a.bonusApplied = true;
    a.checkoutVapeOrder();
    assert.equal(a.cart.length, 1);
    assert.equal(storage.get('vapeBonus'), '100');
    assert.equal(storage.get('vapeTotalSpent'), '900');
    assert.equal(storage.get('vapeOrders'), '[]');
    assert.equal(storage.has('vapeRefUsed'), false);
    assert.equal(a.bonusApplied, true);
    assert.equal(a._checkoutInFlight, false);
});

test('browser checkout without Telegram keeps cart', () => {
    const { context: a, storage } = app();
    a.tg = null;
    a.checkoutVapeOrder();
    assert.equal(a.cart.length, 1);
    assert.equal(storage.has('vapeOrders'), false);
});

test('VPN deep link preserves the selected device count', () => {
    const { context: a } = app();
    let link;
    a.tg.openTelegramLink = url => { link = url; };
    a._vpnDevices = 5;
    a.buyVpn('month');
    assert.match(link, /start=vpn_month_5$/);
    assert.equal(a.vpnPriceFor(a.VPN_TARIFFS[1], 5), 450);
});

test('corrupt saved data does not crash history or addresses', () => {
    const { context: a, storage } = app();
    storage.set('vapeOrders', '{broken'); storage.set('vapeSavedAddrs', 'null');
    assert.doesNotThrow(() => a.renderHistoryPage());
    assert.doesNotThrow(() => a._renderSavedAddrs());
});

test('order history escapes customer-supplied HTML', () => {
    const { context: a, storage, elements } = app();
    storage.set('vapeOrders', JSON.stringify([{ order_id: '1', total: 1000, address: '<img src=x onerror=alert(1)>', products: '<script>alert(1)</script>' }]));
    a.renderHistoryPage();
    const html = elements.historyContent.children[0].innerHTML;
    assert.equal(html.includes('<img'), false);
    assert.equal(html.includes('<script>'), false);
    assert.match(html, /&lt;img/);
});

test('saved addresses use text and event handlers, including quotes and markup', () => {
    const { context: a, storage, elements } = app();
    const address = `Магадан, "дом" <b>1</b> 'кв. 2'`;
    storage.set('vapeSavedAddrs', JSON.stringify([address]));
    a._renderSavedAddrs();
    const chip = elements.savedAddrsRow.children[0];
    chip.children[0].onclick();
    assert.equal(elements.deliveryAddress.value, address);
    assert.equal(chip.innerHTML, '');
});

test('shop status uses Magadan even when the client timezone is UTC', () => {
    const { context: a } = app();
    a.Date = class extends Date { constructor() { super('2026-09-07T00:00:00Z'); } };
    assert.equal(a.getShopStatus().open, true, '11:00 в Магадане');
    a.Date = class extends Date { constructor() { super('2026-09-07T15:00:00Z'); } };
    assert.equal(a.getShopStatus().open, false, '02:00 в Магадане');
});

test('cart notes are persisted immediately', () => {
    const { context: a, storage } = app();
    a._setCartNote(0, 'Подарок');
    assert.equal(JSON.parse(storage.get('vapeCart'))[0].note, 'Подарок');
});

test('checkout progresses before sending; back keeps contact details and cart', () => {
    const { context: a, elements } = app();
    for (const id of ['orderFormBlock', 'cartItemsList', 'cartBenefits', 'checkoutBack', 'checkoutSteps', 'cartTitle', 'cartSubtitle', 'checkoutHint']) elements[id] = element();
    let sent = 0;
    a.checkoutVapeOrder = () => sent++;
    a.setCheckoutStep('cart');
    assert.equal(elements.orderFormBlock.style.display, 'none');
    assert.equal(elements.cartItemsList.hidden, false);
    elements.checkoutBtn.onclick();
    assert.equal(sent, 0, 'Continue never sends an order');
    assert.equal(elements.orderFormBlock.style.display, 'block');
    assert.equal(elements.cartItemsList.hidden, true);
    elements.customerPhone.value = '+7 (999) 456-78-90';
    a.cartBack();
    assert.equal(a._checkoutStep, 'cart');
    assert.equal(elements.customerPhone.value, '+7 (999) 456-78-90');
    assert.equal(a.cart.length, 1);
    elements.checkoutBtn.onclick();
    elements.checkoutBtn.onclick();
    assert.equal(sent, 1);
});

test('small baskets cannot advance and pending submissions cannot change step', () => {
    const { context: a } = app();
    a.setCheckoutStep('cart');
    a.cart[0].price = 100;
    a.setCheckoutStep('details');
    assert.equal(a._checkoutStep, 'cart');
    a.cart[0].price = 1000;
    a.setCheckoutStep('details');
    a._checkoutInFlight = true;
    a.cartBack();
    assert.equal(a._checkoutStep, 'details');
});

test('flavor searches and complete filter reset recover an empty catalogue', () => {
    const { context: a, elements } = app();
    a.products = [
        { id: 'one', name: 'Товар', brand: 'Brand', category: 'Жидкости', price: 500, flavors: ['Манго малина'] },
        { id: 'two', name: 'Другой', category: 'Под-системы', price: 2000, flavors: ['Black'] }
    ];
    elements.searchInput = element('Brand манго');
    let shown;
    a.renderProducts = list => { shown = list; };
    a.filterVapeProducts();
    assert.equal(shown.length, 1);
    assert.equal(shown[0].id, 'one');
    a.currentCategory = 'Под-системы'; a._activeBrand = 'Brand'; a.currentFilter = 'sale';
    a.filterVapeProducts();
    assert.equal(shown.length, 0);
    a.clearCatalogFilters();
    assert.equal(shown.length, 2);
    assert.equal(elements.searchInput.value, '');
});

test('Telegram users without a public username can place an order', async () => {
    const { context: a, elements, storage } = app();
    delete a.tg.initDataUnsafe.user.username;
    elements.customerTelegram.value = '';
    a.checkoutVapeOrder();
    await flush();
    assert.equal(JSON.parse(storage.get('vapeOrders')).length, 1);
    assert.equal(elements.customerTelegram.value, '', 'Do not invent a username from a name or ID');
});
