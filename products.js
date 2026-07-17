/* ==========================================================================
   БАЗА ДАННЫХ ТОВАРОВ VAPEBAZAR (products.js)
   ========================================================================== */

window.VAPE_PRODUCTS = [
    // ================= POD-СИСТЕМЫ =================
    {
        id: "pod_aegis_hero_5",
        name: "Aegis Hero 5",
        brand: "GeekVape",
        category: "Под-системы",
        price: 3700,
        image: "pod_aegis_hero_5.png",
        description: "🔥 ТОП НОВИНКА! Легендарное продолжение линейки Hero. Повышенная ударопрочность, мощный аккумулятор и идеальная передача вкуса.",
        flavors: ["Black", "Red Space", "Cyber Camo", "Silver Aura"],
        tags: ["🆕 NEW", "🔥 ТОП"],
        isNew: true,
        lowStock: 2,
        viewers: 22,
        inStock: true
    },
    {
        id: "pod_xros_5",
        name: "Vaporesso XROS 5",
        brand: "Vaporesso",
        category: "Под-системы",
        price: 3000,
        image: "pod_xros_5.png",
        description: "Новое поколение самого популярного пода. Улучшенная регулировка обдува, быстрая зарядка и супер-стильный корпус.",
        flavors: ["Matte Black", "Silver", "Neon Blue", "Pink Rose"],
        tags: [],
        inStock: true
    },
    {
        id: "pod_xros_6",
        name: "Vaporesso XROS 6",
        brand: "Vaporesso",
        category: "Под-системы",
        price: 3500,
        image: "pod_xros_6.png",
        description: "🔋 1800 мАч · 30W · 3 мл · Venturi Airflow. Готов к работе за 60 секунд. Цветной дисплей, картриджи 0.4Ω и 0.6Ω в комплекте. Флагман серии XROS.",
        flavors: ["Dreamy Pink [2 шт]", "Scorching Cloud [2 шт]", "Cosmic Black [2 шт]", "Carbon Fiber Grey [2 шт]", "Aurora Blue [2 шт]"],
        tags: ["🆕 NEW", "🔥 10 шт."],
        isNew: true,
        inStock: true
    },
    {
        id: "pod_xros_5_mini",
        name: "Vaporesso XROS 5 mini",
        brand: "Vaporesso",
        category: "Под-системы",
        price: 2000,
        image: "pod_xros_5_mini.png",
        description: "Компактная и ультра-удобная версия XROS 5. Идеально помещается в любой карман, работает автоматически от затяжки.",
        flavors: ["Black", "Space Grey", "Aurora", "Cherry Red"],
        tags: ["🆕 NEW"],
        isNew: true,
        viewers: 18,
        inStock: true
    },
    {
        id: "pod_knight_aio",
        name: "KNIGHT AIO 90W",
        brand: "Rincoe",
        category: "Под-системы",
        price: 4000,
        image: "pod_knight_aio.png",
        description: "🏪 МОЩНЫЙ КИТ! Серьезный девайс на 90W для ценителей плотного пара и полной кастомизации.",
        flavors: ["Stealth Black", "Cyber Punk", "Gunmetal"],
        tags: ["⚔️ PREMIUM"],
        isNew: false,
        lowStock: 1,
        inStock: true
    },
    {
        id: "pod_pasito2_le",
        name: "PASITO 2 L/E",
        brand: "Smoant",
        category: "Под-системы",
        price: 3500,
        oldPrice: 3700,
        image: "pod_pasito2_le.png",
        description: "Ограниченная серия легендарного Pasito 2. Максимальная автономность, картридж на 6 мл и отличная плата.",
        flavors: ["Space Grey", "Carbon Fiber", "Premium Leather"],
        tags: ["HOT"],
        isNew: false,
        inStock: false
    },

    // ================= ЖИДКОСТИ =================
    {
        id: "liq_anarhia_v2_brand",
        name: "Жидкость Анархия v2",
        brand: "АНАРХИЯ",
        category: "Жидкости",
        price: 500,
        image: "liq_anarhia_v2_brand.png",
        description: "Легендарная ультра-крепкая жидкость с леденящими и максимально насыщенными фруктово-ягодными миксами. Лютый вкус!",
        flavors: [
            "Кола сода айс (3 шт)", "Арбузно-клубничный коктейль (3 шт)", "Энергетик с лесными ягодами (3 шт)",
            "Малиновый лимонад (3 шт)", "Клюква смородина (3 шт)", "Клюква брусника (3 шт)",
            "Персик ананас (3 шт)", "Ягодный микс (3 шт)", "Энергетик личи (3 шт)",
            "Голубая малина розовая малина арбуз (3 шт)", "Черника голубика (3 шт)", "Арбузный фреш (3 шт)",
            "Манго смородина (3 шт)", "Фруктовая жвачка банан ананас (3 шт)", "Ананас вишня (3 шт)",
            "Киви драгон фрукт (3 шт)", "Вишня лайм (3 шт)", "Манго малина (3 шт)",
            "Личи маракуя (3 шт)", "Клубничный мохито (3 шт)"
        ],
        tags: ["🆕 NEW", "🔥 ЛЮТЫЙ ВКУС"],
        isNew: true,
        viewers: 27,
        inStock: true
    },
    {
        id: "liq_podonki",
        name: "Жидкость Podonki Critical",
        brand: "Podonki",
        category: "Жидкости",
        price: 500,
        image: "liq_podonki.png",
        description: "Дерзкая линейка жидкостей с яркими кислыми оттенками, сочными сочетаниями и приятным холодком.",
        flavors: [
            "Кислые лесные ягоды (3 шт)", "Кислая смородина черника (3 шт)", "Манго апельсин (3 шт)",
            "Кислый киви (3 шт)", "Земляника груша (3 шт)", "Малина ежевика Лёд (3 шт)",
            "Ягодный смузи (3 шт)", "Кислый малиновый лимонад (3 шт)", "Ягодный энергетик (3 шт)",
            "Бабл гам (3 шт)", "Кислые вишнёвые червячки (3 шт)", "Кола сода айс (3 шт)", "Кислый скитлс (3 шт)"
        ],
        tags: ["🔥 HARD"],
        isNew: false,
        inStock: true
    },
    {
        id: "liq_narcoz",
        name: "Жидкость Narcos 5%",
        brand: "NARCOZ",
        category: "Жидкости",
        price: 550,
        image: "liq_narcoz.png",
        description: "Плотные, затягивающие вкусы с отличным ТХ и долгим послевкусием. Настоящий топ для повседневного парения.",
        flavors: [
            "Скитлс (кислый) (2 шт)", "Love is (2 шт)", "Энергетик (2 шт)",
            "Кислый яблоко малина (2 шт)", "Жевачка с голубой малиной (2 шт)", "Манго черника смородина (2 шт)"
        ],
        tags: ["🆕 NEW"],
        isNew: true,
        inStock: true
    },
    {
        id: "liq_inflave",
        name: "Жидкость INFLAVE & BUBBLE",
        brand: "INFLAVE",
        category: "Жидкости",
        price: 725,
        image: "liq_inflave.png",
        description: "Премиальная жидкость с мягким солевым никотином, глубокой насыщенностью и долгим сохранением вкуса.",
        flavors: [
            "ЗЕЛЕНЫЙ ЯБЛОК", "ЧЕРНАЯ МЯТА", "АРБУЗНАЯ ЖВАЧКА", "ВИШНЕВАЯ ГАЗИРОВКА",
            "ЧЕРНИКА МАЛИНА", "ДЮШЕС", "КИСЛЫЙ РОЗОВЫЙ ЛИМОН", "ЛЕСНАЯ ЧЕРНИКА",
            "БАНАНОВАЯ ЖВАЧКА", "ПАНЕЛЬНЫЙ МАНГО", "ВИНОГРАДНЫЙ МИКС", "БЛИЖНИЙ МАНГО",
            "МАЛИНА ГРЕЙПФРУТ", "ЛИМОН МЯТА", "КОЛА", "ЖАСМИН МАЛИНА", "ПЕНСИОННЫЙ ПРИГОР"
        ],
        tags: ["💥 STRONG"],
        isNew: false,
        inStock: true
    },
    {
        id: "liq_annima_love",
        name: "Жидкость Annima love (Sour/Sweet/2%)",
        brand: "Annima",
        category: "Жидкости",
        price: 460,
        image: "liq_annima_love.png",
        description: "Сбалансированная и яркая линейка. Вкусы с потрясающей кислинкой и сладостью.",
        flavors: [
            "Annima Love 2% (Оригинал)", "Annima Love Sour (Кислый Тропик)", 
            "Кислые малиновые червячки", "Кислые малина лайм", 
            "Сочный персик", "Дыня черника"
        ],
        tags: ["❤️ SWEET/SOUR"],
        isNew: false,
        inStock: true
    },
    {
        id: "liq_oggo_premium",
        name: "Жидкость OGGO premium",
        brand: "OGGO",
        category: "Жидкости",
        price: 700,
        image: "liq_oggo_premium.png",
        description: "Качественные компоненты, мягкий ТХ и чистая вкусопередача на любых испарителях. Солевой никотин 40 мг.",
        flavors: ["Клубника Банан [3 шт]", "Лайм Яблоко", "Лесной Морс"],
        tags: ["ВЫБОР КЛИЕНТОВ"],
        isNew: false,
        inStock: true
    },

    // ================= ОДНОРАЗКИ =================
    {
        id: "dis_pafos_20000",
        name: "PAFOS 20000",
        brand: "PAFOS",
        category: "Одноразки",
        price: 2500,
        oldPrice: 2700,
        image: "dis_pafos_20000.png",
        description: "🔒 ЭКСКЛЮЗИВ — только у нас в Магадане! 20000 затяжек, крепкая соль 80 мг (8%). Плотный навал, стойкий вкус и долгая автономность. В офиц. вейп-шопах продавались по 2700 ₽ и уже сняты с продажи — успей забрать.",
        flavors: ["Кактус Лимон [4 шт]", "Двойное Яблоко [4 шт]"],
        tags: ["🔒 ЭКСКЛЮЗИВ", "🔥 8 шт.", "💥 80MG"],
        isNew: true,
        viewers: 19,
        inStock: true
    },
    {
        id: "dis_lost_mary_30000",
        name: "LOST MARY MO 30000",
        brand: "LOST MARY",
        category: "Одноразки",
        price: 1600,
        image: "dis_lost_mary_30000.png",
        description: "🚀 ХИТ ЗАВОЗА! Целых 30000 затяжек, огромный смарт-экран, регулировка мощности и невероятная стойкость вкуса. 50 мг соль.",
        flavors: ["Вишня [2 шт]", "Вишня Лайм [2 шт]", "Гранатовый Всплеск [2 шт]", "Грушевый Лимонад [2 шт]", "Киви Маракуйя Гуава [2 шт]", "Кислая Клубника Питайя [2 шт]", "Манго Ягоды [2 шт]", "Яблоко Гуава [2 шт]"],
        tags: ["🚀 ХИТ", "🆕 30k Puffs", "🔥 16 шт."],
        isNew: true,
        viewers: 34,
        inStock: true
    },
    {
        id: "dis_mfu_40000",
        name: "MFU 40000 (Max Puffs)",
        brand: "MFU",
        category: "Одноразки",
        price: 1900,
        image: "dis_mfu_40000.png",
        description: "📦 РЕКОРДСМЕН АВТОНОМНОСТИ! Мощный девайс на 40000 затяжек. Забудь о покупке новых одноразок на месяц.",
        flavors: ["Виноградный Айс", "Кислые Яблоки", "Малина-Лимонад", "Ананасовый Драйв"],
        tags: ["👑 MAX PUFFS", "🔥 КРУТОЕ"],
        isNew: false,
        inStock: false
    },
    {
        id: "dis_rick_morty_25000",
        name: "RICK AND MORTY 25000",
        brand: "RICK AND MORTY",
        category: "Одноразки",
        price: 1500,
        image: "dis_rick_morty_25000.png",
        description: "💨 Стильный интерактивный дизайн с любимыми героями и сочным баком на 25000 тяг. Отличный навал пара.",
        flavors: ["Ягодный Взрыв", "Мятный Скитлс", "Банан-Клубника", "Манго-Маракуйя"],
        tags: ["🛸 ДИЗАЙН"],
        isNew: false,
        inStock: false
    },

    // ================= РАСХОДНИКИ =================
    {
        id: "isp_geekvape_b",
        name: "Испаритель GEEK VAPE B-series",
        brand: "GeekVape",
        category: "Расходники",
        price: 350,
        image: "isp_geekvape_b.png",
        description: "Оригинальные испарители B-series (0.2Ω / 0.4Ω / 0.6Ω) для линеек Aegis Hero и Manto.",
        flavors: ["GEEK VAPE B 0.2 Ohm", "GEEK VAPE B 0.4 Ohm", "GEEK VAPE B 0.6 Ohm"],
        tags: ["⚙️ ИСПЫ"],
        isNew: false,
        inStock: true
    },
    {
        id: "isp_manto_015",
        name: "Испаритель MANTO AIO (0.15Ω)",
        brand: "Rincoe",
        category: "Расходники",
        price: 350,
        image: "isp_manto_015.png",
        description: "Сменный сеточный испаритель для устройств линейки Manto AIO на 0.15 Ом. Максимум навала.",
        flavors: ["1 шт"],
        tags: [],
        isNew: false,
        inStock: true
    },
    {
        id: "isp_smoant_k",
        name: "Испарители Smoant K1 / K5",
        brand: "Smoant",
        category: "Расходники",
        price: 350,
        image: "isp_smoant_k.png",
        description: "Фирменные сменные испарители для девайсов Smoant. Выбери нужную модель.",
        flavors: ["Smoant K1 (350₽)", "Smoant K5 (450₽)"],
        tags: [],
        isNew: false,
        inStock: true
    },
    {
        id: "cart_knight_80_kit",
        name: "Картридж Knight 80 + 2 испарителя",
        brand: "Rincoe",
        category: "Расходники",
        price: 1300,
        image: "cart_knight_80_kit.png",
        description: "Выгодный полный комплект: сменный пустой картридж для Knight 80 и 2 оригинальных испарителя в коробке.",
        flavors: ["1 комплект"],
        tags: ["🔥 ВЫГОДНО"],
        isNew: false,
        inStock: false
    },
    {
        id: "cart_pasito2",
        name: "Картридж Smoant Pasito 2 / Knight 80",
        brand: "Smoant",
        category: "Расходники",
        price: 550,
        image: "cart_pasito2.png",
        description: "Оригинальный пустой картридж для Pasito 2 на 6 мл под сменные испарители.",
        flavors: ["1 шт"],
        tags: [],
        isNew: false,
        inStock: false
    },
    {
        id: "cart_xros_all",
        name: "Картриджи XROS Series / COREX 3.0",
        brand: "Vaporesso",
        category: "Расходники",
        price: 350,
        image: "cart_xros_all.png",
        description: "Сменные картриджи для всей серии XROS (0.4Ω / 0.6Ω / 0.8Ω) с обновленной технологией вкуса COREX 3.0.",
        flavors: ["XROS Series 0.4 Ohm", "XROS Series 0.6 Ohm", "XROS Series 0.8 Ohm", "XROS COREX 3.0"],
        tags: ["🔥 ТОП СБОРКА"],
        isNew: false,
        inStock: true
    },
    {
        id: "cart_luxe_x",
        name: "Картридж Vaporesso Luxe X (0.8Ω)",
        brand: "Vaporesso",
        category: "Расходники",
        price: 275,
        image: "cart_luxe_x.png",
        description: "Оригинальный картридж для под-систем линейки Luxe X. Объем 5мл, сопротивление 0.8 Ом.",
        flavors: ["1 шт"],
        tags: [],
        isNew: false,
        inStock: true
    },
    {
        id: "cart_ursa_nano",
        name: "Картридж Lost Vape Ursa Nano (0.8Ω)",
        brand: "Lost Vape",
        category: "Расходники",
        price: 350,
        image: "cart_ursa_nano.png",
        description: "Сменный картридж для под-систем серии Ursa (Nano, Baby, Pro). Мягкая затяжка.",
        flavors: ["1 шт"],
        tags: [],
        isNew: false,
        inStock: true
    },
    {
        id: "cart_manto_ultra_empty",
        name: "Картридж Rincoe Manto Ultra Empty",
        brand: "Rincoe",
        category: "Расходники",
        price: 550,
        image: "cart_manto_ultra_empty.png",
        description: "Сменный пустой картридж для Manto Ultra. Прочный пластик, защита от протечек.",
        flavors: ["1 шт"],
        tags: [],
        isNew: false,
        inStock: true
    },
    {
        id: "rba_base",
        name: "Обслуживаемая RBA база",
        brand: "Универсал",
        category: "Расходники",
        price: 750,
        image: "rba_base.png",
        description: "⚙️ Для мастеров! База для самостоятельной намотки койлов и укладки ваты.",
        flavors: ["1 шт"],
        tags: [],
        isNew: false,
        inStock: true
    },
    {
        id: "battery_18650",
        name: "Аккумулятор АКБ 18650",
        brand: "🔋 БАТАРЕИ",
        category: "Расходники",
        price: 550,
        image: "battery_18650.png",
        description: "Качественные высокотоковые аккумуляторы формата 18650 для твоих вейп-модов.",
        flavors: ["Обычный 18650 (550₽)", "Ограниченная серия 18650 L/E (750₽)"],
        tags: ["🔋 АКБ"],
        isNew: false,
        inStock: true
    },

    // ================= ТАБАК / СНЮС =================
    {
        id: "snus_cataclysm",
        name: "Снюс Cataclysm",
        brand: "Cataclysm",
        category: "Другое",
        price: 500,
        image: "snus_cataclysm.png",
        description: "🧪 Крепкий качественный снюс со стойким бодрящим эффектом.",
        flavors: ["Цитрус микс", "Колддрай", "Брауни", "Корица"],
        tags: ["🔥 СНЮС"],
        isNew: false,
        inStock: true
    },

    // ================= APPLE / ТЕХНИКА (под заказ из Дубая) =================
    {
        id: "iphone_15_128",
        name: "iPhone 15 128 ГБ",
        brand: "Apple",
        category: "🍏 Apple",
        price: 51090,
        preOrder: true,
        description: "📦 Под заказ из Дубая · предоплата 50% · доставка 7–14 дней. Цвет чёрный · 128 ГБ · nano-SIM + eSIM. РФ-версия (RU), новый, не активирован. Оригинал Apple — ниже магазинных цен.",
        tags: ["🍏 Apple"],
        isNew: true,
        inStock: true
    },
    {
        id: "iphone_16_128",
        name: "iPhone 16 128 ГБ",
        brand: "Apple",
        category: "🍏 Apple",
        price: 57819,
        preOrder: true,
        description: "📦 Под заказ из Дубая · предоплата 50% · доставка 7–14 дней. Цвет бирюзовый · 128 ГБ · nano-SIM + eSIM. РФ-версия (RU), новый, не активирован. Оригинал Apple — ниже магазинных цен.",
        tags: ["🍏 Apple"],
        isNew: true,
        inStock: true
    },
    {
        id: "iphone_17_256",
        name: "iPhone 17 256 ГБ",
        brand: "Apple",
        category: "🍏 Apple",
        price: 72823,
        preOrder: true,
        description: "📦 Под заказ из Дубая · предоплата 50% · доставка 7–14 дней. Цвет чёрный · 256 ГБ · eSIM + eSIM. РФ-версия (RU), новый, не активирован. Оригинал Apple — ниже магазинных цен.",
        tags: ["🍏 Apple", "🆕 NEW"],
        isNew: true,
        inStock: true
    },
    {
        id: "iphone_17_pro_256",
        name: "iPhone 17 Pro 256 ГБ",
        brand: "Apple",
        category: "🍏 Apple",
        price: 103234,
        preOrder: true,
        description: "📦 Под заказ из Дубая · предоплата 50% · доставка 7–14 дней. Цвет оранжевый · 256 ГБ (12 ГБ RAM) · eSIM + eSIM. РФ-версия (RU), новый, не активирован. Оригинал Apple — топ линейки, ниже магазинных цен.",
        tags: ["🍏 Apple", "⚔️ PREMIUM"],
        isNew: true,
        inStock: true
    },

    // ----- MacBook -----
    {
        id: "mac_air13_m3_256",
        name: "MacBook Air 13″ M3 256 ГБ",
        brand: "Apple",
        category: "🍏 Apple",
        price: 95000,
        preOrder: true,
        description: "📦 Под заказ из Дубая · предоплата 50% · доставка 7–14 дней. Чип Apple M3, 13.6″ Liquid Retina, 8 ГБ / 256 ГБ SSD. Оригинал, новый, запечатан.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🍏 Apple"],
        isNew: false,
        inStock: true
    },
    {
        id: "mac_air15_m3_256",
        name: "MacBook Air 15″ M3 256 ГБ",
        brand: "Apple",
        category: "🍏 Apple",
        price: 110000,
        preOrder: true,
        description: "📦 Под заказ из Дубая · предоплата 50% · доставка 7–14 дней. Чип Apple M3, большой 15.3″ Liquid Retina, 8 ГБ / 256 ГБ SSD. Оригинал, новый, запечатан.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🍏 Apple"],
        isNew: false,
        inStock: true
    },
    {
        id: "mac_air13_m5_1tb",
        name: "MacBook Air 13″ M5 24/1 ТБ",
        brand: "Apple",
        category: "🍏 Apple",
        price: 118000,
        preOrder: true,
        description: "📦 Под заказ из Дубая · предоплата 50% · доставка 7–14 дней. Новейший чип Apple M5, 24 ГБ ОЗУ / 1 ТБ SSD — топ конфигурация. Оригинал, новый, запечатан.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🍏 Apple", "🆕 NEW", "⚔️ PREMIUM"],
        isNew: false,
        inStock: true
    },
    {
        id: "mac_13_8_512",
        name: "MacBook neo 13″ 8/512 ГБ (англ.)",
        brand: "Apple",
        category: "🍏 Apple",
        price: 60000,
        preOrder: true,
        description: "📦 Под заказ из Дубая · предоплата 50% · доставка 7–14 дней. 8 ГБ / 512 ГБ SSD, английская раскладка клавиатуры. Оригинал, новый.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🍏 Apple"],
        isNew: false,
        inStock: true
    },

    // ----- AirPods -----
    {
        id: "airpods_pro3",
        name: "AirPods Pro 3",
        brand: "Apple",
        category: "🍏 Apple",
        price: 19000,
        preOrder: true,
        description: "📦 Под заказ из Дубая · доставка 7–14 дней. Активное шумоподавление, прозрачный режим, кейс с зарядкой MagSafe. Оригинал, новые, запечатаны.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🍏 Apple", "🆕 NEW"],
        isNew: false,
        inStock: true
    },
    {
        id: "airpods_4",
        name: "AirPods 4",
        brand: "Apple",
        category: "🍏 Apple",
        price: 13000,
        preOrder: true,
        description: "📦 Под заказ из Дубая · доставка 7–14 дней. Базовая версия AirPods 4 — лёгкие, чистый звук, удобная посадка. Оригинал, новые, запечатаны.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🍏 Apple"],
        isNew: false,
        inStock: true
    },

    // ----- Apple Watch -----
    {
        id: "watch_se3_40",
        name: "Apple Watch SE 3 40 мм",
        brand: "Apple",
        category: "🍏 Apple",
        price: 20000,
        preOrder: true,
        description: "📦 Под заказ из Дубая · доставка 7–14 дней. Корпус 40 мм, GPS. Оригинал, новые, запечатаны.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🍏 Apple"],
        isNew: false,
        inStock: true
    },
    {
        id: "watch_se3_43",
        name: "Apple Watch SE 3 43 мм",
        brand: "Apple",
        category: "🍏 Apple",
        price: 22000,
        preOrder: true,
        description: "📦 Под заказ из Дубая · доставка 7–14 дней. Корпус 43 мм, GPS — экран крупнее. Оригинал, новые, запечатаны.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🍏 Apple"],
        isNew: false,
        inStock: true
    },
    {
        id: "watch_s11_42",
        name: "Apple Watch Series 11 42 мм",
        brand: "Apple",
        category: "🍏 Apple",
        price: 27000,
        preOrder: true,
        description: "📦 Под заказ из Дубая · доставка 7–14 дней. Корпус 42 мм, яркий Always-On дисплей, расширенные датчики здоровья. Оригинал, новые, запечатаны.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🍏 Apple", "🆕 NEW"],
        isNew: false,
        inStock: true
    },
    {
        id: "watch_ultra2",
        name: "Apple Watch Ultra 2",
        brand: "Apple",
        category: "🍏 Apple",
        price: 78000,
        preOrder: true,
        description: "📦 Под заказ из Дубая · предоплата 50% · доставка 7–14 дней. Титановый корпус 49 мм, максимальная автономность, для спорта и приключений. Оригинал, новые, запечатаны.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🍏 Apple", "⚔️ PREMIUM"],
        isNew: false,
        inStock: true
    },

    // ----- Аксессуары Apple -----
    {
        id: "acc_charger_20w",
        name: "Зарядка Apple 20W USB-C",
        brand: "Apple",
        category: "🍏 Apple",
        price: 1500,
        preOrder: true,
        description: "📦 Под заказ · оригинальный адаптер питания USB-C 20W для быстрой зарядки iPhone. \n\n💱 Цена может меняться от курса.",
        tags: ["🍏 Apple"],
        isNew: false,
        inStock: true
    },
    {
        id: "acc_case_iphone",
        name: "Чехол для iPhone 15/16/17",
        brand: "Apple",
        category: "🍏 Apple",
        price: 990,
        preOrder: true,
        description: "📦 Под заказ · защитный чехол для iPhone 15 / 16 / 17. Уточните модель и цвет у менеджера.\n\n💱 Цена может меняться от курса.",
        tags: ["🍏 Apple"],
        isNew: false,
        inStock: true
    },

    // ----- Samsung -----
    {
        id: "samsung_s25_256",
        name: "Samsung Galaxy S25 12/256 ГБ",
        brand: "Samsung",
        category: "📱 Samsung",
        price: 45000,
        preOrder: true,
        description: "📦 Под заказ · предоплата 50% · доставка 7–14 дней. 6.2″ Dynamic AMOLED 2X 120 Гц, Snapdragon 8 Elite, 12 ГБ / 256 ГБ, камера 50 МП, One UI 7. Оригинал, новый.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["📱 Samsung"],
        isNew: false,
        inStock: true
    },
    {
        id: "samsung_s25_ultra_256",
        name: "Samsung Galaxy S25 Ultra 12/256 ГБ",
        brand: "Samsung",
        category: "📱 Samsung",
        price: 65000,
        preOrder: true,
        description: "📦 Под заказ · предоплата 50% · доставка 7–14 дней. 6.9″ AMOLED 120 Гц, Snapdragon 8 Elite, 12 ГБ / 256 ГБ, камера 200 МП, перо S Pen, титан. Оригинал, новый.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["📱 Samsung", "⚔️ PREMIUM"],
        isNew: false,
        inStock: true
    },
    {
        id: "samsung_s25_ultra_512",
        name: "Samsung Galaxy S25 Ultra 12/512 ГБ",
        brand: "Samsung",
        category: "📱 Samsung",
        price: 70000,
        preOrder: true,
        description: "📦 Под заказ · предоплата 50% · доставка 7–14 дней. 6.9″ AMOLED 120 Гц, Snapdragon 8 Elite, 12 ГБ / 512 ГБ, камера 200 МП, перо S Pen, титан. Оригинал, новый.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["📱 Samsung", "⚔️ PREMIUM"],
        isNew: false,
        inStock: true
    },
    {
        id: "samsung_watch_ultra",
        name: "Galaxy Watch Ultra 2025 eSIM 47 мм",
        brand: "Samsung",
        category: "📱 Samsung",
        price: 25000,
        preOrder: true,
        description: "📦 Под заказ · доставка 7–14 дней. Титановый корпус 47 мм, eSIM 4G (звонки без телефона), Wear OS. Оригинал, новые.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["📱 Samsung"],
        isNew: false,
        inStock: true
    },

    // ----- Игровые консоли -----
    {
        id: "console_switch2",
        name: "Nintendo Switch 2 (глобальная)",
        brand: "Nintendo",
        category: "🎮 Консоли",
        price: 38000,
        preOrder: true,
        description: "📦 Под заказ · предоплата 50% · доставка 7–14 дней. Глобальная версия новой Nintendo Switch 2. Оригинал, новая, запечатана.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🎮 Консоли", "🆕 NEW"],
        isNew: false,
        inStock: true
    },
    {
        id: "console_ps5_slim_digital",
        name: "PlayStation 5 Slim Digital 825 ГБ",
        brand: "Sony",
        category: "🎮 Консоли",
        price: 50000,
        preOrder: true,
        description: "📦 Под заказ · предоплата 50% · доставка 7–14 дней. PS5 Slim без дисковода (цифровая), накопитель 825 ГБ. Оригинал, новая, запечатана.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🎮 Консоли"],
        isNew: false,
        inStock: true
    },
    {
        id: "console_ps5_slim_disc",
        name: "PlayStation 5 Slim Blu-ray 1 ТБ",
        brand: "Sony",
        category: "🎮 Консоли",
        price: 55000,
        preOrder: true,
        description: "📦 Под заказ · предоплата 50% · доставка 7–14 дней. PS5 Slim с дисководом Blu-ray, накопитель 1 ТБ. Оригинал, новая, запечатана.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🎮 Консоли"],
        isNew: false,
        inStock: true
    },
    {
        id: "console_ps5_pro",
        name: "PlayStation 5 Pro 2 ТБ",
        brand: "Sony",
        category: "🎮 Консоли",
        price: 70000,
        preOrder: true,
        description: "📦 Под заказ · предоплата 50% · доставка 7–14 дней. PS5 Pro без дисковода, накопитель 2 ТБ — максимальная производительность. Оригинал, новая, запечатана.\n\n💱 Цена ориентировочная — зависит от курса $ и таможни на момент заказа, финал подтвердит менеджер.",
        tags: ["🎮 Консоли", "⚔️ PREMIUM"],
        isNew: false,
        inStock: true
    }
];

/* ==========================================================================
   ВЫГОДНЫЕ НАБОРЫ (КОМБО)
   price — цена набора, oldPrice — сумма по отдельности (для зачёркивания).
   items — что входит (для отображения и в составе заказа).
   ========================================================================== */
window.VAPE_COMBOS = [
    {
        id: "combo_starter_mini",
        emoji: "🚀",
        name: "Стартовый набор",
        items: ["Vaporesso XROS 5 mini", "Анархия v2 ×2"],
        price: 2600,
        oldPrice: 3000
    },
    {
        id: "combo_aegis_full",
        emoji: "⚔️",
        name: "Aegis под ключ",
        items: ["Aegis Hero 5", "Жидкость Анархия", "Испаритель GeekVape B"],
        price: 3990,
        oldPrice: 4550
    },
    {
        id: "combo_xros_pro",
        emoji: "💨",
        name: "XROS PRO",
        items: ["Vaporesso XROS 5", "Картридж XROS", "Жидкость Narcos"],
        price: 3400,
        oldPrice: 3900
    }
];
