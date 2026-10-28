# Пакет оружия: ветки Топоры и Булавы (Albion Online)

Файл данных: `albion-weapon-branches.json`. Источник — ao-bin-dumps (items.xml, spells.xml, localization.json), T8.
Генератор (`build_pack.py`, `lib.py`, `extract.py`) лежит рядом: по нему можно добавить другие ветки (копья, боевые посохи, молоты…).

## Что внутри
- `branches.axe`, `branches.mace`: по 8 видов оружия (`weapons[]`: id, name, nameRu, hands, dual, auto, aint, attackRange, `e` = id E-умения).
- Q и W общие для ветки (`q[]`, `w[]`), E у каждого оружия своё. Пассивки общие на ветку (`passives`, 4 шт.).
- Все описания `descRu`/`descEn`, значения уже переведены в масштаб проекта: урон = Albion × 3.37, энергия = Albion × 3, перезарядка = recastdelay (с).
- `approx: true` — в Albion механика завязана на союзников/сложную цепочку; здесь упрощена (см. descRu).

## Как сопоставить с текущим кодом
Сейчас Q/W/E, пассивки и оружие жёстко зашиты для мечей. Нужно сделать их данными.

### Сервер (`server.js`)
1. Загрузить JSON (`require('./albion-weapon-branches.json')`). Для каждого `spells[id]` создать запись в `ABILITIES` (cost, cooldown, hits, effects, selfEffects, shape). Старые способности мечей оставить как есть.
2. `WEAPON_DAMAGE`, `WEAPON_E` дополнить оружием из `weapons[]` (ключ — `id`). `Q_ALLOWED`/`W_ALLOWED`/`PASSIVE_ALLOWED` сделать зависимыми от ветки текущего оружия (`p.branch`): сервер должен отклонять умения чужой ветки.
3. Вместо множества `if(abilityId===...)` в `ability-hit` нужен общий резолвер по `shape`:
   - `single` — цель в `range`; `circle` (origin: self / aim / selfFront+offset / landing, radius, innerRadius); `cone` (angle°, radius, innerRadius); `line` (length, width, start).
   - `hits[]` — отложенные удары (`delay` в секундах, `damage`, `effects`); `multiTargetBonus` = +8% за каждую доп. цель; `innerDamage` — урон ближних целей.
   - `dash` (`toAim`, distance, dur, `landing` — эффект в точке приземления), `pulses`, `channel`, `zone` (область с временем жизни, эффект раз на цель), `chain`.
4. Новые статусы/эффекты (в существующих `applyEffects` и `gameTick` уже есть bleed/root/stun/silence/slow/resist/haste/armorBreak/hpDown/air/weak/defense):
   - `stackBleed` (key `axeBleed`, до 3 стаков, на 3 стаках `healBlock`), `moveBleed` (тик только если цель сдвинулась с прошлого тика), `healBlock`, `damageBuff` (множитель урона умений), `attackSpeed`, `shield`, `healOverTime`, `lifesteal`/`lifestealAuto` (лечение долей нанесённого урона), `energy` (+энергия), `knockback`/`pull` (сервер двигает цель, ставит `positionLockUntil` и рассылает `player`), `invuln`, `ccImmune`, `ccResist`, `ccResistDown`, `ccDurationBonus`, `dispelBuffs`, `spellImmune`, `cannotAttack`, `auraStack`.
   - `armorBreak` теперь учитывает `value` (множитель урона `1 + value`; если value не число — прежние 1.25).
5. Пассивки: счётчик `p.autoCount` уже есть. Для каждой пассивки из JSON: `everyNthAutoAttack` и `effect` (на цель) / `selfEffect` (на себя). `deepcuts` уже реализован (`exists: true`).
6. В `weapon` и `loadout` сообщениях принимать оружие любой ветки и проверять Q/W/P по `branch`.

### Клиент (`villagestrategy_albion_prototype (2).html`)
1. `WEAPONS`: добавить 16 записей (name/nameRu, hands, dual, auto, aint, e, look). Внешний вид: топор (клинок-трапеция + длинная рукоять), булава (шар/навершие на рукояти); `buildSword(look)` расширить параметром `type: 'axe'|'mace'`.
2. `SPELLS`: для каждого умения собрать объект из JSON (`name`, `icon`, `en`=cost, `cd`, `target`: enemy/ground/self, `range`, `desc`=descRu). Для манекенов написать общий интерпретатор по `shape/hits/effects` (тот же код, что и на сервере). Анимации: `anim` ∈ slash/chop/stab/spin → `swing(kind, dur)`.
3. `Q_LIST` / `W_LIST` / `PASSIVES` сделать функциями от ветки текущего оружия; при смене оружия перезаполнять `#selQ`, `#selW`, `#selP`, сбрасывать невалидный выбор.
4. Таблицу `motion` в `castSlot` и `localDummyWouldBeHit` расширить новыми id (или брать `anim`/`shape` из данных).
5. Бейджи статусов (`BADGES`, `DOTNAMES`, HUD баффов) дополнить новыми статусами.

### Тесты
- Для каждого умения: кулдаун, энергия, область (попал/не попал по границе радиуса), эффект, смерть цели во время отложенного удара.
- Пассивки: срабатывание ровно на N-й автоатаке.
- Смена оружия ветки не должна позволять использовать умения прошлой ветки (сервер отклоняет).
- Движение: knockback/pull/dash не должны откатываться из-за `state` от клиента (использовать `positionLockUntil`).

## Известные упрощения
Albion-комбо с несколькими нажатиями (Rending Rage, второй бросок Blood Bandit, повтор Relentless Assault/Gravitas) собраны в один каст. Эффекты для союзников (Guard Rune, Blessed Aurora, Defensive Slam) применяются только к самому игроку. Тики каналов/зон (Whirlwind, Gravitas) — по данным spells.xml.
