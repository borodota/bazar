# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 📌 Project Overview

**VapeBazar Premium** — полноценная экосистема электронной коммерции для Telegram:
- **Telegram Mini App** (витрина + корзина) с поддержкой HTML/JS
- **Python бот** (aiogram 3.7+) для обработки заказов, выдачи VPN-подписок, уведомлений
- **VPN модули** для интеграции с панелью 3x-ui (два подхода: через API и прямая запись в SQLite)
- **Admin Dashboard** для управления магазином из браузера
- **GitHub Pages** для хостирования Mini App, **Vercel** для relay (аватарки из Telegram)

### Основной стек
- **Frontend**: HTML5, CSS3 (no framework), Vanilla JavaScript
- **Backend**: Python 3.10+, aiogram 3.7+
- **Database**: JSON-файлы (bonuses.json, orders_log.json, vpn_subs.json) + SQLite для 3x-ui
- **Deployment**: GitHub Pages (Mini App), VPS с systemd (бот), Vercel (image relay)

---

## 🏗️ Архитектура

### Структура репозитория
```
/home/user/bazar/
├── index.html              # Основная страница Mini App (витрина + профиль + корзина)
├── admin.html              # Панель управления магазином (защищена паролем)
├── script.js               # Логика Mini App (150+ слов: все вкладки, корзина, VPN)
├── style.css               # Стили (темы, анимации, responsive)
├── products.js             # Данные товаров (каталог в памяти клиента)
├── bott.py                 # Главный модуль бота (aiogram dispatcher + обработчики)
├── xui_api.py              # Модуль выдачи VPN через API 3x-ui (login + add_client)
├── xui_db.py               # Модуль выдачи VPN прямой записью в SQLite панели
├── test_xui_api.py         # Тесты для API-подхода
├── test_xui_db.py          # Тесты для DB-подхода
├── requirements.txt        # Python зависимости
├── vercel.json             # Конфиг для деплоя на Vercel (relay для аватарок)
├── .vercelignore           # Исключаем бот + требования из Vercel
├── api/relay.js            # Edge Function на Vercel для проксирования аватарок
├── deploy/
│   ├── SERVER_SETUP.md     # Инструкция переноса на VPS (systemd, logrotate, env)
│   ├── vapebazar-bot.service      # systemd юнит
│   ├── vapebazar-bot.logrotate    # Ротация логов
│   └── env.example         # Шаблон .env для сервера
├── README.md               # Документация для пользователей
└── CLAUDE.md               # Этот файл
```

### Ключевые JSON-файлы (в .gitignore — локальные данные)
| Файл | Назначение | Критичность |
|---|---|---|
| `bonuses.json` | **Баллы и рефералы** (=$$$) | 🔴 КРИТИЧНО |
| `orders_log.json` | История заказов (для `/orders`, `/stats`) | 🔴 КРИТИЧНО |
| `vpn_subs.json` | Учёт VPN-подписок (кто, тариф, срок истечения) | 🔴 КРИТИЧНО |
| `subscribers.json` | Кого добавлять в рассылку | 🟡 Важно |
| `reviews.json` | Отзывы клиентов (после заказа) | 🟢 Опционально |
| `notify_requests.json` | Запросы уведомить о поступлении товара | 🟢 Опционально |

**⚠️ Важно:** Эти файлы содержат деньги (баллы) и подписки — при развёртывании на сервер переносятся вручную (см. `deploy/SERVER_SETUP.md` шаг 4).

### Данные товаров
```javascript
// products.js — массив товаров, загружается в память при открытии App
// Структура каждого товара:
{
  id: "pod_xros_5",
  name: "VAPORESSO XROS 5",
  category: "pod",           // pod | liquid | disposable | consumable | apple | samsung | console | other
  price: 2490,
  discount: null,            // 0.15 для 15% скидки
  inStock: true,
  imageUrl: "https://...",
  flavor: "...",             // Для под-систем
  badge: "Новинка",          // New | Hot | Скидка | 🔥 10 шт.
}
```

---

## 🚀 Разработка и запуск

### Frontend (Mini App) — локально

**Просмотр во время разработки:**
```bash
# Вариант 1: используй Live Server VSCode (right-click index.html → Open with Live Server)
# Или вариант 2: простой сервер Python
python3 -m http.server 8000
# Откроешь http://localhost:8000/index.html
```

**Главный entry point**: Telegram WebApp API (если открыт в Telegram, иначе fallback на localStorage).
- Тестирование в Telegram: Отправь Mini App ссылку боту (`/start` и кнопка в меню), откроется в webview.
- Тестирование в браузере: Все основные функции работают (кроме `tg.sendData()` — используется fallback через Bot API).

### Backend (Бот) — локально

**Установка зависимостей:**
```bash
python3 -m venv venv
source venv/bin/activate  # или: venv\Scripts\activate на Windows
pip install -r requirements.txt
```

**Запуск:**
```bash
# Минимум: нужны переменные окружения или вписаны в файл
export BOT_TOKEN="8687110031:AAE..."  # от @BotFather
python3 bott.py
```

