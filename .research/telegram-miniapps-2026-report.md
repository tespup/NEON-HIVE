# Telegram Mini Apps / Games platform: точная техническая картина (состояние на конец 2026)

**Методология и важная оговорка.** Домены `core.telegram.org` и `telegram.org` с этой машины не отвечают
(`ERR_CONNECTION_TIMED_OUT`), поэтому вся официальная документация читалась через **web.archive.org**:

| Документ | Снимок | Что подтверждено |
|---|---|---|
| `core.telegram.org/bots/webapps` | 2026-10-27 | весь класс `WebApp`, все объекты, все события, лимиты, валидация |
| `core.telegram.org/bots/api` | 2026-11-05 | Bot API **10.3 (24.08.2026)** — последний; игры, звёзды, gifts |
| `core.telegram.org/bots/games` | 2026-10-05 | страница не менялась с 2022, упоминания Mini Apps = 1 строка |
| `core.telegram.org/bots/payments` | 2026-10-25 | physical goods; Stars вынесены на отдельную страницу |
| `core.telegram.org/bots/payments-stars` | 2026-11-06 | digital goods = только XTR |
| `core.telegram.org/bots/faq` | 2026-10-25 | rate limits, размеры файлов |
| `telegram.org/blog/telegram-stars` | 2026-10-25 | Stars → вывод в TON через Fragment |

Свежесть типов официального SDK: `@types/telegram-web-app@10.1.0`, опубликован **29.08.2026**
(проверено по registry.npmjs.org). Помечу `[не подтверждено]` всё, где первоисточника не нашёл.

---

## A. Карта WebApp API

### A.0 Как подключается и как версионируется

```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script>window.Telegram.WebApp.ready();</script>
```

* `telegram-web-app.js` — **единственный официальный SDK** (это подтверждает и README сообщества:
  «the only existing official SDK for Telegram Mini Apps by Telegram»).
* `Telegram.WebApp.version: string` — версия **Bot API** в конкретном клиенте (например `"9.6"`).
* `Telegram.WebApp.isVersionAtLeast(version: string): boolean` — единственная официальная проверка фич.
* **Официального `WebApp.init()` НЕ существует.** Инициализация автоматическая; есть только `ready()`.
  (`init()` был в community-пакете `@telegram-apps/sdk` v1/v2 — это не API Telegram.)
* Типы для TS: `@types/telegram-web-app` (v10.1.0) либо `@telegram-apps/sdk` v3.

### A.1 Поля `Telegram.WebApp` (дословно из доков)

| Поле | Тип | Примечание |
|---|---|---|
| `initData` | `String` | raw-строка `query_id=..&user={json}&auth_date=..&hash=..`; **единственное, чему можно верить** (после HMAC-проверки на сервере) |
| `initDataUnsafe` | `WebAppInitData` | тот же объект распарсенным; доверять нельзя |
| `version` | `String` | версия Bot API в клиенте |
| `platform` | `String` | `android｜ios｜android_x｜webm｜weba｜macos｜windows｜linux｜unknown` (`Platform`; отдельного поля `deviceType` в официальных доках **нет** `[не подтверждено]`) |
| `colorScheme` | `String` | `light｜dark`; также CSS `var(--tg-color-scheme)` |
| `themeParams` | `ThemeParams` | 15 цветов, см. A.6 |
| `isActive` | `Boolean` | 8.0+ |
| `isExpanded` | `Boolean` | развёрнут ли до максимальной высоты |
| `viewportHeight` | `Float` | CSS `var(--tg-viewport-height)`; НЕ годится для приклеивания низа UI |
| `viewportStableHeight` | `Float` | CSS `var(--tg-viewport-stable-height)`; для «прижать вниз» |
| `headerColor`, `backgroundColor`, `bottomBarColor` | `String` | `#RRGGBB`, текущие значения |
| `isClosingConfirmationEnabled` | `Boolean` | |
| `isVerticalSwipesEnabled` | `Boolean` | |
| `isFullscreen` | `Boolean` | 8.0+ |
| `isOrientationLocked` | `Boolean` | 8.0+ |
| `safeAreaInset` | `SafeAreaInset {top,left,bottom,right}` | CSS `var(--tg-safe-area-inset-*)` |
| `contentSafeAreaInset` | `ContentSafeAreaInset {top,left,bottom,right}` | CSS `var(--tg-content-safe-area-inset-*)` |
| `BackButton`, `MainButton`, `SecondaryButton` | объекты | см. A.4 |
| `HomeScreen` | объект | 7.0+ **маркер**: сам объект-«менеджер» — рудимент; реальные методы `addToHomeScreen`/`checkHomeScreenStatus` живут на `WebApp` |
| `SettingsButton` | объект | |
| `HapticFeedback` | объект | |
| `CloudStorage` | объект | |
| `BiometricManager` | объект | 7.2+ |
| `Accelerometer`, `DeviceOrientation`, `Gyroscope` | объекты | 8.0+ |
| `LocationManager` | объект | 8.0+ |
| `DeviceStorage` | объект | **9.0+** локальное хранилище на устройстве |
| `SecureStorage` | объект | **9.0+** защищённое локальное хранилище |
| `Serverless` | объект | **NEW (Bot API 10.2, 20.07.2026)** вызов эндпоинтов Serverless-проекта бота |

### A.2 Методы `WebApp` — точные сигнатуры

