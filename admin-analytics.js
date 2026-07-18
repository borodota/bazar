/**
 * admin-analytics.js
 * Аналитические функции для админ-панели
 * Парсит данные из JSON-файлов и отправляет на вывод
 */

class AdminAnalytics {
  constructor() {
    this.orders = this._loadOrdersLog();
    this.bonuses = this._loadBonusesData();
    this.vpnSubs = this._loadVpnSubs();
  }

  // ── Загрузка данных ──
  _loadOrdersLog() {
    // В реальности эти данные приходят с бота через API
    // Сейчас это заглушка — в следующем коммите добавим API эндпоинт
    return [];
  }

  _loadBonusesData() {
    return {};
  }

  _loadVpnSubs() {
    return {};
  }

  // ── Статистика по заказам ──
  getOrderStats(days = 30) {
    const now = Date.now();
    const startDate = now - days * 24 * 60 * 60 * 1000;

    const filtered = this.orders.filter(o => o.timestamp > startDate);

    return {
      totalOrders: filtered.length,
      totalRevenue: filtered.reduce((sum, o) => sum + (o.total || 0), 0),
      averageCheck: filtered.length ? Math.round(filtered.reduce((sum, o) => sum + (o.total || 0), 0) / filtered.length) : 0,
      uniqueCustomers: new Set(filtered.map(o => o.user_id)).size,
      byDate: this._groupByDate(filtered),
      byStatus: this._groupByStatus(filtered),
    };
  }

  _groupByDate(orders) {
    const grouped = {};
    orders.forEach(o => {
      const date = new Date(o.timestamp).toISOString().split('T')[0];
      if (!grouped[date]) grouped[date] = { count: 0, revenue: 0 };
      grouped[date].count += 1;
      grouped[date].revenue += o.total || 0;
    });
    return grouped;
  }

  _groupByStatus(orders) {
    const grouped = { accepted: 0, pending: 0, shipped: 0, completed: 0, cancelled: 0 };
    orders.forEach(o => {
      const status = o.status || 'pending';
      grouped[status] = (grouped[status] || 0) + 1;
    });
    return grouped;
  }

  // ── Топ товаров ──
  getTopProducts(limit = 10) {
    const productSales = {};

    this.orders.forEach(o => {
      if (o.products) {
        o.products.forEach(p => {
          const key = p.id;
          if (!productSales[key]) {
            productSales[key] = { id: p.id, name: p.name, qty: 0, revenue: 0 };
          }
          productSales[key].qty += p.quantity || 1;
          productSales[key].revenue += (p.price || 0) * (p.quantity || 1);
        });
      }
    });

    return Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  // ── Анализ клиентов ──
  getCustomerAnalytics() {
    const customers = {};

    this.orders.forEach(o => {
      const uid = o.user_id;
      if (!customers[uid]) {
        customers[uid] = {
          user_id: uid,
          name: o.customer_name || 'Неизвестный',
          orders: 0,
          total_spent: 0,
          first_order: o.timestamp,
          last_order: o.timestamp,
        };
      }
      customers[uid].orders += 1;
      customers[uid].total_spent += o.total || 0;
      customers[uid].last_order = Math.max(customers[uid].last_order, o.timestamp);
    });

    return Object.values(customers)
      .sort((a, b) => b.total_spent - a.total_spent);
  }

  // ── VPN статистика ──
  getVpnStats() {
    const vpnData = Object.values(this.vpnSubs);
    const now = Date.now();

    return {
      totalSubs: vpnData.length,
      active: vpnData.filter(v => v.expiry_ms > now).length,
      expiring: vpnData.filter(v => v.expiry_ms > now && v.expiry_ms < now + 7 * 24 * 60 * 60 * 1000).length,
      expired: vpnData.filter(v => v.expiry_ms <= now).length,
    };
  }

  // ── Рост по дням (для графика) ──
  getRevenueByDay(days = 30) {
    const stats = this.getOrderStats(days);
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayData = stats.byDate[dateStr] || { count: 0, revenue: 0 };
      data.push({
        date: dateStr,
        orders: dayData.count,
        revenue: dayData.revenue,
      });
    }

    return data;
  }
}

// ── Экспорт для использования ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdminAnalytics;
}
