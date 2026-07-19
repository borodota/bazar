import csv
import io
import logging
import re
from aiogram import Bot, Dispatcher, types, F
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton
from aiogram.filters import Command
from aiogram.enums import ParseMode
import asyncio
import json
from datetime import datetime, timedelta, timezone
import os
import sys
from xui_db import XuiClient  # выдача VPN через прямую запись в базу 3x-ui (вход не нужен)

# ==================== НАСТРОЙКА ЛОГИРОВАНИЯ ====================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('bot.log', encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)

# ==================== ВРЕМЕННАЯ ЗОНА ====================
# Магадан находится в зоне UTC+11 (стандартное время, без перевода)
MAGADAN_TZ = timezone(timedelta(hours=11))

def now_magadan():
    """Получить текущее время в магаданской зоне"""
    return datetime.now(MAGADAN_TZ)

# ==================== КОНФИГУРАЦИЯ ====================
# Токен лучше хранить в переменной окружения BOT_TOKEN (см. README)
SHOP_BOT_TOKEN = os.getenv("BOT_TOKEN", "8687110031:AAE9E430W55aRQQuUwDI8hEMjaVliq_gbG4")
ADMIN_ID = 6163521938
MANAGER_USERNAME = 'BORO_DOTA'
BOT_USERNAME = 'vapebazar_bot'   # для реферальных ссылок t.me/<bot>?startapp=ref_<id>
DEPUTY_ADMIN_IDS = [5289357165, 6163521938]

SHOP_OPEN_HOUR = 10   # часы работы по Магадану — синхронизировано со script.js
SHOP_CLOSE_HOUR = 22

DELIVERY_BASE_COST = 250
FREE_DELIVERY_THRESHOLD = 2000

# В aiogram 3.7+ parse_mode передаётся только через DefaultBotProperties
bot = Bot(token=SHOP_BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
storage = MemoryStorage()
dp = Dispatcher(storage=storage)

# ==================== ХРАНИЛИЩЕ (JSON-файлы рядом с ботом) ====================
DATA_DIR = os.path.dirname(os.path.abspath(__file__))
SUBSCRIBERS_FILE = os.path.join(DATA_DIR, "subscribers.json")  # кому слать рассылку
ORDERS_FILE = os.path.join(DATA_DIR, "orders_log.json")        # журнал заказов для /orders и /stats
BONUSES_FILE = os.path.join(DATA_DIR, "bonuses.json")          # ИСТОЧНИК ПРАВДЫ по баллам и рефералам
NOTIFY_FILE = os.path.join(DATA_DIR, "notify_requests.json")   # запросы уведомить о поступлении товара
VPN_SUBS_FILE = os.path.join(DATA_DIR, "vpn_subs.json")        # учёт VPN-подписок: кто, тариф, срок
REVIEWS_FILE = os.path.join(DATA_DIR, "reviews.json")          # оценки клиентов после выполненного заказа
CHALLENGES_FILE = os.path.join(DATA_DIR, "challenges.json")    # ежемесячные вызовы и прогресс

# ── Тарифы VPN (название / дней / цена ₽ / устройств) ──
VPN_TARIFFS = {
    "trial": {"name": "Пробный", "days": 7,   "price": 50,   "devices": 1},
    "month": {"name": "Месяц",   "days": 30,  "price": 150,  "devices": 1},
    "q":     {"name": "3 месяца","days": 90,  "price": 400,  "devices": 1},
    "half":  {"name": "Полгода", "days": 180, "price": 700,  "devices": 1},
    "year":  {"name": "Год",     "days": 365, "price": 1200, "devices": 1},
}
VPN_REFERRAL_BONUS_DAYS = 7   # приведи друга на VPN — оба получают эти дни бонусом
VPN_EXPIRY_REMINDER_WINDOW_DAYS = 2   # начинаем напоминать за N дней до истечения
VPN_EXPIRY_GRACE_DAYS = 14    # но не дольше N дней после — дальше считаем что клиент ушёл

REFERRAL_REWARD = 200   # баллов пригласившему за ПЕРВЫЙ оплаченный заказ друга
EARN_CAP_RATE = 0.15    # санити-лимит начисления: не больше 15% от суммы заказа

# ── VIP ПОДПИСКА И УРОВНИ ЛОЯЛЬНОСТИ ──
VIP_MONTHLY_PRICE = 299  # цена VIP на месяц
VIP_ORDERS_TO_FREE = 10  # бесплатный VIP за 10 заказов

# Уровни лояльности (название / заказов / скидка / описание)
LOYALTY_TIERS = {
    "bronze": {"name": "🥉 Bronze", "orders": 10, "discount": 0.03, "perks": "Скидка 3% на каждый заказ"},
    "silver": {"name": "🥈 Silver", "orders": 20, "discount": 0.05, "perks": "Скидка 5% + приоритет доставки"},
    "gold": {"name": "🥇 Gold", "orders": 50, "discount": 0.07, "perks": "Скидка 7% + бесплатная доставка"},
    "platinum": {"name": "👑 Platinum", "orders": 100, "discount": 0.10, "perks": "Скидка 10% + персональный менеджер"},
}

# Бейджи за действия
BADGES = {
    "first_order": {"emoji": "🎯", "name": "Первый заказ", "desc": "Сделал первый заказ"},
    "fast_buyer": {"emoji": "⚡", "name": "На маршруте", "desc": "Заказ в течение часа после открытия"},
    "sponsor": {"emoji": "💰", "name": "Спонсор", "desc": "Потратил 100k₽"},
    "referrer": {"emoji": "🎁", "name": "Дарующий", "desc": "Пригласил 10 друзей"},
    "reviewer": {"emoji": "⭐", "name": "Критик", "desc": "Оставил 5+ отзывов"},
}

ADMINS = set([ADMIN_ID] + DEPUTY_ADMIN_IDS)

def _load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default
    except Exception as e:
        logger.error(f"Не удалось прочитать {path}: {e}")
        return default

def _save_json(path, data):
    # Атомарная запись: сначала во временный файл, затем подменяем оригинал.
    # Так файл с баллами (это деньги) не побьётся, если бот упадёт в момент записи.
    try:
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except Exception as e:
        logger.error(f"Не удалось сохранить {path}: {e}")

def remember_user(user):
    """Запоминает любого, кто взаимодействовал с ботом, — это база для рассылки."""
    if not user:
        return
    subs = _load_json(SUBSCRIBERS_FILE, {})
    subs[str(user.id)] = {
        "name": user.first_name or "",
        "username": user.username or "",
        "ts": now_magadan().isoformat(timespec="seconds"),
    }
    _save_json(SUBSCRIBERS_FILE, subs)

def log_order(order_id, customer_id, total, action, status_label, items=None, name=None, phone=None, address=None):
    """Создаёт/обновляет запись заказа в журнале. Вызывается при создании заказа
    (путь sendData) и при каждой смене статуса кнопкой (путь Bot API из браузера)."""
    orders = _load_json(ORDERS_FILE, [])
    now = now_magadan().isoformat(timespec="seconds")
    rec = next((o for o in orders if str(o.get("order_id")) == str(order_id)), None)
    if rec is None:
        rec = {
            "order_id": str(order_id),
            "customer_id": str(customer_id or ""),
            "total": int(total or 0),
            "created_at": now,
        }
        orders.append(rec)
    if total and not rec.get("total"):
        rec["total"] = int(total)
    if customer_id and not rec.get("customer_id"):
        rec["customer_id"] = str(customer_id)
    if items and not rec.get("items"):
        rec["items"] = str(items)
    if name and not rec.get("name"):
        rec["name"] = str(name)
    if phone and not rec.get("phone"):
        rec["phone"] = str(phone)
    if address and not rec.get("address"):
        rec["address"] = str(address)
    rec["status"] = action
    rec["status_label"] = status_label
    rec["updated_at"] = now
    # держим журнал компактным
    if len(orders) > 500:
        orders = orders[-500:]
    _save_json(ORDERS_FILE, orders)

def _fmt_money(n):
    try:
        return f"{int(n):,}".replace(",", " ")
    except (TypeError, ValueError):
        return "0"

# ==================== БАЛЛЫ И РЕФЕРАЛЫ (источник правды) ====================
# Браузеру доверять нельзя (localStorage легко подделать). Поэтому баланс баллов,
# суммы покупок и реферальные связи живут ЗДЕСЬ и меняются только когда админ
# жмёт «✅ Принять» под заказом. Списание баллов бот ограничивает реальным
# балансом из этого файла — нарисовать себе баллы в браузере бесполезно.

def _safe_int(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default

# Все операции «прочитать-изменить-записать» с баллами идут под этим замком,
# иначе два одновременных нажатия «Принять» могут затереть изменения друг друга.
_bonus_lock = asyncio.Lock()
# Тот же принцип для VPN: выдача идёт в двух местах (два админа получают одну
# и ту же заявку отдельными сообщениями) и делает реальные await-вызовы к 3x-ui
# между чтением и записью vpn_subs.json — без лока это гонка данных.
_vpn_lock = asyncio.Lock()

def _load_bonuses():
    data = _load_json(BONUSES_FILE, {})
    if not isinstance(data, dict):
        data = {}
    data.setdefault("users", {})
    data.setdefault("settled", {})
    return data

def _save_bonuses(data):
    _save_json(BONUSES_FILE, data)

def _ensure_user(data, uid):
    uid = str(uid)
    u = data["users"].get(uid)
    if u is None:
        u = {"balance": 0, "spent": 0, "orders": 0,
             "referred_by": None, "ref_rewarded": False,
             "name": "", "username": ""}
        data["users"][uid] = u
    return u

def record_referral(new_user_id, ref_id, user=None):
    """Запоминает, кто кого пригласил, по факту перехода /start ref_<id> —
    серверная (надёжная) фиксация связи. Только для нового клиента без покупок."""
    if not ref_id or str(ref_id) in ("0", "", str(new_user_id)):
        return
    data = _load_bonuses()
    cust = _ensure_user(data, new_user_id)
    ref_str = str(ref_id)
    if cust["orders"] == 0 and not cust.get("referred_by") and not cust.get("ref_rewarded"):
        cust["referred_by"] = ref_str
        if user:
            cust["name"] = user.first_name or cust.get("name", "")
            cust["username"] = user.username or cust.get("username", "")

        # Отслеживаем в обратном направлении: кого пригласил реферер
        referrer = _ensure_user(data, ref_str)
        if "referred" not in referrer:
            referrer["referred"] = []
        if str(new_user_id) not in referrer["referred"]:
            referrer["referred"].append(str(new_user_id))

        _save_bonuses(data)

def settle_order_bonuses(order_id, customer_id, total, earn, redeem, ref_id):
    """Учитывает баллы по ПОДТВЕРЖДЁННОМУ заказу. Идемпотентно по order_id.
    Возвращает результат для уведомлений или None (нет клиента / уже учтён)."""
    if not customer_id:
        return None
    data = _load_bonuses()
    if data["settled"].get(str(order_id)):
        return None  # уже учитывали этот заказ — без двойного начисления

    cust = _ensure_user(data, customer_id)
    total = max(0, _safe_int(total))

    # 1. Списание: не больше реального баланса в нашем леджере (анти-фрод)
    redeem = max(0, _safe_int(redeem))
    actual_redeem = min(redeem, cust["balance"])
    redeem_capped = redeem > actual_redeem

    # 2. Начисление: доверяем расчёту клиента, но не больше 15% от суммы
    earn = max(0, _safe_int(earn))
    earn = min(earn, int(total * EARN_CAP_RATE) + 1)

    first_order = cust["orders"] == 0

    cust["balance"] = max(0, cust["balance"] - actual_redeem + earn)
    cust["spent"] += total
    cust["orders"] += 1
    cust["last_order_ts"] = now_magadan().isoformat(timespec="seconds")

    # 3. Реферальная связь: серверной нет — берём из заказа (по факту покупки)
    referrer_id = cust.get("referred_by")
    if not referrer_id and ref_id and str(ref_id) not in ("0", "", str(customer_id)):
        referrer_id = str(ref_id)
        cust["referred_by"] = referrer_id

    # 4. Награда пригласившему — ТОЛЬКО за первый оплаченный заказ друга, один раз
    ref_result = None
    if (first_order and referrer_id and not cust["ref_rewarded"]
            and str(referrer_id) != str(customer_id)):
        ref = _ensure_user(data, referrer_id)
        ref["balance"] += REFERRAL_REWARD
        cust["ref_rewarded"] = True
        ref_result = {"referrer_id": referrer_id,
                      "reward": REFERRAL_REWARD,
                      "referrer_balance": ref["balance"]}

    data["settled"][str(order_id)] = True
    _save_bonuses(data)

    return {
        "earn": earn,
        "redeem": actual_redeem,
        "requested_redeem": redeem,
        "redeem_capped": redeem_capped,
        "balance": cust["balance"],
        "spent": cust["spent"],
        "orders": cust["orders"],
        "ref": ref_result,
    }

def referral_stats(uid):
    """Сколько друзей привёл клиент и сколько из них уже оплатили первый заказ."""
    data = _load_bonuses()
    uid = str(uid)
    invited = rewarded = 0
    for u in data["users"].values():
        if str(u.get("referred_by")) == uid:
            invited += 1
            if u.get("ref_rewarded"):
                rewarded += 1
    bal = data["users"].get(uid, {}).get("balance", 0)
    return {"invited": invited, "rewarded": rewarded, "balance": bal}

def get_loyalty_tier(orders_count):
    """Определить уровень лояльности по количеству заказов"""
    for tier_key in ["platinum", "gold", "silver", "bronze"]:
        tier = LOYALTY_TIERS[tier_key]
        if orders_count >= tier["orders"]:
            return tier_key, tier
    return None, {}

def get_user_badges(uid):
    """Получить список бейджей пользователя"""
    data = _load_bonuses()
    user = data["users"].get(str(uid), {})
    badges = []

    # Первый заказ
    if user.get("orders", 0) > 0:
        badges.append("first_order")

    # Спонсор (100k₽)
    if user.get("spent", 0) >= 100000:
        badges.append("sponsor")

    # Дарующий (10+ приглашённых)
    referred = len(user.get("referred", []))
    if referred >= 10:
        badges.append("referrer")

    return badges

def apply_loyalty_discount(total, orders_count):
    """Применить скидку за уровень лояльности"""
    tier_key, tier = get_loyalty_tier(orders_count)
    if tier_key:
        discount = tier.get("discount", 0)
        return max(0, int(total * (1 - discount)))
    return total

def get_vip_status(uid):
    """Проверить VIP статус пользователя"""
    data = _load_bonuses()
    user = data["users"].get(str(uid), {})

    vip_until = user.get("vip_until")
    if not vip_until:
        return {"active": False, "days_left": 0}

    try:
        expiry = datetime.fromisoformat(vip_until)
        now = now_magadan()
        if expiry > now:
            days_left = (expiry - now).days
            return {"active": True, "days_left": days_left, "expiry": vip_until}
    except (ValueError, TypeError):
        pass

    return {"active": False, "days_left": 0}

def activate_vip(uid, days=30):
    """Активировать VIP статус"""
    data = _load_bonuses()
    user = _ensure_user(data, uid)

    now = now_magadan()
    current_vip = user.get("vip_until")

    if current_vip:
        try:
            expiry = datetime.fromisoformat(current_vip)
            if expiry > now:
                # Продлить существующий VIP
                new_expiry = expiry + timedelta(days=days)
            else:
                # VIP истёк, начать новый
                new_expiry = now + timedelta(days=days)
        except (ValueError, TypeError):
            new_expiry = now + timedelta(days=days)
    else:
        new_expiry = now + timedelta(days=days)

    user["vip_until"] = new_expiry.isoformat(timespec="seconds")
    _save_bonuses(data)

    return new_expiry

def get_main_keyboard():
    web_app_url = "https://borodota.github.io/bazar/"
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🛍️ Открыть Магазин", web_app=types.WebAppInfo(url=web_app_url))],
            [KeyboardButton(text="💎 Баллы"), KeyboardButton(text="👑 VIP"), KeyboardButton(text="🎁 Рефереллы")],
            [KeyboardButton(text="🏆 Бейджи"), KeyboardButton(text="🎯 Скидки"), KeyboardButton(text="🎂 День рождения")],
            [KeyboardButton(text="🎪 Вызовы"), KeyboardButton(text="❓ FAQ"), KeyboardButton(text="📦 Мои заказы")],
            [KeyboardButton(text="📞 Контакты")]
        ],
        resize_keyboard=True
    )

