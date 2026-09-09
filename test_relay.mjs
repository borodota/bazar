import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import handler from './api/relay.js';

process.env.BOT_TOKEN = '12345:test-token-for-offline-tests';
const uid = 123456789;
const admin = 6163521938;
function initData(overrides = {}) {
    const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: uid, first_name: 'Test' }), ...overrides };
    const params = new URLSearchParams(Object.entries(fields).filter(([,v]) => v !== null));
    const check = [...params.entries()].map(([k,v]) => `${k}=${v}`).sort().join('\n');
    const key = createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
    params.set('hash', createHmac('sha256', key).update(check).digest('hex'));
    return params.toString();
}
function request(body, origin = 'https://borodota.github.io') {
    return new Request('https://bazar-amber.vercel.app/api/relay', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
}
const valid = (extra = {}) => ({ initData: initData(), chatId: admin, text: 'Тестовый заказ', ...extra });

test('valid Telegram identity can notify an administrator', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async (_, options) => {
        assert.equal(JSON.parse(options.body).chat_id, admin);
        return Response.json({ ok: true, result: { message_id: 1 } });
    });
    const response = await handler(request(valid()));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://borodota.github.io');
});

test('missing, expired, future and malformed identities never call Telegram', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
    for (const data of ['', initData({ auth_date: null }), initData({ auth_date: '0' }), initData({ auth_date: 'NaN' }), initData({ auth_date: String(Math.floor(Date.now()/1000)-86401) }), initData({ auth_date: String(Math.floor(Date.now()/1000)+3600) }), initData({ user: 'null' }), initData({ user: '{"id":0}' }), initData({ user: '{"id":"123456789"}' })]) {
        assert.equal((await handler(request(valid({ initData: data })))).status, 403);
    }
    assert.equal(fetch.mock.callCount(), 0);
});

test('tampered signature and duplicate fields are rejected', async () => {
    for (const data of [initData().replace('Test', 'Forged'), initData() + '&auth_date=1']) {
        assert.equal((await handler(request(valid({ initData: data })))).status, 403);
    }
});

test('unrelated recipients and origins are rejected', async () => {
    assert.equal((await handler(request(valid({ chatId: 555 })))).status, 403);
    const response = await handler(request(valid(), 'https://untrusted.test'));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('invalid JSON shape, oversize body and unknown actions are rejected', async () => {
    assert.equal((await handler(request(null))).status, 400);
    assert.equal((await handler(request([]))).status, 400);
    assert.equal((await handler(request(valid({ action: 'deleteMessage' })))).status, 400);
    assert.equal((await handler(request(valid({ text: 'a'.repeat(33000) })))).status, 413);
    assert.equal((await handler(request(valid({ text: 'a'.repeat(4097) })))).status, 400);
});

test('order buttons cannot claim another customer or exceed Telegram limits', async () => {
    for (const callback_data of ['st_accept_ab12_999_500_25_0_0', 'cmd_bonus', 'st_accept_' + 'a'.repeat(70)]) {
        const response = await handler(request(valid({ reply_markup: { inline_keyboard: [[{ text: 'Принять', callback_data }]] } })));
        assert.equal(response.status, 400);
    }
});

test('valid status buttons and customer link are forwarded', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }));
    const response = await handler(request(valid({ reply_markup: { inline_keyboard: [[{ text: 'Принять', callback_data: `st_accept_ab12_${uid}_500_25_0_0` }], [{ text: 'Клиент', url: `tg://user?id=${uid}` }]] } })));
    assert.equal((await response.json()).ok, true);
});

test('network failure does not reveal the bot token', async t => {
    t.mock.method(globalThis, 'fetch', async url => { throw new Error(url); });
    const response = await handler(request(valid()));
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes(process.env.BOT_TOKEN), false);
});

test('avatar download failure is a handled response', async t => {
    t.mock.method(globalThis, 'fetch', async url => {
        if (url.endsWith('getUserProfilePhotos')) return Response.json({ ok: true, result: { total_count: 1, photos: [[{ file_id: 'photo' }]] } });
        if (url.endsWith('getFile')) return Response.json({ ok: true, result: { file_path: 'avatar.jpg' } });
        return new Response(null, { status: 404 });
    });
    assert.equal((await handler(request(valid({ action: 'getAvatar' })))).status, 502);
});

test('avatars are not publicly cached', async t => {
    t.mock.method(globalThis, 'fetch', async url => {
        if (url.endsWith('getUserProfilePhotos')) return Response.json({ ok: true, result: { total_count: 1, photos: [[{ file_id: 'photo' }]] } });
        if (url.endsWith('getFile')) return Response.json({ ok: true, result: { file_path: 'avatar.jpg' } });
        return new Response(new Uint8Array([1,2,3]), { headers: { 'Content-Type': 'image/jpeg' } });
    });
    const response = await handler(request(valid({ action: 'getAvatar' })));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
