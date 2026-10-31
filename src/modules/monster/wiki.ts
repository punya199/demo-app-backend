import { ADVENTURE_AREAS, FIRST_CLEAR_MULTIPLIER } from './adventure-data'
import {
  BEATS,
  CRITICAL_CHANCE,
  CRITICAL_MULTIPLIER,
  DAMAGE_VARIANCE,
  DEFENSE_FACTOR,
  MAX_ROUNDS,
  SKILL_EVERY_ROUNDS,
  STRONG_MULTIPLIER,
  WEAK_MULTIPLIER,
} from './battle-engine'
import {
  ATK_BONUS_PER_STRENGTH_HEART,
  HUNGRY_ATK_MULTIPLIER,
  OVERWEIGHT_RATIO,
  OVERWEIGHT_SPD_MULTIPLIER,
} from './battle-stats'
import * as rules from './monster-rules'
import {
  BOX_GRADE_RATES,
  DISMANTLE_STONES,
  DROP_GRADE_RATES_BY_AREA,
  ENHANCE_BONUS_PER_LEVEL,
  ENHANCE_MILESTONE_BONUS,
  ENHANCE_MILESTONE_EVERY,
  GRADE_MULTIPLIER,
  MATERIALS,
  SET_DEFINITIONS,
  SLOT_MAIN_STAT,
  SUB_STAT_COUNT,
} from './equipment-data'
import { ENHANCE_STEPS, MAX_ENHANCE_LEVEL, PITY_MAX, PITY_PER_FAIL } from './enhance-engine'
import {
  RAID_BOSSES,
  RAID_DIFFICULTIES,
  RAID_EXCHANGE_COST,
  RAID_FIRST_CLEAR_MULTIPLIER,
} from './raid-data'
import { K_ATTACKER, K_DEFENDER, MIN_RATING, START_RATING } from './elo'
import { PVP_NPCS, PVP_SEASON_REWARDS, PVP_STAGES } from './pvp-data'
import { calcAutoBattleReward, getExpeditionBaseRate } from './idle-data'
import { DAILY_QUESTS } from './quest-data'
import { SHOP_ITEMS } from './shop-data'
import { SPECIES } from './species-data'

