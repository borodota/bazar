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
        tags: ["🆕 NEW"],
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
        inStock: true
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
        price: 450,
        image: "liq_oggo_premium.png",
        description: "Качественные компоненты, мягкий ТХ и чистая вкусопередача на любых испарителях.",
        flavors: ["Лайм яблоко", "Лесной морс"],
        tags: ["ВЫБОР КЛИЕНТОВ"],
        isNew: false,
        inStock: true
    },

    // ================= ОДНОРАЗКИ =================
    {
        id: "dis_lost_mary_30000",
        name: "LOST MARY MO 30000",
        brand: "LOST MARY",
        category: "Одноразки",
        price: 1600,
        oldPrice: 1700,
        image: "dis_lost_mary_30000.png",
        description: "🚀 ХИТ ЗАВОЗА! Целых 30000 затяжек, огромный смарт-экран, регулировка мощности и невероятная стойкость вкуса.",
        flavors: ["Тропический Микс", "Клубничный Мохито", "Черника-Мята", "Двойной Арбуз"],
        tags: ["🚀 ХИТ", "🆕 30k Puffs"],
        isNew: true,
        lowStock: 1,
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
        inStock: true
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
        inStock: true
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
        inStock: true
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
    }
];
