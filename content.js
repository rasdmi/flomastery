// Тексты/настройки
window.TEXT = {
  hint: "WASD/стрелки — движение • Space — перепрыгнуть ближайшую стену • R — рестарт уровня • M — полный рестарт • ? — окно навигации",
  end_title: "Финиш!",
  end_text: (lvl, time, caught) =>
    caught ? `Тебя поймала собака на уровне ${lvl}. Время: ${time.toFixed(1)}s`
           : `Уровень ${lvl} пройден! Время: ${time.toFixed(1)}s`,
  restart_btn: "🔄 С начала",
};

window.CONFIG = {
  tile: 32,              // размер базовой плитки (px). Одна стеночка = tile/2.
  playerSpeed: 3.2,      // пикс/кадр
  playerRadius: 10,

  // Стартовые размеры лабиринта (в клетках, НЕ стенах)
  baseCols: 15,
  baseRows: 11,
  levelScale: 1.4,       // каждый следующий уровень ×1.4 к cols/rows

  // Навигационные стрелки
  arrowStep: 3,
  arrowLookAhead: 2,
  arrowActiveRadius: 140,
  arrowMaxAlpha: 0.95,
  navRecalcMs: 400,      // раз в N мс пересчитываем путь от игрока до выхода

  // Прыжок через стену
  jumpCooldownMs: 900,

  // Собака
  dogSpeed: 2.8,
  dogRecalcMs: 260,      // как часто обновлять путь до игрока
};
