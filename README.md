# Калькулятор стоимости

Внутренний калькулятор стоимости проектных работ по наружным сетям В1, К1, К2 и дренажа. Заказчик видит коммерческое КП; себестоимость, маржа и СБЦ остаются у менеджера.

Дорожная карта: [knowledge-base/roadmap.md](knowledge-base/roadmap.md).

BIM-проект под Cursor + Civil 3D MCP.

## Калькулятор в браузере

Учебный веб-экран из `mockup/index.html`. Ставки по-прежнему выдуманные.

```bash
npm install
npm test
npm run dev
```

Откроется `http://localhost:5173`. Расчёт живёт в `src/engine` и не зависит от экрана. База сооружений и лист СБЦ сохраняются в браузере.

На телефоне тот же адрес страницы: https://krasavkinmax.github.io/kalkulyator-pir/ . Экран уже собран под узкую ширину: вкладки в две колонки, строки работ карточками. Чтобы открывать как приложение, в браузере телефона выберите «На экран Домой» или «Добавить на главный экран».

## Старт

1. Открой папку в Cursor.
2. В Civil 3D загрузи MCP-плагин (порт `8080`).
3. В чате: «проверь здоровье проекта».

## Содержимое кита

- `.cursor/rules/bim-project.mdc` — правило проекта
- `.cursor/skills/project-health-check/` — health check
- `.cursor/mcp.json` — stub; Civil 3D берётся с user-level MCP
- `knowledge-base/` — база знаний

Кит-источник: `%USERPROFILE%\.cursor\skills\bim-civil3d-project-kit`
