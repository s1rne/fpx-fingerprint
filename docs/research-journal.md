# Research Journal: Банковские браузерные отпечатки (Сбер / Т-Банк)

## Цель
Полный аудит JS-коллекторов антифрода российских банков: какие сигналы
снимаются с браузера, куда уходят, можно ли подменить отпечаток и как
банк это замечает.

## Метод
1. Снять JS-коллекторы с веб-версий (online.sberbank.ru, www.tbank.ru)
2. Зафиксировать исходящий трафик через CDP (Network domain)
3. Деобфусцировать коллекторы, извлечь список сигналов
4. Эксперименты с подменой через Chrome DevTools Protocol
5. Наблюдение за видимыми реакциями (SMS, ре-логин, лимиты)

## Журнал
- [2026-11-21 18:20] Создан воркспейс. Фаза 1: сбор коллекторов.

## Находки по ходу
- [18:25] FINDING #1 (Сбер): WAF блокирует curl-клиент ДО исполнения JS
  (страница user_blocked, Support ID 6419244398521535456). Значит, у Сбера
  TLS-fingerprinting на входе. curl без --insecure не проходит из-за
  самоподписанного CA Минцифры в цепочке.
- [18:26] Т-Банк: главная отдаётся нормально, 1.97MB HTML, 25 внешних скриптов CDN.
- [18:35] FINDING #2 (Т-Банк): в конфиге главной найден явный ANTIFRAUD_API:
  https://webevent.tbank.ru/ — именно туда уходит поведенческая телеметрия.
  Плюс BAF_BASE_URL (baf-client-api.tbank.ru) = Browser Anti-Fraud?
  Remote Identification API: ris.tbank.ru. Cobrowsing/fullstory тоже подключены.
  MDDC_CHECK_ENABLE: mddc.tbank.ru — проверка установки сертификата Минцифры.
- [18:36] Сохранил inline-мониторинг скрипт: evidence/tbank_inline_monitoring.js
- [18:40] FINDING #3 (ГЛАВНЫЙ): найден antifraudPlugin Т-Банка в бандле
  form-growth-black.client.js. Структура:
  * checkers: ve, ves, nr, nf, mt, vn, lg, rd, rc, eg, rq
  * 28 типов DOM-событий (Mouse/Keyboard/Clipboard/Touch/Focus) с лимитом 1000
  * Каждое событие сжимается в минифилды: timeStamp->a, isTrusted->b,
    pageX->j, screenX->l и т.д. (eventKeyMap) — тип enum eventTypeMap:
    mousemove=24, click=4, touchstart=12, keydown=16...
  * secureElements: input[type=password], input[name=login],
    input[data-cobrowsing-secure] — значение поля НЕ уходит, только код клавиш
  * Отправка: POST antifraudApi + "data" (webevent.tbank.ru) с payload:
    hid, session_id, wuid, uri, yclid, utm_*, device_*, client,
    user_agent, timestamp + ib_performance (собранные события)
  * Триггеры отправки: событие формы ADD_APPLICATION (full/short),
    onConfirmSMS -> "sms"
  * SDK называется WEV (window.wev), грузится отдельным скриптом (src=l
    из pluginProps.script) — НАЙТИ ЭТОТ СКРИПТ = найти сам коллектор
- [19:10] FINDING #4 (ЯДРО ИССЛЕДОВАНИЯ): WEV-коллектор запущен в лаборатории
  (лаб-страница + init с оригинальным конфигом из бандла Т-Банка).
  wev.collectData() отдал payload из 10 чекеров:
    ve  — поток событий мыши/клавы: каждый event сжат в минифилды
          {b:isTrusted, l/m: screenX/Y??, j/k: pageX/pageY, w: eventTypeMap
          (mousemove=24, click=4, keydown=16), a: timeStamp, v: Date.now()}
          клавиши: {0:key, 4:keyCode, z:code} — текст поля НЕ уходит
    ves — отдельный поток secure-событий (ввод в защищённые поля)
    nr  — {r1..r6: bool} — детекты (назначение уточнить: navigator checks?)
    nf  — SHA256-хеш (64 hex) — это ИДОТ СЕРВЕРУ отпечаток устройства!
          в лабе: 8b1426d0... — надо найти, из чего считается
    mt  — -180 (mimeTypes count? timezone offset?)
    vn  — полный navigator.userAgent
    lg  — ПОЛНЫЙ WebGL-слепок: glVersion, unMaskedRenderer ("Apple M4 Max"),
          bits, maximum (texture sizes), precision шейдеров, 39 extensions,
          webgl1 И webgl2 — уникальный идентификатор видеокарты
    rd  — "" (referral data?)
    rc  — [[1280,720]] — разрешение экрана (список мониторов?)
    eg  — [1280,720] — window size
  Ключевой вывод: Т-Банк снимает WebGL-отпечаток вплоть до модели чипа
  (Apple M4 Max), топологию событий с таймингами и хеш устройства (nf).
