/**
 * 15 achievement definitions. Must match codes in domain/achievements.ts.
 */

import type { AchievementDefRow } from '../repos/achievement_repo';

export const ACHIEVEMENT_SEED: Omit<AchievementDefRow, 'id' | 'created_at'>[] = [
  { code: 'first_step',        name: 'Первый шаг',          description: 'Выполни первый квест',              rarity: 'common',    icon: '🚶' },
  { code: 'first_quest',       name: 'Старт',                description: 'Соверши любое действие',             rarity: 'common',    icon: '🌱' },
  { code: 'comeback',          name: 'Возвращение',          description: 'Вернись после паузы в 3+ дней',     rarity: 'common',    icon: '🔁' },
  { code: 'early_bird',        name: 'Ранняя пташка',        description: 'Квест до 09:00',                     rarity: 'common',    icon: '🌅' },
  { code: 'midnight_owl',      name: 'Полуночник',           description: 'Квест между 00:00 и 05:00',          rarity: 'common',    icon: '🌙' },
  { code: 'evening_zen',       name: 'Вечерний дзен',        description: 'Квест после 22:00',                  rarity: 'common',    icon: '🌆' },
  { code: 'weekend_warrior',   name: 'Выходной воин',        description: '10 квестов в субботу или воскресенье', rarity: 'rare',     icon: '🛡️' },
  { code: 'week_streak',       name: 'Неделя силы',          description: '7 дней подряд',                      rarity: 'rare',      icon: '🔥' },
  { code: 'month_streak',      name: 'Месяц стали',          description: '30 дней подряд',                     rarity: 'legendary', icon: '👑' },
  { code: 'category_rainbow',  name: 'Радуга',               description: 'Все 5 категорий за 7 дней',          rarity: 'rare',      icon: '🌈' },
  { code: 'all_categories_today', name: 'Дождь из категорий', description: 'Все 5 категорий за один день',      rarity: 'epic',      icon: '⛈️' },
  { code: 'health_balance',    name: 'Здоровый ритм',        description: 'Health 7 дней подряд',               rarity: 'rare',      icon: '💚' },
  { code: 'variety_30',        name: 'Исследователь',        description: '30 разных квестов',                  rarity: 'common',    icon: '🧭' },
  { code: 'variety_50',        name: 'Мастер разнообразия',  description: '50 разных квестов',                  rarity: 'epic',      icon: '🗺️' },
  { code: 'hardcore_5',        name: 'Хардкор',              description: '5 квестов сложности 3',              rarity: 'rare',      icon: '💀' },
  { code: 'personal_record_day', name: 'Рекорд дня',          description: 'Твой лучший день по XP',             rarity: 'epic',      icon: '🏆' },
  { code: 'category_personal_best', name: 'Рекорд категории', description: 'Твой лучший XP в категории',        rarity: 'epic',      icon: '🥇' },
];
