"""Правила заказа без сетевых зависимостей; общие для обработчиков бота."""

import re
from datetime import datetime, timedelta, timezone

MAGADAN_TZ = timezone(timedelta(hours=11))
VPN_DEVICE_MULTIPLIERS = {1: 1, 2: 1.5, 3: 2, 5: 3}


def order_total(data):
    """Mini App передаёт итог с доставкой. Повторно её не прибавляем."""
    for key in ("total", "Total summary", "price", "sum"):
        if key in data:
            value = data[key]
            if isinstance(value, bool) or not re.fullmatch(r"\d{1,9}", str(value)):
                raise ValueError("Некорректная сумма заказа")
            return int(value)
    return 0


def vpn_selection(tariffs, tariff_id, devices=1):
    if not isinstance(tariff_id, str) or tariff_id not in tariffs:
        raise ValueError("Тариф не найден")
    if isinstance(devices, bool) or str(devices) not in {"1", "2", "3", "5"}:
        raise ValueError("Выберите 1, 2, 3 или 5 устройств")
    devices = int(devices)
    tariff = dict(tariffs[tariff_id])
    tariff["devices"] = devices
    tariff["price"] = int(tariff["price"] * VPN_DEVICE_MULTIPLIERS[devices] + .5)
    return tariff


def parse_vpn_start(payload):
    """Поддерживает и старое vpn_month, и новое vpn_month_3."""
    parts = payload.split("_")
    if len(parts) not in (2, 3) or parts[0] != "vpn":
        raise ValueError("Некорректная ссылка на тариф")
    devices = parts[2] if len(parts) == 3 else "1"
    if devices not in {"1", "2", "3", "5"}:
        raise ValueError("Выберите 1, 2, 3 или 5 устройств")
    return parts[1], int(devices)


def can_change_status(current, action):
    transitions = {
        "new": {"accept", "cancel"},
        "accept": {"pack", "ship", "done", "cancel"},
        "pack": {"ship", "done", "cancel"},
        "ship": {"done", "cancel"},
        "done": set(),
        "cancel": set(),
    }
    return action in transitions.get(current, set())


def vpn_expiry_iso(expiry_ms):
    return datetime.fromtimestamp(expiry_ms / 1000, MAGADAN_TZ).isoformat(timespec="seconds")


def was_vpn_order_processed(record, order_id):
    if not record or not order_id:
        return False
    return order_id == record.get("last_processed_order_id") or order_id in record.get("processed_order_ids", [])
