"""
xui_db.py — выдача VPN через ПРЯМУЮ запись в базу панели 3x-ui.

Зачем: панель 3x-ui отдаёт 403 на автоматический вход по HTTP (защита).
Бот и панель на одном сервере, поэтому надёжнее писать клиента прямо в
SQLite-базу панели (/etc/x-ui/x-ui.db) и перезагружать Xray — вход не нужен.

Класс XuiClient повторяет интерфейс модуля xui_api (login/add_client/
extend_client/close), поэтому в bott.py достаточно поменять только импорт.

Параметры из окружения (.env на сервере):
    XUI_DB_PATH        — путь к базе (по умолчанию /etc/x-ui/x-ui.db)
    XUI_SUB_BASE       — базовый адрес подписок (https://IP:2096/sub)
    XUI_INBOUND_REMARK — имя инбаунда (по умолчанию MyVPN)
    XUI_RESTART_CMD    — команда перезагрузки панели/Xray
                         (по умолчанию "systemctl restart x-ui";
                          пустая строка — не перезагружать, для тестов)

Все обращения к SQLite/subprocess синхронные, поэтому выполняются в
отдельном потоке через asyncio.to_thread — event loop бота не блокируется.
"""

import os
import json
import time
import uuid
import shutil
import secrets
import sqlite3
import asyncio
import logging
import subprocess

logger = logging.getLogger(__name__)

DAY_MS = 86_400_000  # миллисекунд в сутках (3x-ui хранит срок в мс epoch)


class XuiError(Exception):
    """Ошибка выдачи VPN через базу панели."""


class XuiClient:
    def __init__(self, db_path=None, sub_base=None, inbound_remark=None, restart_cmd=None):
        self.db_path = db_path or os.getenv("XUI_DB_PATH", "/etc/x-ui/x-ui.db")
        self.sub_base = (sub_base or os.getenv("XUI_SUB_BASE", "")).rstrip("/")
        self.inbound_remark = inbound_remark or os.getenv("XUI_INBOUND_REMARK", "MyVPN")
        self.restart_cmd = (restart_cmd if restart_cmd is not None
                            else os.getenv("XUI_RESTART_CMD", "systemctl restart x-ui"))

    # ── публичный async-интерфейс (как у xui_api.XuiClient) ──────────────────
    async def login(self):
        # Вход не нужен — пишем прямо в базу. Оставлено для совместимости.
        return True

    async def add_client(self, email, days, ip_limit=1):
        return await asyncio.to_thread(self._add_client_sync, email, int(days), int(ip_limit))

    async def extend_client(self, client_uuid, email, sub_id, add_days, ip_limit=1):
        return await asyncio.to_thread(
            self._extend_client_sync, client_uuid, email, sub_id, int(add_days), int(ip_limit)
        )

    async def close(self):
        return None

    # ── внутреннее ───────────────────────────────────────────────────────────
    def _backup(self):
        """Копия базы перед записью (страховка)."""
        try:
            shutil.copy2(self.db_path, self.db_path + ".autobak")
        except Exception as e:
            logger.warning(f"xui_db: не удалось сделать бэкап базы: {e}")

    def _reload(self):
        """Перезагрузка панели/Xray, чтобы новый клиент стал активен."""
        if not self.restart_cmd:
            return
        try:
            subprocess.run(self.restart_cmd.split(), timeout=90,
                           capture_output=True, check=False)
        except Exception as e:
            logger.error(f"xui_db: перезагрузка Xray не удалась ({self.restart_cmd}): {e}")

    def _connect(self):
        return sqlite3.connect(self.db_path, timeout=30)

    def _find_inbound(self, cur):
        row = cur.execute(
            "SELECT id, settings FROM inbounds WHERE remark=?", (self.inbound_remark,)
        ).fetchone()
        if not row:
            raise XuiError(f"Инбаунд '{self.inbound_remark}' не найден в базе панели")
        return row[0], json.loads(row[1] or "{}")

    def _traffic_columns(self, cur):
        return {c[1] for c in cur.execute("PRAGMA table_info(client_traffics)").fetchall()}

    def _upsert_traffic(self, cur, inbound_id, email, expiry_ms):
        """Строка в client_traffics (для срока/статистики). Устойчиво к разным версиям схемы."""
        cols = self._traffic_columns(cur)
        exists = cur.execute(
            "SELECT id FROM client_traffics WHERE email=? AND inbound_id=?", (email, inbound_id)
        ).fetchone()
        if exists:
            sets, vals = [], []
            for k, v in (("expiry_time", expiry_ms), ("enable", 1)):
                if k in cols:
                    sets.append(f"{k}=?"); vals.append(v)
            if sets:
                vals.append(exists[0])
                cur.execute(f"UPDATE client_traffics SET {','.join(sets)} WHERE id=?", tuple(vals))
        else:
            want = {"inbound_id": inbound_id, "enable": 1, "email": email,
                    "up": 0, "down": 0, "expiry_time": expiry_ms, "total": 0, "reset": 0}
            use = {k: v for k, v in want.items() if k in cols}
            names = ",".join(use.keys())
            ph = ",".join("?" * len(use))
            cur.execute(f"INSERT INTO client_traffics ({names}) VALUES ({ph})", tuple(use.values()))

    def _add_client_sync(self, email, days, ip_limit):
        client_uuid = str(uuid.uuid4())
        sub_id = secrets.token_hex(8)
        expiry_ms = int(time.time() * 1000) + days * DAY_MS

        self._backup()
        con = self._connect()
        try:
            cur = con.cursor()
            inbound_id, settings = self._find_inbound(cur)
            clients = settings.get("clients", [])
            clients.append({
                "id": client_uuid, "flow": "", "email": email,
                "limitIp": ip_limit, "totalGB": 0, "expiryTime": expiry_ms,
                "enable": True, "tgId": "", "subId": sub_id, "reset": 0,
            })
            settings["clients"] = clients
            cur.execute("UPDATE inbounds SET settings=? WHERE id=?",
                        (json.dumps(settings), inbound_id))
            self._upsert_traffic(cur, inbound_id, email, expiry_ms)
            con.commit()
        finally:
            con.close()

        self._reload()
        return {"sub_url": f"{self.sub_base}/{sub_id}", "uuid": client_uuid,
                "sub_id": sub_id, "email": email, "expiry_ms": expiry_ms}

    def _extend_client_sync(self, client_uuid, email, sub_id, add_days, ip_limit):
        self._backup()
        con = self._connect()
        try:
            cur = con.cursor()
            inbound_id, settings = self._find_inbound(cur)
            clients = settings.get("clients", [])
            target = next((c for c in clients
                           if c.get("email") == email or c.get("id") == client_uuid), None)
            if target is None:
                # клиента нет в настройках — воссоздаём с тем же subId
                target = {"id": client_uuid, "flow": "", "email": email,
                          "limitIp": ip_limit, "totalGB": 0, "expiryTime": 0,
                          "enable": True, "tgId": "", "subId": sub_id, "reset": 0}
                clients.append(target)
                settings["clients"] = clients

            base = max(int(time.time() * 1000), int(target.get("expiryTime") or 0))
            new_expiry = base + add_days * DAY_MS
            target["expiryTime"] = new_expiry
            target["enable"] = True
            cur.execute("UPDATE inbounds SET settings=? WHERE id=?",
                        (json.dumps(settings), inbound_id))
            self._upsert_traffic(cur, inbound_id, email, new_expiry)
            con.commit()
        finally:
            con.close()

        self._reload()
        return {"sub_url": f"{self.sub_base}/{sub_id}", "expiry_ms": new_expiry}
