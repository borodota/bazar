/* Independent prototype. No store API, bot calls, payments or order writes. */
'use strict';
const $ = selector => document.querySelector(selector);
const iconPaths = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  catalog:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  box:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v10l9 5 9-5V8M12 13v10M7.5 5.5l9 5"/>',
  gift:'<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/>',
  chat:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l2-5a8.5 8.5 0 1 1 16-3.5Z"/><path d="M8 10h8M8 14h5"/>',
  headphones:'<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
  book:'<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15"/>',
  settings:'<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
  laptop:'<rect x="4" y="3" width="16" height="13" rx="1"/><path d="M2 20h20l-2-4H4Z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  cloud:'<path d="M5 17a5 5 0 0 1-1-10 7 7 0 0 1 12-3m3 4a5 5 0 0 1 0 10h-7M3 21 21 3"/>'
};
const icon = (name, extra='') => '<svg class="icon '+extra+'" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7">'+(iconPaths[name] || iconPaths.info)+'</svg>';
const safe = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const products = [
  {id:'phone',name:'Смартфоны',category:'Смартфоны',image:'assets/tech.webp',alternate:'assets/japan.webp',description:'Демонстрация раздела смартфонов. На обложке — иллюстрация категории, а не фото выбранной модели.',variants:['Графит','Серебро'],memory:['128 ГБ','256 ГБ']},
  {id:'laptop',name:'Ноутбуки',category:'Техника',image:'assets/tech.webp',alternate:'assets/japan.webp',description:'Демонстрация раздела ноутбуков. Конкретные модели, комплектация и цены пока не заданы.',variants:['Тёмный','Светлый']},
  {id:'accessories',name:'Аксессуары',category:'Аксессуары',image:'assets/accessories.webp',alternate:'assets/tech.webp',description:'Иллюстрация категории аксессуаров. Совместимость с устройством необходимо уточнить.',variants:['Вариант 1','Вариант 2']},
  {id:'gaming',name:'Игровые устройства',category:'Техника',image:'assets/gaming.webp',alternate:'assets/japan.webp',description:'Иллюстрация категории игровых устройств. Модель и комплектация ещё не выбраны.',variants:['Вариант 1','Вариант 2']}
];
const categories = ['Все','Смартфоны','Техника','Аксессуары'];
const titles={home:'Главная',catalog:'Каталог',product:'Товар',vpn:'VPN',profile:'Профиль',orders:'Мои заказы',myvpn:'Мой VPN',favorites:'Избранное',bonus:'Бонусы',settings:'Настройки',guide:'Как подключиться',support:'Поддержка',loading:'Загрузка',empty:'Ничего не найдено',error:'Ошибка сети'};
const navItems=[['home','Главная','home'],['catalog','Каталог','catalog'],['vpn','VPN','shield'],['profile','Профиль','user']];
let favorites=new Set(),query='',category='Все',devices=2,months=1,platform='iOS',theme='dark',reduceMotion=false;
let currentPage='',filterSort='default',filterSaved=false,toastTimer,returnRoute='catalog',productVariant=0,productMemory=0,productImage=0,lastProduct='';
const scrollPositions = new Map();
try {
  const prefs=JSON.parse(localStorage.getItem('vb-japan-concept-v2') || '{}');
  if(Array.isArray(prefs.favorites))favorites=new Set(prefs.favorites.filter(id=>products.some(p=>p.id===id)));
  if(['dark','light','system'].includes(prefs.theme))theme=prefs.theme;
  reduceMotion=prefs.reduceMotion===true;
} catch (_) { /* Browser storage is optional. */ }
function savePreferences(){
  try{localStorage.setItem('vb-japan-concept-v2',JSON.stringify({favorites:[...favorites],theme,reduceMotion}));}catch(_){}
}
function applyPreferences(){
  const light=theme==='light'||(theme==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches);
  document.body.classList.toggle('light',light);
  document.body.classList.toggle('reduce-motion',reduceMotion);
}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;toastTimer=setTimeout(()=>{$('#toast').textContent='';},3000);}
const linkButton=(label,route,outline=false)=>'<a class="'+(outline?'outline':'primary')+'" href="#'+route+'">'+label+icon('arrow')+'</a>';
const back=(route='profile',label='Профиль')=>'<a class="back" href="#'+route+'">'+icon('back')+label+'</a>';
function hero(title,subtitle='',type='compact'){
  return '<section class="hero '+type+'"><span class="eyebrow">VAPEBAZAR · 夜</span><h1>'+title+'</h1>'+(subtitle?'<p>'+subtitle+'</p>':'')+'</section>';
}
const row=(label,route,name='chevron',sub='')=>'<a class="row" href="#'+route+'">'+icon(name)+'<span class="row-text">'+label+(sub?'<small>'+sub+'</small>':'')+'</span>'+icon('chevron','chevron')+'</a>';
const supportBlock=()=>'<div class="panel rows">'+row('Поможем с выбором','support','headphones','Техника, устройства и подключение')+'</div>';
function card(p){
  const marked=favorites.has(p.id);
  return '<article class="card"><button class="heart" data-fav="'+p.id+'" aria-pressed="'+marked+'" aria-label="'+(marked?'Убрать из избранного: ':'Добавить в избранное: ')+p.name+'">'+icon('heart')+'</button><a class="card-media" data-product="'+p.id+'" href="#product/'+p.id+'" tabindex="-1" aria-hidden="true"><img src="'+p.image+'" alt="" loading="lazy" width="360" height="360"></a><div class="card-body"><h3>'+p.name+'</h3><small>Демо-каталог</small><a class="outline" data-product="'+p.id+'" href="#product/'+p.id+'">Подробнее'+icon('arrow')+'</a></div></article>';
}
const grid=items=>'<div class="grid">'+items.map(card).join('')+'</div>';
function searchForm(home=false){
  return '<form class="search-form" data-search-form><label class="search-box">'+icon('search')+'<input id="search" type="search" name="q" maxlength="120" aria-label="Поиск по каталогу" placeholder="'+(home?'Что ищешь?':'Поиск по каталогу')+'" value="'+safe(query)+'" enterkeyhint="search" autocomplete="off"><button class="icon-button" type="'+(home?'submit':'button')+'" '+(home?'aria-label="Найти"':'data-action="clear-search" aria-label="Очистить поиск"')+'>'+(home?icon('arrow'):'×')+'</button></label></form>';
}
function chips(){return '<div class="chips" aria-label="Категории">'+categories.map(c=>'<button data-category="'+c+'" aria-pressed="'+(category===c)+'">'+c+'</button>').join('')+'</div>';}
function emptyState(kind='search'){
  if(kind==='favorites')return '<section class="panel empty">'+icon('heart','state-icon')+'<h2>В избранном пока пусто</h2><p>Сохраняйте интересные товары нажатием на сердце.</p>'+linkButton('Открыть каталог','catalog')+'</section>';
  if(kind==='orders')return '<section class="panel empty">'+icon('box','state-icon')+'<h2>Заказов пока нет</h2><p>Здесь появится история заказов. В этом макете заказы не создаются.</p>'+linkButton('Открыть каталог','catalog')+'</section>';
  return '<section class="panel empty">'+icon('search','state-icon')+'<h2>Ничего не найдено</h2><p>Попробуйте другое название или сбросьте фильтры.</p><div class="stack"><button class="primary" data-action="reset-filters">Сбросить фильтры</button><button class="outline" data-action="clear-search">Очистить поиск</button></div></section>';
}
function results(){
  const target=$('#results');if(!target)return;
  let list=products.filter(p=>(category==='Все'||p.category===category)&&(!filterSaved||favorites.has(p.id))&&p.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru').trim()));
  if(filterSort==='name')list.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  target.innerHTML=list.length?grid(list):emptyState();
  $('#result-count').textContent='Найдено: '+list.length;
}
function catalog(state='catalog'){
  let body=back('home','Главная')+hero('Каталог','Техника и аксессуары')+searchForm()+chips();
  if(state!=='catalog')body+='<p class="notice">Демонстрация состояния</p>';
  if(state==='loading')body+='<p class="loading-label" role="status">Загружаем товары…</p><div class="grid" aria-busy="true" aria-label="Пример загрузки">'+Array.from({length:4},()=>'<div class="skeleton" aria-hidden="true"><div class="block"></div><div class="bar"></div><div class="bar short"></div><div class="bar button"></div></div>').join('')+'</div><p>'+linkButton('Вернуться в каталог','catalog',true)+'</p>';
  else if(state==='error')body+='<section class="panel empty error">'+icon('cloud','state-icon')+'<h2>Не удалось загрузить товары</h2><p>Проверьте интернет-соединение и попробуйте снова.</p><div class="stack"><button class="primary" data-action="retry">Повторить</button>'+linkButton('Написать в поддержку','support',true)+'</div><p class="small">Выбранные фильтры сохранены</p></section>';
  else if(state==='empty')body+=emptyState();
  else body+='<div class="section-heading"><span id="result-count" class="small" role="status"></span><button class="text-button" data-action="filters">'+icon('settings')+'Фильтры'+(filterSaved||filterSort!=='default'?' · активны':'')+'</button></div><div id="results"></div><p class="small">На обложках — иллюстрации категорий, не фотографии выбранных моделей.</p><details class="panel"><summary>Информационные разделы · 18+</summary><p>Под-системы и жидкости. В этом концепте представлены только названия разделов, без товарных предложений и заказа.</p></details>';
  return body+supportBlock();
}
function productPage(id){
  const p=products.find(x=>x.id===id);
  if(!p)return back('catalog','Каталог')+hero('Товар не найден','Откройте каталог и выберите другой товар.')+linkButton('Открыть каталог','catalog');
  if(lastProduct!==id){productVariant=0;productMemory=0;productImage=0;lastProduct=id;}
  return back(returnRoute,returnRoute==='favorites'?'Избранное':'Каталог')+
    '<img class="detail-image" id="product-image" src="'+(productImage?p.alternate:p.image)+'" alt="Иллюстрация категории: '+p.name+'" width="480" height="420"><div class="thumbnails" aria-label="Изображения">'+[p.image,p.alternate].map((im,i)=>'<button data-photo="'+i+'" aria-pressed="'+(productImage===i)+'" aria-label="'+(i?'Атмосферная иллюстрация':'Обложка категории')+'"><img src="'+im+'" alt=""></button>').join('')+'</div><h1>'+p.name+'</h1><span class="tag">Демонстрационный товар</span><p class="muted">'+p.description+'</p><section class="panel"><fieldset><legend>Выберите вариант</legend><div class="segments">'+p.variants.map((v,i)=>'<button data-variant="'+i+'" aria-pressed="'+(productVariant===i)+'">'+v+'</button>').join('')+'</div></fieldset>'+
    (p.memory?'<fieldset><legend>Объём памяти</legend><div class="segments">'+p.memory.map((v,i)=>'<button data-memory="'+i+'" aria-pressed="'+(productMemory===i)+'">'+v+'</button>').join('')+'</div></fieldset>':'')+'<p class="small">Варианты приведены только для демонстрации выбора.</p></section><section class="panel"><details><summary>Описание</summary><p>'+p.description+'</p></details><details><summary>Характеристики</summary><p>Характеристики, комплект поставки и совместимость будут указаны после выбора конкретной модели.</p></details></section><div class="product-actions"><div class="total"><span>Стоимость</span><strong>Не задана</strong></div><button class="primary wide" data-action="product-details">Уточнить детали'+icon('arrow')+'</button></div>';
}
function vpnPage(){
  return back('home','Главная')+hero('Оставайся<br>на связи','Выбери подключение под себя','vpn-hero')+'<section class="panel"><fieldset><legend>Количество устройств</legend><div class="segments">'+[1,2,3,5].map(n=>'<button data-devices="'+n+'" aria-pressed="'+(devices===n)+'">'+n+'</button>').join('')+'</div></fieldset><fieldset><legend>Срок подключения</legend><div class="segments">'+[1,3,6].map(n=>'<button data-months="'+n+'" aria-pressed="'+(months===n)+'">'+n+' '+(n===1?'месяц':n===3?'месяца':'месяцев')+'</button>').join('')+'</div></fieldset><div class="total"><span>Стоимость</span><strong>Не задана</strong></div><p class="small">Демонстрационные параметры. Оплата и выдача доступа не подключены.</p><p><button class="primary wide" data-action="vpn-summary">Посмотреть выбор'+icon('arrow')+'</button></p></section><div class="panel rows">'+row('Как подключиться','guide','book','Инструкция для устройства')+row('Поддержка','support','chat','Помощь с настройкой')+'</div>';
}
function profilePage(){
  return '<section class="hero profile-hero"><span class="brand-mark large" aria-hidden="true">VB</span><h1>Твой профиль</h1><p>Демонстрационный аккаунт</p></section><div class="shortcuts"><a class="shortcut" href="#orders">'+icon('box')+'Мои заказы</a><a class="shortcut" href="#favorites">'+icon('heart')+'Избранное · '+favorites.size+'</a></div><div class="panel vpn-card">'+icon('shield','shield')+'<div><h2>Мой VPN</h2><p class="muted">Подписка не подключена</p>'+linkButton('Открыть','myvpn',true)+'</div></div><div class="panel rows">'+row('Бонусы','bonus','gift','Условия пока не заданы')+row('Настройки','settings','settings')+row('Поддержка','support','headphones')+'</div>';
}
function settingsPage(){
  return back()+hero('Настройки','Всё под тебя')+'<h2>Оформление</h2><section class="panel rows"><label class="row" for="theme"><span class="row-text">Тема</span><select class="setting-select" id="theme"><option value="dark" '+(theme==='dark'?'selected':'')+'>Японская ночь</option><option value="light" '+(theme==='light'?'selected':'')+'>Светлая</option><option value="system" '+(theme==='system'?'selected':'')+'>Как в системе</option></select></label><label class="row" for="motion"><span class="row-text">Уменьшить анимацию<small>Меньше движения и эффектов</small></span><input class="switch" type="checkbox" id="motion" '+(reduceMotion?'checked':'')+'></label></section><h2>Приложение</h2><section class="panel rows"><div class="row"><span class="row-text">Язык</span><span class="muted">Русский</span></div><label class="row"><span class="row-text">Уведомления<small>В концепте не подключены</small></span><input class="switch" type="checkbox" disabled aria-label="Уведомления недоступны"></label></section><h2>Помощь</h2><div class="panel rows">'+row('Поддержка','support','headphones')+'<button class="row wide text-button" data-action="about">'+icon('info')+'О приложении</button></div><details class="panel"><summary>Просмотр UX-состояний</summary><p class="small">Примеры для проверки макета; реальные запросы не выполняются.</p><div class="stack">'+linkButton('Загрузка','loading',true)+linkButton('Пустая выдача','empty',true)+linkButton('Ошибка сети','error',true)+'</div></details>';
}
function guidePage(){
  return back('myvpn','Мой VPN')+hero('Как подключиться','Выберите устройство')+'<div class="segments" aria-label="Устройство">'+['iOS','Android','Компьютер'].map(p=>'<button data-platform="'+p+'" aria-pressed="'+(platform===p)+'">'+p+'</button>').join('')+'</div><section class="panel"><h2 id="platform-title">Инструкция · '+platform+'</h2><ol class="steps"><li><div><h3>Приложение</h3><p>Название клиента пока не задано.</p></div></li><li><div><h3>Настройки подключения</h3><p>Данные появятся после подключения сервиса.</p></div></li><li><div><h3>Проверка соединения</h3><p>Порядок проверки будет добавлен.</p></div></li></ol><p class="notice">Это макет инструкции, не готовое руководство.</p></section><div class="stack">'+linkButton('Помощь с настройкой','support')+linkButton('Вернуться в Мой VPN','myvpn',true)+'</div>';
}
const supportTopics = {
  'Вопрос о технике': 'Укажите модель устройства, нужный вариант и что хотите уточнить: совместимость, комплектацию или характеристики.',
  'Мой заказ': 'Если вопрос о реальном заказе, подготовьте его номер. Заказы действующего магазина в этом макете не отображаются.',
  'Настройка VPN': 'Укажите устройство, операционную систему и на каком шаге возник вопрос. Пароли и ключи доступа присылать не нужно.',
  'Другой вопрос': 'Опишите, что вы хотели сделать и что получилось. Если появилась ошибка, добавьте её текст.',
  'Общий вопрос': 'Опишите ваш вопрос — можно уточнить тему в поле ниже.'
};
const supportDrafts = new Map();
let supportTopic = 'Общий вопрос';
const faqItems = [
  ['Как выбрать технику?', 'Откройте каталог, выберите категорию и нажмите «Подробнее». На странице товара можно переключить демонстрационные варианты. Для уточнения модели и совместимости выберите тему «Вопрос о технике».'],
  ['Как найти и сохранить товар?', 'Введите название в поиске или выберите категорию. Сердце на карточке добавляет товар в избранное. Сохранённые товары доступны через профиль в этом браузере.'],
  ['Почему нет цены и наличия?', 'Это отдельный концепт. Цены, наличие и характеристики конкретных моделей здесь не подключены. Мы не показываем демонстрационные значения как действующие условия.'],
  ['Где мой заказ?', 'Раздел «Мои заказы» находится в профиле. Макет не подключён к заказам основного магазина, поэтому реальные покупки здесь не отображаются.'],
  ['Как выбрать VPN?', 'В разделе VPN выберите количество устройств и срок, затем нажмите «Посмотреть выбор». Откроется сводка. В макете это не оформляет подписку и не списывает деньги.'],
  ['Где инструкция подключения VPN?', 'Откройте «Мой VPN» → «Как подключиться» и выберите устройство. Пока сервис не подключён, инструкция содержит пояснения о недостающих настройках, а не рабочие ключи доступа.'],
  ['Как отключить анимацию?', 'В профиле откройте «Настройки» и включите «Уменьшить анимацию». Приложение также учитывает системную настройку уменьшения движения.'],
  ['Что происходит с моим вопросом?', 'В макете можно подготовить и скопировать черновик вопроса. Он никому не отправляется. Текст сохраняется только в памяти открытой страницы и исчезает после её перезагрузки.']
];
function supportPage(){
  return back()+hero('Поможем<br>разобраться','Ответы и помощь в одном месте','vpn-hero')+
    '<div class="section-heading"><h2>Выберите тему</h2></div><section class="panel rows support-topics">'+
    Object.entries(supportTopics).filter(([title])=>title!=='Общий вопрос').map(([title,hint],i)=>
      '<button class="row wide text-button" data-support="'+safe(title)+'">'+icon(['laptop','box','shield','chat'][i])+'<span class="row-text">'+safe(title)+'</span>'+icon('chevron','chevron')+'</button>').join('')+
    '</section><button class="primary wide" data-support="Общий вопрос">'+icon('chat')+'Подготовить вопрос</button><p class="small">Черновик можно скопировать. Чат в макете не подключён.</p>'+
    '<section class="panel faq"><h2>Частые вопросы</h2><p class="small">Нажмите на вопрос, чтобы прочитать ответ.</p>'+
    faqItems.map(([q,a])=>'<details><summary>'+safe(q)+icon('chevron','faq-chevron')+'</summary><div class="faq-answer"><p>'+safe(a)+'</p></div></details>').join('')+'</section>';
}
function supportComposer(topic){
  supportTopic=Object.hasOwn(supportTopics,topic)?topic:'Общий вопрос';
  modal('Ваш вопрос','<form id="support-form"><label class="field-label" for="support-topic">Тема обращения</label><select id="support-topic" class="support-input">'+
    Object.keys(supportTopics).map(t=>'<option '+(t===supportTopic?'selected':'')+'>'+safe(t)+'</option>').join('')+
    '</select><p id="support-hint" class="small">'+safe(supportTopics[supportTopic])+'</p><label class="field-label" for="support-message">Что хотите уточнить?</label><textarea id="support-message" class="support-input" rows="5" maxlength="1500" required aria-describedby="support-hint support-count" placeholder="Опишите вопрос своими словами…">'+safe(supportDrafts.get(supportTopic)||'')+'</textarea><p id="support-count" class="small">'+(supportDrafts.get(supportTopic)||'').length+' / 1500</p><button class="primary wide" type="submit">Скопировать вопрос'+icon('arrow')+'</button><p id="support-status" class="notice" role="status">Это черновик. Сообщение не отправляется.</p></form>');
}
async function copySupportDraft(){
  const input=$('#support-message'),status=$('#support-status');
  const message=input.value.trim();
  if(!message){input.setCustomValidity('Напишите вопрос перед копированием.');input.reportValidity();return;}
  input.setCustomValidity('');
  supportDrafts.set(supportTopic,input.value);
  const text='Тема: '+supportTopic+'\n\n'+message;
  try{
    if(!window.navigator?.clipboard?.writeText)throw new Error('Clipboard unavailable');
    await window.navigator.clipboard.writeText(text);
    status.textContent='Вопрос скопирован. Вставьте его в нужный чат. Ничего не отправлено.';
  }catch(_){
    input.focus();input.select();
    status.textContent='Автокопирование недоступно. Текст выделен — скопируйте его вручную. Ничего не отправлено.';
  }
}
const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
const activeMotions=new Set();
const disclosureMotions=new WeakMap();
function motionAllowed(){return !reduceMotion&&!motionPreference.matches;}
function enterMotion(node){
  if(!node)return;
  node.getAnimations?.().forEach(a=>a.cancel());
  if(!motionAllowed()||typeof node.animate!=='function')return;
  const a=node.animate([{opacity:.25,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});
  activeMotions.add(a);
  const done=()=>activeMotions.delete(a);
  a.onfinish=done;a.oncancel=done;
}
function finishMotions(){
  if(!motionAllowed())[...activeMotions].forEach(a=>{try{a.finish();}catch(_){a.cancel();}});
}
function toggleDisclosure(details,summary){
  const existing=disclosureMotions.get(details);
  const opening=existing?!existing.opening:!details.open;
  const start=details.getBoundingClientRect().height;
  if(existing){existing.animation.onfinish=null;existing.animation.oncancel=null;existing.animation.cancel();activeMotions.delete(existing.animation);}
  details.style.height='';details.style.overflow='';
  if(!motionAllowed()||typeof details.animate!=='function'){details.open=opening;disclosureMotions.delete(details);return;}
  // Measure natural closed/open sizes; native details remains keyboard accessible.
  details.open=false;
  const collapsed=details.getBoundingClientRect().height;
  details.open=true;
  const expanded=details.getBoundingClientRect().height;
  details.style.overflow='hidden';
  const animation=details.animate([{height:start+'px'},{height:(opening?expanded:collapsed)+'px'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});
  disclosureMotions.set(details,{animation,opening});
  activeMotions.add(animation);
  const finish=()=>{if(disclosureMotions.get(details)?.animation!==animation)return;details.open=opening;details.style.height='';details.style.overflow='';disclosureMotions.delete(details);activeMotions.delete(animation);};
  animation.onfinish=finish;animation.oncancel=finish;
}
document.addEventListener('click',e=>{
  const summary=e.target.closest('summary');
  if(!summary||!summary.parentElement.matches('details'))return;
  e.preventDefault();
  toggleDisclosure(summary.parentElement,summary);
});
motionPreference.addEventListener('change',finishMotions);
function view(page,id){
  switch(page){
    case 'home':return '<section class="hero"><span class="brand-mark large" aria-hidden="true">VB</span><h1>Твой Bazar</h1><p>Техника, сервисы<br>и поддержка</p>'+linkButton('Открыть каталог','catalog')+'</section>'+searchForm(true)+'<div class="chips">'+[['Смартфоны','phone'],['Техника','laptop'],['Аксессуары','headphones']].map(([label,name])=>'<button data-category="'+label+'">'+icon(name)+' '+label+'</button>').join('')+'</div><section class="panel vpn-card">'+icon('shield','shield')+'<div><h2>VapeBazar VPN</h2><p class="muted">Подключение для твоих устройств</p>'+linkButton('Посмотреть тарифы','vpn')+'</div></section><div class="section-heading"><h2>Техника и устройства</h2><a href="#catalog">Все'+icon('chevron')+'</a></div>'+grid([products[0],products[2]])+supportBlock();
    case 'catalog':case 'loading':case 'empty':case 'error':return catalog(page);
    case 'product':return productPage(id);
    case 'vpn':return vpnPage();
    case 'profile':return profilePage();
    case 'favorites':return back()+hero('Избранное','Твой личный выбор')+(favorites.size?grid(products.filter(p=>favorites.has(p.id)))+'<p class="small">Нажмите на сердце, чтобы убрать товар.</p>':emptyState('favorites'));
    case 'orders':return back()+hero('Мои заказы','Всё о ваших заказах')+emptyState('orders')+supportBlock();
    case 'myvpn':return back()+hero('Мой VPN','Всё о подключении — здесь','vpn-hero')+'<section class="panel empty">'+icon('shield','state-icon')+'<h2>Подписки пока нет</h2><p>Выберите количество устройств и срок подключения.</p>'+linkButton('Посмотреть тарифы','vpn')+'</section><div class="panel rows">'+row('Как подключиться','guide','book')+row('Помощь с настройкой','support','chat')+'</div>';
    case 'bonus':return back()+hero('Бонусы','Программа готовится')+'<section class="panel"><h2>Условия пока не заданы</h2><p class="muted">Правила бонусной программы появятся после согласования.</p><div class="row">Начисление <span class="muted">Уточняется</span></div><div class="row">Списание <span class="muted">Уточняется</span></div><div class="row">Срок действия <span class="muted">Уточняется</span></div></section><section class="panel empty">'+icon('gift','state-icon')+'<h2>История операций</h2><p>Операций пока нет</p></section>'+linkButton('Задать вопрос','support',true);
    case 'settings':return settingsPage();
    case 'guide':return guidePage();
    case 'support':return supportPage();
    default:return hero('Страница не найдена','Вернитесь на главную.')+linkButton('На главную','home');
  }
}
function route(){const parts=location.hash.slice(1).split('/');return {page:parts[0]||'home',id:parts[1]||''};}
function render(focus=false){
  const {page,id}=route();
  currentPage=page;
  $('#screen').innerHTML=view(page,id);
  const tab=['loading','empty','error','product'].includes(page)?'catalog':navItems.some(x=>x[0]===page)?page:'profile';
  $('#navigation').innerHTML=navItems.map(([key,label,name])=>'<a href="#'+key+'" '+(tab===key?'aria-current="page"':'')+'>'+icon(name)+'<span>'+label+'</span></a>').join('');
  document.title=(titles[page]||'Страница')+' · VapeBazar';
  if(page==='catalog')results();
  if(focus){$('#screen').focus({preventScroll:true});enterMotion($('#screen'));}
}
function modal(title,body){
  $('#detail-body').innerHTML='<h2 id="dialog-title">'+safe(title)+'</h2>'+body;
  if(!$('#detail').open)$('#detail').showModal();
  enterMotion($('#detail-body'));
}
function setPressed(button,selector){button.parentElement.querySelectorAll(selector).forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}
function resetFilters(){category='Все';filterSaved=false;filterSort='default';}
document.addEventListener('submit',e=>{
  if(e.target.id==='support-form'){e.preventDefault();void copySupportDraft();return;}
  if(e.target.matches('[data-search-form]')){e.preventDefault();query=$('#search').value;location.hash='catalog';if(currentPage==='catalog')results();}
});
document.addEventListener('input',e=>{
  if(e.target.id==='support-message'){e.target.setCustomValidity('');supportDrafts.set(supportTopic,e.target.value);$('#support-count').textContent=e.target.value.length+' / 1500';$('#support-status').textContent='Это черновик. Сообщение не отправляется.';}
  if(e.target.id==='search'){query=e.target.value;if(currentPage==='catalog')results();}
});
document.addEventListener('change',e=>{
  if(e.target.id==='support-topic'){supportDrafts.set(supportTopic,$('#support-message').value);supportTopic=e.target.value;$('#support-hint').textContent=supportTopics[supportTopic];$('#support-message').value=supportDrafts.get(supportTopic)||'';$('#support-message').setCustomValidity('');$('#support-count').textContent=$('#support-message').value.length+' / 1500';$('#support-status').textContent='Это черновик. Сообщение не отправляется.';}
  if(e.target.id==='theme'){theme=e.target.value;applyPreferences();savePreferences();}
  if(e.target.id==='motion'){reduceMotion=e.target.checked;applyPreferences();savePreferences();finishMotions();}
});
document.addEventListener('click',e=>{
  const anchor=e.target.closest('[data-product]');
  if(anchor)returnRoute=currentPage==='favorites'?'favorites':'catalog';
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.fav){
    const id=b.dataset.fav;
    if(!products.some(p=>p.id===id))return;
    const marked=!favorites.has(id);
    if(marked)favorites.add(id);else favorites.delete(id);
    savePreferences();
    b.setAttribute('aria-pressed',String(marked));
    b.setAttribute('aria-label',(marked?'Убрать из избранного: ':'Добавить в избранное: ')+products.find(p=>p.id===id).name);
    toast(marked?'Добавлено в избранное':'Убрано из избранного');
    if(currentPage==='favorites')render(true);
    else if(currentPage==='catalog'&&filterSaved)results();
  }
  if(b.dataset.category){
    category=b.dataset.category;
    if(currentPage!=='catalog')location.hash='catalog';
    else{setPressed(b,'[data-category]');results();}
  }
  if(b.dataset.devices){devices=Number(b.dataset.devices);setPressed(b,'[data-devices]');}
  if(b.dataset.months){months=Number(b.dataset.months);setPressed(b,'[data-months]');}
  if(b.dataset.platform){platform=b.dataset.platform;setPressed(b,'[data-platform]');$('#platform-title').textContent='Инструкция · '+platform;}
  if(b.dataset.variant!==undefined){productVariant=Number(b.dataset.variant);setPressed(b,'[data-variant]');}
  if(b.dataset.memory!==undefined){productMemory=Number(b.dataset.memory);setPressed(b,'[data-memory]');}
  if(b.dataset.photo!==undefined){
    const p=products.find(p=>p.id===route().id);if(p){productImage=Number(b.dataset.photo);$('#product-image').src=productImage?p.alternate:p.image;setPressed(b,'[data-photo]');}
  }
  if(b.dataset.support)supportComposer(b.dataset.support);
  switch(b.dataset.action){
    case 'close-dialog':$('#detail').close();break;
    case 'clear-search':query='';if($('#search')){$('#search').value='';$('#search').focus();}if(currentPage==='empty')location.hash='catalog';else results();break;
    case 'reset-filters':resetFilters();if(currentPage==='catalog'){render(true);}else location.hash='catalog';break;
    case 'retry':location.hash='catalog';toast('Открыт демонстрационный каталог');break;
    case 'filters':modal('Фильтры','<label class="row">Показывать<select id="saved-filter" class="setting-select"><option value="all">Все товары</option><option value="saved" '+(filterSaved?'selected':'')+'>Избранное</option></select></label><label class="row">Сортировка<select id="sort-filter" class="setting-select"><option value="default">По умолчанию</option><option value="name" '+(filterSort==='name'?'selected':'')+'>По названию</option></select></label><p><button class="primary wide" data-action="apply-filters">Применить</button></p><button class="text-button wide" data-action="clear-filters">Сбросить фильтры</button>');break;
    case 'apply-filters':filterSaved=$('#saved-filter').value==='saved';filterSort=$('#sort-filter').value;$('#detail').close();render(true);break;
    case 'clear-filters':resetFilters();$('#detail').close();render(true);break;
    case 'vpn-summary':modal('Твой выбор','<div class="row"><span class="row-text">Устройств</span><strong>'+devices+'</strong></div><div class="row"><span class="row-text">Месяцев</span><strong>'+months+'</strong></div><div class="row"><span class="row-text">Стоимость</span><strong>Не задана</strong></div><p class="notice">Демонстрационный выбор. Оплата и выдача подписки не выполняются.</p>'+linkButton('Помощь с настройкой','support',true));break;
    case 'product-details':{
      const p=products.find(x=>x.id===route().id);if(!p)break;
      modal(p.name,'<p>Ваш выбор: '+safe(p.variants[productVariant])+(p.memory?' · '+safe(p.memory[productMemory]):'')+'</p><p class="notice">Это демонстрационные варианты. Модель, цена и наличие не заданы.</p>'+linkButton('Задать вопрос','support'));break;
    }
    case 'about':modal('О приложении','<p>VapeBazar · Японская ночь</p><p>Самостоятельный интерактивный концепт техники и VPN. Избранное и оформление сохраняются только в этом браузере.</p><p class="notice">Реальные аккаунты, заказы, оплата и подписки не подключены.</p>');break;
  }
});
document.addEventListener('error',e=>{
  const img=e.target;if(img.tagName!=='IMG')return;
  const note=document.createElement('div');note.className='panel small';note.textContent='Изображение недоступно';img.replaceWith(note);
},true);
let previousHash=location.hash||'#home';
window.addEventListener('hashchange',()=>{
  scrollPositions.set(previousHash,window.scrollY);
  if($('#detail').open)$('#detail').close();
  render(true);
  const hash=location.hash||'#home';
  window.scrollTo({top:scrollPositions.get(hash)||0,behavior:'instant'});
  previousHash=hash;
});
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change',applyPreferences);
function keyboardViewport(){
  const viewport=window.visualViewport;
  const inputFocused=document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  document.body.classList.toggle('keyboard-open',Boolean(viewport&&inputFocused&&window.innerHeight-viewport.height>120));
}
window.visualViewport?.addEventListener('resize',keyboardViewport);
document.addEventListener('focusout',()=>{document.body.classList.remove('keyboard-open');});
applyPreferences();
render();
