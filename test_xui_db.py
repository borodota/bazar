"""
Тесты xui_db.py на ВРЕМЕННОЙ базе (боевую панель не трогаем).

Схема временной базы повторяет 3x-ui 3.4.x: клиент должен появиться
одновременно в inbounds.settings (то, что реально конфигурирует Xray),
client_traffics (лимиты/статистика) И в новых clients + client_inbounds
(это то, что показывает список «Клиенты» в панели — раньше бот писал
только в первые два места, из-за чего клиент был невидим в UI).

Запуск:  python3 -m unittest test_xui_db -v
"""

import os
import json
import time
import sqlite3
import tempfile
import unittest

from xui_db import XuiClient, XuiError, DAY_MS


STREAM = json.dumps({
    "network": "tcp", "security": "reality",
    "realitySettings": {
        "serverNames": ["www.nvidia.com"],
        "shortIds": ["23d96f34a9f6", "39"],
        "settings": {"publicKey": "N7ysNCfHWngtnxV56ti-XYplQYSQznPGMU1r5GryZjg",
                     "fingerprint": "chrome", "spiderX": "/"},
    },
})


def make_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE inbounds (id INTEGER PRIMARY KEY, remark TEXT, settings TEXT, "
                "stream_settings TEXT, port INTEGER)")
    con.execute(
        "CREATE TABLE client_traffics ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, inbound_id INTEGER, enable INTEGER, "
        "email TEXT, up INTEGER, down INTEGER, expiry_time INTEGER, total INTEGER, reset INTEGER)"
    )
    con.execute(
        "CREATE TABLE clients (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, "
        "sub_id TEXT, uuid TEXT, password TEXT, auth TEXT, flow TEXT, security TEXT, "
        "reverse TEXT, limit_ip INTEGER, total_gb INTEGER, expiry_time INTEGER, "
        "enable NUMERIC DEFAULT 1, tg_id INTEGER, group_name TEXT DEFAULT '', comment TEXT, "
        "reset INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER)"
    )
    con.execute(
        "CREATE TABLE client_inbounds (client_id INTEGER, inbound_id INTEGER, "
        "flow_override TEXT, created_at INTEGER, PRIMARY KEY (client_id, inbound_id))"
    )
    con.execute("INSERT INTO inbounds (id, remark, settings, stream_settings, port) VALUES (?,?,?,?,?)",
                (1, "MyVPN", json.dumps({"clients": [], "decryption": "none", "fallbacks": []}),
                 STREAM, 443))
    con.commit()
    con.close()
    return path


def client_for(path):
    return XuiClient(db_path=path, server_host="62.133.61.23",
                     sub_base="https://62.133.61.23:2096/sub",
                     inbound_remark="MyVPN", restart_cmd="")  # restart отключён


class TestAddClient(unittest.IsolatedAsyncioTestCase):
    async def test_add_writes_settings_and_traffic(self):
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
            self.assertEqual(len(traf), 1)
            self.assertEqual(traf[0][1], "tg777")
            self.assertEqual(traf[0][3], 1)
            con.close()

            self.assertEqual(res["sub_url"], f"https://62.133.61.23:2096/sub/{res['sub_id']}")

            url = res["access_url"]
            self.assertTrue(url.startswith(f"vless://{res['uuid']}@62.133.61.23:443?"))
            self.assertIn("security=reality", url)
            self.assertIn("pbk=N7ysNCfHWngtnxV56ti-XYplQYSQznPGMU1r5GryZjg", url)
            self.assertIn("sni=www.nvidia.com", url)
            self.assertNotIn("flow=", url)  # flow пустой у этого инбаунда → в ссылке его нет
            self.assertIn("sid=23d96f34a9f6", url)
        finally:
            os.remove(path)

    async def test_add_writes_clients_table_and_link(self):
        """Раньше клиент был невидим в UI панели — эти таблицы и были причиной."""
        path = make_db()
        try:
            c = client_for(path)
            res = await c.add_client(email="tg777", days=30, ip_limit=1)

            con = sqlite3.connect(path)
            row = con.execute(
                "SELECT email, uuid, sub_id, limit_ip, enable FROM clients WHERE email='tg777'"
            ).fetchone()
            self.assertIsNotNone(row, "клиент должен появиться в таблице clients (иначе невидим в UI)")
            self.assertEqual(row[0], "tg777")
            self.assertEqual(row[1], res["uuid"])
            self.assertEqual(row[2], res["sub_id"])
            self.assertEqual(row[3], 1)
            self.assertEqual(row[4], 1)

            client_id = con.execute("SELECT id FROM clients WHERE email='tg777'").fetchone()[0]
            link = con.execute(
                "SELECT inbound_id FROM client_inbounds WHERE client_id=?", (client_id,)
            ).fetchone()
            con.close()
            self.assertIsNotNone(link, "должна быть связка client_inbounds, иначе клиент не привязан к инбаунду")
            self.assertEqual(link[0], 1)
        finally:
            os.remove(path)

    async def test_add_client_panel_error(self):
        path = make_db()
        try:
            c = XuiClient(db_path=path, server_host="62.133.61.23",
                          sub_base="https://62.133.61.23:2096/sub",
                          inbound_remark="НетТакого", restart_cmd="")
            with self.assertRaises(XuiError):
                await c.add_client(email="tg1", days=7)
        finally:
            os.remove(path)


class TestExtendClient(unittest.IsolatedAsyncioTestCase):
    async def test_extend_keeps_remaining_days_no_duplicates(self):
        path = make_db()
        try:
            c = client_for(path)
            add = await c.add_client(email="tg777", days=10, ip_limit=1)
            ext = await c.extend_client(add["uuid"], "tg777", add["sub_id"], add_days=30)
            expected = add["expiry_ms"] + 30 * DAY_MS
            self.assertAlmostEqual(ext["expiry_ms"], expected, delta=5000)

            con = sqlite3.connect(path)
            settings = json.loads(con.execute("SELECT settings FROM inbounds WHERE id=1").fetchone()[0])
            self.assertEqual(len(settings["clients"]), 1)  # не задвоился в settings

            clients_rows = con.execute("SELECT COUNT(*) FROM clients WHERE email='tg777'").fetchone()[0]
            self.assertEqual(clients_rows, 1, "не должно быть дубликатов в таблице clients")

            links = con.execute("SELECT COUNT(*) FROM client_inbounds").fetchone()[0]
            self.assertEqual(links, 1, "связка client_inbounds не должна задваиваться")

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
            row = con.execute("SELECT email FROM clients WHERE email='tg_new'").fetchone()
            con.close()
            emails = [cl["email"] for cl in settings["clients"]]
            self.assertIn("tg_new", emails)
            self.assertIsNotNone(row)
            self.assertGreater(ext["expiry_ms"], int(time.time() * 1000))
        finally:
            os.remove(path)


if __name__ == "__main__":
    unittest.main()
