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

# ==================== КОНФИГУРАЦИЯ ====================
# Токен лучше хранить в переменной окружения BOT_TOKEN (см. README)
SHOP_BOT_TOKEN = os.getenv("BOT_TOKEN", "8687110031:AAE9E430W55aRQQuUwDI8hEMjaVliq_gbG4")
ADMIN_ID = 6163521938
MANAGER_USERNAME = 'BORO_DOTA'
BOT_USERNAME = 'vapebazar_bot'   # для реферальных ссылок t.me/<bot>?startapp=ref_<id>
DEPUTY_ADMIN_IDS = [5289357165, 6163521938]

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

REFERRAL_REWARD = 200   # баллов пригласившему за ПЕРВЫЙ оплаченный заказ друга
EARN_CAP_RATE = 0.15    # санити-лимит начисления: не больше 15% от суммы заказа

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
        "ts": datetime.now().isoformat(timespec="seconds"),
    }
    _save_json(SUBSCRIBERS_FILE, subs)

def log_order(order_id, customer_id, total, action, status_label, items=None, name=None, phone=None, address=None):
    """Создаёт/обновляет запись заказа в журнале. Вызывается при создании заказа
    (путь sendData) и при каждой смене статуса кнопкой (путь Bot API из браузера)."""
    orders = _load_json(ORDERS_FILE, [])
    now = datetime.now().isoformat(timespec="seconds")
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
    if cust["orders"] == 0 and not cust.get("referred_by") and not cust.get("ref_rewarded"):
        cust["referred_by"] = str(ref_id)
        if user:
            cust["name"] = user.first_name or cust.get("name", "")
            cust["username"] = user.username or cust.get("username", "")
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
    cust["last_order_ts"] = datetime.now().isoformat(timespec="seconds")

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

def get_main_keyboard():
    web_app_url = "https://borodota.github.io/bazar/"
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="📱 Открыть Магазин / Корзину", web_app=types.WebAppInfo(url=web_app_url))],
            [KeyboardButton(text="💎 Мои баллы"), KeyboardButton(text="🎁 Пригласить друга")],
            [KeyboardButton(text="🛍️ Мои заказы"), KeyboardButton(text="📞 Контакты")],
            [KeyboardButton(text="ℹ️ О магазине")]
        ],
        resize_keyboard=True
    )

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

        if is_json and raw_data.get("type") == "newsletter_subscribe":
            username_text = f"@{message.from_user.username}" if message.from_user.username else "Скрыт"
            await message.answer("📣 Вы подписаны на акции и новинки!", reply_markup=get_main_keyboard())
            for chat_id in set([ADMIN_ID] + DEPUTY_ADMIN_IDS):
                try: await bot.send_message(chat_id=chat_id, text=f"📣 Новая подписка на рассылку: {username_text} (<code>{message.from_user.id}</code>)")
                except: pass
            return

        if is_json:
            order_id = raw_data.get("order_id") or raw_data.get("Order ID") or raw_data.get("id") or datetime.now().strftime("%M%S")
            date_str = raw_data.get("date") or raw_data.get("Date") or datetime.now().strftime("%d.%m.%Y %H:%M")
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
            order_id = datetime.now().strftime("%M%S")
            date_str = datetime.now().strftime("%d.%m.%Y %H:%M")
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
            receipt_date = rec.get("created_at", datetime.now().isoformat())[:10]
            receipt_text = (
                f"🧾 <b>ВАШ ЧЕК — VAPEBAZAR PREMIUM</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"📦 Заказ: <b>#{order_id}</b>\n"
                f"📅 Дата: {receipt_date}\n\n"
                f"🛒 <b>Состав:</b>\n<blockquote>{receipt_items}</blockquote>\n\n"
                f"💰 <b>Итого: {receipt_total} ₽</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"✅ <b>ОПЛАЧЕН И ВЫДАН</b>\n\n"
                f"Спасибо за покупку! Возвращайтесь 💚\n"
                f"📞 По вопросам: @{MANAGER_USERNAME}"
            )
            try:
                await bot.send_message(chat_id=int(customer_id), text=receipt_text)
            except Exception as e:
                logger.error(f"Не удалось отправить чек клиенту {customer_id}: {e}")

    # Уведомляем клиента о смене статуса
    if customer_id:
        status_extra = {
            "accept": "Мы уже начали обработку вашего заказа!",
            "pack": "Собираем ваш заказ — скоро будет готов!",
            "ship": "Заказ в пути! Курьер скоро будет у вас.",
            "done": "Спасибо за покупку! Будем рады видеть вас снова 💚",
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
                    f"Спасибо, что зовёшь друзей в VAPEBAZAR 💚"
                )
            )
        except Exception as e:
            logger.error(f"Не удалось уведомить реферера {r['referrer_id']}: {e}")

    await callback.answer(f"Статус изменен: {new_status}")

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
        f"Привет, {message.from_user.first_name}! Добро пожаловать в магазин <b>VAPEBAZAR PREMIUM</b>.\n"
        f"Нажми кнопку ниже, чтобы войти в каталог.",
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


