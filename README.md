# fpx-fingerprint

FPX — behavioral & device fingerprint collector (clean-room implementation).

Статья-исследование: [article.md](article.md) — «Как Т-Банк узнаёт ваш компьютер:
реверс антифрод-коллектора wev.js». Внутри: рецепт canvas-паспорта устройства,
восемь бот-ловушек, эксперименты со спуфом и четыре схемы.

**TL;DR**: пока вы двигаете мышью по форме банка, браузер рисует невидимую
картинку 2000×200 с текстом на несуществующем шрифте и превращает её в
SHA256-хеш. Этот хеш — «паспорт» вашего компьютера.

## Репозиторий

```
fpx.js        — сам коллектор (~300 строк, без зависимостей)
demo.html     — демо: что ваш браузер рассказывает о вас
test_fpx.js   — тесты (Playwright): сбор, стабильность хеша, спуф-тест
article.md    — статья-исследование с иллюстрациями
docs/images/  — схемы
docs/research-journal.md — журнал реверса с таймстампами (17 находок)
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