**Локально с VPN-тестированием:**
Если хочешь выдавать VPN, нужна подключённая 3x-ui панель:
```bash
export XUI_DB_PATH="/etc/x-ui/x-ui.db"       # путь к базе панели
export XUI_SERVER_HOST="62.133.61.23"        # адрес сервера
export XUI_INBOUND_REMARK="MyVPN"            # имя инбаунда
export XUI_RESTART_CMD=""                    # пусто = не перезагружать (для тестов)
python3 bott.py
```

**Проверка логирования:**
```bash
tail -f bot.log  # смотри логи в реальном времени
```

---

## 🧪 Тестирование

### Python tests
```bash
# Все тесты VPN-модулей
python3 -m unittest test_xui_api -v
python3 -m unittest test_xui_db -v

# Один конкретный тест
python3 -m unittest test_xui_db.TestAddClient.test_add_writes_settings_and_traffic -v
```

**Что тестируется:**
- `test_xui_api.py` — логин в панель, создание клиента через API (медленнее, но безопаснее)
- `test_xui_db.py` — прямая запись в SQLite (быстро, но требует файловый доступ к базе)

### Frontend testing
Нет автотестов для JS — полагаемся на ручное тестирование в браузере и Telegram:
1. Открыть Mini App в браузере (http://localhost:8000)
2. Проверить все вкладки (Каталог, Избранное, История, Профиль)
3. Добавить товар в корзину, оформить заказ (должен отправиться боту)
4. В Telegram: получить заказ, нажать кнопки статусов, проверить уведомления у клиента

---

## 📊 Механика системы

### Как пользователь делает заказ
1. Открывает Mini App (через кнопку в боте)
2. Добавляет товары в корзину
3. Заполняет форму (имя, номер, адрес, способ доставки, способ оплаты)
4. Нажимает «Оформить заказ»
5. `script.js` отправляет заказ через `tg.sendData()` (если открыт в боте) или через Bot API через relay
6. Бот получает заказ, сохраняет в `orders_log.json`, отправляет админу с кнопками статусов

### Баллы и рефералы
- За каждый заказ +5% баллами (но не более 15% от суммы — `EARN_CAP_RATE`)
- Баллы хранятся в `bonuses.json`: `{ "user_id": { "balance": 500, "referrer_id": null, "referred": [789] }, ... }`
- Реферальный бонус: если пригласил друга и он сделал первый оплаченный заказ → приглашённый получает скидку 50%, пригласивший +200 баллов

### VPN-подписки
- Два модуля на выбор:
  1. **xui_api.py** — логинится в панель через HTTP API (медленнее, требует учётные данные)
  2. **xui_db.py** — пишет клиента прямо в SQLite базу (быстро, не требует логина, т.к. бот на одном сервере с панелью)
- При оплате VPN админ нажимает кнопку «✅ Оплачено — выдать» → бот выдаёт ссылку вида `vless://uuid@host:port?...`
- Продление увеличивает срок без потери оставшихся дней (считается от `max(сейчас, текущий срок)`)
- Реферальный бонус на VPN: приведи друга по своей ссылке → оба получают +7 дней при первой оплате

---

## 🔧 Развёртывание

### Mini App (GitHub Pages)
```bash
# Любой push в main автоматически деплоит
git add -A
git commit -m "..."
git push
# Обновляется за 1–2 минуты на https://borodota.github.io/bazar/
```

### Бот (на VPS)
Полная инструкция в `deploy/SERVER_SETUP.md`. Кратко:

1. **Первичная установка** (один раз):
   ```bash
   ssh root@VPS_IP
   git clone https://github.com/borodota/bazar.git /opt/bazar
   cd /opt/bazar
   python3 -m venv venv
   venv/bin/pip install -r requirements.txt
   
   # Перенести живые данные с локального компьютера
   scp bonuses.json orders_log.json vpn_subs.json root@VPS_IP:/opt/bazar/
   
   # Настроить секреты
   cp deploy/env.example /etc/vapebazar-bot.env
   nano /etc/vapebazar-bot.env  # вписать BOT_TOKEN, XUI_PASSWORD
   
   # Установить systemd-сервис (автозапуск 24/7)
   cp deploy/vapebazar-bot.service /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable --now vapebazar-bot
   ```

2. **Обновления** (будущее):
   ```bash
   ssh root@VPS_IP
   cd /opt/bazar
   git pull
   systemctl restart vapebazar-bot
   ```

3. **Мониторинг**:
   ```bash
   # Статус
   systemctl status vapebazar-bot
   
   # Логи в реальном времени
   journalctl -u vapebazar-bot -f
   
   # Последние 50 строк
   journalctl -u vapebazar-bot -n 50
   ```

### Vercel Relay (для аватарок)
Обязательна для отправки аватарок из Telegram (браузер блокирует прямые запросы к Bot API).

1. На [vercel.com](https://vercel.com): импортируй репозиторий, добавь env var `BOT_TOKEN`
2. В `script.js` вписать Vercel URL: `const RELAY_URL = "https://bazar-xxxxxx.vercel.app/api/relay"`
3. Любой push на main автоматически деплоит на Vercel

---

## 🎯 Важные детали для разработки

### Telegram WebApp API
```javascript
// tg.sendData() — отправить данные из Mini App в бота (ТОЛЬКО если открыт через кнопку бота)
// Иначе используется fallback: fetch через Bot API + relay на Vercel
tg.sendData(JSON.stringify({type: "order", ...cart}))

// Цветовая схема
tg.setHeaderColor("#1a1a1a")  // тёмная шапка

// Haptic feedback
tg.HapticFeedback.impactOccurred("light")
tg.HapticFeedback.notificationOccurred("success")
```

### Синхронизация данных между браузерами пользователя
Использует **Telegram CloudStorage** (если пользователь залогинен в Telegram на нескольких устройствах):
```javascript
// Баланс баллов синхронизируется автоматически
// Цветовые темы (акцентные цвета) также синхронизируются
tg.CloudStorage.setItem("theme", "purple", () => {})
```

### Безопасность токена бота
⚠️ **Никогда** не вписывай `BOT_TOKEN` в `script.js` — он публичный на GitHub Pages!
Правильный путь:
1. Токен лежит на Vercel (в env vars): `/api/relay` → добавляет токен при проксировании
2. Mini App отправляет запросы на relay, relay добавляет токен и пробрасывает в Telegram Bot API
3. Если нет relay — используется `tg.sendData()` (только в боте, не требует токена)

### Долгоживущие соединения
- Бот использует **long-polling** (aiogram): получает сообщения в цикле
- ⚠️ Два экземпляра одного бота одновременно работать **не могут** — Telegram отключит оба
- Поэтому перед переносом на VPS нужно остановить локальный бот (см. `deploy/SERVER_SETUP.md` шаг 2)

### Временная зона
- **Все операции в боте работают в магаданском времени (UTC+11)**
- Функция `now_magadan()` возвращает текущее время в правильной зоне
- Используется для: заказов, напоминаний VPN, рабочих часов магазина, еженедельных отчётов
- Рабочие часы магазина: `SHOP_OPEN_HOUR = 10` и `SHOP_CLOSE_HOUR = 22` (по Магадану)
- ⚠️ **Важно**: все `datetime.now()` должны быть заменены на `now_magadan()` в новом коде

---

## 📋 Чек-лист перед коммитом

1. **Python код**:
   - `python3 -m py_compile bott.py` — синтаксис OK?
   - `python3 -m unittest test_xui_*.py` — тесты проходят?
   - Нет вписанных токенов/паролей (только env vars)?

2. **JavaScript**:
   - Нет `console.error` при открытии в браузере?
   - Проверил корзину, оформление, профиль?
   - Проверил адаптивность на мобильном экране (320px)?

3. **Git**:
   - `git status` — не вносим `bonuses.json`, `orders_log.json` и т.п. (в `.gitignore`)?
   - Коммит-месседж на русском, понятен будущим разработчикам?

---

## 🚨 Типичные ошибки

| Проблема | Причина | Решение |
|---|---|---|
| `ModuleNotFoundError: No module named 'aiogram'` | Не установлены зависимости | `pip install -r requirements.txt` |
| Бот не получает сообщения из Mini App | Старый токен или нет relay URL | Проверить `BOT_TOKEN` и `RELAY_URL` в коде |
| `XuiError: Инбаунд 'MyVPN' не найден` | 3x-ui панель отключена или неправильный `XUI_INBOUND_REMARK` | Проверить: `x-ui status`, правильный рemark в панели |
| Два экземпляра бота одновременно | Забыли остановить локальный перед переносом на VPS | `pkill -f bott.py` локально перед запуском на сервере |
| На GitHub Pages видны `undefined` в консоли | Нет relay URL для аватарок или неправильный токен | Деплой на Vercel, вписать URL в `script.js` |

---

## 🎯 Приоритет при добавлении фич

Следующие фичи уже выбраны для разработки (от критичных к nice-to-have):

1. **Дашборд администратора** — нужны цифры (заказы, выручка, топ товары)
2. **Реферральная программа** — вирусный рост (ссылки, бонусы)
3. **Подписка VIP** — регулярный доход (скидка за месячный платёж)
4. **Анимации и мобильная оптимизация** — UX
5. **Система достижений + вызовы** — геймификация
6. **FAQ, гайды, автоответ** — self-service поддержка

При добавлении каждой фичи:
- Добавить тесты (Python) или проверить вручную (JS)
- Обновить этот CLAUDE.md, если меняется архитектура
- Закоммитить в ветку, отправить PR перед мержем в main

---

## 🔗 Ссылки

- **Основной бот:** https://t.me/VapeBazar_bot
- **Mini App:** https://borodota.github.io/bazar/
- **Admin Dashboard:** https://borodota.github.io/bazar/admin.html
- **GitHub репозиторий:** https://github.com/borodota/bazar
- **Поддержка:** https://t.me/BORO_DOTA
- **Документация сервера:** `/deploy/SERVER_SETUP.md`
