// Тексты/настройки
window.TEXT = {
  hint:
    "WASD/стрелки — движение • Space — перепрыгнуть стену • 1/2/3 — скорость собаки • R — рестарт • ? — окно навигации",
  end_title: "Финиш!",
  end_text: (lvl, time, caught) =>
    caught ? `Тебя поймала собака на уровне ${lvl}. Время: ${time.toFixed(1)}s`
           : `Уровень ${lvl} пройден! Время: ${time.toFixed(1)}s`,
  restart_btn: "🔄 С начала",
};

window.CONFIG = {
  tile: 32,
  playerSpeed: 3.2,
  playerRadius: 10,

  // МЕНЬШЕ стартовый уровень
  baseCols: 8,   // было 15
  baseRows: 6,   // было 11
  levelScale: 1.4, // крупнее на каждом уровне, но визуально всё влезает

  arrowStep: 3,
  arrowLookAhead: 2,
  arrowActiveRadius: 140,
  arrowMaxAlpha: 0.95,
  navRecalcMs: 400,

  jumpCooldownMs: 900,

  dogSpeeds: [2.0, 2.8, 3.8],
  dogRecalcMs: 260,
};
