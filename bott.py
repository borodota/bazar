import logging
from aiogram import Bot, Dispatcher, types, F
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton
from aiogram.filters import Command
from aiogram.enums import ParseMode
import asyncio
import json
from datetime import datetime, timedelta
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
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
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

def log_order(order_id, customer_id, total, action, status_label):
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

def get_main_keyboard():
    web_app_url = "https://borodota.github.io/bazar/"  
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="📱 Открыть Магазин / Корзину", web_app=types.WebAppInfo(url=web_app_url))],
            [KeyboardButton(text="🛍️ Мои заказы"), KeyboardButton(text="🤝 Партнерам")],
            [KeyboardButton(text="📞 Контакты"), KeyboardButton(text="ℹ️ О магазине")]
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
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Принять", callback_data=f"st_accept_{order_id}_{customer_id}_{final_total}"),
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
        log_order(order_id, customer_id, final_total, "new", "🆕 Новый")

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

    statuses = {
        "accept": "Принят в работу 🟡",
        "pack": "Собирается на складе 📦",
        "ship": "Передан курьеру / В пути 🚚",
        "done": "Выполнен / Оплачен успешно ✅",
        "cancel": "Отменен администратором ❌"
    }
    new_status = statuses.get(action, "Изменен")

    # Фиксируем заказ в журнале (для заказов из браузера это первый момент,
    # когда бот узнаёт о заказе — данные берём из callback_data).
    log_order(order_id, customer_id, total, action, new_status)

    # html_text сохраняет жирный шрифт и форматирование при редактировании
    text = callback.message.html_text or callback.message.text or ""
    if "📊 Статус:" in text:
        clean_text = text.split("📊 Статус:")[0]
        updated_text = f"{clean_text}📊 Статус: <b>{new_status}</b>"
        try:
            await callback.message.edit_text(text=updated_text, reply_markup=callback.message.reply_markup)
        except Exception as e:
            logger.error(f"Не удалось обновить сообщение заказа #{order_id}: {e}")

    # Уведомляем клиента о смене статуса
    if customer_id:
        status_extra = {
            "accept": "Мы уже начали обработку вашего заказа!",
            "pack": "Собираем ваш заказ — скоро будет готов!",
            "ship": "Заказ в пути! Курьер скоро будет у вас.",
            "done": "Спасибо за покупку! Будем рады видеть вас снова 💚",
            "cancel": f"Если возникли вопросы — напишите @{MANAGER_USERNAME}"
        }
        try:
            await bot.send_message(
                chat_id=int(customer_id),
                text=(
                    f"📦 <b>Заказ #{order_id}</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"📊 Новый статус: <b>{new_status}</b>\n\n"
                    f"{status_extra.get(action, '')}"
                )
            )
        except Exception as e:
            logger.error(f"Не удалось уведомить клиента {customer_id} о статусе заказа #{order_id}: {e}")

    await callback.answer(f"Статус изменен: {new_status}")

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    remember_user(message.from_user)
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

@dp.message(F.text == "🤝 Партнерам")
async def show_partner_panel(message: types.Message):
    await message.answer("🤝 Раздел партнерской программы на техническом обслуживании.")

@dp.message(F.text == "🛍️ Мои заказы")
async def show_my_orders(message: types.Message):
    await message.answer(
        "🛍️ <b>Мои заказы</b>\n\n"
        "История ваших заказов хранится в Mini App:\n"
        "нажмите «📱 Открыть Магазин / Корзину» → вкладка <b>Профиль</b> → <b>История заказов</b>.\n\n"
        f"По вопросам текущего заказа пишите: @{MANAGER_USERNAME}"
    )

# Ловит всё остальное — регистрируется последним, чтобы не перехватывать другие хэндлеры.
# Гарантирует, что бот отвечает на ЛЮБОЕ сообщение (удобно для проверки, что бот жив).
@dp.message()
async def fallback_any_message(message: types.Message):
    remember_user(message.from_user)
    logger.info(f"Сообщение без обработчика от {message.from_user.id} (@{message.from_user.username}): {message.text!r}")
    await message.answer(
        "Я понимаю только кнопки меню 👇\n"
        f"По любым вопросам: @{MANAGER_USERNAME}",
        reply_markup=get_main_keyboard()
    )

async def main():
    logger.info("Запуск сервера бота VAPEBAZAR PREMIUM...")
    # Webhook нужно снять, иначе polling не получит апдейты.
    # Накопившиеся за время простоя заказы НЕ сбрасываем — они доставятся после старта.
    await bot.delete_webhook(drop_pending_updates=False)
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот остановлен.")
    except Exception as e:
        logger.critical(f"Бот упал при запуске: {e}")
        raise