- [19:30] FINDING #5 (РЕЦЕПТ nf — canvas fingerprint): восстановлена точная
  последовательность отрисовки (перехват прототипов CanvasRenderingContext2D):
    1. canvas 2000x200 (скрытый, не в DOM? создаётся createElement)
    2. textBaseline=alphabetic; fillStyle=#f60; fillRect(?, ?, 62, 20) — оранжевый фон
    3. fillStyle=#069; font='11pt no-real-font-123' (несуществующий шрифт!);
       fillText('Nullam dictum felis eu pede mollis', 2, 15)
    4. fillStyle=rgba(91,104,0,0.2); font='18pt Arial';
       fillText('Nullam dictum felis eu pede mollis ', 4, 45) (с хвостовым пробелом)
    5. затем поверх круги: arc(30,30,30) rgb(255,0,255); arc(50,30,30) rgb(0,255,255);
       arc(75,80,30) rgb(255,255,0); arc(55,55,55); arc(55,55,35) — «цветок»
    6. toDataURL() -> строка; вторая отрисовка с font='11pt Arial' (без фейка)
       -> toDataURL()
    7. nf = SHA256( dataURL1 + '_' + dataURL2 )
  Классический recipe FP-Stalker (AmIUnique), встроенный в прод-антифрод банка.
  nf стабилен в рамках сессии/машины — это и есть «паспорт устройства».
  В first run nf == sha256('') если canvas пуст (headless старый?) — важно:
  e3b0c442... = пустой хеш. Значит сервер видит «пустой canvas» как признак
  бота/автоматизации! (run1 в первом лабе дал пустой, во втором лабе полный.)
- [19:40] FINDING #6 (чекеры nr/mt/rd расшифрованы):
    nr.r1 = window.domAutomation || window.domAutomationController  -> DETECT PLAYWRIGHT/PUPPETEER
    nr.r2 = window.emit
    nr.r3 = window.Buffer                                          -> DETECT NODE.JS INJECT
    nr.r4 = window.callPhantom || window._phantom || window.__phantoma
           || (typeof console.profiles === 'object' && len==5)     -> DETECT PHANTOMJS
    nr.r5 = window.spawn
    nr.r6 = navigator.webdriver                                    -> DETECT SELENIUM/CDP
    mt = new Date().getTimezoneOffset()                            -> часовой пояс
    rd = document.referrer
    vn = navigator.appVersion
  Это ГОТОВАЯ ТАБЛИЦА ДЛЯ СТАТЬИ: банк детектит каждую популярную
  библиотеку автоматизации по глобальным маркерам.
- [19:45] FINDING #7 (эксперимент): матрица детекта автоматизации
    headless по умолчанию:      r6 (navigator.webdriver) = TRUE  -> палевно
    headed + --disable-blink-features=AutomationControlled: r6 = FALSE
  Вывод: Т-Банк ловит Playwright/Selenium мгновенно по navigator.webdriver,
  но флаг лечится одним аргументом запуска. Готовый рецепт для читателей.
- [19:55] FINDING #8 (живая сессия): на /deposit/ WEV НЕ грузится (wev undefined).
  Грузится только аналитика: statist/gateway/v1/events (пакетные события,
  mddcCertInstalled — проверка сертификата Минцифры на клиенте!) и
  eventea-beer (gzip-brotli бинарные пейлоады).
  => WEV (webevent.tbank.ru) подключается ТОЛЬКО на формах заявок
  (form-debit-card, form-deposit, form-growth-black бандлы).
  Значит для перехвата антифрод-payload надо идти на форму заявки, не на лендинг.
  Плюс найден mddc.mddcCertInstalled — Т-Банк статистит, установлен ли
  российский корневой сертификат. Ещё один сигнал о пользователе.