```ts
isVersionAtLeast(version: string): boolean

ready(): void
expand(): void
close(): void

// цвета
setHeaderColor(color: string): void            // 6.1+  #RRGGBB | "bg_color" | "secondary_bg_color"
setBackgroundColor(color: string): void        // 6.1+
setBottomBarColor(color: string): void         // 7.10+ (плюс navigation bar на Android)
// ВНИМАНИЕ: setColorScheme() в официальном API ОТСУТСТВУЕТ.

// поведение окна
enableClosingConfirmation(): void              // 6.2+
disableClosingConfirmation(): void             // 6.2+
enableVerticalSwipes(): void                   // 7.7+
disableVerticalSwipes(): void                  // 7.7+
requestFullscreen(): void                      // 8.0+ (даже с невидимым header надо setHeaderColor)
exitFullscreen(): void                         // 8.0+
lockOrientation(): void                        // 8.0+
unlockOrientation(): void                      // 8.0+

// шаринг
shareToStory(media_url: string, params?: StoryShareParams): void          // 7.8+
shareMessage(preparedInlineMessageId: string,
             callback?: (res: {status: "sent"|"failed"; message?: PreparedSentMessage}) => void): void  // 8.0+
downloadFile(url: string, file_name: string,
             event?: "web_download" | "user_has_added_widget" | string): void   // 8.0+

// emoji status
setEmojiStatus(emoji_id: string, params?: EmojiStatusParams,
               callback?: (err: "UNSUPPORTED"|"SUGGESTED_EMOJI_INVALID"|"DURATION_INVALID"
                                |"USER_DECLINED"|"SERVER_ERROR"|"UNKNOWN_ERROR"|null) => void): void  // 8.0+
requestEmojiStatusAccess(callback?: (allowed: boolean) => void): void      // 8.0+

// нативные окна
showPopup(params: PopupParams, callback?: (button_id: string|null) => void): void   // 6.2+
showScanQrPopup(params?: ScanQrPopupParams, callback?: (data: string) => (boolean|void)): void // 6.4+; return true закрывает попап
closeScanQrPopup(): void                                                   // 6.4+
readTextFromClipboard(callback?: (data: string|null) => void): void        // 6.4+

// навигация / бот
openInvoice(url: string, callback?: (status: "paid"|"cancelled"|"failed"|"pending") => void): void // 6.1+
openTelegramLink(url: string): void                                        // 6.2+  только https://t.me/...
switchInlineQuery(query: string, chat_types?: ("users"|"bots"|"groups"|"channels")[]): void // 6.7+
sendData(data: string): void            // только для web_app-кнопки; ~4096 байт [число в исходной таблице дока потерялось — сверь]
hideKeyboard(): void                                                           // 9.1+
requestChat(req_id: string, callback?: (success: boolean) => void): void       // 9.6+

// home screen
addToHomeScreen(callback?: (confirmation: boolean) => void): void          // 8.0+
checkHomeScreenStatus(callback?: (status: "unsupported"|"unknown"|"added"|"missed") => void): void // 8.0+

// события
onEvent(eventType: EventType, handler: (e: any) => void): void
offEvent(eventType: EventType, handler: (e: any) => void): void

// geolocation (8.0+)
getLocation(callback?: (error: string|null, location?: LocationData) => void,
            options?: { allowUserLocation?: boolean; placeholder?: string }): void
```

`invokeCustomMethod` **нет** в официальной документации Mini Apps. Он есть как low-level утилита
community-пакета `@telegram-apps/bridge@2.11.0`:

```ts
invokeCustomMethod(method: CustomMethodName, params, requestId: string, opts?) : AbortablePromise<unknown>
// известные имена: saveStorageValue, getStorageValues, deleteStorageValues,
//                   getStorageKeys, getCurrentTime, getRequestedContact
```
То есть «CloudStorage» из коробки построен на этих методах. `[не подтверждено]`, что
`Telegram.WebApp.invokeCustomMethod` публично доступен в `telegram-web-app.js` (сам скрипт скачать не смог).

### A.3 Чего в официальном API **нет** (запросы из ТЗ)

| Прошено | Итог |
|---|---|
| `WebApp.setColorScheme()` | **нет** |
| `HomeScreen.supportsHomeScreen` | **нет**; есть `checkHomeScreenStatus()` → `"unsupported"` |
| `ScanQrPopup` как объект | **нет**; есть `showScanQrPopup()/closeScanQrPopup()` + событие `scanQrPopupClosed` |
| `WriteAccess` как объект | **нет**; есть `requestWriteAccess(cb)` + `requestContact(cb)` |
| `DataCustom`, `setData-custom`, `data-custom-id` | **нет** ни в доке, ни в `@types/telegram-web-app@10.1.0` |
| `CloudStorage.getCommands` | **нет**; правильно — `getKeys(cb)` |
| `isPrivacyPolicyAvailable` | **нет** |
| `allowsPageScrolling` | **нет** |
| `WebApp.init()` | **нет** (только `ready()`) |
| `Telegram.GameProxy` в Mini App | нет; `TelegramGameProxy` — только из `telegram.org/js/games.js` в Games platform |

### A.4 Кнопки

**`BackButton`**: `isVisible: boolean`, `onClick(cb)`/`offClick(cb)` (alias `backButtonClicked`),
`show()`, `hide()` — всё 6.1+.

**`SettingsButton`**: `isVisible`, `onClick/offClick` (`settingsButtonClicked`), `show()`, `hide()` (7.0+).
Пункт «Настройки» в контекст-меню включается в @BotFather.

**`BottomButton`** (общий класс для `MainButton` и `SecondaryButton`, 7.10+):

