# Game Systems Roadmap

This roadmap describes the intended direction for the multiplayer sandbox. It is prototype-first: values and balance are tunable, while data contracts and system boundaries should remain extensible.

## Design constraints

- Teams are configurable, with an initial maximum of 7 players per team. Do not hard-code the number throughout unrelated systems.
- Albion Online is a reference for the gathering → refining → crafting → equipment loop, not a requirement to clone every feature.
- Server authority is required for inventory changes, crafting, market transactions, combat resources, death outcomes, and visibility that affects PvP.
- Keep item definitions, recipes, weapon abilities, tiers, and tuning in data/configuration rather than scattering weapon-specific logic across UI code.
- Preserve backward compatibility where practical; feature flags and small vertical slices are preferred.
- Do not rebalance future weapon content while external weapon work is in progress.

## Phased implementation plan

### Phase 0 — Foundations and safety
1. Keep current inventory/crafting/factory work as a prototype; clearly separate temporary in-memory state from persistent state.
2. Add shared data definitions for items, tiers, recipes, stations, weapon families, abilities, and stat modifiers.
3. Define stable IDs and server-validated message contracts for economy/combat/map systems.
4. Add focused automated tests for validation, state transitions, and malformed requests.
5. Keep team size configurable; default cap is 7.

Done when: new item types and weapons can be added through data definitions without rewriting core inventory or combat handlers.

### Phase 1 — Persistent economy and resource gathering
1. Persist player, team, inventory, structures, and resource-node state in durable storage.
2. Make resource nodes server-authoritative: identity, position, remaining charges, gathering time, tool/skill requirements, respawn.
3. Add shared team storage and permissions.
4. Keep gathering and crafting atomic: no double-spending, duplicate rewards, or client-trusted item quantities.

### Phase 2 — Item and crafting foundation
1. Use a general item schema: ID, category, tier, stackability, weight, equipment slot, durability, binding/trade flags, and optional weapon/ability data.
2. Recipes consume lower-tier items plus a blueprint and other materials to create higher-tier equipment.
3. Blueprints are inventory items sold by the travelling merchant; stock can vary per visit by item family and tier.
4. Separate recipe availability from item definitions so many weapon families and tiers can be added safely.
5. Crafted weapons must flow into the same equipment/combat stat pipeline as any other weapon.

### Phase 3 — Travelling merchant and global market
1. A merchant ship arrives on a configurable schedule and opens one shared market for all teams.
2. During one visit, prices are fixed for that visit; purchases and sales accumulate demand/supply statistics.
3. At the next arrival, calculate the next visit's prices from the previous visit's completed transactions and inventory/supply signals. Never reprice midway through a visit.
4. Merchant stock and blueprint availability can vary by visit. Blueprint appearance chances can later depend on time period, tier, weapon family, and prior stock.
5. Make pricing deterministic, bounded, auditable, and configurable; prevent negative prices, overflow, and trivial buy/sell exploits.
6. Persist visit ID, stock snapshot, prices, transactions, and the data used for the next price calculation.

Important: the market is global across teams, not separate per-team shops. The arrival is a pricing boundary.

### Phase 4 — World map, camera, and performance
1. Wait for the user's map sketch before committing to a major map layout.
2. Establish a world-coordinate system and separate logical world data from rendered objects.
3. Keep the camera fixed/controlled if that remains the desired presentation; cull or simplify objects outside the view plus a configurable safety margin.
4. Use distance/visibility-based levels of detail: full simulation/rendering nearby, simplified visuals farther away, and no unnecessary client rendering at great distance.
5. Do not confuse rendering culling with server simulation: authoritative combat, resource, and visibility rules must remain correct even when objects are not rendered.
6. Profile before choosing chunk sizes or view distances; make them tunable.

### Phase 5 — Fog of war and ambush gameplay
1. Server determines which players/objects a team is allowed to see, based on vision radius, blockers/terrain, and relevant reveal rules.
2. Client renders fog/visibility, but cannot decide authoritative enemy visibility.
3. Separate visible-now, explored-before, and never-seen areas if the design benefits from it.
4. Start with a simple radius-based prototype, then add obstacle/terrain occlusion after the map representation is ready.
5. Prevent hidden enemies, names, target selection, and combat events from leaking through network snapshots or UI.
6. Test reconnects, moving across vision boundaries, death/unconsciousness, spectators, and multiple team members spotting the same enemy.

### Phase 6 — Stamina, exhaustion, unconsciousness, and Mute
1. Replace the current mana concept with a configurable stamina/resource model, after auditing all ability costs and UI references.
2. Stamina is consumed by abilities, sprinting/running, and incoming hits. Cost can depend on attack type/weapon weight and attack properties, not damage alone.
3. Model attacker cost and defender stamina drain as separate tunable values; magical-item drain is a separate future rule and should not be guessed yet.
4. When stamina reaches zero, enter an explicit unconscious/exhausted state: movement, attacks, target selection, and abilities are disabled; vision narrows to a small radius.
5. Add a separate Mute status/effect that blocks spell/ability use without necessarily causing unconsciousness.
6. Centralize status checks so every ability and server combat path respects Mute, unconsciousness, stuns, and movement locks.
7. Add recovery rules and clear UI feedback; exact timings and drain amounts remain balance parameters.

### Phase 7 — Death, dropped gear, and breakage
1. Define tier-based equipment and loot policies.
2. On death, calculate item drop and breakage independently using configurable rules and deterministic server-side outcomes.
3. Persist the death result before notifying clients; prevent duplicate loot from reconnects or repeated messages.
4. Add loss previews/logs only when the underlying rules are agreed.

### Phase 8 — Progression and weapon mastery
1. Build a weapon-family/ability definition format that supports many weapon types and many abilities.
2. Progression can modify damage, cooldowns, stamina costs, cast/windup times, and other explicitly supported stats.
3. Use a composable stat-modifier pipeline with caps/order-of-operations documented and tested.
4. Keep progression data separate from the individual weapon's base definition.
5. Integrate new weapon files from the user/Claude only when supplied; do not pre-emptively rewrite them.

## Interface and interaction conventions

- `I` opens/closes a compact inventory window; inventory, crafting, and factories are separate tabs rather than one oversized panel.
- `Esc` closes the current panel.
- `F` is the contextual interaction key. It should act on the nearest valid world object within range and show a clear prompt (for example, a forge, storage, resource node, or travelling merchant).
- Do not pretend a UI-only factory is a world object. Add factory `F` interaction only once a placed building has a world representation and server-validated range/permissions.
- Reuse a consistent visual system for inventory, crafting, storage, merchant, and factory menus; keep mobile layout compact.
- UI visibility and interaction are client conveniences only; server validates every action, range, ownership, and permissions where relevant.

## Proposed implementation order

1. Add this roadmap and establish the configurable team-cap/item/weapon data foundations.
2. Audit the current economy prototype and make the server state persistent.
3. Finish server-authoritative gathering and shared team storage.
4. Generalize item/recipe/equipment data and connect crafted weapons to equipment.
5. Implement merchant visit snapshots and delayed price recalculation.
6. Wait for the map sketch; then plan world coordinates, camera culling, and fog-of-war together.
7. Implement stamina/Mute/unconsciousness after auditing all combat ability paths.
8. Add tiered drops/breakage and broad weapon progression.

## Acceptance and reporting

For each batch: fetch latest main, create a backup branch, make a small coherent change, run available syntax/static tests, commit directly to main, and report the exact commit SHA. Clearly distinguish tests actually run from tests merely added. Do not claim browser PvP, live deployment, or Render verification unless performed.