- [20:05] FINDING #9 (второй коллектор!): SSO-формы грузят fp-pixel.js
  (186KB, НЕ обфусцирован в строковый массив). Внутри — полноценный
  фингерпринт: canvas(34), webgl(62), audio(34), fonts, battery, touch,
  webrtc, timezone, language... Эндпоинты:
    https://web2web.tbank.ru/web-fingerprint/api/v1/external/fingerprint
    https://id.tbank.ru/preidentity
  Т.е. у Т-Банка ДВА независимых фингерпринтера: WEV (поведение+canvas)
  и fp-pixel (полный device fingerprint на SSO). Отправляет на
  web-fingerprint API — отдельный антифрод-сервис web2web.
  Это уже материал на отдельную статью.
- [20:15] FINDING #10 (НЕОЖИДАННЫЙ, важный): подмена UNMASKED_RENDERER через
  патч getParameter НЕ меняет nf! Хеш тот же (8b1426d0…).
  => nf считается ТОЛЬКО по canvas 2D (текст/шрифты/антиалиасинг), WebGL
  уходит отдельно в lg, но в nf не входит. Спуфить GPU бесполезно для nf —
  надо спуфить canvas.toDataURL (рендер текста).
  Следствие для читателей: подмена «видеокарты» в антифроде Т-Банка не
  спасает, если не подменён canvas 2D-рендер.
