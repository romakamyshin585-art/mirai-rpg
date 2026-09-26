/**
 * Second wave of system quests — 150 entries, 30 per category.
 *
 * Curated from the 200-quest reference list. Selection rule: keep the
 * quests that are specific enough to actually start today and that widen
 * the catalogue rather than restating an existing seed. Dropped on
 * purpose:
 *
 *  - exact restatements of the first wave ("Пять километров" vs
 *    "Пробежка 5 км", "Дочитано" vs "Закончить книгу", "Забытый
 *    контакт" vs "Написать другу", ...);
 *  - near-duplicate pairs inside one category (three investing quests,
 *    two "thank everyone" quests, two "order a coffee" quests) — one of
 *    each pair survives;
 *  - entries that are not actionable as written.
 *
 * Difficulty and XP follow the first wave's scale: an easy quest is a
 * single sitting (~15 XP), a medium one a session or a short week
 * (~30-40), a hard one a multi-week commitment (~50-70). The three
 * "Финальный босс" entries per category are the long arcs and pay a
 * bonus, so a profile that clears one of them has visibly done something
 * hard.
 *
 * Titles are unique across both waves — the boot seeder matches on title
 * to stay idempotent, so a duplicate would silently never appear.
 */

import type { SeedQuest } from './quests';

const HEALTH: SeedQuest[] = [
  { title: 'Разминка новичка',           description: '20 приседаний одним подходом, без остановки',                    category: 'health', difficulty: 1, xp_reward: 15 },
  { title: 'Прогулка без экрана',         description: '15 минут на улице, телефон в кармане',                              category: 'health', difficulty: 1, xp_reward: 20 },
  { title: 'Кулинарный дебют',           description: 'Полноценный обед дома вместо доставки',                               category: 'health', difficulty: 2, xp_reward: 35 },
  { title: 'Диагностика',                description: 'Общий анализ крови и визит к терапевту',                            category: 'health', difficulty: 2, xp_reward: 30 },
  { title: 'Абонемент',                  description: 'Выбери зал или секцию рядом с домом и купи абонемент',              category: 'health', difficulty: 1, xp_reward: 15 },
  { title: 'Первый бой',                 description: 'Первая тренировка, лучше с тренером',                                 category: 'health', difficulty: 2, xp_reward: 40 },
  { title: 'Неделя без сахара',          description: '7 дней без сахара и фастфуда',                                        category: 'health', difficulty: 3, xp_reward: 50 },
  { title: 'Трекер тела',                description: 'Начни считать сон и шаги честно, без приукрашивания',                   category: 'health', difficulty: 1, xp_reward: 15 },
  { title: 'Улыбка героя',               description: 'Полный осмотр у стоматолога',                                         category: 'health', difficulty: 1, xp_reward: 20 },
  { title: 'Личный план',                description: 'План тренировок на месяц вперёд',                                     category: 'health', difficulty: 1, xp_reward: 15 },
  { title: 'Мил-преп',                   description: 'Заготовить полезное меню на всю неделю',                              category: 'health', difficulty: 2, xp_reward: 35 },
  { title: 'Консультация специалиста',   description: 'Приём у нутрициолога или диетолога',                                  category: 'health', difficulty: 2, xp_reward: 30 },
  { title: 'Полный чекап',               description: 'Кровь, УЗИ и ЭКГ за один визит',                                      category: 'health', difficulty: 3, xp_reward: 50 },
  { title: 'Десятка',                    description: '10 км без единой остановки',                                           category: 'health', difficulty: 3, xp_reward: 70 },
  { title: 'Сухой месяц',                description: 'Месяц без алкоголя',                                                  category: 'health', difficulty: 3, xp_reward: 60 },
  { title: 'Осанка героя',               description: 'Целый день лови себя на сутулости',                                    category: 'health', difficulty: 1, xp_reward: 20 },
  { title: 'Без лифта',                  description: 'Неделю поднимайся по лестнице',                                        category: 'health', difficulty: 1, xp_reward: 20 },
  { title: 'Первый отжим',               description: '10 отжиманий подряд одним подходом',                                   category: 'health', difficulty: 1, xp_reward: 15 },
  { title: 'Заплыв',                     description: '500 метров в бассейне',                                                category: 'health', difficulty: 2, xp_reward: 35 },
  { title: 'Педали',                      description: '15 км на велосипеде',                                                  category: 'health', difficulty: 2, xp_reward: 35 },
  { title: 'Без газировки',              description: 'Месяц без сладких газированных напитков',                               category: 'health', difficulty: 2, xp_reward: 30 },
  { title: 'Зоркий глаз',                description: 'Проверь зрение у окулиста',                                            category: 'health', difficulty: 1, xp_reward: 20 },
  { title: 'Первый подъём',              description: 'Подтянись на турнике хотя бы один раз',                                 category: 'health', difficulty: 2, xp_reward: 35 },
  { title: 'Разгрузка тела',             description: 'Профессиональный массаж',                                              category: 'health', difficulty: 1, xp_reward: 25 },
  { title: 'Однодневный поход',          description: '10+ км пешком по лесу или парку',                                       category: 'health', difficulty: 3, xp_reward: 60 },
  { title: 'Спальня без гаджетов',       description: 'Неделю не бери телефон в постель',                                      category: 'health', difficulty: 2, xp_reward: 30 },
  { title: 'Железная воля',              description: 'Месяц с весами три раза в неделю по плану',                            category: 'health', difficulty: 3, xp_reward: 60 },
  { title: 'Полтинник на колёсах',       description: '50 км на велосипеде за один день',                                      category: 'health', difficulty: 3, xp_reward: 60 },
  { title: 'Финальный босс: Полумарафон', description: '21,1 км. Всё, что было раньше, вело именно сюда',                    category: 'health', difficulty: 3, xp_reward: 120 },
  { title: 'Финальный босс: Мини-триатлон', description: '1 км в бассейне, 20 км на велосипеде и 5 км бегом за один день',      category: 'health', difficulty: 3, xp_reward: 120 },
];

