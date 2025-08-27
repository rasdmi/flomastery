// Тексты/настройки
window.TEXT = {
  hint: "WASD/стрелки — движение • Space — перепрыгнуть стену • 1/2/3 — скорость собаки • R — рестарт уровня • M — полный рестарт • ? — окно навигации",
  end_title: "Финиш!",
  end_text: (lvl, time, caught) =>
    caught ? `Тебя поймала собака на уровне ${lvl}. Время: ${time.toFixed(1)}s`
           : `Уровень ${lvl} пройден! Время: ${time.toFixed(1)}s`,
  restart_btn: "🔄 С начала",
};

window.CONFIG = {
  tile: 32,              // размер базовой плитки (px), стенка = tile/2
  playerSpeed: 3.2,
  playerRadius: 10,

  baseCols: 15,
  baseRows: 11,
  levelScale: 1.4,       // каждый следующий уровень ×1.4

  arrowStep: 3,
  arrowLookAhead: 2,
  arrowActiveRadius: 140,
  arrowMaxAlpha: 0.95,
  navRecalcMs: 400,

  jumpCooldownMs: 900,

  // Скорости собаки (индексы 1..3 для удобства в UI/клавишах)
  dogSpeeds: [2.0, 2.8, 3.8],
  dogRecalcMs: 260,
};
