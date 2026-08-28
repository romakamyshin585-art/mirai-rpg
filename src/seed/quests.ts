/**
 * 76 system quests (15 per category, 16 in health). Reasonable spread of
 * difficulty and XP. Titles in Russian.
 *
 * The user can add/remove these by archiving. We re-seed only if catalog
 * is empty (idempotent boot).
 */

import type { Category } from '../domain/category';

export interface SeedQuest {
  title: string;
  description: string;
  category: Category;
  difficulty: 1 | 2 | 3;
  xp_reward: number;
}

const HEALTH: SeedQuest[] = [
  { title: 'Утренняя зарядка 10 мин',  description: 'Потянись, разомнись, настрой тело',           category: 'health', difficulty: 1, xp_reward: 15 },
  { title: 'Пробежка 3 км',              description: 'Лёгкий темп, без фанатизма',                   category: 'health', difficulty: 2, xp_reward: 35 },
  { title: 'Пробежка 5 км',              description: 'Средний темп',                                  category: 'health', difficulty: 3, xp_reward: 60 },
  { title: 'Прогулка 1 час',             description: 'Просто идти, дышать, смотреть по сторонам',     category: 'health', difficulty: 1, xp_reward: 20 },
  { title: '30 отжиманий',               description: 'Можно с перерывами',                            category: 'health', difficulty: 2, xp_reward: 30 },
  { title: 'Планка 3 минуты',            description: 'Суммарно, в подходах',                          category: 'health', difficulty: 2, xp_reward: 35 },
  { title: 'Растяжка 15 мин',            description: 'Всё тело, акцент на бёдра и спину',             category: 'health', difficulty: 1, xp_reward: 20 },
  { title: 'Тренировка в зале',          description: 'Силовая или функциональная, 45+ мин',          category: 'health', difficulty: 3, xp_reward: 70 },
  { title: 'Йога 30 мин',                description: 'Видео-урок или своя практика',                  category: 'health', difficulty: 2, xp_reward: 35 },
  { title: '8 стаканов воды',            description: 'Пей воду равномерно в течение дня',             category: 'health', difficulty: 1, xp_reward: 10 },
  { title: 'Лечь спать до 23:00',        description: 'Реальный отбой, не в кровати с телефоном',      category: 'health', difficulty: 2, xp_reward: 25 },
  { title: 'Сон 7+ часов',               description: 'Качественный сон',                              category: 'health', difficulty: 1, xp_reward: 20 },
  { title: 'Отказаться от сахара',       description: 'Целый день без сладкого/мучного',               category: 'health', difficulty: 3, xp_reward: 50 },
  { title: 'Контрастный душ',            description: 'Холодная вода в конце',                         category: 'health', difficulty: 2, xp_reward: 25 },
  { title: '10000 шагов',                description: 'По шагомеру',                                   category: 'health', difficulty: 2, xp_reward: 40 },
  { title: 'Велосипед 1 час',            description: 'Темп спокойный',                                category: 'health', difficulty: 2, xp_reward: 40 },
];