const KNOWLEDGE: SeedQuest[] = [
  { title: 'Список книг',                description: 'Заведи список из 10 книг, которые хочешь прочитать',                    category: 'knowledge', difficulty: 1, xp_reward: 15 },
  { title: 'Первый иностранный',         description: 'Вводный урок языка в приложении',                                        category: 'knowledge', difficulty: 1, xp_reward: 20 },
  { title: 'Новый навык, шаг 1',         description: 'Вводный модуль онлайн-курса по любому навыку',                          category: 'knowledge', difficulty: 2, xp_reward: 35 },
  { title: 'Финансовый ликбез',          description: 'Основы личного бюджета: статья или видео на 20 минут',                   category: 'knowledge', difficulty: 1, xp_reward: 20 },
  { title: 'Психология отношений',       description: 'Книга о том, как строить здоровые отношения с людьми',                  category: 'knowledge', difficulty: 2, xp_reward: 30 },
  { title: 'Голос и сцена',              description: 'Курс по публичным выступлениям',                                        category: 'knowledge', difficulty: 2, xp_reward: 40 },
  { title: 'Инвест-азбука',              description: 'Что такое ИИС и брокерский счёт и с чего начать',                        category: 'knowledge', difficulty: 2, xp_reward: 35 },
  { title: 'Привычки, которые работают', description: 'Книга про формирование привычек и продуктивность',                       category: 'knowledge', difficulty: 1, xp_reward: 20 },
  { title: 'Апгрейд профессии',          description: 'Курс повышения квалификации по своей специальности',                    category: 'knowledge', difficulty: 3, xp_reward: 60 },
  { title: 'Публикация',                 description: 'Обзор прочитанной книги, опубликованный публично',                      category: 'knowledge', difficulty: 2, xp_reward: 35 },
  { title: 'Новая территория',           description: 'Курс по теме, вообще не связанной с твоей профессией',                   category: 'knowledge', difficulty: 3, xp_reward: 60 },
  { title: 'Ремесло за деньги',          description: 'Основы навыка, который можно монетизировать',                          category: 'knowledge', difficulty: 3, xp_reward: 60 },
  { title: 'Разбор чужого опыта',        description: 'Биография человека, который добился того, чего хочешь ты',               category: 'knowledge', difficulty: 2, xp_reward: 30 },
  { title: 'Игра ума',                   description: 'Базовые правила шахмат или го и одна партия',                           category: 'knowledge', difficulty: 1, xp_reward: 20 },
  { title: 'Скорочтение',                description: 'Урок по технике быстрого чтения и попытка применить',                    category: 'knowledge', difficulty: 2, xp_reward: 30 },
  { title: 'Знай свои права',            description: 'Основы трудового законодательства: что тебе положено',                  category: 'knowledge', difficulty: 2, xp_reward: 30 },
  { title: 'Профильная статья',          description: 'Серьёзная статья по своей сфере с конспектом',                          category: 'knowledge', difficulty: 2, xp_reward: 35 },
  { title: 'Живая лекция',               description: 'Офлайн-лекция или мастер-класс',                                        category: 'knowledge', difficulty: 2, xp_reward: 40 },
  { title: 'Разговорный клуб',           description: 'Встреча разговорного клуба по любому языку',                             category: 'knowledge', difficulty: 2, xp_reward: 40 },
  { title: 'Налоговый ликбез',           description: 'Разберись в вычетах и подай заявление на возврат НДФЛ',                category: 'knowledge', difficulty: 2, xp_reward: 35 },
  { title: 'Большая книга',              description: 'Книга об экономике или истории, целиком',                                category: 'knowledge', difficulty: 3, xp_reward: 60 },
  { title: 'Разбор полётов',             description: 'Разбери одну крупную неудачу и выпиши выводы',                          category: 'knowledge', difficulty: 2, xp_reward: 35 },
  { title: 'Пятидневный марафон',        description: 'Короткий бесплатный онлайн-интенсив по любой теме',                     category: 'knowledge', difficulty: 2, xp_reward: 40 },
  { title: 'Речь на камеру',             description: 'Трёхминутная речь на видео, без монтажа',                               category: 'knowledge', difficulty: 2, xp_reward: 35 },
  { title: 'Первая помощь',              description: 'Курс оказания первой медицинской помощи',                              category: 'knowledge', difficulty: 2, xp_reward: 40 },
  { title: 'Права арендатора',           description: 'Как устроен договор аренды и какие права у квартиросъёмщика',            category: 'knowledge', difficulty: 2, xp_reward: 30 },
  { title: 'Учитель на день',            description: 'Объясни другу тему, в которой ты силён, как преподаватель',              category: 'knowledge', difficulty: 2, xp_reward: 35 },
  { title: 'Финальный босс: Сертификация', description: 'Официальный экзамен или сертификат по новому навыку',               category: 'knowledge', difficulty: 3, xp_reward: 100 },
  { title: 'Финальный босс: Интенсив выходного дня', description: 'Однодневный воркшоп и готовый мини-проект на выходе',        category: 'knowledge', difficulty: 3, xp_reward: 100 },
];

