"""
Тесты xui_api.py — проверяют логику БЕЗ реального обращения к панели.

Метод _request замокан: вместо HTTP он возвращает заранее заданные ответы,
а мы проверяем, что модуль строит правильные запросы и корректно
разбирает результат (uuid, subId, срок, ссылку).

Запуск:  python3 -m unittest test_xui_api -v
"""

import time
import json
import unittest
from unittest.mock import AsyncMock, patch

import xui_api
from xui_api import XuiClient, XuiError, DAY_MS


def make_client():
    return XuiClient(
        base_url="https://panel.test/base",
        sub_base="https://panel.test:2096/sub",
        username="admin",
        password="secret",
        inbound_id=7,
    )


class TestLogin(unittest.IsolatedAsyncioTestCase):
    async def test_login_ok(self):
        c = make_client()
        with patch.object(c, "_request", new=AsyncMock(return_value={"success": True})) as req:
            ok = await c.login()
        self.assertTrue(ok)
        # логин ушёл POST /login с логином и паролем
        args, kwargs = req.call_args
        self.assertEqual(args[0], "POST")
        self.assertEqual(args[1], "/login")
        self.assertEqual(kwargs["data"]["username"], "admin")
        self.assertEqual(kwargs["data"]["password"], "secret")

    async def test_login_fail(self):
        c = make_client()
        with patch.object(c, "_request", new=AsyncMock(return_value={"success": False, "msg": "bad"})):
            with self.assertRaises(XuiError):
                await c.login()


class TestAddClient(unittest.IsolatedAsyncioTestCase):
    async def test_add_client_builds_correct_payload(self):
        c = make_client()
        req = AsyncMock(return_value={"success": True})
        with patch.object(c, "_request", new=req):
            before = int(time.time() * 1000)
            res = await c.add_client(email="tg123", days=30, ip_limit=1)
            after = int(time.time() * 1000)

        # правильный эндпоинт
        args, kwargs = req.call_args
        self.assertEqual(args[0], "POST")
        self.assertEqual(args[1], "/panel/api/inbounds/addClient")

        body = kwargs["data"]
        self.assertEqual(body["id"], 7)  # наш inbound_id
        settings = json.loads(body["settings"])
        client = settings["clients"][0]

        self.assertEqual(client["email"], "tg123")
        self.assertEqual(client["limitIp"], 1)
        self.assertEqual(client["flow"], "")
        self.assertTrue(client["enable"])
        # срок ≈ сейчас + 30 дней
        self.assertGreaterEqual(client["expiryTime"], before + 30 * DAY_MS)
        self.assertLessEqual(client["expiryTime"], after + 30 * DAY_MS)

        # ответ модуля
        self.assertEqual(res["email"], "tg123")
        self.assertTrue(res["sub_url"].startswith("https://panel.test:2096/sub/"))
        self.assertEqual(res["sub_url"].split("/")[-1], res["sub_id"])
        # uuid и subId выглядят валидно
        self.assertEqual(len(res["uuid"]), 36)
        self.assertTrue(len(res["sub_id"]) >= 8)

    async def test_add_client_panel_error(self):
        c = make_client()
        with patch.object(c, "_request", new=AsyncMock(return_value={"success": False, "msg": "dup"})):
            with self.assertRaises(XuiError):
                await c.add_client(email="tg123", days=30)


class TestExtendClient(unittest.IsolatedAsyncioTestCase):
    async def test_extend_from_future_expiry(self):
        """Если подписка ещё активна — новый срок считается от неё, дни не сгорают."""
        c = make_client()
        future = int(time.time() * 1000) + 10 * DAY_MS  # ещё 10 дней осталось

        async def fake_request(method, path, **kwargs):
            if path.startswith("/panel/api/inbounds/getClientTraffics/"):
                return {"success": True, "obj": {"expiryTime": future}}
            return {"success": True}

        with patch.object(c, "_request", new=AsyncMock(side_effect=fake_request)):
            res = await c.extend_client(
                client_uuid="u-1", email="tg123", sub_id="abc123", add_days=30
            )
        # 10 оставшихся + 30 новых ≈ 40 дней от сейчас
        expected = future + 30 * DAY_MS
        self.assertAlmostEqual(res["expiry_ms"], expected, delta=5000)

    async def test_extend_from_expired(self):
        """Если подписка истекла — считаем от 'сейчас'."""
        c = make_client()
        past = int(time.time() * 1000) - 5 * DAY_MS

        async def fake_request(method, path, **kwargs):
            if path.startswith("/panel/api/inbounds/getClientTraffics/"):
                return {"success": True, "obj": {"expiryTime": past}}
            return {"success": True}

        with patch.object(c, "_request", new=AsyncMock(side_effect=fake_request)):
            now = int(time.time() * 1000)
            res = await c.extend_client(
                client_uuid="u-1", email="tg123", sub_id="abc123", add_days=30
            )
        self.assertGreaterEqual(res["expiry_ms"], now + 30 * DAY_MS - 5000)


class TestResolveInbound(unittest.IsolatedAsyncioTestCase):
    async def test_resolve_by_remark(self):
        c = XuiClient(base_url="https://panel.test/base", sub_base="https://s/sub",
                      inbound_id=None, inbound_remark="MyVPN")
        listing = {"success": True, "obj": [
            {"id": 1, "remark": "Other"},
            {"id": 42, "remark": "MyVPN"},
        ]}
        with patch.object(c, "_request", new=AsyncMock(return_value=listing)):
            got = await c._resolve_inbound_id()
        self.assertEqual(got, 42)

    async def test_resolve_not_found(self):
        c = XuiClient(base_url="https://panel.test/base", sub_base="https://s/sub",
                      inbound_id=None, inbound_remark="MyVPN")
        listing = {"success": True, "obj": [{"id": 1, "remark": "Other"}]}
        with patch.object(c, "_request", new=AsyncMock(return_value=listing)):
            with self.assertRaises(XuiError):
                await c._resolve_inbound_id()


if __name__ == "__main__":
    unittest.main()
