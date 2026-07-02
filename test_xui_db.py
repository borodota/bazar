"""
Тесты xui_db.py на ВРЕМЕННОЙ базе (боевую панель не трогаем).

Создаём временную SQLite-базу со схемой как у 3x-ui, кладём инбаунд MyVPN,
и проверяем, что add_client/extend_client правильно пишут клиента и срок.
Перезагрузка Xray отключена (restart_cmd="").

Запуск:  python3 -m unittest test_xui_db -v
"""

import os
import json
import time
import sqlite3
import tempfile
import unittest

from xui_db import XuiClient, XuiError, DAY_MS


def make_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE inbounds (id INTEGER PRIMARY KEY, remark TEXT, settings TEXT)")
    con.execute(
        "CREATE TABLE client_traffics ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, inbound_id INTEGER, enable INTEGER, "
        "email TEXT, up INTEGER, down INTEGER, expiry_time INTEGER, total INTEGER, reset INTEGER)"
    )
    con.execute("INSERT INTO inbounds (id, remark, settings) VALUES (?,?,?)",
                (1, "MyVPN", json.dumps({"clients": [], "decryption": "none", "fallbacks": []})))
    con.commit()
    con.close()
    return path


def client_for(path):
    return XuiClient(db_path=path, sub_base="https://62.133.61.23:2096/sub",
                     inbound_remark="MyVPN", restart_cmd="")  # restart отключён


class TestAddClient(unittest.IsolatedAsyncioTestCase):
    async def test_add_writes_client_and_traffic(self):
        path = make_db()
        try:
            c = client_for(path)
            before = int(time.time() * 1000)
            res = await c.add_client(email="tg777", days=30, ip_limit=1)
            after = int(time.time() * 1000)

            con = sqlite3.connect(path)
            settings = json.loads(con.execute("SELECT settings FROM inbounds WHERE id=1").fetchone()[0])
            clients = settings["clients"]
            self.assertEqual(len(clients), 1)
            cl = clients[0]
            self.assertEqual(cl["email"], "tg777")
            self.assertEqual(cl["limitIp"], 1)
            self.assertEqual(cl["subId"], res["sub_id"])
            self.assertEqual(cl["id"], res["uuid"])
            self.assertTrue(cl["enable"])
            self.assertGreaterEqual(cl["expiryTime"], before + 30 * DAY_MS)
            self.assertLessEqual(cl["expiryTime"], after + 30 * DAY_MS)

            traf = con.execute("SELECT inbound_id, email, expiry_time, enable FROM client_traffics").fetchall()
            con.close()
            self.assertEqual(len(traf), 1)
            self.assertEqual(traf[0][1], "tg777")
            self.assertEqual(traf[0][3], 1)

            self.assertEqual(res["sub_url"], f"https://62.133.61.23:2096/sub/{res['sub_id']}")
        finally:
            os.remove(path)

    async def test_missing_inbound_raises(self):
        path = make_db()
        try:
            c = XuiClient(db_path=path, sub_base="https://s/sub",
                          inbound_remark="НетТакого", restart_cmd="")
            with self.assertRaises(XuiError):
                await c.add_client(email="tg1", days=7)
        finally:
            os.remove(path)


class TestExtendClient(unittest.IsolatedAsyncioTestCase):
    async def test_extend_keeps_remaining_days(self):
        path = make_db()
        try:
            c = client_for(path)
            add = await c.add_client(email="tg777", days=10, ip_limit=1)
            # продлеваем на 30, пока активно 10 → должно стать ~40 от сейчас
            ext = await c.extend_client(add["uuid"], "tg777", add["sub_id"], add_days=30)
            expected = add["expiry_ms"] + 30 * DAY_MS
            self.assertAlmostEqual(ext["expiry_ms"], expected, delta=5000)

            con = sqlite3.connect(path)
            settings = json.loads(con.execute("SELECT settings FROM inbounds WHERE id=1").fetchone()[0])
            self.assertEqual(len(settings["clients"]), 1)  # не задвоился
            traf_exp = con.execute("SELECT expiry_time FROM client_traffics WHERE email='tg777'").fetchone()[0]
            con.close()
            self.assertAlmostEqual(traf_exp, expected, delta=5000)
        finally:
            os.remove(path)

    async def test_extend_recreates_if_missing(self):
        path = make_db()
        try:
            c = client_for(path)
            ext = await c.extend_client("uuid-x", "tg_new", "subxyz", add_days=7)
            con = sqlite3.connect(path)
            settings = json.loads(con.execute("SELECT settings FROM inbounds WHERE id=1").fetchone()[0])
            con.close()
            emails = [cl["email"] for cl in settings["clients"]]
            self.assertIn("tg_new", emails)
            self.assertGreater(ext["expiry_ms"], int(time.time() * 1000))
        finally:
            os.remove(path)


if __name__ == "__main__":
    unittest.main()