// Everything the in-game guide explains, read straight from the rule constants and game data so
// the guide can never drift from how the game actually behaves.
export const buildWiki = () => ({
  care: {
    maxHearts: rules.MAX_HEARTS,
    maxPoops: rules.MAX_POOPS,
    hatchFullness: rules.HATCH_FULLNESS,
    hatchStrength: rules.HATCH_STRENGTH,
    stageRates: rules.STAGE_RATES,
    neglectFirstMistakeMinutes: rules.NEGLECT_FIRST_MISTAKE_MINUTES,
    neglectRepeatMistakeMinutes: rules.NEGLECT_REPEAT_MISTAKE_MINUTES,
    sickAfterHungryMinutes: rules.SICK_AFTER_HUNGRY_MINUTES,
    deathAfterSickMinutes: rules.DEATH_AFTER_SICK_MINUTES,
    deathAfterHungryMinutes: rules.DEATH_AFTER_HUNGRY_MINUTES,
    lifespanMinutes: rules.LIFESPAN_MINUTES,
    feedWeightGain: rules.FEED_WEIGHT_GAIN,
    vitaminWeightGain: rules.VITAMIN_WEIGHT_GAIN,
    trainWeightLoss: rules.TRAIN_WEIGHT_LOSS,
    trainCooldownMinutes: rules.TRAIN_COOLDOWN_MS / 60_000,
  },
  online: {
    graceMinutes: rules.ONLINE_GRACE_MINUTES,
    evolutionMultiplier: rules.ONLINE_EVOLUTION_MULTIPLIER,
  },
  stamina: {
    max: rules.MAX_STAMINA,
    recoveryPerMinute: rules.STAMINA_RECOVERY_PER_MINUTE,
    recoveryOnlineMultiplier: rules.STAMINA_RECOVERY_ONLINE_MULTIPLIER,
    battleCost: rules.BATTLE_STAMINA_COST,
    noStaminaStatMultiplier: rules.NO_STAMINA_STAT_MULTIPLIER,
    minigameRounds: rules.MINIGAME_ROUNDS,
    minigameRewards: rules.MINIGAME_STAMINA_REWARDS,
    minigameCooldownMinutes: rules.MINIGAME_COOLDOWN_MS / 60_000,
    refillGemPrice: rules.STAMINA_REFILL_GEM_PRICE,
  },
  evolution: {
    stageDurationMinutes: rules.STAGE_DURATION_MINUTES,
    species: SPECIES,
  },
  battle: {
    atkBonusPerStrengthHeart: ATK_BONUS_PER_STRENGTH_HEART,
    hungryAtkMultiplier: HUNGRY_ATK_MULTIPLIER,
    overweightRatio: OVERWEIGHT_RATIO,
    overweightSpdMultiplier: OVERWEIGHT_SPD_MULTIPLIER,
    maxRounds: MAX_ROUNDS,
    skillEveryRounds: SKILL_EVERY_ROUNDS,
    criticalChance: CRITICAL_CHANCE,
    criticalMultiplier: CRITICAL_MULTIPLIER,
    strongMultiplier: STRONG_MULTIPLIER,
    weakMultiplier: WEAK_MULTIPLIER,
    defenseFactor: DEFENSE_FACTOR,
    damageVariance: DAMAGE_VARIANCE,
    weightLoss: rules.BATTLE_WEIGHT_LOSS,
    beats: BEATS,
  },
  adventure: {
    firstClearMultiplier: FIRST_CLEAR_MULTIPLIER,
    areas: ADVENTURE_AREAS,
  },
  idle: {
    expeditionMaxMinutes: rules.EXPEDITION_MAX_MINUTES,
    expeditionDrainMultiplier: rules.EXPEDITION_DRAIN_MULTIPLIER,
    expeditionDropEveryMinutes: rules.EXPEDITION_DROP_EVERY_MINUTES,
    expeditionPowerMultiplierMin: rules.EXPEDITION_POWER_MULTIPLIER_MIN,
    expeditionPowerMultiplierMax: rules.EXPEDITION_POWER_MULTIPLIER_MAX,
    expeditionAreas: ADVENTURE_AREAS.filter(area => getExpeditionBaseRate(area.id)).map(area => ({
      id: area.id,
      name: area.name,
      emoji: area.emoji,
      baseRatePerHour: getExpeditionBaseRate(area.id),
      autoBattleRewards: area.stages
        .filter(stage => !stage.isBoss)
        .map(stage => ({ name: stage.enemy.name, coins: calcAutoBattleReward(stage) })),
    })),
    autoBattleCooldownSeconds: rules.AUTO_BATTLE_COOLDOWN_MS / 1000,
    autoBattleStaminaCost: rules.AUTO_BATTLE_STAMINA_COST,
    autoBattleDailyCoinCap: rules.AUTO_BATTLE_DAILY_COIN_CAP,
  },
  equipment: {
    capacity: rules.EQUIPMENT_CAPACITY,
    slots: SLOT_MAIN_STAT,
    gradeMultiplier: GRADE_MULTIPLIER,
    subStatCount: SUB_STAT_COUNT,
    boxPrice: rules.EQUIPMENT_BOX_PRICE,
    boxGradeRates: BOX_GRADE_RATES,
    dropChancePercent: rules.EQUIPMENT_DROP_CHANCE_BP / 100,
    dropGradeRatesByArea: DROP_GRADE_RATES_BY_AREA,
    dismantleStones: DISMANTLE_STONES,
    materials: MATERIALS,
    expeditionStoneEveryMinutes: rules.EXPEDITION_STONE_EVERY_MINUTES,
    sets: SET_DEFINITIONS,
    enhance: {
      maxLevel: MAX_ENHANCE_LEVEL,
      bonusPerLevel: ENHANCE_BONUS_PER_LEVEL,
      milestoneBonus: ENHANCE_MILESTONE_BONUS,
      milestoneEvery: ENHANCE_MILESTONE_EVERY,
      pityPerFail: PITY_PER_FAIL,
      pityMax: PITY_MAX,
      steps: ENHANCE_STEPS,
    },
  },
  pvp: {
    stages: PVP_STAGES,
    startRating: START_RATING,
    minRating: MIN_RATING,
    kAttacker: K_ATTACKER,
    kDefender: K_DEFENDER,
    dailyAttempts: rules.PVP_DAILY_ATTEMPTS,
    winCoin: rules.PVP_WIN_COIN,
    lossCoin: rules.PVP_LOSS_COIN,
    defenseCooldownMinutes: rules.PVP_DEFENSE_COOLDOWN_MS / 60_000,
    opponentCount: rules.PVP_OPPONENT_COUNT,
    maxFightsPerOpponentPerDay: rules.PVP_MAX_FIGHTS_PER_OPPONENT_PER_DAY,
    ratingWindow: rules.PVP_RATING_WINDOW,
    seasonMinFights: rules.PVP_SEASON_MIN_FIGHTS,
    seasonResetKeep: rules.PVP_SEASON_RESET_KEEP,
    seasonRewards: PVP_SEASON_REWARDS,
    npcs: PVP_NPCS.map(npc => ({
      stage: npc.stage,
      name: npc.fighter.name,
      emoji: npc.fighter.emoji,
      rating: npc.rating,
    })),
  },
  raid: {
    dailyAttempts: rules.RAID_DAILY_ATTEMPTS,
    bossTokensPerWin: rules.RAID_BOSS_TOKENS_PER_WIN,
    firstClearMultiplier: RAID_FIRST_CLEAR_MULTIPLIER,
    exchangeCost: RAID_EXCHANGE_COST,
    bosses: RAID_BOSSES,
    difficulties: RAID_DIFFICULTIES,
    setEnhanceThreshold: rules.SET_ENHANCE_THRESHOLD,
    setEnhanceMultiplier: rules.SET_ENHANCE_MULTIPLIER,
  },
  economy: {
    shopItems: SHOP_ITEMS,
    dailyQuests: DAILY_QUESTS,
    dexDiscoveryGems: rules.DEX_DISCOVERY_GEM_REWARD,
  },
})