const CAREER: SeedQuest[] = [
  { title: 'Инвентарь достижений',       description: 'Выпиши все реальные рабочие достижения за последний год',                category: 'career', difficulty: 1, xp_reward: 20 },
  { title: 'Разведка рынка',             description: 'Узнай, сколько платят специалистам твоего профиля сейчас',              category: 'career', difficulty: 2, xp_reward: 30 },
  { title: 'Квартальный план',           description: 'План профессионального развития на три месяца',                        category: 'career', difficulty: 2, xp_reward: 30 },
  { title: 'Честная обратная связь',     description: 'Попроси у руководителя прямую оценку своей работы',                     category: 'career', difficulty: 2, xp_reward: 35 },
  { title: 'Новый инструмент',           description: 'Освой один инструмент, полезный именно для работы',                     category: 'career', difficulty: 2, xp_reward: 35 },
  { title: 'Проверка боем',              description: 'Пять откликов на вакансии — просто чтобы узнать свою цену',            category: 'career', difficulty: 2, xp_reward: 40 },
  { title: 'Побочный доход, старт',      description: 'Профиль на бирже фриланса',                                           category: 'career', difficulty: 2, xp_reward: 30 },
  { title: 'Первые деньги на стороне',   description: 'Первый небольшой платный заказ, взятый и выполненный',                 category: 'career', difficulty: 3, xp_reward: 60 },
  { title: 'Пет-проект',                 description: 'Личный проект вне работы, доведённый до рабочего состояния',            category: 'career', difficulty: 3, xp_reward: 60 },
  { title: 'Переговоры о цене',          description: 'Встреча с руководителем и разговор о премии или повышении',               category: 'career', difficulty: 3, xp_reward: 60 },
  { title: 'Первый вклад в будущее',     description: 'Открой ИИС или брокерский счёт и внеси первую сумму',                   category: 'career', difficulty: 2, xp_reward: 35 },
  { title: 'Сцена внутри компании',      description: 'Выступи с докладом или презентацией идеи на работе',                   category: 'career', difficulty: 2, xp_reward: 40 },
  { title: 'Прибавка',                   description: 'Добейся повышения зарплаты или индексации',                            category: 'career', difficulty: 3, xp_reward: 70 },
  { title: 'Нетворкинг-старт',           description: 'Десять новых профильных контактов в hh.ru или LinkedIn',                 category: 'career', difficulty: 2, xp_reward: 30 },
  { title: 'Найди наставника',           description: 'Ментор или встреча с более опытным специалистом',                       category: 'career', difficulty: 2, xp_reward: 40 },
  { title: 'Резюме на языке мира',       description: 'Резюме на английском языке',                                           category: 'career', difficulty: 2, xp_reward: 35 },
  { title: 'Рекомендация',               description: 'Попроси коллегу или руководителя написать рекомендацию',                category: 'career', difficulty: 2, xp_reward: 35 },
  { title: 'Аудит слабых мест',          description: 'Слабые стороны в работе и план их прокачки',                            category: 'career', difficulty: 2, xp_reward: 30 },
  { title: 'Метод помидора',             description: 'Техника Pomodoro на работе всю неделю',                                 category: 'career', difficulty: 1, xp_reward: 20 },
  { title: 'Искусство торга',            description: 'Изучи технику переговоров о зарплате',                                 category: 'career', difficulty: 2, xp_reward: 35 },
  { title: 'Рутина под автопилот',       description: 'Автоматизируй одну повторяющуюся рабочую задачу',                      category: 'career', difficulty: 3, xp_reward: 50 },
  { title: 'План Б',                     description: 'Продумай запасной вариант дохода на случай форс-мажора',               category: 'career', difficulty: 2, xp_reward: 30 },
  { title: 'Кейсы для резюме',           description: 'Три рабочих кейса с измеримым результатом',                           category: 'career', difficulty: 2, xp_reward: 40 },
  { title: 'Инвестиция в мозг',         description: 'Платный курс, который реально поднимет твою цену на рынке',            category: 'career', difficulty: 3, xp_reward: 60 },
  { title: 'Второй канал дохода',        description: 'Протестируй ещё один способ подработки, отличный от привычного',        category: 'career', difficulty: 3, xp_reward: 60 },
  { title: 'Деловой завтрак',            description: 'Профессиональная конференция или нетворкинг-встреча',                  category: 'career', difficulty: 2, xp_reward: 40 },
  { title: 'Личный бренд',               description: 'Профессиональный пост о своём опыте в своей сфере',                   category: 'career', difficulty: 2, xp_reward: 30 },
  { title: 'Второе мнение',              description: 'Собеседование в другой компании ради практики и оффера',                 category: 'career', difficulty: 2, xp_reward: 40 },
  { title: 'Финальный босс: Первая оплата со стороны', description: 'Побочный проект до первого реального дохода от клиента',    category: 'career', difficulty: 3, xp_reward: 100 },
  { title: 'Финальный босс: Смена уровня', description: 'Полный цикл смены работы: поиск, переговоры, оффер',            category: 'career', difficulty: 3, xp_reward: 100 },
];

