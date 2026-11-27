const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
    const elements = new Map();
    const node = () => ({textContent:'', value:'old query', hidden:true, attributes:{},
        classList:{toggle(){}}, setAttribute(k,v){this.attributes[k]=v;},
        scrollIntoView(){this.scrolled=true;}, focus(){this.focused=true;}, appendChild(){}});
    const get = id => { if(!elements.has(id)) elements.set(id,node()); return elements.get(id); };
    const dots = [node(),node(),node()];
    const calls = [];
    const window = {resetFilters(){}, updateFilterChips(){}, filterVapeProducts(){calls.push('filter');},
        renderCategories(){}, _renderBrandChips(){}, openVapeCart(){calls.push('cart');},
        showToast(t){calls.push(t);}, switchTab(t){calls.push(t);}};
    const context = {window, DELIVERY_COST:250, FREE_DELIVERY_THRESHOLD:2400,
        _catTheme: c=>c, document:{getElementById:get, querySelector:()=>node(),
            querySelectorAll:s=>s==='.hero-dots button'?dots:[],
            addEventListener:(event,cb)=>{if(event==='DOMContentLoaded')context.init=cb;}}};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('storefront.js','utf8'),context);
    context.init();
    return {window,get,dots,calls,context};
}

test('delivery banner reads shop constants, not prototype demo prices', () => {
    const f=fixture();f.window.setStoreBanner(2);
    assert.match(f.get('heroTitle').textContent,/2.?400/);
    assert.match(f.get('heroText').textContent,/250/);
    assert.equal(f.dots[2].attributes['aria-pressed'],'true');
    f.window.activateStoreBanner();assert.match(f.calls[0],/2400/);
});
test('banner wraps in both directions and cart action uses real handler',()=>{
    const f=fixture();f.window.stepStoreBanner(-1);
    assert.equal(f.get('heroTag').textContent,'Доставка');
    f.window.stepStoreBanner(2); f.window.activateStoreBanner();
    assert.deepEqual(f.calls,['cart']);
});
test('new arrivals clears stale search and category before applying filter',()=>{
    const f=fixture();f.window.currentCategory='Apple';f.window._activeBrand='Apple';
    f.window.activateStoreBanner();
    assert.equal(f.window.currentCategory,'Все');assert.equal(f.window._activeBrand,null);
    assert.equal(f.get('searchInput').value,'');assert.equal(f.window.currentFilter,'new');
    assert.equal(f.get('allProductsLabel').scrolled,true);assert.deepEqual(f.calls,['filter']);
});
test('brand filter state and focus are accessible',()=>{
    const f=fixture(), button=f.get('toggle');f.window.toggleBrandFilters(button);
    assert.equal(f.get('brandFilterRow').hidden,false);assert.equal(button.attributes['aria-expanded'],'true');
    f.window.toggleBrandFilters(button);assert.equal(f.get('brandFilterRow').hidden,true);
    f.window.focusCatalogSearch();assert.equal(f.get('searchInput').focused,true);
});
test('all product categories have lightweight SVG fallback',()=>{
    const f=fixture();for(const kind of ['pod','disposable','liquid','consumable','apple','samsung','unknown']) {
        const art=f.window.storeProductArt(kind);assert.match(art,/<svg/);assert.match(art,/aria-hidden="true"/);
        assert.doesNotMatch(art,/<script|<image|https:/);
    }
});