def get_features_menu():
    """Меню с инлайн кнопками для фич"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="💎 Баллы (/bonus)", callback_data="cmd_bonus"),
            InlineKeyboardButton(text="👑 VIP (/vip)", callback_data="cmd_vip")
        ],
        [
            InlineKeyboardButton(text="🏆 Бейджи (/badges)", callback_data="cmd_badges"),
            InlineKeyboardButton(text="🎯 Скидки (/discount)", callback_data="cmd_discount")
        ],
        [
            InlineKeyboardButton(text="🎁 Рефереллы (/ref)", callback_data="cmd_ref"),
            InlineKeyboardButton(text="🎪 Вызовы (/challenges)", callback_data="cmd_challenges")
        ],
        [
            InlineKeyboardButton(text="❓ FAQ (/faq)", callback_data="cmd_faq"),
            InlineKeyboardButton(text="🎂 День рождения (/birthday)", callback_data="cmd_birthday")
        ]
    ])

@dp.message(F.web_app_data)
async def handle_web_app_order(message: types.Message):
    logger.info(f"Получены данные из WebApp: {message.web_app_data.data}")
    remember_user(message.from_user)
    try:
        raw_string = message.web_app_data.data
        
        try:
            raw_data = json.loads(raw_string)
            is_json = True
        except json.JSONDecodeError:
            is_json = False

        # Обработка спецтипов запросов
        if is_json and raw_data.get("type") == "special_order":
            username_text = f"@{message.from_user.username}" if message.from_user.username else "Скрыт"
            so_name = raw_data.get("product_name", "—")
            so_link = raw_data.get("link") or "—"
            so_details = raw_data.get("details") or "—"
            so_qty = raw_data.get("quantity", 1)
            so_tg = raw_data.get("telegram") or username_text
            so_phone = raw_data.get("phone") or "—"

            await message.answer(
                "✅ <b>Заявка на спецзаказ принята!</b>\n\n"
                "Менеджер свяжется в течение 1–2 часов чтобы согласовать сумму предоплаты и сроки.\n\n"
                f"🧑‍💻 @{MANAGER_USERNAME}",
                reply_markup=get_main_keyboard()
            )
            admin_text = (
                f"📦 <b>СПЕЦЗАКАЗ ПОД ЗАКАЗ</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"👤 <b>Клиент:</b> {username_text}\n"
                f"🆔 <b>ID:</b> <code>{message.from_user.id}</code>\n"
                f"📞 <b>Телефон:</b> <code>{so_phone}</code>\n"
                f"💬 <b>Telegram:</b> {so_tg}\n\n"
                f"🏷️ <b>Товар:</b> {so_name}\n"
                f"🎨 <b>Детали:</b> {so_details}\n"
                f"🔗 <b>Ссылка:</b> {so_link}\n"
                f"#️⃣ <b>Кол-во:</b> {so_qty} шт.\n\n"
                f"⚠️ Клиент согласен на предоплату."
            )
            kb_so = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="📞 Связаться", url=f"tg://user?id={message.from_user.id}")
            ]])
            for chat_id in set([ADMIN_ID] + DEPUTY_ADMIN_IDS):
                try: await bot.send_message(chat_id=chat_id, text=admin_text, reply_markup=kb_so)
                except Exception as e: logger.error(f"special_order notify failed {chat_id}: {e}")
            return

        if is_json and raw_data.get("type") == "vpn_order":
            tariff_id = raw_data.get("tariff")
            tariff = VPN_TARIFFS.get(tariff_id)
            if not tariff:
                await message.answer(
                    f"⚠️ Тариф не распознан. Напишите менеджеру @{MANAGER_USERNAME}",
                    reply_markup=get_main_keyboard()
                )
                return
            username_text = f"@{message.from_user.username}" if message.from_user.username else "Скрыт"
            subs = _load_json(VPN_SUBS_FILE, {})
            is_renewal = str(message.from_user.id) in subs

            await message.answer(
                "🛡️ <b>Заявка на VPN принята!</b>\n\n"
                f"Тариф: <b>{tariff['name']}</b> — {tariff['price']} ₽ ({tariff['days']} дн.)\n\n"
                f"💳 Оплати директору @{MANAGER_USERNAME}. Как подтвердит оплату — "
                "сразу пришлём сюда ссылку-подписку и инструкцию.",
                reply_markup=get_main_keyboard()
            )
            admin_text = (
                f"🛡️ <b>{'ПРОДЛЕНИЕ' if is_renewal else 'НОВЫЙ'} VPN-ЗАКАЗ</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"👤 <b>Клиент:</b> {username_text}\n"
                f"🆔 <b>ID:</b> <code>{message.from_user.id}</code>\n\n"
                f"📦 <b>Тариф:</b> {tariff['name']} ({tariff['days']} дн., {tariff['devices']} устр.)\n"
                f"💰 <b>К оплате:</b> {tariff['price']} ₽\n\n"
                f"👉 Клиент платит напрямую. После оплаты жми кнопку — выдам доступ."
            )
            kb_vpn = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="✅ Оплачено — выдать", callback_data=f"vpn_give_{message.from_user.id}_{tariff_id}")],
                [InlineKeyboardButton(text="📞 Связаться", url=f"tg://user?id={message.from_user.id}")],
            ])
            for chat_id in set([ADMIN_ID] + DEPUTY_ADMIN_IDS):
                try: await bot.send_message(chat_id=chat_id, text=admin_text, reply_markup=kb_vpn)
                except Exception as e: logger.error(f"vpn_order notify failed {chat_id}: {e}")
            return

        if is_json and raw_data.get("type") == "notify_request":
            username_text = f"@{message.from_user.username}" if message.from_user.username else "Скрыт"
            prod_name = raw_data.get("product_name", "—")
            # Сохраняем запрос — когда товар придёт, /restock оповестит всех
            notify_reqs = _load_json(NOTIFY_FILE, {})
            prod_key = prod_name.lower().strip()
            if prod_key not in notify_reqs:
                notify_reqs[prod_key] = []
            uid_str = str(message.from_user.id)
            if uid_str not in notify_reqs[prod_key]:
                notify_reqs[prod_key].append(uid_str)
            _save_json(NOTIFY_FILE, notify_reqs)
            await message.answer(f"🔔 Мы сообщим как только <b>{prod_name}</b> появится в наличии!", reply_markup=get_main_keyboard())
            for chat_id in set([ADMIN_ID] + DEPUTY_ADMIN_IDS):
                try: await bot.send_message(chat_id=chat_id, text=f"🔔 <b>Запрос наличия</b>\nКлиент: {username_text}\nТовар: {prod_name}\nID: <code>{message.from_user.id}</code>")
                except: pass
            return

        if is_json and raw_data.get("type") == "order_log":
            # Тихое логирование заказа для /orders и /top (отправляется при закрытии overlay)
            log_order(
                str(raw_data.get("order_id") or ""),
                str(message.from_user.id),
                int(raw_data.get("total") or 0),
                "new", "🆕 Новый",
                items=raw_data.get("products"),
                name=raw_data.get("name"),
                phone=raw_data.get("phone"),
                address=raw_data.get("address")
            )
            return

        if is_json and raw_data.get("type") == "newsletter_subscribe":
            username_text = f"@{message.from_user.username}" if message.from_user.username else "Скрыт"
            await message.answer("📣 Вы подписаны на акции и новинки!", reply_markup=get_main_keyboard())
            for chat_id in set([ADMIN_ID] + DEPUTY_ADMIN_IDS):
                try: await bot.send_message(chat_id=chat_id, text=f"📣 Новая подписка на рассылку: {username_text} (<code>{message.from_user.id}</code>)")
                except: pass
            return

        if is_json:
            order_id = raw_data.get("order_id") or raw_data.get("Order ID") or raw_data.get("id") or now_magadan().strftime("%M%S")
            date_str = raw_data.get("date") or raw_data.get("Date") or now_magadan().strftime("%d.%m.%Y %H:%M")
            name = raw_data.get("name") or raw_data.get("Name") or "Не указано"
            phone = raw_data.get("phone") or raw_data.get("Phone") or "Не указан"
            delivery_type = raw_data.get("delivery") or raw_data.get("Delivery type") or "Самовывоз"
            address = raw_data.get("address") or raw_data.get("Address") or "Самовывоз"
            items = raw_data.get("products") or raw_data.get("Items") or "Товары отсутствуют"
            comment = raw_data.get("comment") or raw_data.get("Comment") or "Нет"
            
            total_items_cost = 0
            for key in ["total", "Total summary", "price", "sum"]:
                if key in raw_data:
                    try:
                        total_items_cost = int(raw_data[key])
                        break
                    except:
                        continue
            # Бонусные данные — передаются из браузера для кнопки «Принять»
            order_earn = _safe_int(raw_data.get("earn") or raw_data.get("bonusEarned"), 0)
            order_redeem = _safe_int(raw_data.get("redeem") or raw_data.get("bonusUsed"), 0)
            order_ref_id = str(raw_data.get("ref_id") or "0")
        else:
            order_id = now_magadan().strftime("%M%S")
            date_str = now_magadan().strftime("%d.%m.%Y %H:%M")
            name = message.from_user.first_name if message.from_user.first_name else "Не указано"
            phone = "Указан внутри текста"
            delivery_type = "Проверь текст ниже"
            address = "Проверь текст ниже"
            comment = "В тексте заказа"
            total_items_cost = 0
            items = raw_string
            order_earn = order_redeem = 0
            order_ref_id = "0"

        delivery_cost = 0
        if "доставка" in str(delivery_type).strip().lower():
            if total_items_cost < FREE_DELIVERY_THRESHOLD:
                delivery_cost = DELIVERY_BASE_COST
                
        final_total = total_items_cost + delivery_cost
        username_text = f"@{message.from_user.username}" if message.from_user.username else "Скрыт"

        total_text = f"{final_total:,}".replace(",", " ") if final_total > 0 else "Посчитает директор"

        # 1. Текст покупателю в ЛС
        customer_text = (
            f"✅ <b>Заказ #{order_id} принят!</b>\n"
            f"📅 {date_str}\n\n"
            f"🛒 <b>Ваш заказ</b>\n<blockquote>{items}</blockquote>\n\n"
            f"💰 <b>К оплате: {total_text} ₽</b>\n\n"
            f"🧑‍💻 Наш директор @{MANAGER_USERNAME} свяжется с вами для подтверждения.\n"
            f"🔔 Мы пришлём уведомление, когда статус заказа изменится!"
        )
        await message.answer(customer_text, reply_markup=get_main_keyboard())

        # 2. Текст директору в админку
        admin_caption = (
            f"🆕 <b>НОВЫЙ ЗАКАЗ #{order_id}</b>\n"
            f"📅 {date_str}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"👤 <b>КЛИЕНТ</b>\n"
            f"├ Telegram: {username_text}\n"
            f"├ Имя: {name}\n"
            f"├ Телефон: <code>{phone}</code>\n"
            f"└ ID: <code>{message.from_user.id}</code>\n\n"
            f"🛒 <b>СОСТАВ ЗАКАЗА</b>\n<blockquote>{items}</blockquote>\n\n"
            f"📍 <b>ПОЛУЧЕНИЕ</b>\n"
            f"├ Способ: {delivery_type}\n"
            f"└ Адрес: {address}\n\n"
            f"💬 Комментарий: <i>{comment}</i>\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"💰 <b>ИТОГО К ПОЛУЧЕНИЮ: {total_text if final_total > 0 else 'Проверь вручную'} ₽</b>\n\n"
            f"📊 Статус: <b>🆕 Новый</b>"
        )

        customer_id = message.from_user.id
        # В кнопку «Принять» зашиваем earn/redeem/ref — бот сверяет и начисляет баллы из bonuses.json
        accept_cb = f"st_accept_{order_id}_{customer_id}_{final_total}_{order_earn}_{order_redeem}_{order_ref_id}"
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Принять", callback_data=accept_cb),
                InlineKeyboardButton(text="📦 В сборке", callback_data=f"st_pack_{order_id}_{customer_id}_{final_total}")
            ],
            [
                InlineKeyboardButton(text="🚚 Отправлен", callback_data=f"st_ship_{order_id}_{customer_id}_{final_total}"),
                InlineKeyboardButton(text="🎯 Выполнен", callback_data=f"st_done_{order_id}_{customer_id}_{final_total}")
            ],
            [
                InlineKeyboardButton(text="❌ Отменить заказ", callback_data=f"st_cancel_{order_id}_{customer_id}_{final_total}")
            ],
            [
                InlineKeyboardButton(text="📞 Связаться с клиентом", url=f"tg://user?id={customer_id}")
            ]
        ])

        # Заказ из sendData приходит с полными данными — сразу пишем его в журнал
        log_order(order_id, customer_id, final_total, "new", "🆕 Новый",
                  items=items, name=name, phone=phone, address=address)

        all_chats = set([ADMIN_ID] + DEPUTY_ADMIN_IDS)
        for chat_id in all_chats:
            try:
                await bot.send_message(chat_id=chat_id, text=admin_caption, reply_markup=kb)
            except Exception as e:
                logger.error(f"Не удалось отправить уведомление на ID {chat_id}: {e}")

    except Exception as e:
        logger.error(f"Критическая ошибка хэндлера WebApp: {e}")
        await message.answer("❌ Произошла ошибка при обработке данных корзины.")

@dp.callback_query(F.data.startswith("vpn_give_"))
async def vpn_give_access(callback: types.CallbackQuery):
    """Директор нажал «Оплачено — выдать»: создаём/продлеваем доступ в 3x-ui."""
    if callback.from_user.id not in ADMINS:
        await callback.answer("⛔ Нет доступа", show_alert=True)
        return

    # vpn_give_<customer_id>_<tariff_id>_<devices>_<ref_id>_<order_id>
    parts = callback.data.split("_")
    customer_id = parts[2] if len(parts) > 2 else None
    tariff_id = parts[3] if len(parts) > 3 else None
    tariff = VPN_TARIFFS.get(tariff_id)
    if not customer_id or not tariff:
        await callback.answer("⚠️ Не разобрал заказ", show_alert=True)
        return
    devices = int(parts[4]) if len(parts) > 4 and parts[4].isdigit() else tariff["devices"]
    ref_id = parts[5] if len(parts) > 5 else "0"
    order_id = parts[6] if len(parts) > 6 else ""

    # Заявка на один и тот же заказ уходит ОБОИМ админам отдельными сообщениями —
    # если оба нажмут «Оплачено — выдать», без лока и проверки order_id клиенту
    # продлится VPN дважды бесплатно. Лок нужен на весь блок: между чтением и
    # записью vpn_subs.json тут реальные await к панели 3x-ui.
    async with _vpn_lock:
        subs = _load_json(VPN_SUBS_FILE, {})
        rec = subs.get(str(customer_id))
        if order_id and rec and rec.get("last_processed_order_id") == order_id:
            await callback.answer("⚠️ Этот заказ уже обработан", show_alert=True)
            try:
                done_text = (callback.message.html_text or callback.message.text or "") + \
                    "\n\n✅ <b>УЖЕ ВЫДАНО РАНЕЕ</b> (обработал другой админ)"
                await callback.message.edit_text(
                    text=done_text, reply_markup=InlineKeyboardMarkup(inline_keyboard=[])
                )
            except Exception:
                pass
            return

        await callback.answer("Создаю доступ…")
        client = XuiClient()  # все параметры из .env
        try:
            await client.login()
            email = f"tg{customer_id}"
            is_first_vpn = rec is None

            # Реферальный бонус — только первому VPN-заказу клиента, приглашённому не самим собой
            referral_applies = (is_first_vpn and ref_id not in ("0", "", str(customer_id)))
            bonus_days = VPN_REFERRAL_BONUS_DAYS if referral_applies else 0
            effective_days = tariff["days"] + bonus_days

            if rec and rec.get("uuid") and rec.get("sub_id"):
                # уже был доступ → продлеваем, дни не сгорают
                result = await client.extend_client(
                    rec["uuid"], email, rec["sub_id"], effective_days, devices
                )
                uuid_val, sub_id = rec["uuid"], rec["sub_id"]
            else:
                # новый клиент
                result = await client.add_client(email, effective_days, devices)
                uuid_val, sub_id = result["uuid"], result["sub_id"]

            sub_url = result["sub_url"]  # ссылка-подписка — стабильно открывается только в HAPP
            expiry_ms = result["expiry_ms"]
            expiry_str = datetime.fromtimestamp(expiry_ms / 1000).strftime("%d.%m.%Y")

            subs[str(customer_id)] = {
                "tariff": tariff_id,
                "devices": devices,
                "sub_id": sub_id,
                "uuid": uuid_val,
                "email": email,
                "expiry": datetime.fromtimestamp(expiry_ms / 1000).isoformat(timespec="seconds"),
                "created": (rec.get("created") if rec else now_magadan().isoformat(timespec="seconds")),
                "last_processed_order_id": order_id,
            }
            _save_json(VPN_SUBS_FILE, subs)

            # Реферальный бонус пригласившему — продлеваем его собственный VPN, если он у него есть
            if referral_applies:
                ref_rec = subs.get(str(ref_id))
                if ref_rec and ref_rec.get("uuid") and ref_rec.get("sub_id"):
                    try:
                        ref_result = await client.extend_client(
                            ref_rec["uuid"], ref_rec["email"], ref_rec["sub_id"],
                            VPN_REFERRAL_BONUS_DAYS, ref_rec.get("devices", 1)
                        )
                        ref_rec["expiry"] = datetime.fromtimestamp(
                            ref_result["expiry_ms"] / 1000
                        ).isoformat(timespec="seconds")
                        subs[str(ref_id)] = ref_rec
                        _save_json(VPN_SUBS_FILE, subs)
                        ref_expiry_str = datetime.fromtimestamp(
                            ref_result["expiry_ms"] / 1000
                        ).strftime("%d.%m.%Y")
                        await bot.send_message(
                            chat_id=int(ref_id),
                            text=(
                                f"🎁 <b>Друг оплатил VPN по твоей ссылке!</b>\n\n"
                                f"В подарок +{VPN_REFERRAL_BONUS_DAYS} дней к твоей подписке.\n"
                                f"Теперь активна до <b>{ref_expiry_str}</b> 🛡️"
                            )
                        )
                    except Exception as e:
                        logger.error(f"Не удалось начислить VPN-реферальный бонус {ref_id}: {e}")
                else:
                    # У пригласившего нет своего VPN — бонусу некуда деться. Не молчим,
                    # сообщаем админу, чтобы решить вручную (иначе обещание "оба получат
                    # +7 дней" не выполняется, а никто об этом не узнаёт).
                    logger.info(f"VPN-реферал {ref_id} без активной подписки — бонус рефереру пропущен")
                    try:
                        await bot.send_message(
                            callback.from_user.id,
                            f"ℹ️ Клиент <code>{customer_id}</code> пришёл по реферальной ссылке "
                            f"<code>{ref_id}</code>, но у того нет активного VPN — бонус +{VPN_REFERRAL_BONUS_DAYS} "
                            f"дней начислить некуда. Автоматически не начислено."
                        )
                    except Exception:
                        pass

            # Клиенту — ссылка + инструкция (только HAPP: у него ключ подключается стабильно)
            bonus_line = f"🎁 +{bonus_days} дней в подарок за переход по ссылке друга!\n" if referral_applies else ""
            client_text = (
                "🛡️ <b>Ваш VPN готов!</b>\n"
                f"Тариф: <b>{tariff['name']}</b> · {devices} устр. · активен до <b>{expiry_str}</b>\n"
                f"{bonus_line}\n"
                "🔗 <b>Ваша ссылка-подписка</b> (скопируй целиком):\n"
                f"<code>{sub_url}</code>\n\n"
                "📲 <b>Как подключить:</b>\n"
                "1️⃣ Установи приложение <b>HAPP</b>:\n"
                "   • iPhone — App Store\n"
                "   • Android — Google Play\n"
                "2️⃣ Скопируй ссылку выше\n"
                "3️⃣ В HAPP: «＋» → «Добавить из буфера обмена»\n"
                "4️⃣ Включи тумблер — готово ✅\n\n"
                f"❓ Вопросы: @{MANAGER_USERNAME}"
            )
            try:
                await bot.send_message(chat_id=int(customer_id), text=client_text)
            except Exception as e:
                logger.error(f"Не удалось отправить VPN-доступ клиенту {customer_id}: {e}")
                await bot.send_message(
                    callback.from_user.id,
                    f"⚠️ Доступ создан, но клиенту <code>{customer_id}</code> не доставилось "
                    f"(не запускал бота?). Ссылка:\n<code>{sub_url}</code>"
                )

            # Обновляем сообщение у директора (пустая клавиатура — реально убирает кнопки;
            # reply_markup=None в aiogram просто не отправляет параметр, и старая клавиатура остаётся)
            try:
                done_text = (callback.message.html_text or callback.message.text or "") + \
                    f"\n\n✅ <b>ВЫДАНО</b> · до {expiry_str}"
                await callback.message.edit_text(
                    text=done_text, reply_markup=InlineKeyboardMarkup(inline_keyboard=[])
                )
            except Exception:
                pass

        except Exception as e:
            logger.error(f"VPN выдача не удалась (клиент {customer_id}): {e}")
            try:
                await bot.send_message(
                    callback.from_user.id,
                    f"⚠️ <b>Не удалось выдать VPN.</b>\nОшибка: <code>{e}</code>\n\n"
                    f"Проверь панель/доступ и попробуй ещё раз, либо выдай вручную."
                )
            except Exception:
                pass
        finally:
            await client.close()


@dp.callback_query(F.data.startswith("st_"))
async def change_order_status(callback: types.CallbackQuery):
    # Только админы могут менять статус заказа
    if callback.from_user.id not in set([ADMIN_ID] + DEPUTY_ADMIN_IDS):
        await callback.answer("⛔ Нет доступа", show_alert=True)
        return

    parts = callback.data.split("_")
    action = parts[1] if len(parts) > 1 else ""
    order_id = parts[2] if len(parts) > 2 else "?"
    customer_id = parts[3] if len(parts) > 3 else None
    total = parts[4] if len(parts) > 4 else 0
    # доп. поля есть только у кнопки «Принять»: earn, redeem, ref
    earn = parts[5] if len(parts) > 5 else 0
    redeem = parts[6] if len(parts) > 6 else 0
    ref_id = parts[7] if len(parts) > 7 else 0

    statuses = {
        "accept": "Принят в работу 🟡",
        "pack": "Собирается на складе 📦",
        "ship": "Передан курьеру / В пути 🚚",
        "done": "Выполнен / Оплачен успешно ✅",
        "cancel": "Отменен администратором ❌"
    }
    new_status = statuses.get(action, "Изменен")

    # Фиксируем заказ в журнале (для заказов из браузера это первый момент,
    # когда бот узнаёт о заказе — данные берём из текста сообщения).
    _msg_html = callback.message.html_text or callback.message.text or ""
    _bq = re.search(r'<blockquote>(.*?)</blockquote>', _msg_html, re.DOTALL)
    _extracted_items = _bq.group(1).strip() if _bq else None
    _phone_m = re.search(r'Телефон: (?:<code>)?([^<\n]+?)(?:</code>)?$', _msg_html, re.MULTILINE)
    _name_m = re.search(r'Указал в форме: ([^\n<]+)', _msg_html) or re.search(r'Telegram: ([^\n<]+)', _msg_html)
    _addr_m = re.search(r'Адрес: ([^\n<]+)', _msg_html)
    log_order(order_id, customer_id, total, action, new_status,
              items=_extracted_items,
              name=_name_m.group(1).strip() if _name_m else None,
              phone=_phone_m.group(1).strip() if _phone_m else None,
              address=_addr_m.group(1).strip() if _addr_m else None)

    # Добавляем клиента в базу подписчиков (чтобы попадал в рассылку)
    if customer_id:
        try:
            _cid = str(customer_id)
            _subs = _load_json(SUBSCRIBERS_FILE, {})
            if _cid not in _subs:
                _name_val = _name_m.group(1).strip() if _name_m else ""
                _subs[_cid] = {"name": _name_val, "username": "", "ts": now_magadan().isoformat(timespec="seconds")}
                _save_json(SUBSCRIBERS_FILE, _subs)
        except Exception:
            pass

    # ── Начисление баллов: ТОЛЬКО при «Принять» и один раз на заказ ──
    bonus_summary = None
    if action == "accept":
        try:
            async with _bonus_lock:
                bonus_summary = settle_order_bonuses(order_id, customer_id, total, earn, redeem, ref_id)
        except Exception as e:
            logger.error(f"Ошибка начисления баллов по заказу #{order_id}: {e}")
        # Уведомляем админа об итогах и подозрительном списании
        if bonus_summary:
            try:
                warn = ""
                if bonus_summary["redeem_capped"]:
                    warn = (f"\n⚠️ <b>Клиент пытался списать {_fmt_money(bonus_summary['requested_redeem'])} баллов, "
                            f"а доступно было только {_fmt_money(bonus_summary['redeem'])}.</b> Списано по факту.")
                ref_line = ""
                if bonus_summary["ref"]:
                    r = bonus_summary["ref"]
                    ref_line = f"\n🎁 Рефереру <code>{r['referrer_id']}</code> начислено {r['reward']} (баланс: {_fmt_money(r['referrer_balance'])})"
                await bot.send_message(
                    chat_id=callback.from_user.id,
                    text=(f"💎 <b>Баллы по заказу #{order_id} учтены</b>\n"
                          f"├ Начислено: <b>+{_fmt_money(bonus_summary['earn'])}</b>\n"
                          f"├ Списано: <b>{_fmt_money(bonus_summary['redeem'])}</b>\n"
                          f"└ Баланс клиента: <b>{_fmt_money(bonus_summary['balance'])}</b>"
                          f"{ref_line}{warn}")
                )
            except Exception as e:
                logger.error(f"Не удалось отправить сводку по баллам админу: {e}")

    # html_text сохраняет жирный шрифт и форматирование при редактировании
    text = callback.message.html_text or callback.message.text or ""
    if "📊 Статус:" in text:
        clean_text = text.split("📊 Статус:")[0]
        updated_text = f"{clean_text}📊 Статус: <b>{new_status}</b>"
        try:
            await callback.message.edit_text(text=updated_text, reply_markup=callback.message.reply_markup)
        except Exception as e:
            logger.error(f"Не удалось обновить сообщение заказа #{order_id}: {e}")

    # При завершении заказа — отправляем чек клиенту
    if action == "done" and customer_id:
        orders = _load_json(ORDERS_FILE, [])
        rec = next((o for o in orders if str(o.get("order_id")) == str(order_id)), None)
        if rec:
            receipt_items = rec.get("items") or "—"
            receipt_total = _fmt_money(rec.get("total") or total)
            receipt_date = rec.get("created_at", now_magadan().isoformat())[:10]
            receipt_text = (
                f"🧾 <b>ВАШ ЧЕК — VAPEBAZAR PREMIUM</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"📦 Заказ: <b>#{order_id}</b>\n"
                f"📅 Дата: {receipt_date}\n\n"
                f"🛒 <b>Состав:</b>\n<blockquote>{receipt_items}</blockquote>\n\n"
                f"💰 <b>Итого: {receipt_total} ₽</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"✅ <b>ОПЛАЧЕН И ВЫДАН</b>\n\n"
                f"Спасибо за покупку! Возвращайтесь 💜\n"
                f"📞 По вопросам: @{MANAGER_USERNAME}"
            )
            try:
                await bot.send_message(chat_id=int(customer_id), text=receipt_text)
            except Exception as e:
                logger.error(f"Не удалось отправить чек клиенту {customer_id}: {e}")

            # Просим оценить заказ
            try:
                rate_kb = InlineKeyboardMarkup(inline_keyboard=[[
                    InlineKeyboardButton(text=str(n), callback_data=f"rate_{order_id}_{n}") for n in range(1, 6)
                ]])
                await bot.send_message(
                    chat_id=int(customer_id),
                    text="⭐ Как оцените заказ? Помогите нам стать лучше:",
                    reply_markup=rate_kb
                )
            except Exception as e:
                logger.error(f"Не удалось отправить запрос оценки клиенту {customer_id}: {e}")

    # Уведомляем клиента о смене статуса
    if customer_id:
        status_extra = {
            "accept": "Мы уже начали обработку вашего заказа!",
            "pack": "Собираем ваш заказ — скоро будет готов!",
            "ship": "Заказ в пути! Курьер скоро будет у вас.",
            "done": "Спасибо за покупку! Будем рады видеть вас снова 💜",
            "cancel": f"Если возникли вопросы — напишите @{MANAGER_USERNAME}"
        }
        # При «Принять» дописываем клиенту реальные баллы из нашего леджера
        bonus_line = ""
        if action == "accept" and bonus_summary:
            parts_b = []
            if bonus_summary["earn"] > 0:
                parts_b.append(f"💎 Начислено <b>{_fmt_money(bonus_summary['earn'])}</b> баллов")
            if bonus_summary["redeem"] > 0:
                parts_b.append(f"➖ Списано {_fmt_money(bonus_summary['redeem'])} баллов")
            if bonus_summary["redeem_capped"]:
                parts_b.append(f"ℹ️ Списали {_fmt_money(bonus_summary['redeem'])} вместо {_fmt_money(bonus_summary['requested_redeem'])} — столько баллов на вашем счёте")
            parts_b.append(f"💼 Ваш баланс: <b>{_fmt_money(bonus_summary['balance'])}</b> баллов")
            bonus_line = "\n\n" + "\n".join(parts_b)
        try:
            await bot.send_message(
                chat_id=int(customer_id),
                text=(
                    f"📦 <b>Заказ #{order_id}</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"📊 Новый статус: <b>{new_status}</b>\n\n"
                    f"{status_extra.get(action, '')}"
                    f"{bonus_line}"
                )
            )
        except Exception as e:
            logger.error(f"Не удалось уведомить клиента {customer_id} о статусе заказа #{order_id}: {e}")

    # Радуем пригласившего: его друг сделал первый заказ
    if bonus_summary and bonus_summary.get("ref"):
        r = bonus_summary["ref"]
        try:
            await bot.send_message(
                chat_id=int(r["referrer_id"]),
                text=(
                    f"🎁 <b>Реферальная награда!</b>\n"
                    f"Твой друг сделал первый заказ — тебе начислено <b>+{r['reward']}</b> баллов.\n"
                    f"💼 Баланс: <b>{_fmt_money(r['referrer_balance'])}</b> баллов.\n\n"
                    f"Спасибо, что зовёшь друзей в VAPEBAZAR 💜"
                )
            )
        except Exception as e:
            logger.error(f"Не удалось уведомить реферера {r['referrer_id']}: {e}")

    await callback.answer(f"Статус изменен: {new_status}")


@dp.callback_query(F.data.startswith("rate_"))
async def rate_order(callback: types.CallbackQuery):
    """Клиент оценил заказ звёздами после «Выполнен»."""
    parts = callback.data.split("_")
    order_id = parts[1] if len(parts) > 1 else "?"
    score = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None
    if not score or not (1 <= score <= 5):
        await callback.answer("⚠️ Не разобрал оценку", show_alert=True)
        return

    customer_id = callback.from_user.id
    reviews = _load_json(REVIEWS_FILE, {})

    existing = reviews.get(str(order_id))
    if existing:
        # reply_markup=None в aiogram не убирает клавиатуру (Telegram оставляет старую,
        # если параметр вообще не передан) — без этой проверки можно оценивать один
        # заказ бесконечно и заспамить админов повторными алертами.
        old_stars = "⭐" * int(existing.get("score", 0))
        await callback.answer("Вы уже оценили этот заказ", show_alert=True)
        try:
            await callback.message.edit_text(
                text=f"Спасибо за оценку! {old_stars}", reply_markup=InlineKeyboardMarkup(inline_keyboard=[])
            )
        except Exception:
            pass
        return

    reviews[str(order_id)] = {
        "customer_id": str(customer_id),
        "score": score,
        "ts": now_magadan().isoformat(timespec="seconds"),
    }
    _save_json(REVIEWS_FILE, reviews)

    stars = "⭐" * score
    try:
        await callback.message.edit_text(
            text=f"Спасибо за оценку! {stars}", reply_markup=InlineKeyboardMarkup(inline_keyboard=[])
        )
    except Exception:
        pass
    await callback.answer("Спасибо!")

    # Низкую оценку — сразу директору, чтобы успеть решить вопрос
    if score <= 3:
        uname = f"@{callback.from_user.username}" if callback.from_user.username else callback.from_user.first_name
        for admin_id in ADMINS:
            try:
                await bot.send_message(
                    admin_id,
                    f"⚠️ <b>Низкая оценка заказа #{order_id}</b>\n"
                    f"{stars} от {uname} (<code>{customer_id}</code>)\n\n"
                    f"Стоит написать клиенту и уточнить, что не так."
                )
            except Exception:
                pass
    # Высокую — можно использовать как отзыв для канала
    elif score >= 4:
        uname = f"@{callback.from_user.username}" if callback.from_user.username else callback.from_user.first_name
        for admin_id in ADMINS:
            try:
                await bot.send_message(
                    admin_id,
                    f"🌟 <b>Хорошая оценка заказа #{order_id}</b>\n"
                    f"{stars} от {uname}\n\n"
                    f"Можно попросить отзыв текстом и запостить в канал 💜"
                )
            except Exception:
                pass


@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    remember_user(message.from_user)
    # Реферальная ссылка ведёт на /start ref_<id> — надёжно фиксируем, кто пригласил
    payload = (message.text.partition(" ")[2].strip() if message.text else "")
    if payload.startswith("ref_"):
        try:
            async with _bonus_lock:
                record_referral(message.from_user.id, payload[4:], message.from_user)
        except Exception as e:
            logger.error(f"Не удалось записать реферала из /start: {e}")
    await message.answer(
        f"Привет, {message.from_user.first_name}! 👋\n\n"
        f"Добро пожаловать в <b>VAPEBAZAR PREMIUM</b> 💜\n\n"
        f"Нажми кнопки ниже чтобы посмотреть статус и управлять скидками:",
        reply_markup=get_features_menu()
    )

    await message.answer(
        f"<b>Основное меню:</b>",
        reply_markup=get_main_keyboard()
    )
    if message.from_user.id in ADMINS:
        await message.answer(
            "🛠 <b>Команды администратора</b>\n"
            "├ /stats — статистика и выручка\n"
            "├ /orders — последние заказы\n"
            "├ /bonus <i>id</i> — баланс баллов клиента\n"
            "├ /bonus_add <i>id сумма</i> — изменить баллы (можно −)\n"
            "├ /restock <i>товар</i> — поступление: оповестить ждущих\n"
            "├ /top — топ товаров по заказам\n"
            "├ /export — выгрузить заказы в CSV\n"
            "├ /broadcast <i>текст</i> — рассылка всем подписчикам\n"
            "└ /broadcast_buyers <i>текст</i> — рассылка только покупателям"
        )


@dp.message(Command("broadcast"))
async def cmd_broadcast(message: types.Message):
    if message.from_user.id not in ADMINS:
        return  # для не-админов команда просто не существует
    text = message.text.partition(" ")[2].strip()
    if not text:
        await message.answer(
            "📣 <b>Рассылка</b>\n\n"
            "Использование: <code>/broadcast текст сообщения</code>\n"
            "Можно с HTML: <code>&lt;b&gt;жирный&lt;/b&gt;</code>, <code>&lt;i&gt;курсив&lt;/i&gt;</code>.\n\n"
            "Получат все, кто хоть раз запускал бота."
        )
        return
    subs = _load_json(SUBSCRIBERS_FILE, {})
    ids = []
    for uid in subs.keys():
        try:
            ids.append(int(uid))
        except (TypeError, ValueError):
            continue
    if not ids:
        await message.answer("📭 Пока нет ни одного подписчика для рассылки.")
        return
    await message.answer(f"📤 Рассылаю {len(ids)} получателям…")
    sent = failed = 0
    for uid in ids:
        try:
            await bot.send_message(chat_id=uid, text=text, reply_markup=get_main_keyboard())
            sent += 1
        except Exception as e:
            failed += 1
            logger.warning(f"Рассылка → {uid} не доставлена: {e}")
        await asyncio.sleep(0.05)  # ~20 сообщений/сек — в пределах лимитов Telegram
    await message.answer(
        f"✅ <b>Рассылка завершена</b>\n"
        f"├ Доставлено: <b>{sent}</b>\n"
        f"└ Не доставлено: <b>{failed}</b>"
    )


@dp.message(Command("broadcast_buyers"))
async def cmd_broadcast_buyers(message: types.Message):
    if message.from_user.id not in ADMINS:
        return
    text = message.text.partition(" ")[2].strip()
    if not text:
        await message.answer(
            "🎯 <b>Рассылка покупателям</b>\n\n"
            "Использование: <code>/broadcast_buyers текст</code>\n"
            "Получат только те, кто уже делал заказ (из журнала)."
        )
        return
    orders = _load_json(ORDERS_FILE, [])
    ids = []
    for o in orders:
        cid = o.get("customer_id")
        if not cid:
            continue
        try:
            cid = int(cid)
        except (TypeError, ValueError):
            continue
        if cid not in ids:
            ids.append(cid)
    if not ids:
        await message.answer("📭 В журнале пока нет покупателей с известным ID.")
        return
    await message.answer(f"🎯 Рассылаю {len(ids)} покупателям…")
    sent = failed = 0
    for uid in ids:
        try:
            await bot.send_message(chat_id=uid, text=text, reply_markup=get_main_keyboard())
            sent += 1
        except Exception as e:
            failed += 1
            logger.warning(f"Рассылка покупателям → {uid} не доставлена: {e}")
        await asyncio.sleep(0.05)
    await message.answer(
        f"✅ <b>Рассылка покупателям завершена</b>\n"
        f"├ Доставлено: <b>{sent}</b>\n"
        f"└ Не доставлено: <b>{failed}</b>"
    )


@dp.message(Command("orders"))
async def cmd_orders(message: types.Message):
    if message.from_user.id not in ADMINS:
        return
    orders = _load_json(ORDERS_FILE, [])
    if not orders:
        await message.answer(
            "📭 Журнал заказов пуст.\n\n"
            "<i>Заказ попадает в журнал, когда он приходит через кнопку «Открыть Магазин» "
            "или когда вы жмёте кнопку статуса под уведомлением о заказе.</i>"
        )
        return
    recent = sorted(orders, key=lambda o: o.get("updated_at", ""), reverse=True)[:15]
    lines = ["🧾 <b>Последние заказы</b>", "━━━━━━━━━━━━━━━━━━━━━━━━"]
    for o in recent:
        total = o.get("total") or 0
        total_txt = f"{_fmt_money(total)} ₽" if total else "—"
        lines.append(f"<b>#{o.get('order_id')}</b> · {total_txt}\n     {o.get('status_label', '—')}")
    await message.answer("\n".join(lines))


@dp.message(Command("vpn_subs"))
async def cmd_vpn_subs(message: types.Message):
    if message.from_user.id not in ADMINS:
        return
    subs = _load_json(VPN_SUBS_FILE, {})
    if not subs:
        await message.answer("🛡️ VPN-подписок пока нет.")
        return
    now = now_magadan()
    lines = ["🛡️ <b>VPN-подписки</b>", "━━━━━━━━━━━━━━━━━━━━━━━━"]
    # сортируем по сроку окончания (кто раньше истекает — выше)
    for cid, rec in sorted(subs.items(), key=lambda kv: kv[1].get("expiry", "")):
        tariff = VPN_TARIFFS.get(rec.get("tariff"), {})
        tname = tariff.get("name", rec.get("tariff", "—"))
        exp_str = rec.get("expiry", "")[:10]
        active = "✅"
        try:
            if datetime.fromisoformat(rec.get("expiry")) < now:
                active = "⛔"
        except Exception:
            pass
        dev_str = f" · {rec['devices']} устр." if rec.get("devices") else ""
        lines.append(f"{active} <code>{cid}</code> · {tname}{dev_str} · до {exp_str}")
    await message.answer("\n".join(lines))


@dp.message(Command("stats"))
async def cmd_stats(message: types.Message):
    if message.from_user.id not in ADMINS:
        return
    orders = _load_json(ORDERS_FILE, [])
    subs = _load_json(SUBSCRIBERS_FILE, {})
    now = now_magadan()
    today = now.date()
    week_ago = now - timedelta(days=7)

    def _created(o):
        try:
            return datetime.fromisoformat(o.get("created_at"))
        except (TypeError, ValueError):
            return None

    active = [o for o in orders if o.get("status") != "cancel"]  # отменённые не считаем в выручке

    def _revenue(items):
        return sum(int(o.get("total") or 0) for o in items)

    today_orders = [o for o in active if (_created(o) and _created(o).date() == today)]
    week_orders = [o for o in active if (_created(o) and _created(o) >= week_ago)]
    cancelled = sum(1 for o in orders if o.get("status") == "cancel")

    await message.answer(
        "📊 <b>Статистика VAPEBAZAR</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"📅 <b>Сегодня:</b> {len(today_orders)} зак. · {_fmt_money(_revenue(today_orders))} ₽\n"
        f"🗓 <b>За 7 дней:</b> {len(week_orders)} зак. · {_fmt_money(_revenue(week_orders))} ₽\n"
        f"📦 <b>Всего:</b> {len(orders)} зак. · {_fmt_money(_revenue(active))} ₽\n"
        f"❌ <b>Отменено:</b> {cancelled}\n"
        f"👥 <b>Подписчиков:</b> {len(subs)}\n\n"
        "<i>В журнал попадают заказы из кнопки магазина и те, по которым вы нажимали статус.</i>"
    )


# ═════════════════════════════════════════════════════════════════════════════
# АНАЛИТИКА И ДАШБОРД (для админ-панели)
# ═════════════════════════════════════════════════════════════════════════════

@dp.message(Command("api_analytics"))
async def cmd_api_analytics(message: types.Message):
    """API для админ-панели: полная статистика в JSON (последние 30 дней)"""
    if message.from_user.id not in ADMINS:
        return

    orders = _load_json(ORDERS_FILE, [])
    now = now_magadan()
    start_date = now - timedelta(days=30)

    def _created(o):
        try:
            return datetime.fromisoformat(o.get("created_at"))
        except (TypeError, ValueError):
            return None

    recent_orders = [o for o in orders
                     if _created(o) and _created(o) >= start_date
                     and o.get("status") != "cancel"]

    # Группируем по датам
    by_date = {}
    for o in recent_orders:
        date_str = _created(o).date().isoformat()
        if date_str not in by_date:
            by_date[date_str] = {"orders": 0, "revenue": 0}
        by_date[date_str]["orders"] += 1
        by_date[date_str]["revenue"] += int(o.get("total") or 0)

    # Топ товаров
    product_sales = {}
    for o in recent_orders:
        items_text = o.get("items", "")
        for line in items_text.split("\n"):
            if line.strip().startswith(("•", "▪")):
                # Парсим: "• ТОВАР · 1 000₽ × 2 = 2 000₽"
                clean = line.lstrip("•▪️ ").strip()
                parts = clean.split("·")
                if len(parts) > 0:
                    name = parts[0].strip()
                    if name not in product_sales:
                        product_sales[name] = 0
                    product_sales[name] += 1

    top_products = sorted(product_sales.items(), key=lambda x: x[1], reverse=True)[:10]

    # Статистика клиентов
    customer_stats = {}
    for o in recent_orders:
        uid = str(o.get("user_id", "unknown"))
        if uid not in customer_stats:
            customer_stats[uid] = {"orders": 0, "spent": 0}
        customer_stats[uid]["orders"] += 1
        customer_stats[uid]["spent"] += int(o.get("total") or 0)

    top_customers = sorted(customer_stats.items(),
                          key=lambda x: x[1]["spent"],
                          reverse=True)[:10]

    # Подготавливаем ответ
    total_revenue = sum(int(o.get("total") or 0) for o in recent_orders)
    avg_check = total_revenue // len(recent_orders) if recent_orders else 0

    response = {
        "status": "ok",
        "period": "30d",
        "summary": {
            "total_orders": len(recent_orders),
            "total_revenue": total_revenue,
            "avg_check": avg_check,
            "unique_customers": len(customer_stats),
        },
        "by_date": by_date,
        "top_products": [{"name": p[0], "sales": p[1]} for p in top_products],
        "top_customers": [{"id": c[0], "orders": c[1]["orders"], "spent": c[1]["spent"]} for c in top_customers],
    }

    # Отправляем JSON
    await message.answer(
        f"<code>{json.dumps(response, ensure_ascii=False, indent=2)}</code>",
        parse_mode="HTML"
    )


@dp.message(Command("api_daily"))
async def cmd_api_daily(message: types.Message):
    """API: графические данные по дням (последние 30 дней)"""
    if message.from_user.id not in ADMINS:
        return

    orders = _load_json(ORDERS_FILE, [])
    now = now_magadan()
    start_date = now - timedelta(days=30)

    def _created(o):
        try:
            return datetime.fromisoformat(o.get("created_at"))
        except (TypeError, ValueError):
            return None

    recent_orders = [o for o in orders
                     if _created(o) and _created(o) >= start_date
                     and o.get("status") != "cancel"]

    # Заполняем все дни (даже с нулями)
    data = []
    for i in range(30, -1, -1):
        date = (now - timedelta(days=i)).date()
        date_str = date.isoformat()

        day_orders = [o for o in recent_orders
                     if _created(o).date() == date]
        revenue = sum(int(o.get("total") or 0) for o in day_orders)

        data.append({
            "date": date_str,
            "orders": len(day_orders),
            "revenue": revenue,
        })

    response = {"status": "ok", "data": data}

    await message.answer(
        f"<code>{json.dumps(response, ensure_ascii=False, indent=2)}</code>",
        parse_mode="HTML"
    )


@dp.message(Command("api_vpn"))
async def cmd_api_vpn(message: types.Message):
    """API: статистика VPN-подписок"""
    if message.from_user.id not in ADMINS:
        return

    vpn_subs = _load_json(VPN_SUBS_FILE, {})
    now = now_magadan()

    active = []
    expiring = []
    expired = []

    for email, sub in vpn_subs.items():
        try:
            expiry = datetime.fromisoformat(sub.get("expiry"))
        except (TypeError, ValueError):
            continue

        if expiry > now:
            active.append(email)
            if expiry <= now + timedelta(days=7):
                expiring.append({"email": email, "days_left": (expiry - now).days})
        else:
            expired.append(email)

    response = {
        "status": "ok",
        "summary": {
            "active": len(active),
            "expiring_soon": len(expiring),
            "expired": len(expired),
        },
        "expiring": expiring,
    }

    await message.answer(
        f"<code>{json.dumps(response, ensure_ascii=False, indent=2)}</code>",
        parse_mode="HTML"
    )


# ═════════════════════════════════════════════════════════════════════════════
# РЕФЕРРАЛЬНАЯ ПРОГРАММА
# ═════════════════════════════════════════════════════════════════════════════

# ═════════════════════════════════════════════════════════════════════════════
# VIP И ЛОЯЛЬНОСТЬ
# ═════════════════════════════════════════════════════════════════════════════

@dp.message(Command("vip"))
async def cmd_vip(message: types.Message):
    """Просмотр VIP статуса и активация"""
    uid = str(message.from_user.id)
    vip = get_vip_status(uid)
    tier_key, tier = get_loyalty_tier(_load_bonuses()["users"].get(uid, {}).get("orders", 0))

    if vip["active"]:
        text = (
            f"👑 <b>VIP Статус АКТИВЕН</b>\n\n"
            f"⏰ Действует ещё <b>{vip['days_left']} дней</b>\n"
            f"📅 До: {vip['expiry'][:10]}\n\n"
            f"✨ <b>Преимущества VIP</b>\n"
            f"├ Скидка 5% на каждый заказ\n"
            f"├ Приоритет доставки\n"
            f"├ +50 баллов за каждый заказ\n"
            f"└ Ранний доступ к новым товарам\n\n"
            f"💰 Стоимость: 299₽/месяц"
        )
    else:
        text = (
            f"👑 <b>VIP Статус</b>\n\n"
            f"❌ Статус не активен\n\n"
            f"✨ <b>Получи VIP за</b>\n"
            f"├ 💳 299₽/месяц\n"
            f"├ 📦 10 заказов (бесплатно)\n"
            f"└ 💎 1000 баллов\n\n"
            f"<b>Преимущества:</b>\n"
            f"├ -5% на каждый заказ\n"
            f"├ Приоритет доставки\n"
            f"├ +50 баллов за заказ\n"
            f"└ Ранний доступ к новинкам"
        )

    await message.answer(text)


# ═════════════════════════════════════════════════════════════════════════════
# FAQ И ГАЙДЫ
# ═════════════════════════════════════════════════════════════════════════════

FAQ_DATA = {
    "order": {
        "emoji": "📦",
        "title": "Как оформить заказ?",
        "answer": (
            "1. Нажми кнопку 🛍️ в меню\n"
            "2. Выбери товары и добавь в корзину\n"
            "3. Нажми 'Оформить заказ'\n"
            "4. Заполни свои данные\n"
            "5. Выбери способ доставки и оплаты\n"
            "6. Подтверди заказ\n\n"
            "Готово! Мы свяжемся с тобой в течение 15 минут."
        )
    },
    "payment": {
        "emoji": "💳",
        "title": "Какие способы оплаты?",
        "answer": (
            "Мы принимаем:\n"
            "├ 💵 Наличные при получении\n"
            "├ 💰 Переводы (QIWI, Яндекс.Касса)\n"
            "├ 🏦 Банковские переводы\n"
            "└ 💎 Баллы (списать со своего баланса)\n\n"
            "Выбирай удобный способ при оформлении."
        )
    },
    "delivery": {
        "emoji": "🚚",
        "title": "Как долго доставка?",
        "answer": (
            "Доставка в Магадане:\n"
            "├ 🚲 Самовывоз: 30 минут\n"
            "├ 🚚 Курьер (день): завтра к 18:00\n"
            "├ 📦 Почта: 2-3 дня\n"
            "└ 🚁 Срочная: 2 часа (+200₽)\n\n"
            "Бесплатная доставка от 2000₽!"
        )
    },
    "return": {
        "emoji": "↩️",
        "title": "Можно ли вернуть товар?",
        "answer": (
            "Да, вернём товар если:\n"
            "├ 🏷️ Заводская упаковка целая\n"
            "├ 🕐 Прошло не более 14 дней\n"
            "├ ✅ Товар без повреждений\n"
            "└ 📋 Есть чек\n\n"
            "Верни товар, вернём деньги за 2 дня.\n"
            "Напиши @BORO_DOTA в Telegram."
        )
    },
    "points": {
        "emoji": "💎",
        "title": "Как копить баллы?",
        "answer": (
            "Способы получить баллы:\n"
            "├ 💰 За заказ: +5% от суммы\n"
            "├ 🎁 За реферала: +200 баллов\n"
            "├ ⭐ За отзыв: +50 баллов\n"
            "├ 🎂 День рождения: +100 баллов\n"
            "└ 📅 Каждый месяц: +10 баллов\n\n"
            "Мин. 100 баллов = 100₽ скидка.\n"
            "Макс. списать: 20% от суммы."
        )
    },
    "vip": {
        "emoji": "👑",
        "title": "Что такое VIP?",
        "answer": (
            "VIP дает:\n"
            "├ 💰 Скидка 5% на каждый заказ\n"
            "├ 🚚 Приоритет доставки (1 час)\n"
            "├ 💎 +50 баллов вместо +10\n"
            "├ 🆕 Ранний доступ к новому\n"
            "└ 👨‍💼 Персональный менеджер\n\n"
            "Стоимость: 299₽/месяц\n"
            "Или: 10 заказов → VIP бесплатно!"
        )
    },
    "referral": {
        "emoji": "🎁",
        "title": "Как пригласить друга?",
        "answer": (
            "Напиши /ref — получи реферальную ссылку.\n\n"
            "Твой друг по ней зарегистрируется → оба получите:\n"
            "├ -50₽ на первый заказ друга\n"
            "├ Ты получишь +200 баллов\n"
            "└ Друг получит +50 баллов\n\n"
            "Без ограничений — зовите сколько хотите!"
        )
    },
}

@dp.message(Command("faq"))
async def cmd_faq(message: types.Message):
    """Часто задаваемые вопросы"""
    buttons = []
    for key, item in FAQ_DATA.items():
        buttons.append([
            InlineKeyboardButton(
                text=f"{item['emoji']} {item['title'][:30]}",
                callback_data=f"faq_{key}"
            )
        ])

    markup = InlineKeyboardMarkup(inline_keyboard=buttons)
    await message.answer(
        "❓ <b>Часто задаваемые вопросы</b>\n\n"
        "Нажми на вопрос чтобы увидеть ответ:",
        reply_markup=markup
    )


@dp.callback_query(lambda c: c.data.startswith("faq_"))
async def faq_answer(callback: types.CallbackQuery):
    """Ответ на FAQ вопрос"""
    key = callback.data.split("_", 1)[1]
    item = FAQ_DATA.get(key)
    if item:
        await callback.message.answer(
            f"{item['emoji']} <b>{item['title']}</b>\n\n{item['answer']}"
        )
    await callback.answer()


@dp.message(Command("challenges"))
async def cmd_challenges(message: types.Message):
    """Ежемесячные вызовы"""
    challenges = _load_json(CHALLENGES_FILE, {}).get("active_challenges", {})

    text = f"🎯 <b>Июльские вызовы</b>\n\n"

    for key, ch in challenges.items():
        text += (
            f"<b>{ch.get('name', 'Unknown')}</b>\n"
            f"📝 {ch.get('description', '')}\n"
            f"🎁 Награда: "
        )

        if ch.get("reward_type") == "discount":
            text += f"-{ch.get('reward_value', 0)}₽ скидка"
        elif ch.get("reward_type") == "vip":
            text += f"VIP на {ch.get('reward_days', 7)} дней"
        else:
            text += f"+{ch.get('reward', 0)} баллов"

        text += f"\n\n"

    text += (
        f"<i>Вызовы обновляются каждый месяц.\n"
        f"Выполни все и получи максимум наград!</i>"
    )

    await message.answer(text)


@dp.message(Command("badges"))
async def cmd_badges(message: types.Message):
    """Просмотр бейджей пользователя"""
    uid = message.from_user.id
    badges = get_user_badges(uid)
    data = _load_bonuses()
    user = data["users"].get(str(uid), {})

    tier_key, tier = get_loyalty_tier(user.get("orders", 0))

    text = f"⭐ <b>Твои Достижения</b>\n\n"

    if tier_key:
        text += f"<b>Уровень лояльности: {tier['name']}</b>\n"
        text += f"Статус: {tier['perks']}\n"
        text += f"Заказов: {user.get('orders', 0)}\n\n"

    if badges:
        text += "<b>Бейджи:</b>\n"
        for badge_key in badges:
            badge = BADGES.get(badge_key, {})
            text += f"├ {badge.get('emoji', '🏆')} {badge.get('name', 'Unknown')}\n"
    else:
        text += "<i>Пока нет бейджей. Начни с первого заказа!</i>\n"

    text += f"\n<i>Всего заказов: {user.get('orders', 0)}</i>"

    await message.answer(text)


@dp.message(Command("discount"))
async def cmd_discount(message: types.Message):
    """Показать текущие скидки пользователя"""
    uid = str(message.from_user.id)
    data = _load_bonuses()
    user = data["users"].get(uid, {})

    orders_count = user.get("orders", 0)
    tier_key, tier = get_loyalty_tier(orders_count)
    vip_status = get_vip_status(int(uid))

    text = "💰 <b>Твои Скидки и Бонусы</b>\n\n"

    # Показываем текущую скидку по лояльности
    if tier_key:
        discount_pct = int(tier["discount"] * 100)
        text += f"<b>Уровень лояльности: {tier['name']}</b>\n"
        text += f"├ Скидка: <b>-{discount_pct}%</b> на все товары\n"
        text += f"├ Бонусы: +{discount_pct}% баллов за заказ\n"
        text += f"└ Преимущества: {tier['perks']}\n\n"
    else:
        text += f"<b>Уровень лояльности:</b> Нет (начни с первого заказа)\n"
        text += f"├ Скидка: базовая -0%\n"
        text += f"└ Бонусы: +5% баллов за заказ\n\n"

    # Показываем VIP статус
    if vip_status["active"]:
        text += f"<b>👑 VIP Статус: АКТИВЕН</b>\n"
        text += f"├ Скидка: <b>дополнительно -5%</b>\n"
        text += f"├ Действует: {vip_status['days_left']} дней\n"
        text += f"└ Бонусы: +50 баллов за заказ\n\n"
    else:
        text += f"<b>👑 VIP Статус:</b> Не активен\n"
        text += f"├ Активирай за 299₽/месяц или сделай 10 заказов\n"
        text += f"└ Дополнительная скидка: -5%\n\n"

    # Итоговая скидка
    total_discount = 0
    if tier_key:
        total_discount += int(tier["discount"] * 100)
    if vip_status["active"]:
        total_discount += 5

    text += f"📊 <b>Итоговая скидка: -{total_discount}%</b> (может быть меньше за счёт акций)\n\n"

    # Прогресс к следующему уровню
    if tier_key != "platinum":
        for tier_name, tier_info in LOYALTY_TIERS.items():
            if tier_info["orders"] > orders_count:
                needed = tier_info["orders"] - orders_count
                text += f"⏳ <b>До {tier_info['name']}:</b> ещё {needed} заказов\n"
                break
    else:
        text += f"✅ <b>Максимальный уровень достигнут!</b>\n"

    await message.answer(text)


@dp.message(Command("ref"))
async def cmd_ref(message: types.Message):
    """Получить реферальную ссылку и статистику приглашённых"""
    uid = str(message.from_user.id)
    bonuses = _load_json(BONUSES_FILE, {})
    my_data = bonuses.get(uid, {})

    # Кодируем ID для ссылки (base36 или hex для удобства)
    ref_code = format(message.from_user.id, 'x')[:8]
    ref_url = f"https://t.me/{BOT_USERNAME}?start=ref_{message.from_user.id}"

    # Статистика: кто был приглашён
    referred = my_data.get("referred", [])
    referred_count = len(referred)

    # Подсчитываем, сколько приглашённых сделали первый заказ
    active_referred = 0
    for ref_id in referred:
        ref_data = bonuses.get(str(ref_id), {})
        if ref_data.get("first_order_completed"):
            active_referred += 1

    text = (
        f"🎁 <b>Твоя реферальная ссылка</b>\n\n"
        f"<code>{ref_url}</code>\n\n"
        f"📊 <b>Статистика</b>\n"
        f"├ Всего приглашено: <b>{referred_count}</b>\n"
        f"├ Активных (сделали заказ): <b>{active_referred}</b>\n"
        f"└ Твоя награда за активных: <b>+{active_referred * REFERRAL_REWARD} баллов</b>\n\n"
        f"<i>Приведи друга по ссылке — получите оба скидку 50₽ на первый заказ!</i>"
    )

    await message.answer(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="📋 Скопировать ссылку", callback_data="copy_ref_link")],
            [InlineKeyboardButton(text="📱 Поделиться в Telegram", url=f"https://t.me/share/url?url={ref_url}&text=Присоединяйся%20к%20VAPEBAZAR!")],
        ])
    )


@dp.callback_query(lambda c: c.data == "copy_ref_link")
async def copy_ref_link(callback: types.CallbackQuery):
    """Копирование реферальной ссылки"""
    uid = str(callback.from_user.id)
    ref_url = f"https://t.me/{BOT_USERNAME}?start=ref_{callback.from_user.id}"

    await callback.answer("✅ Ссылка скопирована в буфер обмена!", show_alert=False)
    # Telegram WebApp может скопировать в буфер обмена
    # Здесь мы просто показываем уведомление


# ═════════════════════════════════════════════════════════════════════════════
# УПРАВЛЕНИЕ БАЛЛАМИ И БОНУСАМИ
# ═════════════════════════════════════════════════════════════════════════════

@dp.message(Command("bonus"))
async def cmd_bonus(message: types.Message):
    if message.from_user.id not in ADMINS:
        return
    args = (message.text or "").split()
    if len(args) < 2:
        await message.answer(
            "💎 <b>Баллы клиента</b>\n\n"
            "Использование: <code>/bonus &lt;telegram_id&gt;</code>\n"
            "ID клиента есть в карточке заказа (поле «ID»)."
        )
        return
    uid = args[1].lstrip("@")
    data = _load_bonuses()
    u = data["users"].get(str(uid))
    if not u:
        await message.answer(f"По клиенту <code>{uid}</code> данных пока нет (не было подтверждённых заказов).")
        return
    ref_txt = u.get("referred_by") or "—"
    name = (u.get("name") or "").strip()
    uname = u.get("username")
    who = (f"{name} " if name else "") + (f"@{uname}" if uname else "")
    await message.answer(
        f"💎 <b>Клиент {who or uid}</b>\n"
        f"├ ID: <code>{uid}</code>\n"
        f"├ Баланс баллов: <b>{_fmt_money(u.get('balance', 0))}</b>\n"
        f"├ Сумма покупок: <b>{_fmt_money(u.get('spent', 0))} ₽</b>\n"
        f"├ Заказов оплачено: <b>{u.get('orders', 0)}</b>\n"
        f"├ Пригласил его: <code>{ref_txt}</code>\n"
        f"└ Реф-награда выдана: {'да' if u.get('ref_rewarded') else 'нет'}"
    )


@dp.message(Command("bonus_add"))
async def cmd_bonus_add(message: types.Message):
    """Ручная корректировка баланса: /bonus_add <id> <сумма> (сумма может быть отрицательной)."""
    if message.from_user.id not in ADMINS:
        return
    args = (message.text or "").split()
    if len(args) < 3:
        await message.answer(
            "✏️ <b>Изменить баллы клиента</b>\n\n"
            "Использование: <code>/bonus_add &lt;telegram_id&gt; &lt;сумма&gt;</code>\n"
            "Пример: <code>/bonus_add 6163521938 500</code> — добавить 500.\n"
            "Отрицательная сумма — списать: <code>/bonus_add 6163521938 -200</code>."
        )
        return
    uid = args[1].lstrip("@")
    delta = _safe_int(args[2], None)
    if delta is None:
        await message.answer("❌ Сумма должна быть числом, например 500 или -200.")
        return
    async with _bonus_lock:
        data = _load_bonuses()
        u = _ensure_user(data, uid)
        u["balance"] = max(0, u["balance"] + delta)
        _save_bonuses(data)
    await message.answer(
        f"✅ Баланс клиента <code>{uid}</code> изменён на {'+' if delta >= 0 else ''}{_fmt_money(delta)}.\n"
        f"💼 Текущий баланс: <b>{_fmt_money(u['balance'])}</b> баллов."
    )
    # сообщим клиенту, если это начисление
    if delta > 0:
        try:
            await bot.send_message(
                chat_id=int(uid),
                text=(f"💎 Вам начислено <b>+{_fmt_money(delta)}</b> баллов!\n"
                      f"💼 Баланс: <b>{_fmt_money(u['balance'])}</b> баллов.")
            )
        except Exception:
            pass


@dp.message(F.text == "📞 Контакты")
async def show_contacts(message: types.Message):
    await message.answer(f"<b>По всем вопросам, опту и предложениям:</b>\nДиректор Enterprise: @{MANAGER_USERNAME}")

@dp.message(F.text == "ℹ️ О магазине")
async def show_about(message: types.Message):
    await message.answer(
        "<b>VAPEBAZAR PREMIUM ENTERPRISE</b>\n"
        "📍 Быстрая доставка и самовывоз в г. Магадан.\n"
        "⚡ Только оригинальные под-системы, премиальные жидкости и расходники."
    )

@dp.message(F.text == "💎 Мои баллы")
async def show_my_bonuses(message: types.Message):
    data = _load_bonuses()
    u = data["users"].get(str(message.from_user.id))
    bal = u.get("balance", 0) if u else 0
    spent = u.get("spent", 0) if u else 0
    orders = u.get("orders", 0) if u else 0
    if bal == 0 and orders == 0:
        await message.answer(
            "💎 <b>Ваши баллы</b>\n\n"
            "Пока баллов нет. Они начисляются <b>5%</b> с каждого оплаченного заказа "
            "и копятся автоматически — потратите их на скидку в следующий раз.\n\n"
            "👇 Сделайте первый заказ в магазине!",
            reply_markup=get_main_keyboard()
        )
        return
    await message.answer(
        f"💎 <b>Ваши баллы</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"💼 Баланс: <b>{_fmt_money(bal)}</b> баллов\n"
        f"🛒 Покупок на: <b>{_fmt_money(spent)} ₽</b>\n"
        f"📦 Оплачено заказов: <b>{orders}</b>\n\n"
        f"<i>Баллами можно оплатить до 20% заказа прямо в корзине.</i>",
        reply_markup=get_main_keyboard()
    )

@dp.message(F.text == "🎁 Пригласить друга")
async def show_referral_panel(message: types.Message):
    uid = message.from_user.id
    link = f"https://t.me/{BOT_USERNAME}?startapp=ref_{uid}"
    st = referral_stats(uid)
    share_kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="📤 Отправить другу",
            url=f"https://t.me/share/url?url={link}&text="
                "Лови скидку 5% в VAPEBAZAR PREMIUM 🔥 Жми на ссылку!"
        )
    ]])
    await message.answer(
        f"🎁 <b>Реферальная программа</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"Приглашай друзей и зарабатывай баллы:\n"
        f"├ Друг получает <b>−5%</b> на первый заказ\n"
        f"└ Тебе <b>+{REFERRAL_REWARD} баллов</b> после его первого оплаченного заказа\n\n"
        f"🔗 <b>Твоя ссылка:</b>\n<code>{link}</code>\n\n"
        f"📊 <b>Твоя статистика</b>\n"
        f"├ Перешли по ссылке: <b>{st['invited']}</b>\n"
        f"├ Сделали заказ: <b>{st['rewarded']}</b>\n"
        f"└ Твой баланс: <b>{_fmt_money(st['balance'])}</b> баллов\n\n"
        f"<i>Нажми кнопку ниже — друг откроет магазин со скидкой автоматически.</i>",
        reply_markup=share_kb
    )

@dp.message(F.text == "🛍️ Мои заказы")
async def show_my_orders(message: types.Message):
    await message.answer(
        "🛍️ <b>Мои заказы</b>\n\n"
        "История ваших заказов хранится в Mini App:\n"
        "нажмите «📱 Открыть Магазин / Корзину» → вкладка <b>Профиль</b> → <b>История заказов</b>.\n\n"
        f"По вопросам текущего заказа пишите: @{MANAGER_USERNAME}"
    )

# ── FAQ АВТООТВЕТ ──
# Перехватываем типовые вопросы до fallback-хэндлера.
# Ключи — наборы подстрок; достаточно совпадения любой одной.
_FAQ = [
    {
        "keys": ["оплат", "платить", "платёж", "перевод", "наличн", "безнал", "карт", "сбер", "тинькоф", "qr"],
        "answer": (
            "💳 <b>Оплата</b>\n\n"
            "Принимаем:\n"
            "├ Наличными при получении\n"
            "├ Переводом на карту (СБП)\n"
            "└ QR-код — скинем при подтверждении заказа\n\n"
            "Для iPhone, MacBook и консолей — предоплата 50% при заказе, остаток при получении."
        ),
    },
    {
        "keys": ["самовыво", "забра", "адрес", "где нахо", "офис", "магазин", "точка"],
        "answer": (
            "📍 <b>Самовывоз — г. Магадан</b>\n\n"
            "Адрес уточняйте у менеджера при оформлении заказа — точка выдачи согласовывается индивидуально.\n\n"
            f"📞 @{MANAGER_USERNAME}"
        ),
    },
    {
        "keys": ["доставк", "курьер", "привез", "привоз", "развоз"],
        "answer": (
            "🚚 <b>Доставка — г. Магадан</b>\n\n"
            "├ Стоимость: <b>250 ₽</b>\n"
            "├ Бесплатно при заказе от <b>2 000 ₽</b>\n"
            "└ Время согласовывается с менеджером\n\n"
            "Техника из Дубая (iPhone, MacBook и т.д.) — доставка <b>7–14 дней</b> после предоплаты."
        ),
    },
    {
        "keys": ["сколько жда", "когда прид", "срок", "дней", "время заказ", "как долго"],
        "answer": (
            "⏱ <b>Сроки</b>\n\n"
            "<b>Вейп, жидкости, расходники</b> — в наличии, доставка в день заказа или на следующий день.\n\n"
            "<b>iPhone, MacBook, Samsung, Apple Watch, консоли</b> — под заказ из Дубая:\n"
            "├ Предоплата 50%\n"
            "└ Срок: <b>7–14 рабочих дней</b>\n\n"
            "Точный срок сообщит менеджер после подтверждения."
        ),
    },
    {
        "keys": ["гарант", "оригинал", "подделк", "настоящ", "подлинн"],
        "answer": (
            "✅ <b>Гарантия и оригинальность</b>\n\n"
            "Вся техника (iPhone, MacBook, Samsung и др.) — <b>100% оригинал</b> из официальных каналов в ОАЭ.\n"
            "├ Новые, запечатанные\n"
            "├ Не активированные\n"
            "└ Гарантия Apple/Samsung по серийному номеру\n\n"
            "По вейп-оборудованию — только оригиналы от официальных поставщиков."
        ),
    },
    {
        "keys": ["возврат", "обмен", "не подошл", "брак", "сломал", "не работа"],
        "answer": (
            "🔄 <b>Обмен и возврат</b>\n\n"
            "Если товар пришёл с браком или не соответствует описанию — решаем вопрос.\n\n"
            f"Напиши менеджеру с фото/видео проблемы: @{MANAGER_USERNAME}\n\n"
            "Рассматриваем каждый случай индивидуально — не бросаем."
        ),
    },
    {
        "keys": ["балл", "скидк", "бонус", "накопи", "кэшбэк", "промокод"],
        "answer": (
            "💎 <b>Бонусная программа</b>\n\n"
            "├ За каждый заказ — <b>5% бонусами</b>\n"
            "├ Баллами оплачивай до <b>20%</b> следующего заказа\n"
            "├ Промокод для новичков: <b>НОВИЧОК10</b> — скидка 10%\n"
            "└ Уровни: Бронза → Серебро → Золото → Платина (бонус растёт)\n\n"
            "Баллы и баланс — кнопка «💎 Мои баллы» в меню."
        ),
    },
    {
        "keys": ["реферал", "пригласи", "друг", "ссылк", "партнёр", "партнер"],
        "answer": (
            "🎁 <b>Реферальная программа</b>\n\n"
            "Приглашай друзей и зарабатывай:\n"
            "├ Друг получает <b>−5%</b> на первый заказ\n"
            "└ Тебе <b>+200 баллов</b> после его первой покупки\n\n"
            "Свою реферальную ссылку найдёшь в кнопке «🎁 Пригласить друга» в меню."
        ),
    },
    {
        "keys": ["iphone", "айфон", "макбук", "macbook", "airpod", "эирподс", "watch", "вотч", "samsung", "самсунг", "s25", "galaxy", "playstation", "ps5", "nintendo", "switch"],
        "answer": (
            "📱 <b>Техника под заказ из Дубая</b>\n\n"
            "Продаём оригинальные:\n"
            "├ 🍏 iPhone, MacBook, AirPods, Apple Watch\n"
            "├ 📱 Samsung Galaxy, Galaxy Watch\n"
            "└ 🎮 PlayStation 5, Nintendo Switch 2\n\n"
            "Все товары в каталоге магазина — жми «📱 Открыть Магазин».\n"
            "Нет нужной модели? Напиши — найдём и предложим цену.\n\n"
            f"📞 @{MANAGER_USERNAME}"
        ),
    },
    {
        "keys": ["работа", "час", "режим", "расписани", "выходн", "открыт"],
        "answer": (
            "🕐 <b>Режим работы</b>\n\n"
            "Заказы принимаем <b>ежедневно с 10:00 до 22:00</b> по МСК+9 (Магадан).\n\n"
            "Сообщения вне этого времени — ответим утром.\n"
            f"📞 @{MANAGER_USERNAME}"
        ),
    },
]

def _match_faq(text: str):
    """Ищем совпадение по ключевым словам. Возвращает ответ или None."""
    t = text.lower()
    for item in _FAQ:
        if any(k in t for k in item["keys"]):
            return item["answer"]
    return None

@dp.message(Command("top"))
async def cmd_top(message: types.Message):
    """Топ-10 товаров по количеству упоминаний в заказах."""
    if message.from_user.id not in ADMINS:
        return
    orders = _load_json(ORDERS_FILE, [])
    if not orders:
        await message.answer("📊 Заказов пока нет.")
        return
    from collections import Counter
    counter = Counter()
    for o in orders:
        if o.get("status") == "cancel":
            continue
        for line in (o.get("items") or "").split("\n"):
            stripped = line.strip()
            if not stripped:
                continue
            # Пропускаем строки кол-ва/итога (начинаются с цифры или эмодзи)
            if not stripped.startswith(("•", "▪")):
                continue
            clean = stripped.lstrip("•▪️️ ")
            # Берём имя товара до ·, [, — или ×
            name = clean.split("·")[0].split("[")[0].split("—")[0].split("×")[0].strip()
            if 3 < len(name) < 60:
                counter[name] += 1
    if not counter:
        await message.answer("📊 Заказы найдены, но состав товаров пока не записан.\n"
                             "Он запишется автоматически при следующем нажатии «Принять» на новых заказах.")
        return
    medals = ["🥇", "🥈", "🥉"]
    lines = ["🏆 <b>Топ товаров</b>", "━━━━━━━━━━━━━━━━━━━━━━━━"]
    for i, (name, cnt) in enumerate(counter.most_common(10), 1):
        pref = medals[i - 1] if i <= 3 else f"{i}."
        lines.append(f"{pref} {name} — <b>{cnt}</b> раз")
    await message.answer("\n".join(lines))


@dp.message(Command("export"))
async def cmd_export(message: types.Message):
    """Выгружает журнал заказов в CSV и отправляет файлом."""
    if message.from_user.id not in ADMINS:
        return
    orders = _load_json(ORDERS_FILE, [])
    if not orders:
        await message.answer("📭 Журнал заказов пуст.")
        return
    output = io.StringIO()
    fields = ["order_id", "created_at", "total", "status_label", "name", "phone", "address", "items", "customer_id"]
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for o in orders:
        row = {f: str(o.get(f, "")).replace("\n", " | ") for f in fields}
        writer.writerow(row)
    csv_bytes = ("﻿" + output.getvalue()).encode("utf-8")  # BOM для Excel
    fname = f"orders_{now_magadan().strftime('%Y%m%d_%H%M')}.csv"
    doc = types.BufferedInputFile(csv_bytes, filename=fname)
    await message.answer_document(doc, caption=f"📁 Экспорт <b>{len(orders)}</b> заказов")


@dp.message(Command("birthday"))
async def cmd_birthday(message: types.Message):
    """Пользователь сохраняет дату рождения: /birthday ДД.ММ"""
    args = (message.text or "").split()
    if len(args) < 2:
        await message.answer(
            "🎂 <b>День рождения</b>\n\n"
            "Укажи дату: <code>/birthday ДД.ММ</code>\n"
            "Например: <code>/birthday 15.03</code>\n\n"
            "В день рождения тебя ждёт подарок от VAPEBAZAR 🎁"
        )
        return
    date_str = args[1].strip()
    try:
        parts = date_str.split(".")
        day, month = int(parts[0]), int(parts[1])
        assert 1 <= day <= 31 and 1 <= month <= 12
        formatted = f"{day:02d}.{month:02d}"
    except Exception:
        await message.answer("❌ Неверный формат. Пример: <code>/birthday 15.03</code>")
        return
    subs = _load_json(SUBSCRIBERS_FILE, {})
    uid = str(message.from_user.id)
    if uid not in subs:
        subs[uid] = {"name": message.from_user.first_name or "", "username": message.from_user.username or "", "ts": now_magadan().isoformat(timespec="seconds")}
    subs[uid]["birthday"] = formatted
    _save_json(SUBSCRIBERS_FILE, subs)
    await message.answer(f"🎂 День рождения сохранён: <b>{formatted}</b>\nВ этот день тебя ждёт подарок от VAPEBAZAR! 🎁")


@dp.message(Command("restock"))
async def cmd_restock(message: types.Message):
    """Админ отмечает поступление товара — оповещаем всех, кто ждал."""
    if message.from_user.id not in ADMINS:
        return
    product_name = message.text.partition(" ")[2].strip()
    if not product_name:
        notify_reqs = _load_json(NOTIFY_FILE, {})
        if notify_reqs:
            items_list = "\n".join(f"• {k} ({len(v)} чел.)" for k, v in list(notify_reqs.items())[:15])
            await message.answer(
                "📦 <b>Поступление товара</b>\n\n"
                f"Использование: <code>/restock Название товара</code>\n\n"
                f"<b>Ожидают поступления:</b>\n{items_list}"
            )
        else:
            await message.answer(
                "📦 <b>Поступление товара</b>\n\n"
                "Использование: <code>/restock Название товара</code>\n"
                "Пока нет запросов на уведомление."
            )
        return
    notify_reqs = _load_json(NOTIFY_FILE, {})
    query = product_name.lower()
    matching_users = set()
    matched_keys = []
    for key, users in notify_reqs.items():
        if query in key or key in query:
            matched_keys.append(key)
            matching_users.update(users)
    if not matching_users:
        await message.answer(f"🔕 Нет запросов на «{product_name}».")
        return
    await message.answer(f"📢 Оповещаю {len(matching_users)} пользователей о поступлении «{product_name}»…")
    sent = failed = 0
    for uid in matching_users:
        try:
            await bot.send_message(
                chat_id=int(uid),
                text=(
                    f"🔔 <b>Товар появился в наличии!</b>\n\n"
                    f"<b>{product_name}</b> — снова есть! 🎉\n"
                    f"Заходи в магазин и оформляй заказ 🛒"
                ),
                reply_markup=get_main_keyboard()
            )
            sent += 1
        except Exception as e:
            failed += 1
            logger.warning(f"restock notify → {uid}: {e}")
        await asyncio.sleep(0.05)
    for key in matched_keys:
        notify_reqs.pop(key, None)
    _save_json(NOTIFY_FILE, notify_reqs)
    await message.answer(f"✅ Отправлено: {sent}, не доставлено: {failed}")


# ═════════════════════════════════════════════════════════════════════════════
# ИНЛАЙН КНОПКИ МЕНЮ (cmd_bonus, cmd_vip, и т.д.)
# ═════════════════════════════════════════════════════════════════════════════

@dp.callback_query(lambda c: c.data.startswith("cmd_"))
async def handle_menu_buttons(callback: types.CallbackQuery):
    """Обработчик инлайн кнопок меню"""
    uid = callback.from_user.id

    # Инлайн кнопки для быстрого доступа к командам
    cmd_map = {
        "cmd_bonus": cmd_bonus,
        "cmd_vip": cmd_vip,
        "cmd_badges": cmd_badges,
        "cmd_discount": cmd_discount,
        "cmd_ref": cmd_ref,
        "cmd_challenges": cmd_challenges,
        "cmd_faq": cmd_faq,
        "cmd_birthday": cmd_birthday,
    }

    cmd_name = callback.data
    if cmd_name in cmd_map:
        # Создаём fake message object для вызова функции команды
        fake_msg = types.Message(
            message_id=0,
            date=0,
            chat=types.Chat(id=uid, type="private"),
            from_user=callback.from_user,
            text=f"/{cmd_name.replace('cmd_', '')}"
        )
        try:
            await cmd_map[cmd_name](fake_msg)
        except Exception as e:
            logger.error(f"Error in menu button {cmd_name}: {e}")
            await callback.answer("❌ Ошибка при выполнении команды", show_alert=True)

    await callback.answer()


# ── ОБРАБОТЧИК ТЕКСТОВЫХ КНОПОК ──
@dp.message(F.text)
async def handle_text_buttons(message: types.Message):
    """Обработчик текстовых кнопок главного меню"""
    remember_user(message.from_user)
    text = message.text or ""

    # Маппирование текстовых кнопок на команды
    button_map = {
        "💎 Баллы": "/bonus",
        "👑 VIP": "/vip",
        "🏆 Бейджи": "/badges",
        "🎯 Скидки": "/discount",
        "🎁 Рефереллы": "/ref",
        "🎪 Вызовы": "/challenges",
        "❓ FAQ": "/faq",
        "🎂 День рождения": "/birthday",
        "📦 Мои заказы": "/orders",
        "📞 Контакты": "/contacts",
    }

    if text in button_map:
        # Создаём fake message с командой
        fake_msg = types.Message(
            message_id=0,
            date=0,
            chat=types.Chat(id=message.from_user.id, type="private"),
            from_user=message.from_user,
            text=button_map[text]
        )
        # Перенаправляем на обработчик команды
        if button_map[text] == "/bonus":
            await cmd_bonus(fake_msg)
        elif button_map[text] == "/vip":
            await cmd_vip(fake_msg)
        elif button_map[text] == "/badges":
            await cmd_badges(fake_msg)
        elif button_map[text] == "/discount":
            await cmd_discount(fake_msg)
        elif button_map[text] == "/ref":
            await cmd_ref(fake_msg)
        elif button_map[text] == "/challenges":
            await cmd_challenges(fake_msg)
        elif button_map[text] == "/faq":
            await cmd_faq(fake_msg)
        elif button_map[text] == "/birthday":
            await cmd_birthday(fake_msg)
        elif button_map[text] == "/orders":
            await show_my_orders(fake_msg)
        elif button_map[text] == "/contacts":
            await message.answer(
                f"📞 <b>Контакты VAPEBAZAR</b>\n\n"
                f"📱 Telegram: @{MANAGER_USERNAME}\n"
                f"🕐 Работаем ежедневно 10:00-22:00 (МСК+8)\n"
                f"❓ Вопросы: /faq или напиши в чат",
                reply_markup=get_main_keyboard()
            )
        return

    # Если не кнопка - продолжаем в fallback_any_message
    await fallback_any_message(message)


# Ловит всё остальное — регистрируется последним, чтобы не перехватывать другие хэндлеры.
@dp.message()
async def fallback_any_message(message: types.Message):
    remember_user(message.from_user)
    text = message.text or ""
    logger.info(f"Сообщение без обработчика от {message.from_user.id} (@{message.from_user.username}): {text!r}")

    faq_answer = _match_faq(text)
    if faq_answer:
        await message.answer(faq_answer, reply_markup=get_main_keyboard())
        return

    # #25 — Умный чатбот: проверяем ключевые слова для FAQ
    text_lower = text.lower()
    keywords_faq = {
        "оплат": "payment",
        "доставк": "delivery",
        "вернуть": "return",
        "балл": "points",
        "vip": "vip",
        "рефер": "referral",
        "заказ": "order",
    }

    for keyword, faq_key in keywords_faq.items():
        if keyword in text_lower and faq_key in FAQ_DATA:
            item = FAQ_DATA[faq_key]
            await message.answer(f"{item['emoji']} <b>{item['title']}</b>\n\n{item['answer']}")
            return

    # ── Проверка рабочего времени ──
    now_local = now_magadan()
    if now_local.hour < SHOP_OPEN_HOUR or now_local.hour >= SHOP_CLOSE_HOUR:
        opens_at = f"{SHOP_OPEN_HOUR:02d}:00"
        await message.answer(
            f"🌙 Магазин сейчас закрыт.\n\n"
            f"Работаем ежедневно с <b>{SHOP_OPEN_HOUR}:00 до {SHOP_CLOSE_HOUR}:00</b> по Магадану.\n"
            f"Откроемся в <b>{opens_at}</b> — обязательно ответим!\n\n"
            f"💡 Совет: напиши /faq для ответов на частые вопросы\n"
            f"Ваше сообщение сохранено, менеджер @{MANAGER_USERNAME} увидит его утром.",
            reply_markup=get_main_keyboard()
        )
        # Уведомить менеджера о сообщении вне рабочего времени
        uname = f"@{message.from_user.username}" if message.from_user.username else message.from_user.first_name
        for cid in ADMINS:
            try:
                await bot.send_message(cid, f"🌙 Сообщение вне рабочего времени\n{uname}: {text[:300]}")
            except Exception:
                pass
        return

    await message.answer(
        "Я не понял вопрос 🤔 Попробуй спросить иначе, или напиши менеджеру:\n"
        f"👉 @{MANAGER_USERNAME}\n\n"
        "Часто спрашивают:\n"
        "• «Как оплатить?»\n"
        "• «Сколько ждать доставку?»\n"
        "• «Есть гарантия на iPhone?»\n"
        "• «Как работают баллы?»",
        reply_markup=get_main_keyboard()
    )


async def birthday_check_loop():
    """Ежедневно проверяет дни рождения и начисляет +100 баллов. Напоминает за неделю."""
    while True:
        try:
            now = now_magadan()
            today_str = f"{now.day:02d}.{now.month:02d}"
            week_ahead = (now + timedelta(days=7)).strftime("%d.%m")
            subs = _load_json(SUBSCRIBERS_FILE, {})
            changed = False

            for uid, data in subs.items():
                birthday = data.get("birthday")
                if not birthday:
                    continue

                # ── Напоминание за неделю ──
                if birthday == week_ahead:
                    reminder_sent_key = f"birthday_reminder_week_{now.year}"
                    if data.get(reminder_sent_key) != now.year:
                        name = data.get("name") or "друг"
                        try:
                            await bot.send_message(
                                chat_id=int(uid),
                                text=(
                                    f"🎂 <b>Через неделю День Рождения!</b>\n\n"
                                    f"Привет, {name}! 👋\n"
                                    f"Через 7 дней у тебя День Рождения 🎉\n\n"
                                    f"Подготовь свой заказ — в день рождения ты получишь:\n"
                                    f"├ <b>-30%</b> скидку на любой товар\n"
                                    f"├ <b>+100 баллов</b> в подарок\n"
                                    f"└ <b>Бесплатная доставка</b>\n\n"
                                    f"Спеши, предложение действует только в этот день! 💜"
                                ),
                                reply_markup=get_main_keyboard()
                            )
                            subs[uid][reminder_sent_key] = now.year
                            changed = True
                        except Exception as e:
                            logger.error(f"Birthday reminder (week before) failed for {uid}: {e}")

                # ── День рождения — начисляем баллы ──
                if birthday == today_str:
                    if data.get("last_birthday_bonus") == now.year:
                        continue
                    async with _bonus_lock:
                        bonuses = _load_bonuses()
                        u = _ensure_user(bonuses, uid)
                        u["balance"] += 100
                        _save_bonuses(bonuses)
                    subs[uid]["last_birthday_bonus"] = now.year
                    changed = True
                    name = data.get("name") or "друг"
                    try:
                        await bot.send_message(
                            chat_id=int(uid),
                            text=(
                                f"🎂 <b>С Днём Рождения, {name}!</b>\n\n"
                                f"Вся команда VAPEBAZAR поздравляет тебя! 🥳\n"
                                f"В подарок — <b>+100 баллов</b> на твой счёт 💎\n\n"
                                f"<b>Ещё подарок:</b> -30% на любой товар в этот день! 🎁\n\n"
                                f"Спеши, скидка действует только сегодня 💜"
                            ),
                            reply_markup=get_main_keyboard()
                        )
                    except Exception as e:
                        logger.error(f"Birthday message failed for {uid}: {e}")

            if changed:
                _save_json(SUBSCRIBERS_FILE, subs)
        except Exception as e:
            logger.error(f"Birthday loop error: {e}")
        # Следующий запуск в 10:00 следующего дня
        now = now_magadan()
        tomorrow = (now + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        await asyncio.sleep((tomorrow - now).total_seconds())


async def smart_reminder_loop():
    """Раз в сутки находит тех, кто не заказывал 14+ дней, и присылает напоминание."""
    await asyncio.sleep(3600)  # первый запуск через час после старта бота
    while True:
        try:
            now = now_magadan()
            cutoff = now - timedelta(days=14)
            data = _load_bonuses()
            for uid, u in data["users"].items():
                last_ts_str = u.get("last_order_ts")
                if not last_ts_str:
                    continue
                try:
                    last_ts = datetime.fromisoformat(last_ts_str)
                except Exception:
                    continue
                if last_ts > cutoff:
                    continue
                reminded_str = u.get("last_reminded_ts")
                if reminded_str:
                    try:
                        reminded_ts = datetime.fromisoformat(reminded_str)
                        if reminded_ts > last_ts:
                            continue  # уже напоминали после последнего заказа
                    except Exception:
                        pass
                name = u.get("name") or "друг"
                try:
                    await bot.send_message(
                        chat_id=int(uid),
                        text=(
                            f"💨 <b>Давно тебя не видели, {name}!</b>\n\n"
                            f"Запасы подходят к концу? 😉\n"
                            f"Свежие поступления уже в каталоге — заходи!\n\n"
                            f"💎 У тебя на балансе: <b>{_fmt_money(u.get('balance', 0))}</b> баллов"
                        ),
                        reply_markup=get_main_keyboard()
                    )
                    async with _bonus_lock:
                        d2 = _load_bonuses()
                        if uid in d2["users"]:
                            d2["users"][uid]["last_reminded_ts"] = now.isoformat(timespec="seconds")
                            _save_bonuses(d2)
                except Exception as e:
                    logger.error(f"Smart reminder failed for {uid}: {e}")
                await asyncio.sleep(0.05)
        except Exception as e:
            logger.error(f"Smart reminder loop error: {e}")
        await asyncio.sleep(86400)  # раз в сутки


async def vpn_expiry_reminder_loop():
    """Раз в сутки напоминает клиентам, у которых VPN скоро/только что истёк, продлить подписку."""
    await asyncio.sleep(1800)  # первый запуск через полчаса после старта бота
    while True:
        try:
            now = now_magadan()
            subs = _load_json(VPN_SUBS_FILE, {})
            changed = False
            for uid, rec in subs.items():
                expiry_str = rec.get("expiry")
                if not expiry_str:
                    continue
                try:
                    expiry = datetime.fromisoformat(expiry_str)
                except Exception:
                    continue
                days_left = (expiry - now).total_seconds() / 86400
                # Верхняя граница фиксированная («начинаем напоминать за N дней»), а нижняя —
                # с запасом на случай простоя бота (перенос на сервер и т.п.), иначе после
                # перезапуска days_left уже «слишком отрицательный» и клиента бы пропускало навсегда.
                if not (-VPN_EXPIRY_GRACE_DAYS <= days_left <= VPN_EXPIRY_REMINDER_WINDOW_DAYS):
                    continue
                if rec.get("last_expiry_reminder") == expiry_str:
                    continue  # уже напоминали про этот же срок (не после продления — expiry изменится)
                tariff = VPN_TARIFFS.get(rec.get("tariff"), {})
                tname = tariff.get("name", rec.get("tariff", "VPN"))
                price = tariff.get("price", "—")
                if days_left >= 0:
                    header = (f"⏰ <b>Твой VPN скоро закончится!</b>\n\n"
                              f"Осталось {int(days_left) + 1} дн. (до {expiry.strftime('%d.%m.%Y')}).")
                else:
                    header = (f"🛡️ <b>Твой VPN истёк {expiry.strftime('%d.%m.%Y')}.</b>\n\n"
                              f"Без него сайты через блокировки могут не открываться.")
                try:
                    await bot.send_message(
                        chat_id=int(uid),
                        text=(
                            f"{header}\n\n"
                            f"Продли тариф «{tname}» за {price} ₽ прямо в приложении:\n"
                            f"Профиль → 🛡️ VPN-подписка → «{tname}» → Купить."
                        ),
                        reply_markup=get_main_keyboard()
                    )
                    rec["last_expiry_reminder"] = expiry_str
                    changed = True
                except Exception as e:
                    logger.error(f"VPN expiry reminder failed for {uid}: {e}")
                await asyncio.sleep(0.05)
            if changed:
                _save_json(VPN_SUBS_FILE, subs)
        except Exception as e:
            logger.error(f"VPN expiry reminder loop error: {e}")
        await asyncio.sleep(86400)  # раз в сутки


async def weekly_digest_loop():
    """Каждый понедельник в 9:00 по Магадану шлёт админам сводку за неделю."""
    while True:
        now = now_magadan()
        days_ahead = (0 - now.weekday()) % 7  # 0 = понедельник
        if days_ahead == 0 and now.hour >= 9:
            days_ahead = 7
        next_run = (now + timedelta(days=days_ahead)).replace(hour=9, minute=0, second=0, microsecond=0)
        await asyncio.sleep((next_run - now).total_seconds())
        try:
            await send_weekly_digest()
        except Exception as e:
            logger.error(f"Weekly digest error: {e}")


async def send_weekly_digest():
    """Считает выручку/топ товаров/VPN за последние 7 дней и шлёт всем админам."""
    now = now_magadan()
    week_ago = now - timedelta(days=7)

    orders = _load_json(ORDERS_FILE, [])
    week_orders = []
    for o in orders:
        try:
            created = datetime.fromisoformat(o.get("created_at", ""))
        except Exception:
            continue
        if created >= week_ago and o.get("status") != "cancel":
            week_orders.append(o)
    revenue = sum(int(o.get("total") or 0) for o in week_orders)

    from collections import Counter
    counter = Counter()
    for o in week_orders:
        for line in (o.get("items") or "").split("\n"):
            stripped = line.strip()
            if not stripped.startswith(("•", "▪")):
                continue
            clean = stripped.lstrip("•▪️️ ")
            name = clean.split("·")[0].split("[")[0].split("—")[0].split("×")[0].strip()
            if 3 < len(name) < 60:
                counter[name] += 1
    top_lines = [f"{i}. {name} — {cnt} раз" for i, (name, cnt) in enumerate(counter.most_common(3), 1)]

    vpn_subs = _load_json(VPN_SUBS_FILE, {})
    new_vpn = 0
    expiring_soon = 0
    for rec in vpn_subs.values():
        try:
            if datetime.fromisoformat(rec.get("created", "")) >= week_ago:
                new_vpn += 1
        except Exception:
            pass
        try:
            expiry = datetime.fromisoformat(rec.get("expiry", ""))
            if now <= expiry <= now + timedelta(days=7):
                expiring_soon += 1
        except Exception:
            pass

    text = (
        f"📊 <b>Сводка за неделю</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"🛒 Заказов: <b>{len(week_orders)}</b>\n"
        f"💰 Выручка: <b>{_fmt_money(revenue)} ₽</b>\n\n"
    )
    if top_lines:
        text += "🏆 <b>Топ товаров недели</b>\n" + "\n".join(top_lines) + "\n\n"
    text += (
        f"🛡️ <b>VPN</b>\n"
        f"├ Новых подписок: <b>{new_vpn}</b>\n"
        f"└ Истекают в ближайшие 7 дней: <b>{expiring_soon}</b>"
    )

    for admin_id in ADMINS:
        try:
            await bot.send_message(chat_id=admin_id, text=text)
        except Exception as e:
            logger.error(f"Weekly digest send failed for {admin_id}: {e}")


async def main():
    logger.info("Запуск сервера бота VAPEBAZAR PREMIUM...")
    await bot.delete_webhook(drop_pending_updates=False)
    asyncio.create_task(birthday_check_loop())
    asyncio.create_task(smart_reminder_loop())
    asyncio.create_task(vpn_expiry_reminder_loop())
    asyncio.create_task(weekly_digest_loop())
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот остановлен.")
    except Exception as e:
        logger.critical(f"Бот упал при запуске: {e}")
        raise