- [20:30] FINDING #11 (эксперимент canvas-noise): патч toDataURL меняет nf
  (8b1426d0 → c5d21d1a/8d6826dc). nf устойчив к подмене GPU (finding #10),
  но 100% управляется через canvas 2D. Значит:
    * сменить «устройство» в глазах Т-Банка = изменить canvas-рендер
      (шрифты, антиалиасинг, GPU-растр) или перехватить toDataURL
    * слишком шумный canvas (меняется каждый запрос) — маркер плагина
      приватности/бота: у живой машины nf консистентен
  Рецепт для статьи: стабильный фейковый canvas = подмена устройства
  без смены железа.
- [20:40] FINDING #12 (ПОДТВЕРЖДЁН СТАБИЛЬНЫЙ СПОФ): детерминированная примесь
  в fillText меняет nf (8b1426d0 → 03499139) и держит его стабильным между
  запусками. Финальный рецепт смены «устройства»:
    addInitScript: патч CanvasRenderingContext2D.fillText с фиксированной
    примесью -> банк видит другой nf, другие данные, тот же браузер.
  Изящно: GPU можно не трогать вообще.
- [20:55] FINDING #13 (ПРОД-ПЕРЕХВАТ, ключевой):
  Форма найдена: https://www.tbank.ru/debit/ (Tinkoff Black).
  WEV загрузился, мы собрали 86 событий мыши, collectData отдал
  nf 8b1426d0... (тот же, что в лабе — canvas-паспорт стабилен!).
  2 POST на https://webevent.tbank.ru/data пойманы. Тело (event:"load"):
    {event:"load", client:"pwa-deposit", dco_general_id:"62961:113454-Control",
     device_browser:"chrome", device_type:"desktop",
     session_id:"ept.N1c8...auth-entity-mgmt-7965c7c8f9-2qmcn",
     tid:"6b374f...", timestamp:..., uri:".../tinkoff-black/",
     user_agent:"...", utm_campaign:"", wuid:"dbe88cc0..."}
  ВАЖНО: это ещё лёгкий payload БЕЗ ib_performance (потока событий).
  Полный (с ve/ves/nf/lg) уходит позже — при ADD_APPLICATION или SMS-подтверждении,
  как и было в коде плагина (p('full') / p('sms')).
  Пойманные посты: traffic/prod_posts.json
- [21:05] FINDING #14 (прод-снимок полный):
  collectData() на живой /debit/ вернул полный объект:
    nf 8b1426d0... (ИДЕНТИЧЕН лабе — canvas-паспорт не зависит от страницы!)
    nr: добавились r7, r8 (в прод-конфиге их больше, чем в дефолтном!)
    ve=173 событий за ~15 сек возни (движения, клики, печать, скролл)
    rc=[[1440,900]] eg=[1440,7003] — eg ловит высоту ВКЛЮЧАЯ скролл
  2 лёгких POST "load" пойманы; полный payload (с ve/nf/lg) уходит в
  момент отправки заявки — жизненный цикл документирован в коде плагина.
  Интригующее: r7/r8 — новые флаги, надо расшифровать (детект Авито-модулей?)
- [21:10] FINDING #15 (новые поля в проде, которых не было в дефолтном конфиге):
  ve-события содержат доп. минифилды:
    L = имя тега element.target (DIV/Document/DIV)
    M = имя тега element.relatedTarget (или null)
    O = продублированный event-порядковый id
  Конфиг прод-версии богаче лабораторного дефолта: eventKeys включает
  target/relatedTarget-теги — банк знает, НА КАКОЙ ЭЛЕМЕНТ ты кликнул.
  Плюс nr имеет r7/r8. Прод-конфиг init() приходит из pluginProps, не из SDK.
- [21:25] FINDING #16 (r7/r8 расшифрованы — прод-версия wev 1.3.1):
  Реальный прод-скрипт: https://sso-captcha-0.t-static.ru/webspy/wev.js
  (100KB, webpack, version 1.3.1 — НА 1 МИНОРКУ НОВЕЕ лабового 1.2.0).
    r6 (улучшенный): document.documentElement.getAttribute("webdriver")
      || getAttribute("driver") || глубокая проверка прототипа
      Navigator.prototype.webdriver (детект патченных getter'ов!)
    r7 = Ct(): детект Safari-подделки. Считает Apple-маркеры
      (ApplePayError, CSSPrimitiveValue, WebKitMediaKeys, vendor=Apple...),
      проверяет canvas.toDataURL("image/jpeg"), и возвращает true, если
      браузер ПРЕТЕНДУЕТ на Safari, но "safari" not in window — ловит
      подделку UA на Chromium! (тай-брейк: ApplePayError без ApplePaySession)
    r8 = Ot(): детект стектрейс-патчей — вызывает null[0](), смотрит,
      содержит ли стек "/callback*/" — так ловят переопределённые
      нативные функции (постпроцессинг стека инструментами)
  НОВОЕ vs 1.2.0: прод-SDK сам по себе компактнее и без obfuscator.io.
- [21:40] FINDING #17 (хвосты добиты, prod v1.3.1 полный чеклист):
  * sn = SensorData: DeviceMotion/DeviceOrientation (акселерометр и гироскоп
    телефона!) — банк снимает наклон/тряску устройства, отдельный лимит sensorLimit
    (на десктопе пусто, на мобиле — это поведенческий биометрический сигнал)
  * rq = request referer: читает GET-параметр "referer" из URL страницы
    (requestRefererKey) — трекинг, откуда пришла заявка
  * fp = НОВЫЙ чекер v1.3.1: getNormalizedData() от отдельного FP-модуля
    (упомянутый fp-pixel!), встроен прямо в WEV как интеграция
  Итого прод-чеклист: ve, sn, nr, nf, mt, vn, lg, rd, rc, eg, rq, fp — 12 чекеров.
  Десктопная мышка + мобильный гироскоп + интеграция с SSO-fingerprint.
  Это конец реверса клиентской части. Хвостов нет.
- [21:55] СТАТЬЯ ГОТОВА: article.md (ЧИСТОТА 87/100 по сканеру, [чисто]).
  4 иллюстрации в article-images/ (fig1 жизненный цикл, fig2 рецепт nf,
  fig3 бот-детектор, fig4 12 чекеров) — единый UI-стиль с habr-seb.
  Структура: хук (невидимая картинка) -> откуда знаем -> фильм вместо лога
  -> рецепт nf -> 8 ловушек -> эксперименты со спуфом -> второй коллектор
  -> что с этим делать (3 аудитории). Без воды, 87 баллов.
  Реверс добит: sn=гироскоп, rq=referer-параметр, fp=интеграция fp-pixel.
  Итого 12 чекеров прод-версии. Хвостов нет.