const KNOWLEDGE: SeedQuest[] = [
  { title: 'Читать 30 мин',              description: 'Книга, не новости',                             category: 'knowledge', difficulty: 1, xp_reward: 20 },
  { title: 'Читать 1 час',                description: 'Глубокое чтение',                               category: 'knowledge', difficulty: 2, xp_reward: 35 },
  { title: 'Выучить 10 новых слов',       description: 'Иностранный язык, с повторением',               category: 'knowledge', difficulty: 2, xp_reward: 30 },
  { title: 'Урок на YouTube / курсе',     description: 'Точечное обучение, заметки по итогу',          category: 'knowledge', difficulty: 2, xp_reward: 35 },
  { title: 'Закончить главу книги',       description: 'Любой нон-фикшн',                               category: 'knowledge', difficulty: 1, xp_reward: 25 },
  { title: 'Закончить книгу',             description: 'Полностью',                                     category: 'knowledge', difficulty: 3, xp_reward: 80 },
  { title: 'Посмотреть документалку',     description: '50+ мин, с конспектом',                         category: 'knowledge', difficulty: 2, xp_reward: 30 },
  { title: 'Решить 5 задач по математике',description: 'Школа/университет/олимпиада',                  category: 'knowledge', difficulty: 3, xp_reward: 50 },
  { title: 'Написать конспект 1 час',     description: 'По теме, которую изучаешь',                     category: 'knowledge', difficulty: 2, xp_reward: 35 },
  { title: 'Подкаст 30 мин',              description: 'С заметками, что зацепило',                     category: 'knowledge', difficulty: 1, xp_reward: 15 },
  { title: 'Пройти тренажёр памяти',      description: 'Dual N-Back или аналог',                        category: 'knowledge', difficulty: 2, xp_reward: 25 },
  { title: 'Практика кодинга 1 час',      description: 'Задачи, проект, code review',                   category: 'knowledge', difficulty: 2, xp_reward: 40 },
  { title: 'Сдать мини-экзамен',          description: 'Самопроверка по теме',                          category: 'knowledge', difficulty: 3, xp_reward: 60 },
  { title: 'Выучить стихотворение',       description: 'Наизусть',                                      category: 'knowledge', difficulty: 2, xp_reward: 30 },
  { title: 'Прочитать статью + саммари',  description: 'Хороший нон-фикшн, 3+ ключевых тезиса',         category: 'knowledge', difficulty: 1, xp_reward: 15 },
];

const CAREER: SeedQuest[] = [
  { title: 'Сделать 1 задачу из бэклога', description: 'Любой проект',                                  category: 'career', difficulty: 1, xp_reward: 25 },
  { title: 'Закрыть 3 задачи за день',    description: 'Темп, не качество',                             category: 'career', difficulty: 2, xp_reward: 50 },
  { title: 'Сделать code review',         description: '2+ PR-запроса',                                 category: 'career', difficulty: 2, xp_reward: 35 },
  { title: 'Написать PR',                 description: 'Любого размера, но с описанием',                category: 'career', difficulty: 2, xp_reward: 40 },
  { title: 'Задизайнить фичу',            description: 'Документ/макет/архитектура',                    category: 'career', difficulty: 3, xp_reward: 70 },
  { title: 'Деплой в прод',               description: 'Без отката после',                              category: 'career', difficulty: 3, xp_reward: 60 },
  { title: 'Убрать 1 технический долг',   description: 'Рефакторинг, тест, документация',               category: 'career', difficulty: 2, xp_reward: 40 },
  { title: 'Написать постмортем',         description: 'По реальному багу/инциденту',                   category: 'career', difficulty: 3, xp_reward: 50 },
  { title: 'Провести собеседование',      description: 'Техническое или продуктовое',                   category: 'career', difficulty: 3, xp_reward: 60 },
  { title: 'Подготовить резюме',          description: 'Актуализировать, отправить',                    category: 'career', difficulty: 2, xp_reward: 30 },
  { title: 'Нетворкинг-сообщение',        description: 'Одно осмысленное сообщение коллеге/знакомому',  category: 'career', difficulty: 1, xp_reward: 15 },
  { title: 'Пройти мок-интервью',         description: 'С таймером и записью',                          category: 'career', difficulty: 3, xp_reward: 60 },
  { title: 'Подать заявку на вакансию',   description: 'С кастомным сопроводительным',                  category: 'career', difficulty: 2, xp_reward: 30 },
  { title: 'Изучить 1 раздел API/фреймворка', description: 'С заметками',                               category: 'career', difficulty: 2, xp_reward: 30 },
  { title: 'Настроить CI для проекта',    description: 'lint + test + build',                           category: 'career', difficulty: 3, xp_reward: 50 },
];

