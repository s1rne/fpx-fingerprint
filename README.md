# fpx-fingerprint

FPX — behavioral & device fingerprint collector (clean-room implementation)
+ реверс-исследование антифрод-коллекторов Т-Банка в двух частях.

**TL;DR**: пока вы двигаете мышью по форме банка, браузер рисует невидимую
картинку 2000×200 с текстом на несуществующем шрифте и превращает её в
SHA256-хеш. Этот хеш — «паспорт» вашего компьютера.

## Части исследования

| Часть | Статья | О чём |
|---|---|---|
| 1 | [article.md](article.md) | Реверс `wev.js`: canvas-паспорт SHA-256, 8 бот-ловушек, 12 чекеров, эксперименты со спуфом |
| 2 | [docs/part2/article.md](docs/part2/article.md) | Реверс `fp-pixel.js` + движка AnyId: 312 сигналов, AES-256-GCM+RSA шифрование, WebRTC сквозь VPN, `fingerprintId` на сервере, 12 проверок эмуляции, энтропия Android vs iOS |

## Репозиторий

```
fpx.js        — сам коллектор (~300 строк, без зависимостей)
demo.html     — демо: что ваш браузер рассказывает о вас
test_fpx.js   — тесты (Playwright): сбор, стабильность хеша, спуф-тест
article.md    — часть 1 с иллюстрациями
docs/images/  — схемы части 1 + обложка
docs/research-journal.md — журнал части 1 (17 находок F1–F17)
docs/part2/   — часть 2: статья, схемы, улики, скрипты, журнал (F18–F40)
```

## Quick start

```html
<script src="fpx.js"></script>
<script>
  Fpx.init({ limit: 1000 });
  const hash = await Fpx.deviceHash();  // паспорт устройства
  const data = await Fpx.collectData(); // полный слепок
  await Fpx.send('https://your-api/collect');
</script>
```

Демо: `python3 -m http.server 8080` → http://localhost:8080/demo.html

## Тесты

```bash
node test_fpx.js
```

## Лицензия

CC BY-NC-SA 4.0 — использовать и изучать можно, коммерция и закрытые производные запрещены.