```ts
readonly type: "main" | "secondary"
iconCustomEmojiId?: string                 // 9.5+
text: string; color: string; textColor: string
isVisible: boolean; isActive: boolean
hasShineEffect: boolean                    // 7.10+
position: "left" | "right"                 // 7.10+, только если видны обе кнопки
readonly isProgressVisible: boolean
setText(t: string); setParams(p: {icon_custom_emoji_id?, text?, color?, text_color?,
                                 has_shine_effect?, position?})
onClick(cb)/offClick(cb)                   // main → "mainButtonClicked", secondary → "secondaryButtonClicked"
show()/hide()/enable()/disable()
showProgress(leaveActive?: boolean); hideProgress()
```
По умолчанию текст `Continue`/`Cancel`. У attachment-menu-запуска MainButton скрыт до первого взаимодействия.

### A.5 Сенсоры, биометрия, геолокация (все — Bot API 8.0+, кrome биометрии 7.2+)

```ts
HapticFeedback.impactOccurred(s: "light"|"medium"|"heavy"|"rigid"|"soft")   // 6.1+
HapticFeedback.notificationOccurred(t: "error"|"success"|"warning")         // 6.1+
HapticFeedback.selectionChanged()                                          // 6.1+
// «новых» haptic-API после 6.1 нет — ровно эти три метода.

Accelerometer: { isStarted, x, y, z, start(params?: {x?:1,y?:1,z?:1}, cb?), stop(cb?) }  // м/с²
DeviceOrientation: { isStarted, absolute, alpha, beta, gamma /* радианы */, start({frequency}), stop }
Gyroscope: { isStarted, x, y, z /* рад/с */, start({frequency}), stop }
LocationManager: { isSameLocationRequested, isLocationAvailable, location,
                   requestLocation(cb), openSettings(cb) }
LocationData: { latitude, longitude, horizontal_accuracy, vertical_accuracy,
                average_altitude, latitude_accuracy, timestamp, provider }

BiometricManager (7.2+): { isInited, isBiometricAvailable,
  biometricType: "finger"|"face"|"unknown", isAccessRequested, isAccessGranted,
  isBiometricTokenSaved, deviceId,
  init(cb?), requestAccess({reason: 0-128}, cb?), authenticate({reason: 0-128}, cb?),
  updateBiometricToken(token, cb?), openSettings() }
```

### A.6 `ThemeParams` (15 полей, все опциональны, есть CSS-переменные)

`bg_color, text_color, hint_color, link_color, button_color, button_text_color,`
`secondary_bg_color`(6.1+), `header_bg_color`(7.0+), `bottom_bar_bg_color`(7.10+),
`accent_text_color`(7.0+), `section_bg_color`(7.0+), `section_header_text_color`(7.0+),
`section_separator_color`(7.6+), `subtitle_text_color`(7.0+), `destructive_text_color`(7.0+).

### A.7 Хранилища — три разных механизма

```ts
// 1) CloudStorage — облако Telegram, синхронно между устройствами, scope = (bot, user)
setItem(key: string, value: string, cb?: (err: Error|null, ok: boolean) => void)
getItem(key: string, cb: (err: Error|null, value?: string) => void)
getItems(keys: string[], cb: (err, values: string[]) => void)
removeItem(key: string, cb?: (err, ok: boolean) => void)
removeItems(keys: string[], cb?: (err, ok: boolean) => void)
getKeys(cb: (err, keys: string[]) => void)

// 2) DeviceStorage (9.0+) — локально на устройстве, НЕ синхронизируется
setItem(key, value, cb?) -> DeviceStorage;  getItem(key, cb?);  removeItem(key, cb?);  clear(cb?)

// 3) SecureStorage (9.0+) — защищённое локальное хранилище
setItem(key, value, cb?);  getItem(key, cb?);  restoreItem(key, cb?) /* спрашивает разрешение */
removeItem(key, cb?);  clear(cb?)

// 4) Serverless (Bot API 10.2+, NEW) — только для Mini App, размещённых на Telegram Serverless
Serverless.call(endpoint: string, input?: object, cb?: (err: ServerlessError|null, result?: any) => void)
// ServerlessError: { message: string, type?: "ENDPOINT_ERROR"|"UNAUTHORIZED"|..., status: number, parameters?: object }
// err.type === "UNAUTHORIZED" если initData отсутствует/невалиден — Telegram валидирует его сам
```

### A.8 `WebAppInitData` (полный список полей, 10.1)

`query_id?` (нужен для `answerWebAppQuery`), `chat_join_request_query_id?` (**10.1**, для
`answerChatJoinRequestQuery`), `user?: WebAppUser`, `receiver?: WebAppUser` (attachment menu, личный чат),
`chat?: WebAppChat`, `chat_type?: "sender"|"private"|"group"|"supergroup"|"channel"` (только direct-link),
`chat_instance?` (только direct-link; «useful for high scores in games»),
`start_param?` (дублируется в GET-параметре `tgWebAppStartParam`), `can_send_after?`,
`auth_date: number`, `hash: string`, `signature?: string` (Ed25519, для третьих сторон).

`WebAppUser`: `id, is_bot?, first_name, last_name?, username?, language_code?, is_premium?,
added_to_attachment_menu?, allows_write_to_pm?, photo_url?` (фото профиля доступно **всем** Mini Apps с 8.0).
`WebAppChat`: `id, type, title, username?, photo_url?`.

### A.9 Полный список событий (`onEvent`), 45 шт.

