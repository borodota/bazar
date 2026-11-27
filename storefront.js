/* Presentation layer adapted from the user-supplied Вебсайт-2 design.
   Business data and order transport remain in script.js. */
(function () {
    'use strict';
    let bannerIndex = 0;
    const banners = [
        { tag: 'Новинки', title: 'Новое в каталоге VAPEBAZAR', text: 'Устройства, жидкости и расходники. Актуальные цены и наличие — в каталоге.', action: 'Смотреть новинки' },
        { tag: 'Первый заказ', title: 'НОВИЧОК10 — скидка 10%', text: 'Введите промокод при оформлении первого заказа. Итоговая сумма появится в корзине.', action: 'Открыть корзину' },
        { tag: 'Доставка', title: 'Доставка по Магадану', text: 'Выберите доставку или самовывоз в корзине. Стоимость рассчитывается до оформления заказа.', action: 'Условия доставки' }
    ];
    window.setStoreBanner = function (index) {
        bannerIndex = (index + banners.length) % banners.length;
        const banner = banners[bannerIndex];
        document.getElementById('heroTag').textContent = banner.tag;
        document.getElementById('heroTitle').textContent = banner.title;
        document.getElementById('heroText').textContent = banner.text;
        document.getElementById('heroAction').textContent = banner.action + '  ›';
        document.querySelectorAll('.hero-dots button').forEach((button, i) => {
            button.classList.toggle('active', i === bannerIndex);
            button.setAttribute('aria-pressed', String(i === bannerIndex));
        });
    };
    window.stepStoreBanner = function (step) { window.setStoreBanner(bannerIndex + step); };
    window.activateStoreBanner = function () {
        if (bannerIndex === 0) {
            window.currentCategory = 'Все';
            window._activeBrand = null;
            window.currentSort = 'default';
            document.getElementById('searchInput').value = '';
            window.renderCategories();
            window._renderBrandChips();
            window.currentFilter = 'new';
            window.updateFilterChips();
            window.filterVapeProducts();
            document.getElementById('allProductsLabel').scrollIntoView({ block: 'start' });
        } else if (bannerIndex === 1) {
            window.openVapeCart();
        } else {
            window.showToast('Доставка — ' + DELIVERY_COST + ' ₽, бесплатно от ' + FREE_DELIVERY_THRESHOLD + ' ₽. Самовывоз — бесплатно.', 5500);
        }
    };
    window.focusCatalogSearch = function () {
        window.switchTab('catalog');
        document.getElementById('searchInput').focus();
    };
    window.toggleBrandFilters = function (button) {
        const row = document.getElementById('brandFilterRow');
        row.hidden = !row.hidden;
        button.setAttribute('aria-expanded', String(!row.hidden));
    };

    // Inline outlines from the supplied DeviceArt; used only when no photo exists.
    window.storeProductArt = function (category) {
        const kind = _catTheme(category);
        const paths = {
            pod: '<rect x="62" y="22" width="36" height="74" rx="10"/><path d="M74 22v-8h12v8M70 48h20M74 82h12"/>',
            disposable: '<rect x="68" y="12" width="24" height="88" rx="9"/><path d="M74 28h12M74 82h12"/><circle cx="80" cy="58" r="4"/>',
            liquid: '<path d="M66 46h28v38a8 8 0 0 1-8 8H74a8 8 0 0 1-8-8V46ZM72 46V28h16v18M66 64h28"/>',
            consumable: '<rect x="56" y="34" width="48" height="44" rx="10"/><path d="M68 30v52M80 30v52M92 30v52M104 56h16"/>',
            tech: '<rect x="55" y="12" width="50" height="88" rx="9"/><path d="M73 19h14M75 91h10"/>',
            other: '<rect x="44" y="38" width="72" height="36" rx="8"/><path d="M56 74v10M104 74v10M116 50h8v12h-8M60 56h20"/>'
        };
        const mapping = { dis: 'disposable', liq: 'liquid', cart: 'consumable', coil: 'consumable', apple: 'tech', samsung: 'tech', console: 'other', acc: 'other' };
        return '<svg class="device-art" viewBox="0 0 160 112" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[kind] || paths[mapping[kind]] || paths.other) + '</svg>';
    };
    document.addEventListener('DOMContentLoaded', function () {
        // Same tab handlers and active-state classes on desktop and mobile.
        const desktop = document.querySelector('.desktop-tabs');
        document.querySelectorAll('.bottom-tabs .tab-btn').forEach(function (button) {
            desktop.appendChild(button.cloneNode(true));
        });
        const amount = Number(FREE_DELIVERY_THRESHOLD).toLocaleString('ru-RU');
        banners[2].title = 'По Магадану от ' + amount + ' ₽ — бесплатно';
        banners[2].text = 'Ниже суммы — ' + DELIVERY_COST + ' ₽. Доставка или самовывоз: выберите удобный способ в корзине.';
        window.setStoreBanner(0);
        // Keep modal semantics while preserving existing swipe handlers.
        document.querySelectorAll('.overlay .drawer').forEach(function (drawer) {
            drawer.setAttribute('role', 'dialog');
            drawer.setAttribute('aria-modal', 'true');
            const title = drawer.querySelector('.drawer-title');
            if (title) drawer.setAttribute('aria-label', title.textContent.trim());
        });
    });
})();