const DISCIPLINE: SeedQuest[] = [
  { title: 'Медитация 10 мин',            description: 'Дыхание или сканирование тела',                 category: 'discipline', difficulty: 1, xp_reward: 15 },
  { title: 'Медитация 20 мин',            description: 'Тишина, без телефона',                          category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: 'Дневник 1 страница',          description: 'Что думаю, что чувствую, что планирую',        category: 'discipline', difficulty: 1, xp_reward: 20 },
  { title: 'Планирование завтрашнего дня',description: 'Вечером, в блокнот',                            category: 'discipline', difficulty: 1, xp_reward: 15 },
  { title: 'Сделать сложное первым',      description: 'Съесть лягушку до обеда',                       category: 'discipline', difficulty: 3, xp_reward: 50 },
  { title: 'Без соцсетей до обеда',       description: 'Половина дня',                                  category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: 'Цифровой детокс 1 час',       description: 'Телефон в ящик',                                category: 'discipline', difficulty: 2, xp_reward: 25 },
  { title: 'Холодный душ 1 мин',          description: 'В конце обычного душа',                         category: 'discipline', difficulty: 2, xp_reward: 25 },
  { title: '5-минутная уборка',           description: 'Стол/комната/почта',                            category: 'discipline', difficulty: 1, xp_reward: 10 },
  { title: 'Убраться 30 мин',             description: 'Генеральная мини-уборка',                       category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: 'Режим дня без исключений',    description: 'Подъём/отбой по расписанию',                    category: 'discipline', difficulty: 3, xp_reward: 60 },
  { title: 'Один день без жалоб',         description: 'Вслух и в мыслях',                              category: 'discipline', difficulty: 3, xp_reward: 50 },
  { title: 'Помыть посуду сразу',         description: 'Не копить',                                     category: 'discipline', difficulty: 1, xp_reward: 10 },
  { title: 'Проверить финансы 15 мин',     description: 'Баланс, расходы, подписки',                     category: 'discipline', difficulty: 1, xp_reward: 15 },
  { title: 'Сказать "нет"',               description: 'Отказать одной ненужной просьбе',               category: 'discipline', difficulty: 2, xp_reward: 20 },
];

const SOCIAL: SeedQuest[] = [
  { title: 'Позвонить родителям',         description: 'Не сообщение — звонок',                         category: 'social', difficulty: 1, xp_reward: 20 },
  { title: 'Написать другу',              description: 'Просто так, без повода',                        category: 'social', difficulty: 1, xp_reward: 10 },
  { title: 'Провести вечер с другом',     description: 'Оффлайн-встреча',                               category: 'social', difficulty: 2, xp_reward: 35 },
  { title: 'Поблагодарить кого-то',       description: 'Вслух или письменно',                           category: 'social', difficulty: 1, xp_reward: 10 },
  { title: 'Помочь коллеге без просьбы',  description: 'Заметить, что он застрял, и помочь',            category: 'social', difficulty: 2, xp_reward: 25 },
  { title: 'Сделать комплимент',          description: 'Искренний, конкретный',                         category: 'social', difficulty: 1, xp_reward: 10 },
  { title: 'Приготовить для близкого',    description: 'Завтрак/ужин',                                  category: 'social', difficulty: 2, xp_reward: 30 },
  { title: 'Разрешить конфликт',          description: 'Поговорить, не замалчивать',                    category: 'social', difficulty: 3, xp_reward: 50 },
  { title: 'Написать отзыв',              description: 'Ресторану/книге/приложению, осмысленный',       category: 'social', difficulty: 1, xp_reward: 10 },
  { title: 'Поддержать в трудный момент', description: 'Быть рядом, а не давать советы',                category: 'social', difficulty: 2, xp_reward: 30 },
  { title: 'Организовать встречу',        description: 'Созвать самому',                                category: 'social', difficulty: 3, xp_reward: 50 },
  { title: 'Подписаться/отписаться',      description: 'Чистка ленты, осознанный выбор',               category: 'social', difficulty: 1, xp_reward: 10 },
  { title: 'День без сплетен',            description: 'О себе и других',                               category: 'social', difficulty: 2, xp_reward: 25 },
  { title: 'Выйти из зоны комфорта',      description: 'Знакомство с новым человеком',                  category: 'social', difficulty: 3, xp_reward: 50 },
  { title: 'Один вечер без телефона',     description: 'С реальным человеком рядом',                    category: 'social', difficulty: 2, xp_reward: 25 },
];

export const QUEST_SEED: SeedQuest[] = [
  ...HEALTH,
  ...KNOWLEDGE,
  ...CAREER,
  ...DISCIPLINE,
  ...SOCIAL,
];
