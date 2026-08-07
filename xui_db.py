"""
xui_db.py — выдача VPN через ПРЯМУЮ запись в базу панели 3x-ui.

Зачем: панель 3x-ui отдаёт 403 на автоматический вход по HTTP (защита),
а подписочный сервис (/sub/) выключен. Бот и панель на одном сервере,
поэтому пишем клиента прямо в SQLite-базу панели и отдаём готовую
vless://…-ссылку (Reality), собранную из настроек инбаунда.

3x-ui 3.4.x хранит клиента в НЕСКОЛЬКИХ местах одновременно, и все нужно
держать в синхроне (иначе клиент invisible в UI и/или не работает в Xray):
  - inbounds.settings.clients (JSON)  — из этого Xray строит живой конфиг
  - client_traffics                   — лимиты и статистика трафика
  - clients + client_inbounds         — новая нормализованная схема панели
                                         (список «Клиенты» в UI читается
                                          отсюда; связь клиент↔инбаунд)

Класс XuiClient повторяет интерфейс модуля xui_api (login/add_client/
extend_client/close), поэтому в bott.py достаточно поменять только импорт.

Параметры из окружения (.env на сервере):
    XUI_DB_PATH        — путь к базе (по умолчанию /etc/x-ui/x-ui.db)
    XUI_SERVER_HOST    — адрес сервера для ссылки (по умолчанию 62.133.61.23)
    XUI_SUB_BASE       — базовый адрес подписок (не используется для vless,
                         оставлен для совместимости)
    XUI_INBOUND_REMARK — имя инбаунда (по умолчанию MyVPN)
    XUI_RESTART_CMD    — команда перезагрузки Xray
                         (по умолчанию "systemctl restart x-ui";
                          пустая строка — не перезагружать, для тестов)
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
from urllib.parse import urlencode, quote

logger = logging.getLogger(__name__)

DAY_MS = 86_400_000  # миллисекунд в сутках (3x-ui хранит срок в мс epoch)
# flow этого инбаунда — ПУСТОЙ (как у рабочих клиентов "me"/"mac").
# xtls-rprx-vision на нём не подключался, поэтому оставляем "".
FLOW = ""


class XuiError(Exception):
    """Ошибка выдачи VPN через базу панели."""


class XuiClient:
    def __init__(self, db_path=None, server_host=None, inbound_remark=None,
                 restart_cmd=None, sub_base=None):
        self.db_path = db_path or os.getenv("XUI_DB_PATH", "/etc/x-ui/x-ui.db")
        # Адрес сервера НЕ имеет значения по умолчанию: при переезде на другой VPS
        # забытая переменная выдавала бы клиентам рабочие с виду ссылки на старый
        # (уже мёртвый) сервер — молча, без единой ошибки в логах.
        self.server_host = (server_host or os.getenv("XUI_SERVER_HOST", "")).strip()
        self.sub_base = (sub_base or os.getenv("XUI_SUB_BASE", "")).strip().rstrip("/")
        self.inbound_remark = inbound_remark or os.getenv("XUI_INBOUND_REMARK", "MyVPN")
        _missing = [n for n, v in (("XUI_SERVER_HOST", self.server_host),
                                   ("XUI_SUB_BASE", self.sub_base)) if not v]
        if _missing:
            raise XuiError("Не заданы переменные окружения: " + ", ".join(_missing))
        self.restart_cmd = (restart_cmd if restart_cmd is not None
                            else os.getenv("XUI_RESTART_CMD", "systemctl restart x-ui"))

    # ── публичный async-интерфейс (как у xui_api.XuiClient) ──────────────────
    async def login(self):
        return True  # вход не нужен — пишем прямо в базу

    async def add_client(self, email, days, ip_limit=1):
        return await asyncio.to_thread(self._upsert_client_sync, email, int(days), int(ip_limit), None, None)

    async def extend_client(self, client_uuid, email, sub_id, add_days, ip_limit=1):
        return await asyncio.to_thread(
            self._upsert_client_sync, email, int(add_days), int(ip_limit), client_uuid, sub_id
        )

    async def close(self):
        return None

    # ── внутреннее ─────────────────────────────────────────────────────────
    def _backup(self):
        try:
            shutil.copy2(self.db_path, self.db_path + ".autobak")
        except Exception as e:
            logger.warning(f"xui_db: не удалось сделать бэкап базы: {e}")

    def _reload(self):
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
            "SELECT id, settings, stream_settings, port FROM inbounds WHERE remark=?",
            (self.inbound_remark,)
        ).fetchone()
        if not row:
            # Показываем, какие инбаунды в панели есть на самом деле — иначе при
            # переезде на новый сервер приходится лезть в базу руками, чтобы
            # узнать имя и вписать его в XUI_INBOUND_REMARK.
            found = cur.execute("SELECT remark FROM inbounds ORDER BY id").fetchall()
            names = ", ".join(f"'{r[0]}'" for r in found if r[0]) or "их вообще нет"
            raise XuiError(
                f"Инбаунд '{self.inbound_remark}' не найден в панели. "
                f"Доступные: {names}. "
                f"Впиши нужное имя в XUI_INBOUND_REMARK (/etc/vapebazar-bot.env) "
                f"и перезапусти бота."
            )
        return row[0], json.loads(row[1] or "{}"), (row[2] or "{}"), row[3]

    def _build_vless(self, port, stream_settings_json, client_uuid, label):
        ss = json.loads(stream_settings_json or "{}")
        reality = ss.get("realitySettings", {}) or {}
        rset = reality.get("settings", {}) or {}
        server_names = reality.get("serverNames", []) or [""]
        short_ids = reality.get("shortIds", []) or [""]
        params = {
            "type": ss.get("network", "tcp"),
            "security": ss.get("security", "reality"),
            "pbk": rset.get("publicKey", ""),
            "fp": rset.get("fingerprint", "chrome"),
            "sni": server_names[0],
            "sid": short_ids[0],
            "spx": rset.get("spiderX", "/"),
        }
        if FLOW:
            params["flow"] = FLOW
        query = urlencode(params)
        return f"vless://{client_uuid}@{self.server_host}:{port}?{query}#{quote(label)}"

    # ── таблица client_traffics (лимиты/статистика) ─────────────────────────
    def _traffic_columns(self, cur):
        return {c[1] for c in cur.execute("PRAGMA table_info(client_traffics)").fetchall()}

    def _upsert_traffic(self, cur, inbound_id, email, expiry_ms):
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

    # ── inbounds.settings.clients (то, что реально консьюмит Xray) ──────────
    def _upsert_settings_client(self, cur, inbound_id, settings, email, client_uuid,
                                 sub_id, expiry_ms, ip_limit, now_ms):
        clients = settings.get("clients", [])
        target = next((c for c in clients if c.get("email") == email), None)
        if target is None:
            target = {}
            clients.append(target)
            settings["clients"] = clients
        target.update({
            "id": client_uuid, "email": email, "subId": sub_id,
            "comment": target.get("comment", ""), "created_at": target.get("created_at", now_ms),
            "enable": True, "expiryTime": expiry_ms, "flow": FLOW,
            "limitIp": ip_limit, "reset": 0, "tgId": 0, "totalGB": 0, "updated_at": now_ms,
        })
        cur.execute("UPDATE inbounds SET settings=? WHERE id=?", (json.dumps(settings), inbound_id))

    # ── новая нормализованная схема панели (clients + client_inbounds) ──────
    def _upsert_clients_table(self, cur, email, client_uuid, sub_id, expiry_ms, ip_limit, now_ms):
        existing = cur.execute("SELECT id FROM clients WHERE email=?", (email,)).fetchone()
        if existing:
            client_id = existing[0]
            cur.execute(
                "UPDATE clients SET uuid=?, sub_id=?, expiry_time=?, limit_ip=?, enable=1, updated_at=? "
                "WHERE id=?",
                (client_uuid, sub_id, expiry_ms, ip_limit, now_ms, client_id),
            )
        else:
            password = secrets.token_hex(8)
            auth = secrets.token_hex(8)
            cur.execute(
                "INSERT INTO clients (email, sub_id, uuid, password, auth, flow, security, reverse, "
                "limit_ip, total_gb, expiry_time, enable, tg_id, group_name, comment, reset, "
                "created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,0,?,?,0,?,?)",
                (email, sub_id, client_uuid, password, auth, FLOW, "auto", "",
                 ip_limit, 0, expiry_ms, "", "", now_ms, now_ms),
            )
            client_id = cur.lastrowid
        return client_id

    def _ensure_client_inbound_link(self, cur, client_id, inbound_id, now_ms):
        cur.execute(
            "INSERT OR IGNORE INTO client_inbounds (client_id, inbound_id, flow_override, created_at) "
            "VALUES (?,?,?,?)",
            (client_id, inbound_id, "", now_ms),
        )

    # ── основная операция: создать или продлить (в одном месте) ─────────────
    def _upsert_client_sync(self, email, days, ip_limit, existing_uuid, existing_sub_id):
        now_ms = int(time.time() * 1000)
        self._backup()
        con = self._connect()
        try:
            cur = con.cursor()
            inbound_id, settings, stream_settings, port = self._find_inbound(cur)

            row = cur.execute(
                "SELECT uuid, sub_id, expiry_time FROM clients WHERE email=?", (email,)
            ).fetchone()
            if row:
                client_uuid, sub_id, current_expiry = row[0], row[1], row[2] or 0
            else:
                client_uuid = existing_uuid or str(uuid.uuid4())
                sub_id = existing_sub_id or secrets.token_hex(8)
                current_expiry = 0

            base = max(now_ms, int(current_expiry or 0))
            new_expiry = base + days * DAY_MS

            client_id = self._upsert_clients_table(
                cur, email, client_uuid, sub_id, new_expiry, ip_limit, now_ms
            )
            self._ensure_client_inbound_link(cur, client_id, inbound_id, now_ms)
            self._upsert_settings_client(
                cur, inbound_id, settings, email, client_uuid, sub_id, new_expiry, ip_limit, now_ms
            )
            self._upsert_traffic(cur, inbound_id, email, new_expiry)

            con.commit()
        finally:
            con.close()

        self._reload()
        access_url = self._build_vless(port, stream_settings, client_uuid, "VAPEBAZAR VPN")
        return {"sub_url": f"{self.sub_base}/{sub_id}", "access_url": access_url,
                "uuid": client_uuid, "sub_id": sub_id, "email": email, "expiry_ms": new_expiry}