`viewportChanged {isStateStable}`, `themeChanged`, `backButtonClicked`, `mainButtonClicked`,
`secondaryButtonClicked`, `settingsButtonClicked`,
`invoiceClosed {url, status: paid|cancelled|failed|pending}`, `popupClosed {button_id}`,
`qrTextReceived {data}`, `scanQrPopupClosed`, `clipboardTextReceived {data}`,
`writeAccessRequested {status: allowed|cancelled}`, `contactRequested {status: sent|cancelled}`,
`biometricManagerUpdated`, `biometricAuthRequested`, `biometricTokenUpdated`,
`acceleratorChanged {x,y,z}`, `acceleratorError`, `deviceOrientationChanged {alpha,beta,gamma,absolute}`,
`deviceOrientationError`, `gyroscopeChanged {x,y,z}`, `gyroscopeError`,
`locationManagerUpdated`, `locationRequested`, `locationError`,
`homeScreenAdded`, `homeScreenChecked`, `emojiStatusSet`, `emojiStatusFailed`,
`emojiStatusAccessRequested`, `shareMessageSent`, `shareMessageFailed`, `fileDownloadRequested`,
`storyShareFailed`, `chatOpened`, `chatFailed`, `deviceStorage...`,
`activated`, `deactivated`, `safeAreaChanged`, `contentSafeAreaChanged`,
`fullscreenChanged`, `fullscreenFailed`.
(полные описания — раздел «Events Available for Mini Apps»; имена `deviceStorage*`/`chatOpened` сверяй по доке —
в извлечённой таблице они есть, но часть названий я перенёс по памяти из середины списка `[уточнить]`.)

### A.10 Валидация initData (дословно, включая новые ключи)

```
data_check_string = "auth_date=..\nquery_id=..\nuser={json}"   // все поля КРОМЕ hash, по алфавиту, key=value, \n
secret_key        = HMAC_SHA256(key=<bot_token>, data="WebAppData")
valid             = hex(HMAC_SHA256(key=secret_key, data=data_check_string)) === hash
доп. проверка     = now - auth_date < [рекомендуют 24 ч]
```
Для передачи данных **третьей стороне** (безBot.token): отдаёте `initData` + `bot_id`, проверяется
**Ed25519**-подпись поля `signature` (base64url) по data-check-string
`"<bot_id>:WebAppData\n" + поля(без hash/signature, sorted)`.
Официальные публичные ключи (hex):
* test: `40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec`
* prod: `e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d`

---

## B. Лимиты (то, что реально нужно закладывать в ТЗ)

**CloudStorage (проверено дословно):** key — **1–128 символов**, только `A-Z a-z 0-9 _ -`;
value — **0–4096 символов**; максимум **1024 ключа** (на пару bot×user). Метод: `getKeys`,
никакого `getCommands`. Частотных лимитов в доке не опубликовано `[не подтверждено]`.

**Хостинг / HTTPS:**
* `WebAppInfo.url` — «An **HTTPS** URL of a Web App» (в `InlineKeyboardButton.web_app`, `KeyboardButton.web_app`, `MenuButtonWebApp`).
* `downloadFile.url` — тоже HTTPS.
* `openTelegramLink` — только `https://t.me/...`.
* Исключение: **тестовая среда** — «you may use links without TLS» (HTTP разрешён на test).
* Ограничений на сам контент (размер бандла, кол-во ассетов) **нет** — Mini App грузится как обычный сайт.
  С 20.07.2026 можно вообще не хостить: появился тип «Mini App на Telegram Serverless»
  (`@BotFather` → новый тип; API-объект `WebApp.Serverless`). Лимиты Telegram Serverless **не опубликованы** `[не подтверждено]`.

**Размеры файлов бота (Bot API):**
| Операция | Лимит |
|---|---|
| `getFile` (скачать) | **20 MB** |
| Загрузка любого файла ботом | **50 MB** |
| Через URL: фото / прочее | 5 MB / 20 MB |
| multipart: фото / прочее | 10 MB / 50 MB |
| `sendPhoto` | ≤10 MB, ≤10000 px по стороне |
| `sendVideo`/`sendAnimation`/`sendAudio`/`sendVoice`/`sendDocument` | 50 MB |
| Live photo | ≤10 с, ≤10 MB |
| Story: фото/видео | 1080×1920 ≤10 MB / 720×1280 H.265 ≤30 MB |
| Local Bot API server | загрузка до **2000 MB**, скачивание без лимита |

**Rate limits (Bot FAQ, дословно):** 1 msg/sec в один чат; 20 msg/min в группу;
~30 msg/sec на массовых рассылках; **paid broadcasts** — до **1000 msg/sec**,
каждое сверх 30/s стоит **0.1 Star**, для включения нужно **≥100 000 Stars** на балансе бота
и **≥100 000 MAU**. Ошибки — HTTP 429 с `retry_after`.

**Кнопки/запуски:**
* `InlineKeyboardButton.web_app` — «Available **only in private chats** between a user and the bot»,
  не работает в бизнес-аккаунтах. То же для keyboard-кнопок (`private chats only`).
* `MenuButtonWebApp` (`setChatMenuButton`) — главный вход; в объекте можно указать вместо URL
  ссылку `t.me` на Mini App.
* `sendGame.reply_markup` — «если пусто, будет одна кнопка *Play <game_title>*, если непусто —
  **первая кнопка обязана запускать игру**» (`callback_game`).
* Мини-апп из **attachment menu**: доступно **только крупным рекламодателям Telegram Ad Platform**
  (остальным — только в test-среде; `/setattach` в @BotFather на test-аккаунте).
