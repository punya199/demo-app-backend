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
    drainFullMinutesOffline: rules.STAMINA_DRAIN_FULL_MINUTES_OFFLINE,
    drainFullMinutesOnline: rules.STAMINA_DRAIN_FULL_MINUTES_ONLINE,
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
  economy: {
    shopItems: SHOP_ITEMS,
    dailyQuests: DAILY_QUESTS,
    dexDiscoveryGems: rules.DEX_DISCOVERY_GEM_REWARD,
  },
})