const DISCIPLINE: SeedQuest[] = [
  { title: 'Первый ритуал',              description: 'Заправь кровать сразу после того как встал',                          category: 'discipline', difficulty: 1, xp_reward: 10 },
  { title: 'Тихий вечер',                 description: 'Вечер без соцсетей после 22:00',                                       category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: 'Зона порядка',                description: 'Убери одну комнату или зону в квартире',                                category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: 'Зеркало правды',             description: 'Включи трекер экранного времени и честно посмотри цифры за неделю',      category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: 'Цифровой детокс на день',     description: 'Целый выходной без соцсетей',                                          category: 'discipline', difficulty: 3, xp_reward: 50 },
  { title: 'Расписание недели',           description: 'Работа, спорт, учёба, общение — по часам',                             category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: 'Долг закрыт',                 description: 'Мелкая задача, которую откладывал больше месяца',                       category: 'discipline', difficulty: 2, xp_reward: 35 },
  { title: 'Генеральная уборка',         description: 'Полный порядок во всей квартире за один день',                          category: 'discipline', difficulty: 3, xp_reward: 50 },
  { title: 'Бюджет под контролем',       description: 'Таблица личных финансов, которую ты ведёшь',                            category: 'discipline', difficulty: 2, xp_reward: 35 },
  { title: 'Правило двух минут',          description: 'Неделю по принципу: меньше двух минут — делай сразу',                    category: 'discipline', difficulty: 2, xp_reward: 35 },
  { title: 'Отказ на неделю',             description: 'Откажись на неделю от одной вредной привычки',                           category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: 'Ревизия трат',                description: 'Пересмотри подписки и регулярные траты, отмени лишнее',                 category: 'discipline', difficulty: 1, xp_reward: 20 },
  { title: 'Личный устав',                description: 'Список правил и ценностей, по которым хочешь жить',                      category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: '30 дней челленджа',          description: 'Месячный челлендж: подъём в 7:00 каждый день',                         category: 'discipline', difficulty: 3, xp_reward: 60 },
  { title: 'Штаб продуктивности',        description: 'Обустрой рабочее место дома под концентрацию',                          category: 'discipline', difficulty: 1, xp_reward: 20 },
  { title: 'Без повтора будильника',      description: 'Пять дней подряд без кнопки «отложить»',                                category: 'discipline', difficulty: 2, xp_reward: 35 },
  { title: 'Пустой инбокс',               description: 'Разбери и обнули почтовый ящик',                                        category: 'discipline', difficulty: 1, xp_reward: 15 },
  { title: 'Одна привычка, ноль пропусков', description: 'Микро-привычка семь дней без единого срыва',                          category: 'discipline', difficulty: 2, xp_reward: 35 },
  { title: 'Разбор гардероба',            description: 'Избавься от ненужных вещей в шкафу',                                   category: 'discipline', difficulty: 2, xp_reward: 25 },
  { title: 'Книга вместо ленты',         description: 'Пять дней вечернего скролла заменяешь чтением',                         category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: 'Список «нет»',               description: 'Распиши, от чего откажешься в этом месяце',                            category: 'discipline', difficulty: 2, xp_reward: 25 },
  { title: 'Итоги дня',                   description: 'Дневник из трёх строк каждый вечер всю неделю',                         category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: 'Проверка уровня',            description: 'Бесплатный тест на уровень языка, который учишь',                       category: 'knowledge', difficulty: 1, xp_reward: 20 },
  { title: 'Заранее, а не в последний момент', description: 'Хотя бы раз сделай задачу заблаговременно',                     category: 'discipline', difficulty: 1, xp_reward: 15 },
  { title: 'Тихий телефон',               description: 'Отключи все ненужные уведомления',                                      category: 'discipline', difficulty: 1, xp_reward: 15 },
  { title: 'Правило суток',               description: 'Месяц без спонтанных покупок: жди 24 часа',                            category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: 'Утренние страницы',          description: 'Страница мыслей от руки каждое утро, неделю',                           category: 'discipline', difficulty: 2, xp_reward: 35 },
  { title: 'Одна задача за раз',          description: 'Неделю без многозадачности',                                            category: 'discipline', difficulty: 2, xp_reward: 35 },
  { title: 'Чистое пространство',        description: 'Убери из дома всё, что постоянно отвлекает',                            category: 'discipline', difficulty: 2, xp_reward: 30 },
  { title: 'Финальный босс: Неделя по расписанию', description: '7 дней строго по своему распорядку, с честным отчётом',     category: 'discipline', difficulty: 3, xp_reward: 100 },
  { title: 'Финальный босс: Тройной трекинг', description: '30 дней, три привычки, ни одного пропуска',                  category: 'discipline', difficulty: 3, xp_reward: 100 },
];