* Мини-аппы в **историях**: самого «мини-аппа внутри истории» нет, есть `shareToStory(media_url,
  {text: 0-200 симв. (0-2048 у premium), widget_link: {url, name: 0-48}})`, причём сторис с ссылкой —
  только для premium-пользователей.
* `chat_join_request`: `sendChatJoinRequestWebApp` → `chat_join_request_query_id` →
  `answerChatJoinRequestQuery` (Bot API 10.1, 11.06.2026).
* **Security-lock (20.07.2026, авто-включено):** `answerWebAppQuery`,
  `savePreparedKeyboardButton`, `savePreparedInlineButton` и связанные `send*` работают только с того же
  origin, который получил `query_id`/`button_id`, если явно не передан `WebApp.doNotUseWebAppMethodLimiterFor`.

---

## C. Монетизация мини-апп-игры в 2026

### C.1 Telegram Stars — единственный легальный способ для digital goods
> «All payments via bots and mini apps for **digital goods and services inside the Telegram apps**
> must exclusively use **Telegram Stars** through the official Telegram Bot Payments API.
> Payments for digital goods and services using external payment systems are prohibited.»

* Валюта инвойса — **`XTR`**, `provider_token` = пустая строка, `prices` — ровно **один** элемент.
  `need_name/phone/email/address`, `is_flexible`, `max_tip_amount` — для XTR **игнорируются** (часть — не поддерживается).
* Цепочка: `sendInvoice`(или `createInvoiceLink`) → `pre_checkout_query` → `answerPreCheckoutQuery`
  → `successful_payment` → **сохранить `telegram_payment_charge_id`** (нужен для возврата).
* В мини-аппе: `WebApp.openInvoice(invoiceLink, cb)` + событие `invoiceClosed` со статусом.
* Подписки: параметр **`subscription_period`** есть в **`createInvoiceLink`** (24·3600·N, N∈{7,30,90,180,365}),
  т.е. подписка в мини-аппе делается так: `createInvoiceLink({subscription_period, currency:"XTR", ...})`
  → `openInvoice(link)`. В `sendInvoice` параметра `subscription_period` **нет** (проверено по API 10.3).
  `SuccessfulPayment`: `is_recurring`, `is_first_recurring`, `subscription_expiration_date`.
  Управление: `editUserStarSubscription(user_id, telegram_payment_charge_id, is_canceled)`,
  апдейты — `BotSubscriptionUpdated {user, invoice_payload, state: canceled|active|failed}`.
* Возвраты: `refundStarPayment(user_id, telegram_payment_charge_id)`.
  Важно: chargeback у Apple/Google **списывает** звёзды с баланса бота (напрямую в доке).
* Баланс/выписки: `getMyStarBalance() → StarAmount {amount, nanostar_amount}`,
  `getStarTransactions(offset, limit≤100) → StarTransaction[]` с `source/receiver: TransactionPartner`
  (`user` c `transaction_type: invoice_payment | paid_media_payment | gift_purchase | premium_purchase`,
  `telegram_ads`, `fragment`, `affiliate_program`, `telegram_api`).
* `StarAmount.nanostar_amount` — 1/1e9 части Stars (точность под комиссии/доли).

### C.2 Вывод и реклама
* Вывод: «developers will be able to withdraw the stars earned by their bots **in Toncoins via Fragment**»
  (официальный блог) + `TransactionPartnerFragment.withdrawal_state: RevenueWithdrawalState(Pending|Succeeded|Failed)`.
  Конкретные пороги/минимумы в документации Bot API **не опубликованы** `[не подтверждено]`.
  («1000 Stars» — это цена `giftPremiumSubscription` за 3 месяца, см. C.4, а не лимит вывода.)
* Stars можно тратить на **Telegram Ads** (прямо в доке: «Stars can be used to place Telegram Ads for your TPA»),
  и исходящая транзакция в Ads — `TransactionPartnerTelegramAds`.
  Тарифы/CPM/«revenue share» для мини-аппов в docs Bot API **отсутствуют** `[не подтверждено]`.
* **Партнёрки (affiliate)**: `AffiliateInfo {affiliate_user?, affiliate_chat?, commission_per_mille,
  amount, nanostar_amount}` приходит внутри `TransactionPartnerUser` для `invoice_payment`/`paid_media_payment`
  (программа настраивается в @BotFather). Это готовая механика «привёл игрока → получишь % со Star-платежей».

### C.3 TON / TON Connect
* **Внутри Telegram за digital goods — нельзя** (цитата выше). TON-платежи допустимы только вне
  Telegram-приложений (собственный сайт) `[юридическая часть — сверяй с актуальными ToS]`.
* Технически TON Connect в WebView работает: `tonconnect-sdk`/`@tonconnect/ui-react` + провайдеры
  (`window.ton`/`window.tonCli`); включён в официальный шаблон `Telegram-Mini-Apps/nextjs-template`
  («...TypeScript, **TON Connect** and tma.js»). Но для внутриигровых покупок в Telegram-игре это
  **риск бана**, не рекомендую.
* Реальная связь с TON: **выручка выводится в TON через Fragment** (C.2).
* `docs.ton.org` доступен, но конкретные страницы TonConnect я не успел вытащить (404 на угаданных путях)
  → `[не подтверждено]` по точным API TON Connect 2026.

