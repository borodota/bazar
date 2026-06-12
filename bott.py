import logging
from aiogram import Bot, Dispatcher, types, F
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton
from aiogram.filters import Command
from aiogram.enums import ParseMode
import asyncio
import json
from datetime import datetime
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

        # 1. Текст покупателю в ЛС
        customer_text = (
            f"✅ <b>Заказ #{order_id} успешно оформлен!</b>\n\n"
            f"📦 <b>Детали вашего заказа:</b>\n{items}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"💵 <b>Итого к оплате (с учетом доставки):</b> {final_total if final_total > 0 else 'Посчитает директор'}₽\n\n"
            f"🧑‍💻 Наш директор @{MANAGER_USERNAME} уже принял заказ и свяжется с вами для подтверждения!"
        )
        await message.answer(customer_text, reply_markup=get_main_keyboard())

        # 2. Текст директору в админку
        admin_caption = (
            f"🆕 <b>НОВЫЙ ЗАКАЗ #{order_id}</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"👤 <b>Клиент:</b> {username_text}\n"
            f"🧑 <b>Имя:</b> {name}\n"
            f"🆔 <b>ID пользователя:</b> <code>{message.from_user.id}</code>\n"
            f"📞 <b>Телефон:</b> <code>{phone}</code>\n"
            f"🚚 <b>Тип получения:</b> {delivery_type}\n"
            f"🏠 <b>Адрес:</b> {address}\n"
            f"📅 <b>Дата/Время:</b> {date_str}\n"
            f"💬 <b>Комментарий:</b> {comment}\n\n"
            f"📦 <b>Состав заказа:</b>\n{items}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"💵 <b>Итого к получению:</b> {final_total if final_total > 0 else 'Проверь вручную'}₽\n\n"
            f"📊 <b>Статус:</b> Новый"
        )

        customer_id = message.from_user.id
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Принять", callback_data=f"st_accept_{order_id}_{customer_id}"),
                InlineKeyboardButton(text="📦 В сборке", callback_data=f"st_pack_{order_id}_{customer_id}")
            ],
            [
                InlineKeyboardButton(text="🚚 Отправлен", callback_data=f"st_ship_{order_id}_{customer_id}"),
                InlineKeyboardButton(text="🎯 Выполнен", callback_data=f"st_done_{order_id}_{customer_id}")
            ],
            [
                InlineKeyboardButton(text="❌ Отменить заказ", callback_data=f"st_cancel_{order_id}_{customer_id}")
            ],
            [
                InlineKeyboardButton(text="📞 Связаться с клиентом", url=f"tg://user?id={customer_id}")
            ]
        ])

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

    statuses = {
        "accept": "Принят в работу 🟡",
        "pack": "Собирается на складе 📦",
        "ship": "Передан курьеру / В пути 🚚",
        "done": "Выполнен / Оплачен успешно ✅",
        "cancel": "Отменен администратором ❌"
    }
    new_status = statuses.get(action, "Изменен")

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
        try:
            await bot.send_message(
                chat_id=int(customer_id),
                text=f"📦 <b>Заказ #{order_id}</b>\nСтатус обновлён: <b>{new_status}</b>"
            )
        except Exception as e:
            logger.error(f"Не удалось уведомить клиента {customer_id} о статусе заказа #{order_id}: {e}")

    await callback.answer(f"Статус изменен: {new_status}")

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    await message.answer(
        f"Привет, {message.from_user.first_name}! Добро пожаловать в магазин <b>VAPEBAZAR PREMIUM</b>.\n"
        f"Нажми кнопку ниже, чтобы войти в каталог.",
        reply_markup=get_main_keyboard()
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