const SOCIAL: SeedQuest[] = [
  { title: 'Мелкий разговор',             description: 'Заговори с незнакомым человеком в очереди, кафе или лифте',              category: 'social', difficulty: 1, xp_reward: 15 },
  { title: 'Приглашение',                 description: 'Позови друга на прогулку или кофе',                                     category: 'social', difficulty: 1, xp_reward: 20 },
  { title: 'Новые лица',                  description: 'Мероприятие или митап по интересам',                                    category: 'social', difficulty: 2, xp_reward: 30 },
  { title: 'Встреча вживую',              description: 'Небольшая офлайн-встреча для 3-5 знакомых',                            category: 'social', difficulty: 3, xp_reward: 50 },
  { title: 'Свидание',                    description: 'Сходи на свидание',                                                     category: 'social', difficulty: 2, xp_reward: 30 },
  { title: 'Прокачка софт-скиллов',       description: 'Книга или тренинг по соцнавыкам и один приём, применённый в жизни',      category: 'social', difficulty: 2, xp_reward: 30 },
  { title: 'Неделя благодарности',        description: 'Каждый день неделю говори спасибо хотя бы одному человеку',             category: 'social', difficulty: 2, xp_reward: 35 },
  { title: 'Воссоединение',               description: 'Организуй встречу одноклассников спустя годы',                           category: 'social', difficulty: 3, xp_reward: 50 },
  { title: 'Микро-выступление',           description: 'Расскажи небольшой группе о том, чем занимаешься',                      category: 'social', difficulty: 2, xp_reward: 35 },
  { title: 'Клуб по интересам',           description: 'Запишись в клуб и сходи на первое занятие',                             category: 'social', difficulty: 2, xp_reward: 35 },
  { title: 'Голос в мир',                 description: 'Развёрнутый пост на волнующую тему и обратная связь',                    category: 'social', difficulty: 2, xp_reward: 35 },
  { title: 'Своя тусовка',                description: 'Небольшое сообщество из 15-20 человек вокруг одного интереса',           category: 'social', difficulty: 3, xp_reward: 60 },
  { title: 'Только вопросы',              description: 'Сегодня слушай и спрашивай, не перебивая',                              category: 'social', difficulty: 1, xp_reward: 20 },
  { title: 'Общий чат по интересу',       description: 'Групповой чат вокруг общего хобби',                                      category: 'social', difficulty: 2, xp_reward: 25 },
  { title: 'Извинение',                   description: 'Извинись перед тем, с кем был неправ, пусть даже давно',                 category: 'social', difficulty: 2, xp_reward: 30 },
  { title: 'Помощь незнакомцу',           description: 'Помоги случайному человеку, ничего не ожидая взамен',                    category: 'social', difficulty: 2, xp_reward: 30 },
  { title: 'Видеозвонок',                 description: 'Созвонись по видео с тем, с кем обычно только переписываешься',           category: 'social', difficulty: 1, xp_reward: 15 },
  { title: 'Гости дома',                  description: 'Пригласи друзей к себе на вечер',                                       category: 'social', difficulty: 2, xp_reward: 35 },
  { title: 'Знакомство через дело',       description: 'Новый человек через совместную секцию или занятие',                      category: 'social', difficulty: 2, xp_reward: 35 },
  { title: 'Честный разговор',            description: 'Мягко скажи другу то, что давно откладывал',                            category: 'social', difficulty: 3, xp_reward: 50 },
  { title: 'Вопрос из зала',              description: 'Задай вопрос спикеру на публичном мероприятии',                         category: 'social', difficulty: 2, xp_reward: 30 },
  { title: 'Разговор о деньгах',          description: 'Открой тему денег и целей с близким человеком',                          category: 'social', difficulty: 3, xp_reward: 45 },
  { title: 'Языковой партнёр',            description: 'Найди собеседника для языкового обмена и проведи первую встречу',        category: 'social', difficulty: 2, xp_reward: 35 },
  { title: 'Семейный ужин',               description: 'Организуй ужин с семьёй или близкими родственниками',                    category: 'social', difficulty: 2, xp_reward: 30 },
  { title: 'Волонтёрство',                description: 'Прими участие в волонтёрском мероприятии',                              category: 'social', difficulty: 3, xp_reward: 50 },
  { title: 'Друзья друзей',               description: 'Познакомься с чужими друзьями на общем мероприятии',                    category: 'social', difficulty: 2, xp_reward: 30 },
  { title: 'Ты — инициатор',              description: 'Регулярная встреча для компании друзей, раз в месяц',                    category: 'social', difficulty: 3, xp_reward: 50 },
  { title: 'Письмо в будущее',            description: 'Напиши письмо себе через год и отдай другу на хранение',                 category: 'social', difficulty: 2, xp_reward: 30 },
  { title: 'Финальный босс: Событие с нуля', description: 'Офлайн-встреча на 15+ человек за один день: идея, приглашения, программа', category: 'social', difficulty: 3, xp_reward: 100 },
  { title: 'Финальный босс: Выезд компании', description: 'Поездка на природу или в город для 5+ человек — вся логистика на тебе', category: 'social', difficulty: 3, xp_reward: 100 },
];

export const QUEST_SEED_V2: SeedQuest[] = [
  ...HEALTH,
  ...KNOWLEDGE,
  ...CAREER,
  ...DISCIPLINE,
  ...SOCIAL,
];