### C.4 Gifts / Premium / paid media
* `sendGift(user_id|chat_id, gift_id, pay_for_upgrade, text 0-128)` — бот дарит gift (не конвертируется в Stars получателем).
* `giftPremiumSubscription(user_id, month_count ∈ {3,6,12}, star_count ∈ {1000,1500,2500})` — точные цены.
* `getAvailableGifts()`, `getUserGifts()`, `getChatGifts()`, `convertGiftToStars()`, `upgradeGift()`,
  `transferGift()`, классы `Gift`, `UniqueGift*`, `OwnedGift*`, `AcceptedGiftTypes`.
  Страницы `core.telegram.org/bots/gifts`/`api/bots/gifts` в web.archive **не нашлась** `[не подтверждено]` —
  всё выше взято из `bots/api` (10.3).
* `sendPaidMedia` / `PaidMedia*` — платный контент (Stars) — можно давать «ключи»/подарки за оплату.
* Premium-сигнал в мини-аппе: `initDataUnsafe.user.is_premium` — бесплатная проверка «у игрока Premium».

**Итог по деньгам для игры:** IAP за Stars (валюта/скины/ускорители/подписка через `createInvoiceLink`
+ `subscription_period`), рефанды через `refundStarPayment`, аналитика через `getStarTransactions`,
вирусный рост через affiliate-программу, вывод — Fragment → TON. Никаких «звёздных» реф-бонусов
в обход платёжки: только через `AffiliateInfo`.

---

## D. Games platform vs Mini Apps

### D.1 Telegram Games (страница `bots/games` + раздел «Games» в Bot API 10.3)
* Это **HTML5-страница в in-app browser**, а не WebView с JS-API. Единственные «мосты»:
  `https://telegram.org/js/games.js` → `TelegramGameProxy.shareScore()` (кнопка «поделиться счётом»)
  и `TelegramGameProxy.initParams` (свои параметры из fragment-id; сервисные параметры начинаются с `tg`).
* Жизненный цикл: `@BotFather /newgame` → `sendGame(game_short_name)` (или `InlineQueryResultGame`)
  → игрок жмёт **Play** → бот получает `CallbackQuery.game_short_name`
  → бот обязан ответить `answerCallbackQuery(callback_query_id, url=<HTTPS URL игры>)`
  → приложение открывает игру в браузере.
* **Лидерборды**: `setGameScore(user_id, score, force?, disable_edit_message?, chat_id+message_id | inline_message_id)`
  — редактирует сообщение с игрой и создаёт service-message; `getGameHighScores(user_id, chat|inline_message_id)`
  → `GameHighScore{position,user,score}`. Возвращает **для указанного сообщения/чата**: самого игрока,
  2 соседа с каждой стороны и топ-3 (поведение «subject to change»).
* `InlineQueryResultGame(game_short_name, photo_url|photo_file_id,...)` — для инлайна.

### D.2 Отличия (ключевое)

| | Games platform | Mini Apps |
|---|---|---|
| Окно | in-app browser (url из `answerCallbackQuery`) | нативный WebView-контейнер, fullscreen 8.0+, 9:16/landscape |
| JS-API | только `TelegramGameProxy.shareScore/initParams` | весь `Telegram.WebApp` (см. A) |
| Платежи | нет | Stars (`openInvoice`, `createInvoiceLink`, подписки) |
| Хранилище | своё (IndexedDB) | CloudStorage (облако, sync между устройствами), DeviceStorage/SecureStorage 9.0+ |
| Платформа-фичи | нет | haptics, sensors, geolocation, biometrics, share to story, home screen, emoji status, push через бота |
| Лидерборд | **встроенный чатовый** + service-сообщения | только свой бэкенд |
| Инвайты/сообщения | `shareScore` | `shareMessage`, `sendData`, `answerWebAppQuery`, `switchInlineQuery`, `openTelegramLink` |
| Монетизация | ❌ | ✅ Stars + affiliate + gifts |

### D.3 Рекомендация
**Основа — Mini App (Bot API ≥ 8.0).** Играть в 2026 в «чистые Games» — значит отказаться от
платежей, haptics, cloud-save, push-инвайтов и всей аналитики.

Гибрид, который даёт и виральность чатов, и полноценную игру (всё — из официально задокументированного):
1. Игра целиком — Mini App (`t.me/<bot>/<game>` + `web_app`-кнопки).
2. Заведите `game_short_name` и шлите в чаты **`sendGame`-сообщение как «карточку»**: у неё красивый
   превью-креатив (фото/GIF из BotFather) и **автоматический чатовый лидерборд от Telegram**.
   Первая кнопка — `callback_game` (обязательна), дальше по докам можно «добавлять дополнительные кнопки»
   (`url`-кнопка с `https://t.me/<bot>/<game>?startapp=ch_<chat_id>`). Внутри игры этот deep-link читает
   `tgWebAppStartParam` (`initDataUnsafe.start_param`) и засабмит счёт через бота.
   `web_app`-кнопку в игровое сообщение в **группе** класть нельзя (private-only) — только `url`.
3. Глобальный лидерборд — **свой бэкенд**: `getGameHighScores` глобальным не является (он scoped к сообщению).
   `chat_instance` из initData (для direct-link запусков) удобен как ключ «чат» — в доке прямо сказано
   «useful for high scores in games».
4. В приватном чате с ботом можно дать и `web_app`-кнопку («Играть») + `MainButton` c `sendData`.

---

## E. Практические грабли (что реально ломается)

**Официально закрытые докой:**
* `100vh`/прыгающий хедер: `viewportHeight` НЕ стабилен («refresh rate … should not be used to pin
  interface elements to the bottom»); используй `--tg-viewport-stable-height` + `viewportChanged{isStateStable:true}`.
