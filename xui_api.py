"""
xui_api.py — изолированный модуль для панели 3x-ui (VLESS + Reality).

Отвечает только за общение с панелью: логин, создание клиента, продление.
Никаких секретов в коде — всё берётся из переменных окружения (.env на сервере):

    XUI_BASE_URL   — адрес панели с базовым путём,
                     напр. https://62.133.61.23:2053/KUzeX4i5ljeMdedcxc
    XUI_SUB_BASE   — базовый адрес подписок,
                     напр. https://62.133.61.23:2096/sub
    XUI_USERNAME   — логин панели (обычно admin)
    XUI_PASSWORD   — пароль панели
    XUI_INBOUND_ID — (необязательно) id инбаунда; если пусто — найдём по имени
    XUI_INBOUND_REMARK — имя инбаунда для автопоиска (по умолчанию "MyVPN")

aiohttp импортируется лениво внутри методов — чтобы модуль можно было
покрыть юнит-тестами без установленного aiohttp (мокая _request).
"""

import os
import json
import time
import uuid
import secrets

DAY_MS = 86_400_000  # миллисекунд в сутках (3x-ui хранит срок в мс epoch)


class XuiError(Exception):
    """Любая ошибка общения с панелью 3x-ui."""


class XuiClient:
    def __init__(
        self,
        base_url=None,
        sub_base=None,
        username=None,
        password=None,
        inbound_id=None,
        inbound_remark=None,
    ):
        self.base_url = (base_url or os.getenv("XUI_BASE_URL", "")).rstrip("/")
        self.sub_base = (sub_base or os.getenv("XUI_SUB_BASE", "")).rstrip("/")
        self.username = username or os.getenv("XUI_USERNAME", "admin")
        self.password = password or os.getenv("XUI_PASSWORD", "")
        _env_inbound = os.getenv("XUI_INBOUND_ID", "").strip()
        self.inbound_id = inbound_id if inbound_id is not None else (int(_env_inbound) if _env_inbound else None)
        self.inbound_remark = inbound_remark or os.getenv("XUI_INBOUND_REMARK", "MyVPN")
        self._session = None  # aiohttp.ClientSession, создаётся при первом запросе

    # ── низкоуровневый HTTP (единственное место, где живёт aiohttp) ──────────
    async def _ensure_session(self):
        if self._session is None or self._session.closed:
            import aiohttp  # ленивый импорт
            # ssl=False — панель на IP с самоподписанным сертификатом
            connector = aiohttp.TCPConnector(ssl=False)
            # Браузерный User-Agent — некоторые панели/WAF отдают 403 на «не-браузерные» запросы
            headers = {
                "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                               "AppleWebKit/537.36 (KHTML, like Gecko) "
                               "Chrome/120.0.0.0 Safari/537.36"),
                "Accept": "application/json, text/plain, */*",
            }
            self._session = aiohttp.ClientSession(connector=connector, headers=headers)
        return self._session

    async def _request(self, method, path, **kwargs):
        """
        Делает запрос к панели и возвращает распарсенный JSON (dict).
        Бросает XuiError, если панель ответила не-успехом.
        Всё общение с aiohttp сосредоточено здесь — тесты мокают этот метод.
        """
        session = await self._ensure_session()
        url = self.base_url + path
        async with session.request(method, url, timeout=_timeout(20), **kwargs) as resp:
            text = await resp.text()
            if resp.status != 200:
                raise XuiError(f"HTTP {resp.status} на {path}: {text[:200]}")
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                raise XuiError(f"Панель вернула не-JSON на {path}: {text[:200]}")

    # ── операции ─────────────────────────────────────────────────────────────
    async def login(self):
        """Логинится в панель. Cookie сессии сохраняется в self._session."""
        data = await self._request(
            "POST", "/login",
            data={"username": self.username, "password": self.password},
        )
        if not data.get("success"):
            raise XuiError(f"Не удалось войти в панель: {data.get('msg', 'нет деталей')}")
        return True

    async def _resolve_inbound_id(self):
        """Возвращает id инбаунда. Если не задан явно — ищет по имени (remark)."""
        if self.inbound_id is not None:
            return self.inbound_id
        data = await self._request("GET", "/panel/api/inbounds/list")
        if not data.get("success"):
            raise XuiError("Не удалось получить список инбаундов")
        for inb in data.get("obj", []):
            if inb.get("remark") == self.inbound_remark:
                self.inbound_id = inb.get("id")
                return self.inbound_id
        raise XuiError(f"Инбаунд с именем '{self.inbound_remark}' не найден в панели")

    async def add_client(self, email, days, ip_limit=1):
        """
        Создаёт нового клиента в инбаунде на `days` суток.
        Возвращает dict: {sub_url, uuid, sub_id, email, expiry_ms}.
        """
        inbound_id = await self._resolve_inbound_id()
        client_uuid = str(uuid.uuid4())
        sub_id = secrets.token_hex(8)
        expiry_ms = int(time.time() * 1000) + int(days) * DAY_MS

        client = {
            "id": client_uuid,
            "flow": "",
            "email": email,
            "limitIp": int(ip_limit),
            "totalGB": 0,
            "expiryTime": expiry_ms,
            "enable": True,
            "tgId": "",
            "subId": sub_id,
            "reset": 0,
        }
        body = {"id": inbound_id, "settings": json.dumps({"clients": [client]})}
        data = await self._request("POST", "/panel/api/inbounds/addClient", data=body)
        if not data.get("success"):
            raise XuiError(f"Не удалось создать клиента: {data.get('msg', 'нет деталей')}")

        return {
            "sub_url": f"{self.sub_base}/{sub_id}",
            "uuid": client_uuid,
            "sub_id": sub_id,
            "email": email,
            "expiry_ms": expiry_ms,
        }

    async def extend_client(self, client_uuid, email, sub_id, add_days, ip_limit=1):
        """
        Продлевает существующего клиента на `add_days` суток.
        Новый срок считается от МАКСИМУМА (текущий срок, сейчас) — чтобы
        не «сгорали» оставшиеся дни при досрочном продлении.
        Возвращает dict: {sub_url, expiry_ms}.
        """
        inbound_id = await self._resolve_inbound_id()

        # текущий срок клиента (мс). Если не нашли — считаем от «сейчас».
        current_expiry = 0
        try:
            traf = await self._request("GET", f"/panel/api/inbounds/getClientTraffics/{email}")
            if traf.get("success") and traf.get("obj"):
                current_expiry = int(traf["obj"].get("expiryTime") or 0)
        except XuiError:
            current_expiry = 0

        base = max(int(time.time() * 1000), current_expiry)
        new_expiry = base + int(add_days) * DAY_MS

        client = {
            "id": client_uuid,
            "flow": "",
            "email": email,
            "limitIp": int(ip_limit),
            "totalGB": 0,
            "expiryTime": new_expiry,
            "enable": True,
            "tgId": "",
            "subId": sub_id,
            "reset": 0,
        }
        body = {"id": inbound_id, "settings": json.dumps({"clients": [client]})}
        data = await self._request(
            "POST", f"/panel/api/inbounds/updateClient/{client_uuid}", data=body
        )
        if not data.get("success"):
            raise XuiError(f"Не удалось продлить клиента: {data.get('msg', 'нет деталей')}")

        return {"sub_url": f"{self.sub_base}/{sub_id}", "expiry_ms": new_expiry}

    async def close(self):
        if self._session is not None and not self._session.closed:
            await self._session.close()


def _timeout(seconds):
    """aiohttp.ClientTimeout, импорт ленивый (чтобы модуль грузился без aiohttp)."""
    import aiohttp
    return aiohttp.ClientTimeout(total=seconds)
