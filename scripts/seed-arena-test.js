// Local test data for the arena/skills screens. Run with the backend up (yarn start:dev):
//   node scripts/seed-arena-test.js [baseUrl]
// Creates (or reuses) user arenatest / arena1234 with four pets (Ultimate with epic +10 gear,
// Perfect, Adult, Baby 2), a wide Dex (skill unlocks), every adventure stage but the last boss
// cleared, and 5000 coins / 100 gems. Refuses any database that is not on this machine.
require('dotenv').config()
const { Client } = require('pg')

const API = (process.argv[2] || `http://localhost:${process.env.PORT || 3000}`) + '/api/v1'
const USER = { username: 'arenatest', password: 'arena1234' }
const LOCAL = ['localhost', '127.0.0.1', '::1']

const call = async (path, body, cookie) => {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

const main = async () => {
  if (!LOCAL.includes(process.env.DATABASE_HOST)) {
    throw new Error(`Refusing to seed a non-local database (${process.env.DATABASE_HOST})`)
  }
  await call('/users/register', USER) // already registered is fine
  const login = await call('/auth/login', USER)
  if (!login.res.ok) throw new Error(`Login failed: ${JSON.stringify(login.data)}`)
  const cookie = login.res.headers
    .getSetCookie()
    .map(c => c.split(';')[0])
    .join('; ')
  const userId = login.data.user.id

  const db = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  })
  await db.connect()
  const { rows } = await db.query(
    'SELECT line FROM monsters WHERE owner_id = $1 AND died_at IS NULL AND deleted_at IS NULL',
    [userId]
  )
  for (const line of ['flame', 'tide', 'leaf', 'earth']) {
    if (!rows.some(r => r.line === line)) {
      const { res, data } = await call('/monster/hatch', { line }, cookie)
      if (!res.ok) console.warn(`hatch ${line}: ${data.message}`)
    }
  }
  const forms = [
    ['flame', 'flame_ultimate', 'ultimate', 40],
    ['tide', 'tide_perfectAlt', 'perfect', 30],
    ['leaf', 'leaf_adultGood', 'adult', 20],
    ['earth', 'earth_baby2', 'baby_2', 10],
  ]
  for (const [line, species, stage, weight] of forms) {
    await db.query(
      `UPDATE monsters SET species_id = $3, stage = $4, weight = $5, fullness = 4, strength = 4,
         stamina = 100, poops = 0, is_sick = false, stage_minutes = 0, last_tick_at = now(),
         last_seen_at = now(), selected_at = CASE WHEN $6 THEN now() ELSE selected_at END
       WHERE owner_id = $1 AND line = $2 AND died_at IS NULL AND deleted_at IS NULL`,
      [userId, line, species, stage, weight, line === 'flame']
    )
  }
  const allForms = ['baby1', 'baby2', 'adultGood', 'adultPoor', 'adultAlt', 'perfectGood', 'perfectPoor', 'perfectAlt', 'ultimate', 'ultimateAlt']
  const dex = [
    ...['flame', 'tide', 'leaf', 'earth'].flatMap(l => allForms.map(f => `${l}_${f}`)),
    ...['lightning', 'holy', 'dark', 'shadow'].flatMap(l => [`${l}_baby1`, `${l}_baby2`]),
  ]
  for (const species of dex) {
    await db.query(
      `INSERT INTO monster_dex (user_id, species_id, first_seen_at) SELECT $1::uuid, $2::varchar, now()
       WHERE NOT EXISTS (SELECT 1 FROM monster_dex WHERE user_id = $1 AND species_id = $2::varchar AND deleted_at IS NULL)`,
      [userId, species]
    )
  }
  const stages = ['meadow', 'coast', 'volcano', 'cavern', 'storm']
    .flatMap(a => [`${a}_1`, `${a}_2`, `${a}_3`, `${a}_boss`])
    .filter(id => id !== 'storm_boss')
  for (const stageId of stages) {
    await db.query(
      `INSERT INTO adventure_progress (user_id, stage_id, clear_count, first_cleared_at) SELECT $1::uuid, $2::varchar, 1, now()
       WHERE NOT EXISTS (SELECT 1 FROM adventure_progress WHERE user_id = $1 AND stage_id = $2::varchar AND deleted_at IS NULL)`,
      [userId, stageId]
    )
  }
  await db.query('UPDATE wallets SET coin = 5000, gem = 100 WHERE user_id = $1', [userId])
  await db.query(
    `INSERT INTO wallets (user_id, coin, gem) SELECT $1::uuid, 5000, 100
     WHERE NOT EXISTS (SELECT 1 FROM wallets WHERE user_id = $1)`,
    [userId]
  )
  const { rows: gear } = await db.query('SELECT 1 FROM equipment_items WHERE user_id = $1 LIMIT 1', [userId])
  if (!gear.length) {
    await db.query(
      `INSERT INTO equipment_items (user_id, template_id, slot, grade, main_value, sub_stats, enhance_level, equipped, monster_id)
       SELECT $1, t, s, 'epic', v, sub::jsonb, 10, true,
         (SELECT id FROM monsters WHERE owner_id = $1 AND line = 'flame' AND died_at IS NULL AND deleted_at IS NULL LIMIT 1)
       FROM (VALUES ('iron_axe','weapon',9,'{"atk":3,"hp":10}'), ('iron_armor','armor',7,'{"def":2,"hp":10}'),
                    ('iron_helm','helmet',33,'{"hp":10,"spd":2}'), ('stone_necklace','accessory',4,'{"atk":3,"def":3}')) AS g(t,s,v,sub)`,
      [userId]
    )
  }
  await db.end()
  console.log(`Seeded ${USER.username} / ${USER.password} (${userId})`)
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