* Safe area/чёлки: `safeAreaInset`/`contentSafeAreaInset` + `safeAreaChanged`/`contentSafeAreaChanged`.
* Свайпы вниз (pull-to-minimize) съедают жесты игры → `disableVerticalSwipes()` (7.7+); в доке прямо
  рекомендуют выключать, если жесты конфликтуют. Для вертикального шутера/тапалки — обязательно.
* Закрытие по ошибке → `enableClosingConfirmation()` + `isActive`/`activated`/`deactivated`
  (вот тут ставь игру на паузу и делай сохранение).
* Полноэкранный режим: `requestFullscreen()` + `lockOrientation()`; события `fullscreenChanged`/`fullscreenFailed`;
  даже в fullscreen **вызывай `setHeaderColor()`** (иначе статус-бар/контролы неконтрастны).
* Клавиатура iOS: `hideKeyboard()` (9.1+) — официальный способ; показывается только по пользовательскому тапу.
* `chat_join_request`/attachment-menu/`web_app`-кнопки в группах — см. B (приватные чаты).
* **Origin-lock с 20.07.2026** (B) — бэкенд должен помнить origin, с которого открыли query.
* Отладка: iOS — 10 тапов по Settings → Allow Web View Inspection + Safari Develop; Android — Settings →
  зажать номер версии → Enable WebView Debug + `chrome://inspect`; Desktop — Experimental → webview inspection;
  macOS beta — 5 тапов по Settings.

**Инженерная практика (не описана в официальных доках → `[не подтверждено]`):**
* WebView iOS: звук только после пользовательского жеста (autoplay-политика WebKit) — «тапните, чтобы начать»
  + `AudioContext.resume()`; Android обычно так же в WebView.
* `localStorage`/IndexedDB в WebView **ненадёжны как сохранение прогресса**: iOS чистит данные по ITP/при
  нехватке места, Android — по политике «удалить данные приложения». Telegram не даёт офлайн-режима и
  service worker в WebView работает нестабильно. → Прогресс: **CloudStorage (1024×4 КБ) для «тёплого» сейва
  и синхронизации между устройствами + свой бэкенд для всего важного (платежи, инвентарь, анти-чит)**.
  DeviceStorage — только кэш/преференсы (не синхронизируется), SecureStorage — токены/реф-коды (`restoreItem`).
* CloudStorage — round-trip через нативный мост и сеть: не пиши каждый кадр; батчь через `getItems`,
  пиши «на паузе/деактивации» с дебаунсом. Миграция schema: ключи ограничены `[A-Za-z0-9_-]` (без `.`),
  поэтому `v2_save1`, а не JSON-версии внутри одного ключа.
* Между устройствами нет push-обновления CloudStorage: поллинг `getKeys/getItems` или WebSocket к бэкенду.
* `sendData` работает **только** при запуске через `web_app`-кнопку; при direct-link запуске её нет — дублируй
  отправку через свой API.
* iOS vs Android в мини-аппах: разный рендер `dvh`, разное поведение клавиатуры (iOS не даёт программный focus),
  `--tg-safe-area-inset-bottom` на Android часто 0 (nav bar в WebView), на iOS — 34 px; landscape + notch →
  следи за `safeAreaChanged`, а не за `orientationchange`.
* Вес бандла: лимита Telegram нет, но iOS WebKit убивает вкладку при ~1–1.5 ГБ RAM. Ориентир:
  first paint ≤ 1,5–2 МБ gzip, текстуры в атласах ≤ 2048², `webp`/процедурная генерация вместо PNG-ов.
* Unity WebGL: вес runtime + bundles обычно десятки МБ и памяти жрёт — сообщество ходит через
  `Open-Yescoin/Telegram-Unity-Bridge` (*48, живёт до 01.2026). Для казуалки 9:16 это overkill `[не подтверждено количественно]`.
* Godot 4 web-export: официального Telegram-гайда/интеграции нет (поиск по GitHub: 0 репозиториев)
  → только ручная обёртка `Telegram.WebApp` через JS-bridge `[не подтверждено]`.

---

## F. Рекомендуемый стек (2D canvas, 9:16, без внешних ассетов)

**Клиент**
* **Vite + TypeScript** (ES2022), билд с `es2017` target; single-page, без роутера.
* **PixiJS v8** — минимальный вес/максимум контроля над 2D-канвасом; **Phaser 3** — если нужна физика/тайлсы/анимация
  (вес выше). `three.js`/`babylon` не нужны.
* Рендер: 1 канвас с `devicePixelRatio` clamp до 2, логический размер 720×1280, letterbox + safe-area паддинги.
* Никаких внешних ассетов: процедурная отрисовка/шейдеры + один self-hosted woff2 + AudioContext-синтез
  (или ≤1 МБ звуковых спрайтов base64 inline).
* Обёртка Telegram: `@types/telegram-web-app@10.1.0` (тонкий слой над `window.Telegram.WebApp`) —
  минимум abstractions. Если нужна реактивность/проверки поддержки — `@telegram-apps/sdk@3.11.8`
  (+ `@telegram-apps/bridge` 2.11.0, monorepo `Telegram-Mini-Apps/telegram-apps`, коммит 28.10.2026).
  `@twa-dev/sdk@8.0.2` — **заброшен (последний пуш 05.02.2025)**, не брать.
* UI-кнопки/попапы — родные `MainButton`/`showPopup`, чтобы попадать в нативный UX; прикладной UI — на канвасе.

