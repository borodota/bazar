# Перенос бота VapeBazar на VPS (Ubuntu 24.04)

Пошаговая инструкция. Команды выполняются на сервере по SSH,
кроме шагов, где явно сказано «на Mac».

> ⚠️ Данные (`bonuses.json`, `subscribers.json`, `orders_log.json`) = деньги и база.
> Их НЕТ в git — переносим вручную (шаг 4). Сначала бэкап (шаг 1)!

---

## Шаг 1 — Бэкап данных (на Mac)
```bash
cd ~/путь/к/боту
mkdir -p ~/bazar-backup
cp bonuses.json subscribers.json orders_log.json ~/bazar-backup/
```

## Шаг 2 — Остановить бота на Mac
Бот использует long-polling: два бота одновременно работать НЕ могут.
Останови процесс бота на Mac (Ctrl+C в окне, где он запущен, или закрой его).

## Шаг 3 — Подготовить сервер и код
```bash
ssh root@62.133.61.23
apt update && apt install -y python3 python3-venv python3-pip git
git clone https://github.com/borodota/bazar.git /opt/bazar
cd /opt/bazar
git checkout claude/improvement-opportunities-pzgi3e
python3 -m venv venv
venv/bin/pip install -r requirements.txt
```

## Шаг 4 — Перенести живые данные (с Mac на сервер)
На **Mac** (новое окно терминала):
```bash
cd ~/bazar-backup
scp bonuses.json subscribers.json orders_log.json root@62.133.61.23:/opt/bazar/
```

## Шаг 5 — Секреты (.env на сервере)
```bash
cp /opt/bazar/deploy/env.example /etc/vapebazar-bot.env
nano /etc/vapebazar-bot.env      # вписать реальные BOT_TOKEN и XUI_PASSWORD
chmod 600 /etc/vapebazar-bot.env
```

## Шаг 6 — systemd-сервис (автозапуск 24/7)
```bash
cp /opt/bazar/deploy/vapebazar-bot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now vapebazar-bot
systemctl status vapebazar-bot        # должно быть active (running)
```

## Шаг 7 — Ротация логов
```bash
cp /opt/bazar/deploy/vapebazar-bot.logrotate /etc/logrotate.d/vapebazar-bot
logrotate -d /etc/logrotate.d/vapebazar-bot   # проверка без ошибок
```

## Шаг 8 — Проверка
```bash
journalctl -u vapebazar-bot -n 50 --no-pager   # логи запуска
```
В Telegram: `/stats` (база на месте?), тест-заказ, и VPN-заказ → кнопка «Оплачено — выдать».

---

## Обновление кода в будущем
```bash
cd /opt/bazar && git pull && systemctl restart vapebazar-bot
```
