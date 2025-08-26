// Тексты/настройки
window.TEXT = {
  hint: "Управление: WASD/стрелки — движение • R — рестарт уровня • M — полный рестарт",
  level_house: "Дом",
  level_yard: "Двор",
  level_mouth: "Во рту голубя",
  end_title: "Ты в желудке голубя 😅",
  end_text: (time) => `Выбрался из дома, прошёл двор и попал в пасть голубя.\nВремя: ${time.toFixed(1)}s`,
  restart_btn: "🔄 С начала",
};

window.CONFIG = {
  tile: 32,             // размер клетки
  houseSize: [15, 11],  // ширина, высота (клетки)
  yardSize: [31, 17],
  playerSpeed: 3.2,     // пикс/кадр
  doodleWobble: 0.9,    // «детские» кривые контуры
};
