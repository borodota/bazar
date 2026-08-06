#!/usr/bin/env bash
# Установка бота VapeBazar на ЧИСТЫЙ VPS (Ubuntu 22.04/24.04).
#
# Запуск на сервере от root:
#   bash install.sh
#
# Скрипт спросит токен бота и данные панели 3x-ui, сложит их в
# /etc/vapebazar-bot.env (права 600, в git не попадает) и поднимет systemd-сервис.
#
# Идемпотентен: можно запускать повторно — репозиторий подтянется, сервис перезапустится.

set -euo pipefail

REPO_URL="https://github.com/borodota/bazar.git"
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/bazar"
ENV_FILE="/etc/vapebazar-bot.env"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m!! %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Запускай от root: sudo bash install.sh"

say "Ставлю зависимости системы"
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip git

say "Забираю код (ветка $BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" fetch origin "$BRANCH"
    git -C "$APP_DIR" checkout "$BRANCH"
    git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

say "Ставлю Python-зависимости"
[ -d "$APP_DIR/venv" ] || python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install -q --upgrade pip
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"

# ── Секреты ───────────────────────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
    say "Файл $ENV_FILE уже есть — оставляю как есть"
    echo "   (чтобы поменять токен: nano $ENV_FILE, затем systemctl restart vapebazar-bot)"
else
    say "Настройка секретов"
    echo "Токен НЕ будет виден на экране и НЕ попадёт в git."
    echo

    read -rsp "Токен бота от @BotFather: " BOT_TOKEN; echo
    [ -n "$BOT_TOKEN" ] || die "Токен обязателен"

    echo
    echo "Дальше — панель 3x-ui для VPN. Если VPN пока не нужен, жми Enter на всех вопросах."
    SERVER_IP="$(hostname -I | awk '{print $1}')"
    read -rp "IP этого сервера [$SERVER_IP]: " XUI_HOST
    XUI_HOST="${XUI_HOST:-$SERVER_IP}"
    read -rp "Имя инбаунда в панели [MyVPN]: " XUI_REMARK
    XUI_REMARK="${XUI_REMARK:-MyVPN}"

    umask 077
    cat > "$ENV_FILE" <<EOF
# Секреты VapeBazar. Права 600, в git НЕ попадает.
BOT_TOKEN=$BOT_TOKEN

# ── VPN через прямую запись в базу 3x-ui (xui_db.py) ──
XUI_DB_PATH=/etc/x-ui/x-ui.db
XUI_SERVER_HOST=$XUI_HOST
XUI_SUB_BASE=https://$XUI_HOST:2096/sub
XUI_INBOUND_REMARK=$XUI_REMARK
XUI_RESTART_CMD=systemctl restart x-ui
EOF
    chmod 600 "$ENV_FILE"
    say "Секреты записаны в $ENV_FILE"
fi

say "Ставлю systemd-сервис"
cp "$APP_DIR/deploy/vapebazar-bot.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable vapebazar-bot >/dev/null
systemctl restart vapebazar-bot

sleep 4
say "Статус"
systemctl status vapebazar-bot --no-pager -n 15 || true

cat <<'EOF'

────────────────────────────────────────────────
Готово. Полезные команды:

  journalctl -u vapebazar-bot -f      # логи в реальном времени
  systemctl restart vapebazar-bot     # перезапуск
  nano /etc/vapebazar-bot.env         # сменить токен/настройки

Обновить код в будущем:
  cd /opt/bazar && git pull && systemctl restart vapebazar-bot

ВАЖНО: перенеси со старого сервера файлы с данными (баллы = деньги):
  bonuses.json  orders_log.json  vpn_subs.json  subscribers.json
Класть в /opt/bazar/ и потом перезапустить сервис.
────────────────────────────────────────────────
EOF
