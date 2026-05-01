Here is the complete, compiled Game Design Document (GDD) section for the card battle mechanics. It includes the detailed breakdown of all three phases, combined with the core rules, resource management, and card anatomy for a comprehensive overview of the game loop.

---

# Game Design Document: Digimon World - Digital Card Arena
## Section: Core Card Game Mechanics & Battle Loop

### 1. Overview and Objective
The card game is a 1v1 turn-based battler. Players take on the role of a Tamer, utilizing a deck of cards to summon, evolve, and battle Digimon.
* **Win Condition:** The first player to score 3 Points wins the match. A player earns 1 Point each time they reduce an opponent's active Digimon's HP to 0.
* **Loss Condition:** Having 3 of your Digimon defeated, or running out of cards in your deck (Deck Out).

### 2. Deck Construction
* **Deck Size:** Exactly 30 cards.
* **Card Limits:** Maximum of 4 copies of the same card per deck (certain rare/boss cards are limited to 1 per deck).
* **Deck Composition:** Players mix Digimon, Option, and Item cards. A balanced deck requires a stable pyramid of Rookie (Level III), Champion (Level IV), and Ultimate (Level V) Digimon to ensure consistent evolution.

---

### 3. Card Anatomy & Types

#### A. Digimon Cards
The primary battling units on the field. 
* **Level:** Rookie, Champion, Ultimate, or Armor. 
* **Specialty:** Fire, Ice, Nature, Darkness, or Rare. Determines elemental weaknesses and Option card compatibility.
* **HP (Hit Points):** The Digimon's health pool.
* **Attacks:** Every Digimon has three distinct attacks:
    * **Circle (O):** Usually the highest damage, straightforward attack.
    * **Triangle (▲):** Moderate damage, sometimes carries special effects.
    * **Cross (X):** Usually the lowest damage, but frequently features powerful special/defensive mechanics.
* **+DP (Digivolve Power):** The amount of DP yielded when discarded from the hand.
* **Evolution Cost:** The DP required to evolve into this Digimon.
* **Support Effect:** A special ability activated if played face-down from the hand during the Battle Phase.

#### B. Option Cards
Spell-like cards played from the hand to alter the game state.
* **Preparation Phase Options:** Used to heal, draw cards, manipulate DP, or fetch cards from the Trash.
* **Battle Phase Options:** Used during combat to boost stats, change the opponent's attack, or nullify damage.

---

### 4. Resource Management: The DP System
**Digivolve Points (DP)** are the core economy. Unlike other card games, resources do not accumulate automatically each turn.
* **Gaining DP:** During the Preparation Phase, a player can discard cards from their hand to the Trash. Each discarded card adds its "+DP" value to the player's DP gauge.
* **Spending DP:** DP is spent exclusively to Digivolve into higher-level Digimon. 

---

### 5. The Turn Structure: Phase by Phase

Players begin with a Rookie Digimon on the field (played automatically from the hand, or drawn from the deck until one is found). Players alternate taking turns. Each turn consists of three distinct phases.

#### Phase 1: Draw Phase
The Draw Phase focuses purely on hand replenishment and enforces the game's strict time-limit mechanic (Deck Out).
* **Replenish Hand:** The active player draws cards from the top of their deck until they have exactly **6 cards** in their hand.
* **Skip Condition:** If the player already has 6 cards in their hand at the start of the turn, they draw 0 cards.
* **Deck Out (Loss Condition):** If a player is required to draw a card to reach 6 in their hand, but their deck has 0 cards remaining, they instantly lose the match, regardless of the current Point score.

#### Phase 2: Preparation Phase
The Preparation Phase is the tactical setup phase. The active player manages resources, plays items, and evolves their Digimon. Actions can be performed in any order, multiple times, until the player chooses to end the phase.
* **Play Option Cards:** The player may play any Option cards marked specifically for the "Prep" phase from their hand. 
* **Generate DP (Discard):** The player selects any number of cards from their hand and sends them to the Trash. The combined "+DP" values of the discarded cards are permanently added to the player's DP gauge.
* **Digivolve:** If the active Digimon is eligible, the player may play a higher-level Digimon card directly onto it.
    * *Standard Evolution:* Rookie to Champion, or Champion to Ultimate. The player must subtract the exact DP cost listed on the new card from their DP gauge.
    * *Armor Evolution:* A Rookie Digimon merges with a "Digi-Egg" Option card from the hand. This costs 0 DP but usually locks the Digimon from further standard evolution.
    * *Evolution Bonuses:* Upon evolving, the Digimon's HP is fully restored to the new maximum, and all negative status ailments (e.g., Poison) are instantly cured.
* **Pass to Battle:** The player concludes their setup and advances to the Battle Phase.

#### Phase 3: Battle Phase
The combat sequence, relying heavily on simultaneous blind choices, priority rules, and the Rock-Paper-Scissors attack dynamic.

* **Step 1: Support Card Placement**
    * Both players (starting with the active player) have the option to play exactly one card face-down from their hand. This can be a Digimon Card (for its Support Effect) or a Battle Option Card. Players can choose to play *no* card, but a bluffing UI still appears.
* **Step 2: Support Card Reveal & Resolution**
    * Both cards are flipped simultaneously.
    * Cancellation Effects resolve first (e.g., an Option card that destroys the opponent's Support).
    * The Active Player's Support Effect resolves.
    * The Defending Player's Support Effect resolves.
* **Step 3: Attack Command Selection**
    * Both players secretly select their attack button: Circle (O), Triangle (▲), or Cross (X). Players do not see the opponent's choice until both are locked in.
* **Step 4: Attack Priority Check**
    * *Simultaneous (Default):* Both Digimon strike at the exact same time.
    * *First Attack:* If an attack possesses the "First Attack" property, it strikes before the opponent. If a First Attack reduces the opponent to 0 HP, the opponent's attack is completely canceled. If *both* have First Attack, priority cancels out and becomes simultaneous.
* **Step 5: Damage Calculation**
    * Damage is calculated based on base power plus/minus Support modifiers.
    * *Special Cross (X) Effects:* If an X attack is used, special rules apply. For example: 
        * *Counter:* Nullifies a specific incoming attack (e.g., Circle) and reflects it back, but fails if the opponent uses a different attack.
        * *Crash:* Deals damage equal to the user's current HP, but the user's HP drops to 0 immediately after.
        * *Eat-Up HP:* Heals the user for the exact amount of damage dealt.
* **Step 6: KO Resolution & End of Turn**
    * *Survival:* If both Digimon survive, the turn ends. HP damage persists. The defending player becomes the active player and starts their Draw Phase.
    * *Knockout (KO):* If a Digimon hits 0 HP, it is sent to the Trash along with all its evolution cards. The surviving player gains 1 Point. The defeated player must immediately deploy a new Rookie Digimon from their hand (or draw from the deck until they find one).
    * *Double KO:* If both hit 0 HP simultaneously, neither player scores a Point, both Digimon are trashed, and both must deploy new Rookies.