**Шаблоны 2025–2026 (проверено по GitHub)**
| Репо | ⭐ | Пуш | Комментарий |
|---|---|---|---|
| `Telegram-Mini-Apps/reactjs-template` | 429 | 11.2025 | React + Vite + tma.js + TS (самый живой) |
| `Telegram-Mini-Apps/nextjs-template` | 370 | 12.2025 | Next.js + **TON Connect** + tma.js |
| `Telegram-Mini-Apps/solidjs-template` / `vuejs-template` | 37/34 | 11.2025 | |
| `Telegram-Mini-Apps/typescript-template` | 18 | 01.2025 | «ванильный» TS + SDK |
| `twa-dev/vite-boilerplate`, `twa-dev/vanilla-js-boilerplate` | – | – | от org «TMA Tools» |
| `twa-dev/Mark42` | 96 | 10.2024 | UI-kit для TWA (устаревает) |
| `twa-dev/types`, `twa-dev/SDK` | 67/332 | 2025 | legacy |
| `Open-Yescoin/Telegram-Unity-Bridge` | 48 | 01.2026 | если всё же Unity |
| `nikandr-surkov/Hamster-Kombat-…-Clone` | 275 | 06.2026 | референс тапалки на Next.js |
| `blackestwhite/nuxt-telegram-mini-app-template` | 17 | 07.2026 | Nuxt |
| `MrConsoleka/aiogram-miniapp-template` | 25 | 01.2026 | aiogram (Python) + Mini App |

Для канвас-игры лучше всего: **`Telegram-Mini-Apps/typescript-template` как скелет + PixiJS**
(ничего лишнего, Vite, `@telegram-apps/sdk`), либо чистый свой Vite-проект — шаблон нужен только из-за
валидации initData и theme-bootstrap.

**Бэкенд**
* Node (Hono/Fastify) или Python (**aiogram 3**, если питоновская команда) + Postgres/Redis.
* Валидация initData: `@telegram-apps/init-data`/`init-data-node` или свой HMAC-SHA-256 (A.10).
* Платежи: `createInvoiceLink` (подписки) + вебхуки `pre_checkout_query`/`successful_payment`,
  `refundStarPayment`, сверка через `getStarTransactions`.
* Деплой: обязателен HTTPS; свой CDN (Cloudflare Pages/Workers) **или** Telegram Serverless (10.2+, лимиты не опубликованы).
* Анти-чит: серверная валидация счёта (rate/дельта/кап), `auth_date` протухание, `chat_instance`/`start_param`
  как атрибут источника.

**Игровой цикл/UX**
* Старт: `ready()` как можно раньше → `expand()` → `requestFullscreen()` → `lockOrientation('portrait')`
  → `disableVerticalSwipes()` → `setHeaderColor()`/`setBackgroundColor()`/`setBottomBarColor()` под тему.
* Пауза/сейв на `deactivated` + `homeScreenChecked` для heuristics.
* Haptics: `impactOccurred` на коллизии (light/medium/heavy), `notificationOccurred` на win/lose —
  бесплатно даёт «-native» ощущение.
* Инвайты: `shareMessage` (prepared inline message) + `openTelegramLink(t.me/...)` + `switchInlineQuery`.

---

## G. Источники

Официальные (проверены через web.archive.org; прямой доступ к доменам был заблокирован):
* Telegram Mini Apps — https://core.telegram.org/bots/webapps (снимок 27.10.2026: https://web.archive.org/web/20261027082547/https://core.telegram.org/bots/webapps)
* Telegram Bot API (10.3, 24.08.2026) — https://core.telegram.org/bots/api (снимок 05.11.2026: https://web.archive.org/web/20261105012614id_/https://core.telegram.org/bots/api)
* Gaming Platform — https://core.telegram.org/bots/games (снимок 05.10.2026: https://web.archive.org/web/20261005150821/https://core.telegram.org/bots/games)
* Bot Payments (physical) — https://core.telegram.org/bots/payments (снимок 25.10.2026)
* Bot Payments for Digital Goods (Stars) — https://core.telegram.org/bots/payments-stars (снимок 06.11.2026)
* Bots FAQ (лимиты) — https://core.telegram.org/bots/faq (снимок 25.10.2026)
* Blog: Stars — https://telegram.org/blog/telegram-stars (снимок 25.10.2026); индекс блога — https://telegram.org/blog (снимок 05.11.2026)
* Типы официального SDK — https://www.npmjs.com/package/@types/telegram-web-app (10.1.0, 29.08.2026)

Сообщество / экосистема:
* `@telegram-apps/sdk`, `@telegram-apps/bridge` (monorepo) — https://github.com/Telegram-Mini-Apps/telegram-apps (пуш 28.10.2026);
  `invokeCustomMethod` типы: `packages/bridge/src/utils/invokeCustomMethod.d.ts`, `methods/types/custom-method.d.ts`
* Документация сообщества — https://docs.telegram-mini-apps.com
* Шаблоны — https://github.com/Telegram-Mini-Apps (reactjs/nextjs/solidjs/vuejs/typescript-template)
* TWA Tools (legacy SDK/types/UI-kit) — https://github.com/twa-dev (SDK 8.0.2, 05.02.2025)
* Unity bridge — https://github.com/Open-Yescoin/Telegram-Unity-Bridge
* Референс тапалки — https://github.com/nikandr-surkov/Hamster-Kombat-Telegram-Mini-App-Clone

Что осталось непроверенным: `docs.ton.org`/TON Connect 2026 (страницы не найдены по угаданным URL),
Telegram Ads тарификация для mini apps, лимиты Telegram Serverless, порог вывода Stars,
`core.telegram.org/*/gifts` (страницы в архиве нет — gifts описаны только в `bots/api`).