@dp.message(Command("stats"))
async def cmd_stats(message: types.Message):
    if message.from_user.id not in ADMINS:
        return
    orders = _load_json(ORDERS_FILE, [])
    subs = _load_json(SUBSCRIBERS_FILE, {})
    now = datetime.now()
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
    fname = f"orders_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    doc = types.BufferedInputFile(csv_bytes, filename=fname)
    await message.answer_document(doc, caption=f"📁 Экспорт <b>{len(orders)}</b> заказов")


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

    # #25 — Автоответ вне рабочего времени (Магадан UTC+10)
    MAGADAN = timezone(timedelta(hours=10))
    now_local = datetime.now(MAGADAN)
    if now_local.hour < SHOP_OPEN_HOUR or now_local.hour >= SHOP_CLOSE_HOUR:
        opens_at = f"{SHOP_OPEN_HOUR:02d}:00"
        await message.answer(
            f"🌙 Магазин сейчас закрыт.\n\n"
            f"Работаем ежедневно с <b>{SHOP_OPEN_HOUR}:00 до {SHOP_CLOSE_HOUR}:00</b> по Магадану.\n"
            f"Откроемся в <b>{opens_at}</b> — обязательно ответим!\n\n"
            f"Ваше сообщение сохранено, менеджер @{MANAGER_USERNAME} увидит его утром.",
            reply_markup=get_main_keyboard()
        )
        # Всё равно уведомить менеджера, чтобы мог ответить раньше
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
        subs[uid] = {"name": message.from_user.first_name or "", "username": message.from_user.username or "", "ts": datetime.now().isoformat(timespec="seconds")}
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


async def birthday_check_loop():
    """Ежедневно проверяет дни рождения и начисляет +100 баллов."""
    while True:
        try:
            now = datetime.now()
            today_str = f"{now.day:02d}.{now.month:02d}"
            subs = _load_json(SUBSCRIBERS_FILE, {})
            changed = False
            for uid, data in subs.items():
                if data.get("birthday") != today_str:
                    continue
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
                            f"Трать с удовольствием 💚"
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
        now = datetime.now()
        tomorrow = (now + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        await asyncio.sleep((tomorrow - now).total_seconds())


async def smart_reminder_loop():
    """Раз в сутки находит тех, кто не заказывал 14+ дней, и присылает напоминание."""
    await asyncio.sleep(3600)  # первый запуск через час после старта бота
    while True:
        try:
            now = datetime.now()
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


async def main():
    logger.info("Запуск сервера бота VAPEBAZAR PREMIUM...")
    await bot.delete_webhook(drop_pending_updates=False)
    asyncio.create_task(birthday_check_loop())
    asyncio.create_task(smart_reminder_loop())
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот остановлен.")
    except Exception as e:
        logger.critical(f"Бот упал при запуске: {e}")
        raise
