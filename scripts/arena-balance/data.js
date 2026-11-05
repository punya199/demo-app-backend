// Monster Arena data: elements, statuses, roster (stats from the game's species formula) and the
// full skill catalog. Every number a designer would tune lives here; engine.js only reads it.
// Times are in seconds here and converted to ticks (20/s) by the engine.

const ARENA_DATA = (() => {
  'use strict'

  // ----- Elements (the game's ring + spiritual triangle), x1.1 strong / x0.9 weak -----
  const ELEMENTS = {
    flame: { label: 'เพลิง', icon: '🔥', color: '#ff8a4c' },
    tide: { label: 'วารี', icon: '💧', color: '#4cb8ff' },
    leaf: { label: 'พฤกษ์', icon: '🌿', color: '#6fe08a' },
    earth: { label: 'ศิลา', icon: '🪨', color: '#c9a36a' },
    lightning: { label: 'อสนี', icon: '⚡', color: '#ffe14a' },
    holy: { label: 'รัศมี', icon: '✨', color: '#fff2b0' },
    dark: { label: 'รัตติกาล', icon: '🌑', color: '#b07cff' },
    shadow: { label: 'เงา', icon: '🌫️', color: '#8fa3c7' },
    neutral: { label: 'กลาง', icon: '⚪', color: '#c8c8d8' },
  }
  const BEATS = {
    flame: ['leaf', 'earth'],
    leaf: ['tide', 'lightning'],
    tide: ['flame', 'earth'],
    earth: ['leaf', 'lightning'],
    lightning: ['tide', 'flame'],
    holy: ['dark'],
    dark: ['shadow'],
    shadow: ['holy'],
  }
  const STRONG = 110
  const WEAK = 90

  // ----- Statuses -----
  // kind: debuff / buff. cc: hard crowd control (shares diminishing returns). Numbers are fixed per
  // status so a skill's strength comes from its chance and duration, which keeps balance readable.
  const STATUS = {
    burn: { label: 'เผาไหม้', icon: '🔥', kind: 'debuff', note: 'เสีย HP ทุกวินาทีตาม ATK ผู้ร่าย ไม่สนเกราะ' },
    poison: { label: 'พิษ', icon: '☠️', kind: 'debuff', note: 'ซ้อนได้ 3 ชั้น ชั้นละน้อยกว่าเผาไหม้ อยู่นานกว่า' },
    slow: { label: 'สโลว์', icon: '🐌', kind: 'debuff', note: 'เดินช้าลง 40% ตีช้าลง 25%' },
    root: { label: 'ตรึง', icon: '🌱', kind: 'debuff', cc: true, note: 'เดินไม่ได้ แต่ยังตีและใช้สกิลได้' },
    stun: { label: 'สตัน', icon: '💫', kind: 'debuff', cc: true, note: 'ทำอะไรไม่ได้เลย' },
    silence: { label: 'ใบ้', icon: '🤐', kind: 'debuff', cc: true, note: 'ใช้สกิลไม่ได้ ตีธรรมดาและหลบได้' },
    blind: { label: 'ตาบอด', icon: '🌫️', kind: 'debuff', note: 'การโจมตีพลาด 35%' },
    static: { label: 'ไฟฟ้าสถิต', icon: '⚡', kind: 'debuff', note: 'ทุกครั้งที่จะลงมือ มีโอกาส 30% ชะงัก 0.4 วินาที' },
    atkDown: { label: 'ATK ลด', icon: '🗡️', kind: 'debuff', note: 'ATK -20%' },
    defDown: { label: 'DEF ลด', icon: '🩻', kind: 'debuff', note: 'DEF -35%' },
    evaDown: { label: 'เปิดช่อง', icon: '🎯', kind: 'debuff', note: 'ค่าหลบ -20' },
    curse: { label: 'คำสาป', icon: '🩸', kind: 'debuff', note: 'ได้รับการฮีลและโล่ลดลงครึ่งหนึ่ง' },
    atkUp: { label: 'ATK เพิ่ม', icon: '💪', kind: 'buff', note: 'ATK +25%' },
    defUp: { label: 'DEF เพิ่ม', icon: '🛡️', kind: 'buff', note: 'DEF +35%' },
    haste: { label: 'เร่งความเร็ว', icon: '💨', kind: 'buff', note: 'เดินเร็วขึ้น 30% ตีเร็วขึ้น 20%' },
    regen: { label: 'ฟื้นฟู', icon: '💚', kind: 'buff', note: 'ฟื้น HP ทุกวินาที' },
    evaUp: { label: 'พริ้วไหว', icon: '👻', kind: 'buff', note: 'ค่าหลบ +20' },
    focus: { label: 'จดจ่อ', icon: '👁️', kind: 'buff', note: 'โอกาสคริติคอล +40%' },
    immune: { label: 'คุ้มกัน', icon: '🌟', kind: 'buff', note: 'ไม่ติด สตัน/ตรึง/ใบ้' },
  }
  const STATUS_NUMBERS = {
    burnAtkPctPerSec: 22, // % of the burner's ATK per second
    poisonAtkPctPerSec: 9, // per stack
    poisonMaxStacks: 3,
    slowMove: 40,
    slowAttack: 25,
    blindMiss: 35,
    staticChance: 30,
    staticStunSec: 0.4,
    atkDown: 20,
    defDown: 35,
    evaDown: 20,
    curse: 50,
    atkUp: 25,
    defUp: 35,
    hasteMove: 30,
    hasteAttack: 20,
    evaUp: 20,
    focusCrit: 40,
    // Hard CC (stun/root/silence) within this window of the last one is cut: 100% -> 50% -> immune.
    ccWindowSec: 6,
    ccSteps: [100, 50, 0],
  }

  // ----- Roster: the game's species formula (stage base x line lean x alt lean x quality) -----
  const STAGE_BASE = {
    adult: { hp: 70, atk: 14, def: 9, spd: 11 },
    perfect: { hp: 105, atk: 21, def: 14, spd: 15 },
    ultimate: { hp: 150, atk: 30, def: 20, spd: 20 },
  }
  const LINE_BIAS = {
    flame: { hp: 1, atk: 1.15, def: 1, spd: 1 },
    tide: { hp: 1.15, atk: 1, def: 1.1, spd: 1 },
    leaf: { hp: 1.05, atk: 1, def: 1, spd: 1.15 },
    earth: { hp: 1.128, atk: 1.025, def: 1.179, spd: 0.974 },
    lightning: { hp: 0.977, atk: 1.075, def: 0.928, spd: 1.124 },
    holy: { hp: 1.13, atk: 0.976, def: 1.13, spd: 1.027 },
    dark: { hp: 0.939, atk: 1.186, def: 0.988, spd: 0.988 },
    shadow: { hp: 0.923, atk: 1.077, def: 0.975, spd: 1.231 },
  }
  const ALT_BIAS = {
    flame: { hp: 1, atk: 1, def: 1, spd: 1.2 },
    tide: { hp: 0.95, atk: 1.2, def: 1, spd: 1 },
    leaf: { hp: 1.1, atk: 1, def: 1.2, spd: 0.95 },
    earth: { hp: 0.95, atk: 1.2, def: 1, spd: 1 },
    lightning: { hp: 1.1, atk: 1, def: 1.2, spd: 0.95 },
    holy: { hp: 0.95, atk: 1.2, def: 1, spd: 1 },
    dark: { hp: 1, atk: 1, def: 1, spd: 1.2 },
    shadow: { hp: 0.95, atk: 1.2, def: 1, spd: 1 },
  }
  const QUALITY = { good: 1.1, poor: 0.95 }
  // Evasion is its own stat (not SPD): it feeds the dodge chance.
  const LINE_EVA = { flame: 5, tide: 4, leaf: 8, earth: 2, lightning: 9, holy: 5, dark: 6, shadow: 12 }
  // Accuracy (cuts the target's dodge chance point for point) and resistance (% cut to debuff
  // chance and duration). Arena-only stats, one value per line.
  const LINE_ACC = { flame: 8, tide: 6, leaf: 6, earth: 4, lightning: 12, holy: 10, dark: 8, shadow: 7 }
  const LINE_RES = { flame: 8, tide: 14, leaf: 10, earth: 20, lightning: 6, holy: 18, dark: 12, shadow: 6 }

  const FORMS = [
    ['adultGood', 'adult', 'good'],
    ['adultPoor', 'adult', 'poor'],
    ['adultAlt', 'adult', 'good'],
    ['perfectGood', 'perfect', 'good'],
    ['perfectPoor', 'perfect', 'poor'],
    ['perfectAlt', 'perfect', 'good'],
    ['ultimate', 'ultimate', 'good'],
    ['ultimateAlt', 'ultimate', 'good'],
  ]
  // [name, emoji] per line and form, from species-data.ts; baby forms only unlock neutral/dodge skills.
  const NAMES = {
    flame: { baby1: ['ประกายจิ๋ว', '✨'], baby2: ['ถ่านน้อย', '🔥'], adultGood: ['เพลิงจอมซน', '🦎'], adultPoor: ['ควันกรุ่น', '💨'], adultAlt: ['เพลิงนักรบ', '🦖'], perfectGood: ['อัคนีพยัคฆ์', '🐯'], perfectPoor: ['ลาวาอ้วน', '🌋'], perfectAlt: ['มังกรเพลิงรบ', '🐲'], ultimate: ['ราชาสุริยะ', '☀️'], ultimateAlt: ['ฟีนิกซ์อมตะ', '🦅'] },
    tide: { baby1: ['หยดน้ำ', '💧'], baby2: ['ฟองจิ๋ว', '🫧'], adultGood: ['ปลาดาบน้อย', '🐟'], adultPoor: ['แมงกะพรุนขี้เซา', '🪼'], adultAlt: ['ฉลามหนาม', '🦈'], perfectGood: ['วาฬเกราะ', '🐋'], perfectPoor: ['หมึกขี้เกียจ', '🐙'], perfectAlt: ['มังกรทะเลลึก', '🐉'], ultimate: ['เจ้าสมุทร', '🔱'], ultimateAlt: ['เทพีสายน้ำ', '🧜'] },
    leaf: { baby1: ['เมล็ดจิ๋ว', '🌰'], baby2: ['ต้นอ่อน', '🌱'], adultGood: ['กวางใบไม้', '🦌'], adultPoor: ['เห็ดง่วง', '🍄'], adultAlt: ['หมาป่าไพร', '🐺'], perfectGood: ['พยัคฆ์ไพร', '🐅'], perfectPoor: ['ตอไม้แก่', '🪵'], perfectAlt: ['ช้างพฤกษา', '🐘'], ultimate: ['เทพพนาลัย', '🌳'], ultimateAlt: ['เอนท์พิทักษ์', '🌲'] },
    earth: { baby1: ['ก้อนกรวด', '🪨'], baby2: ['ก้อนดินเหนียว', '🧱'], adultGood: ['เต่าศิลา', '🐢'], adultPoor: ['หนอนดินเกียจคร้าน', '🪱'], adultAlt: ['แรดผา', '🦏'], perfectGood: ['หมีหินผา', '🐻'], perfectPoor: ['ก้อนหินขี้เกียจ', '🗿'], perfectAlt: ['เม่นแร่เหล็ก', '🦔'], ultimate: ['เจ้าธรณี', '🏔️'], ultimateAlt: ['ไททันคริสตัล', '💠'] },
    lightning: { baby1: ['ประกายไฟฟ้า', '⚡'], baby2: ['ลูกเมฆฟ้า', '☁️'], adultGood: ['นกฟ้าผ่า', '🐦'], adultPoor: ['แมวไฟสถิต', '🐱'], adultAlt: ['เสือพายุ', '🐆'], perfectGood: ['ม้าอสนี', '🦄'], perfectPoor: ['เมฆหม่นขี้เกียจ', '🌥️'], perfectAlt: ['จิ้งจอกอสนี', '🦊'], ultimate: ['ราชาอสนี', '🌪️'], ultimateAlt: ['วัชรเทพ', '🌀'] },
    holy: { baby1: ['ประกายแสง', '🌟'], baby2: ['ลูกแกะแสง', '🐑'], adultGood: ['นกพิราบทิพย์', '🕊️'], adultPoor: ['ทูตน้อยขี้เซา', '👼'], adultAlt: ['อัศวินรัศมี', '🛡️'], perfectGood: ['เทพธิดารัศมี', '👸'], perfectPoor: ['ระฆังแตก', '🔔'], perfectAlt: ['เซราฟปีกขาว', '😇'], ultimate: ['เจ้าแห่งแสงสว่าง', '🌞'], ultimateAlt: ['มหาเทวทูต', '👑'] },
    dark: { baby1: ['ละอองมืด', '🌑'], baby2: ['ลูกค้างคาว', '🦇'], adultGood: ['แมงมุมคำสาป', '🕷️'], adultPoor: ['หนูท่อมืด', '🐀'], adultAlt: ['อสูรเขี้ยวโลหิต', '🧛'], perfectGood: ['ปีศาจนัยน์ตาแดง', '👹'], perfectPoor: ['ซอมบี้ขี้เกียจ', '🧟'], perfectAlt: ['ราชันย์ปีศาจ', '😈'], ultimate: ['จักรพรรดิรัตติกาล', '🌚'], ultimateAlt: ['เจ้าแห่งคำสาป', '💀'] },
    shadow: { baby1: ['เงาจิ๋ว', '🌫️'], baby2: ['แมวเงา', '🐈'], adultGood: ['นินจาเงา', '🥷'], adultPoor: ['ผีเงาขี้อาย', '👻'], adultAlt: ['ผู้ล่าไร้เสียง', '🏹'], perfectGood: ['พญางูเงา', '🐍'], perfectPoor: ['ม่านหมอกขี้เกียจ', '🌁'], perfectAlt: ['แมงป่องอาถรรพ์', '🦂'], ultimate: ['เจ้าแห่งเงา', '🎭'], ultimateAlt: ['ราชันย์ไร้ตัวตน', '🌌'] },
  }

  // ----- Skills -----
  // kind (how it lands):
  //   melee: wind-up then a strike in reach        quick to read, needs to be close
  //   shot: one projectile                          safe range, dodgeable
  //   spread: fan of `hits` projectiles             each hits the first foe it meets (AOE in packs)
  //   multi: `hits` fast strikes in reach           each hit rolls on-hit effects
  //   charge: dash into the foe                     gap closer, hits on contact
  //   burst: blast around the caster (`radius`)     hits every foe in range (AOE)
  //   zone: marked circle on the foe, lands later   hits every foe still inside (AOE, can be walked out of)
  //   beam: instant line toward the foe             hits every foe on the line (AOE)
  //   self: buffs/heals/shields itself
  // power: % of ATK per hit. fx: statuses on hit (ch = chance %) or on self (to: 'self').
  // Tags are derived from these numbers for the cards (see engine.describeSkill).
  const S = (id, name, icon, el, src, kind, cd, opts = {}) => ({
    id, name, icon, el, src, slot: 'active', kind, cd, wind: 8, power: 0, hits: 1, ...opts,
  })
  const P = (id, name, icon, el, src, passive, note) => ({ id, name, icon, el, src, slot: 'passive', kind: 'passive', cd: 0, passive, note })
  const D = (id, name, icon, src, dodge, note) => ({ id, name, icon, el: 'neutral', src, slot: 'dodge', kind: 'dodge', cd: dodge.cd, dodge, note })
  const fx = (st, dur, ch = 100, extra = {}) => ({ st, dur, ch, ...extra })
  const self = (st, dur, extra = {}) => ({ st, dur, ch: 100, to: 'self', ...extra })

  const SKILLS = [
    // 🔥 Flame: burn, melting DEF, rage. Hits hard, nothing to heal with.
    S('flame_tail', 'หางเพลิง', '🔥', 'flame', 'flame_adultGood', 'melee', 6, { power: 150, range: 62, fx: [fx('burn', 3)] }),
    S('flame_smoke', 'ควันพิษ', '💨', 'flame', 'flame_adultPoor', 'burst', 10, { power: 80, radius: 100, wind: 12, fx: [fx('blind', 3), fx('burn', 2, 60)] }),
    S('flame_slash', 'ฟันเพลิง', '🗡️', 'flame', 'flame_adultAlt', 'melee', 3, { power: 115, range: 58, wind: 5 }),
    S('flame_claw', 'กรงเล็บอัคคี', '🐾', 'flame', 'flame_perfectGood', 'multi', 6, { power: 62, hits: 3, range: 60, wind: 6, fx: [fx('burn', 3, 35)] }),
    S('flame_lava', 'ลาวาทับ', '🌋', 'flame', 'flame_perfectPoor', 'zone', 10, { power: 210, radius: 80, wind: 10, delay: 16, fx: [fx('defDown', 4)] }),
    S('flame_breath', 'ลมหายใจมังกร', '🐲', 'flame', 'flame_perfectAlt', 'beam', 8, { power: 150, width: 34, length: 300, wind: 12, fx: [fx('burn', 3)] }),
    S('flame_sun', 'สุริยะแผดเผา', '☀️', 'flame', 'flame_ultimate', 'burst', 14, { power: 250, radius: 125, wind: 20, fx: [fx('burn', 4)] }),
    P('flame_phoenix', 'ปีกอัคนี', '🦅', 'flame', 'flame_ultimateAlt', { rebirthPct: 30 }, 'ครั้งแรกที่ HP จะหมด ฟื้นคืนด้วย HP 30% (ครั้งเดียวต่อการต่อสู้)'),

    // 💧 Tide: chill (slow), mist (blind), healing, shields, cleansing.
    S('tide_sword', 'ดาบน้ำ', '🗡️', 'tide', 'tide_adultGood', 'charge', 6, { power: 165, wind: 6 }),
    P('tide_jelly', 'หนวดช็อต', '🪼', 'tide', 'tide_adultPoor', { meleeRetort: { power: 45, st: 'slow', dur: 2, ch: 35 } }, 'โดนตีระยะประชิด สวนกลับ 45% ของ ATK และมีโอกาส 35% ทำให้ผู้ตีสโลว์ 2 วินาที'),
    S('tide_fang', 'เขี้ยวคลื่น', '🦈', 'tide', 'tide_adultAlt', 'melee', 9, { power: 230, range: 64, wind: 10, execute: 80 }),
    S('tide_armor', 'คลื่นเกราะ', '🐋', 'tide', 'tide_perfectGood', 'self', 15, { wind: 6, shield: 22, shieldSec: 5, fx: [self('defUp', 5)] }),
    S('tide_ink', 'หมึกพ่น', '🐙', 'tide', 'tide_perfectPoor', 'shot', 8, { power: 100, wind: 8, fx: [fx('blind', 3.5)] }),
    S('tide_whirl', 'น้ำวนมังกร', '🌀', 'tide', 'tide_perfectAlt', 'zone', 10, { power: 170, radius: 90, wind: 10, delay: 14, fx: [fx('slow', 3)] }),
    S('tide_trident', 'ตรีศูลสมุทร', '🔱', 'tide', 'tide_ultimate', 'spread', 6, { power: 85, hits: 3, wind: 10, fx: [fx('slow', 1.5, 50)] }),
    S('tide_eternal', 'สายน้ำนิรันดร์', '🧜', 'tide', 'tide_ultimateAlt', 'self', 16, { wind: 10, heal: 18, cleanse: true, fx: [self('regen', 4, { val: 2 })] }),

    // 🌿 Leaf: poison, roots, spores, regrowth, draining.
    S('leaf_antler', 'เขาพฤกษา', '🦌', 'leaf', 'leaf_adultGood', 'charge', 8, { power: 150, wind: 6, fx: [fx('root', 1.2)] }),
    S('leaf_spore', 'สปอร์หลับ', '🍄', 'leaf', 'leaf_adultPoor', 'burst', 11, { power: 60, radius: 100, wind: 14, fx: [fx('silence', 2.5), fx('poison', 5)] }),
    S('leaf_fang', 'เขี้ยวไพร', '🐺', 'leaf', 'leaf_adultAlt', 'melee', 3.5, { power: 100, range: 58, wind: 5, fx: [fx('poison', 5)] }),
    S('leaf_claw', 'กรงเล็บไพร', '🐅', 'leaf', 'leaf_perfectGood', 'multi', 6, { power: 65, hits: 3, range: 60, wind: 6, lifesteal: 30 }),
    S('leaf_root', 'รากฟาด', '🪵', 'leaf', 'leaf_perfectPoor', 'zone', 11, { power: 120, radius: 85, wind: 10, delay: 12, fx: [fx('root', 2)] }),
    S('leaf_trunk', 'งวงพฤกษา', '🐘', 'leaf', 'leaf_perfectAlt', 'melee', 9, { power: 250, range: 66, wind: 12 }),
    S('leaf_wrath', 'พนาพิโรธ', '🍃', 'leaf', 'leaf_ultimate', 'spread', 7, { power: 55, hits: 5, wind: 10, fx: [fx('poison', 5, 40)] }),
    P('leaf_ent', 'พิทักษ์พนา', '🌲', 'leaf', 'leaf_ultimateAlt', { regenPct: 1.2, damageCut: 8 }, 'ฟื้น HP 1.2% ทุกวินาที และรับดาเมจน้อยลง 8%'),

    // 🪨 Earth: stuns, guarding, shields, toughness. Slow and steady.
    S('earth_shell', 'กระดองศิลา', '🐢', 'earth', 'earth_adultGood', 'self', 13, { wind: 6, shield: 25, shieldSec: 5 }),
    S('earth_crawl', 'เลื้อยทับ', '🪱', 'earth', 'earth_adultPoor', 'melee', 6, { power: 120, range: 60, wind: 7, fx: [fx('slow', 2.5)] }),
    S('earth_horn', 'งาผา', '🦏', 'earth', 'earth_adultAlt', 'charge', 10, { power: 190, wind: 8, fx: [fx('stun', 0.8)] }),
    S('earth_paw', 'อุ้งตีนผา', '🐻', 'earth', 'earth_perfectGood', 'melee', 12, { power: 260, range: 64, wind: 14, fx: [fx('stun', 1)] }),
    P('earth_boulder', 'ทับกด', '🗿', 'earth', 'earth_perfectPoor', { damageCut: 12, tenacity: 40, moveCut: 15 }, 'รับดาเมจน้อยลง 12% และติดสตัน/ตรึง/ใบ้สั้นลง 40% แต่เดินช้าลง 15%'),
    S('earth_quill', 'ขนแร่', '🦔', 'earth', 'earth_perfectAlt', 'spread', 7, { power: 60, hits: 4, wind: 10, fx: [fx('defDown', 3, 30)] }),
    S('earth_quake', 'ธรณีสั่น', '🏔️', 'earth', 'earth_ultimate', 'burst', 15, { power: 180, radius: 130, wind: 20, fx: [fx('stun', 0.8)] }),
    S('earth_crystal', 'ผลึกพิโรธ', '💠', 'earth', 'earth_ultimateAlt', 'self', 16, { wind: 8, fx: [self('defUp', 6), self('atkUp', 6)] }),

    // ⚡ Lightning: static, short stuns, speed, many quick hits.
    S('ltn_wing', 'ปีกฟ้าผ่า', '🐦', 'lightning', 'lightning_adultGood', 'shot', 6, { power: 130, wind: 7, fx: [fx('static', 3)] }),
    P('ltn_cat', 'ขนพองช็อต', '🐱', 'lightning', 'lightning_adultPoor', { meleeRetort: { power: 0, st: 'static', dur: 3, ch: 40 } }, 'ใครตีระยะประชิด มีโอกาส 40% ติดไฟฟ้าสถิต 3 วินาที'),
    S('ltn_claw', 'เล็บพายุ', '🐆', 'lightning', 'lightning_adultAlt', 'multi', 5, { power: 46, hits: 4, range: 60, wind: 5 }),
    S('ltn_hoof', 'กีบอสนี', '🦄', 'lightning', 'lightning_perfectGood', 'charge', 7, { power: 160, wind: 5, fx: [self('haste', 3)] }),
    S('ltn_roar', 'ฟ้าคำราม', '🌥️', 'lightning', 'lightning_perfectPoor', 'zone', 10, { power: 150, radius: 90, wind: 8, delay: 14, fx: [fx('static', 3)] }),
    S('ltn_tail', 'หางอสนี', '🦊', 'lightning', 'lightning_perfectAlt', 'self', 12, { wind: 4, fx: [self('haste', 5), self('focus', 5)] }),
    S('ltn_bolt', 'อสนีบาต', '🌪️', 'lightning', 'lightning_ultimate', 'beam', 12, { power: 230, width: 30, length: 320, wind: 14, fx: [fx('stun', 0.6)] }),
    S('ltn_vajra', 'วัชระผ่าฟ้า', '🌀', 'lightning', 'lightning_ultimateAlt', 'spread', 8, { power: 90, hits: 3, wind: 9, fx: [fx('static', 2.5, 60)] }),

    // ✨ Holy: healing, cleansing, shields, silence (judgement), dazzling light (blind).
    S('holy_wing', 'ปีกทิพย์', '🕊️', 'holy', 'holy_adultGood', 'self', 13, { wind: 8, heal: 15, cleanse: true }),
    S('holy_lull', 'พรหลับ', '👼', 'holy', 'holy_adultPoor', 'shot', 10, { power: 80, wind: 8, fx: [fx('silence', 2.5)] }),
    S('holy_blade', 'ดาบรัศมี', '🛡️', 'holy', 'holy_adultAlt', 'melee', 7, { power: 170, range: 62, wind: 8, shield: 10, shieldSec: 3 }),
    S('holy_arrow', 'ธนูรัศมี', '🏹', 'holy', 'holy_perfectGood', 'shot', 6, { power: 160, wind: 8, fx: [fx('blind', 2)] }),
    S('holy_bell', 'เสียงก้อง', '🔔', 'holy', 'holy_perfectPoor', 'burst', 11, { power: 90, radius: 110, wind: 12, fx: [fx('silence', 1.5)] }),
    P('holy_seraph', 'ปีกขาวเจิดจ้า', '😇', 'holy', 'holy_perfectAlt', { lastStand: { belowPct: 35, shield: 28, immuneSec: 2 } }, 'ครั้งแรกที่ HP ต่ำกว่า 35% ได้โล่ 28% ล้างสถานะผิดปกติ และคุ้มกัน CC 2 วินาที'),
    S('holy_sun', 'ตะวันชำระ', '🌞', 'holy', 'holy_ultimate', 'zone', 12, { power: 200, radius: 100, wind: 10, delay: 16, fx: [fx('blind', 2)] }),
    S('holy_judge', 'พิพากษาสวรรค์', '👑', 'holy', 'holy_ultimateAlt', 'beam', 10, { power: 180, width: 30, length: 320, wind: 12, execute: 60 }),

    // 🌑 Dark: curses (anti-heal), weakening, draining life.
    S('dark_web', 'ใยสาป', '🕷️', 'dark', 'dark_adultGood', 'shot', 8, { power: 90, wind: 8, fx: [fx('slow', 3), fx('curse', 4)] }),
    S('dark_bite', 'กัดโสโครก', '🐀', 'dark', 'dark_adultPoor', 'melee', 4, { power: 100, range: 58, wind: 5, fx: [fx('atkDown', 3, 50)] }),
    S('dark_fang', 'เขี้ยวโลหิต', '🧛', 'dark', 'dark_adultAlt', 'melee', 7, { power: 160, range: 62, wind: 8, lifesteal: 50 }),
    S('dark_eye', 'นัยน์ตาอาฆาต', '👹', 'dark', 'dark_perfectGood', 'shot', 10, { power: 110, wind: 9, fx: [fx('atkDown', 4), fx('defDown', 4)] }),
    P('dark_undead', 'คลานทับ', '🧟', 'dark', 'dark_perfectPoor', { basicLifesteal: 15, enrage: { belowPct: 50, atk: 20 } }, 'ตีธรรมดาดูดเลือด 15% และ ATK +20% เมื่อ HP ต่ำกว่า 50%'),
    S('dark_wrath', 'พิโรธรัตติกาล', '😈', 'dark', 'dark_perfectAlt', 'burst', 12, { power: 170, radius: 110, wind: 14, fx: [fx('curse', 4)] }),
    S('dark_end', 'อวสานแสง', '🌚', 'dark', 'dark_ultimate', 'melee', 11, { power: 280, range: 66, wind: 14, fx: [fx('defDown', 4)] }),
    S('dark_curse', 'คำสาปนิรันดร์', '💀', 'dark', 'dark_ultimateAlt', 'zone', 12, { power: 110, radius: 90, wind: 10, delay: 14, fx: [fx('curse', 5), fx('atkDown', 5), fx('poison', 5)] }),

    // 🌫️ Shadow: blinding, silencing, evasion, finishing blows.
    S('shd_kunai', 'คุไนเงา', '🥷', 'shadow', 'shadow_adultGood', 'spread', 4.5, { power: 70, hits: 3, wind: 6 }),
    S('shd_flee', 'ลอยหนี', '👻', 'shadow', 'shadow_adultPoor', 'self', 12, { wind: 4, fx: [self('evaUp', 4), self('focus', 4)] }),
    S('shd_arrow', 'ศรเงียบ', '🏹', 'shadow', 'shadow_adultAlt', 'shot', 9, { power: 140, wind: 8, fx: [fx('silence', 2)] }),
    S('shd_snake', 'เขี้ยวเงียบ', '🐍', 'shadow', 'shadow_perfectGood', 'melee', 6, { power: 120, range: 60, wind: 6, fx: [fx('poison', 5), fx('poison', 5)] }),
    S('shd_mist', 'กลืนกลบ', '🌁', 'shadow', 'shadow_perfectPoor', 'burst', 10, { power: 70, radius: 100, wind: 10, fx: [fx('blind', 3.5)] }),
    P('shd_sting', 'เหล็กในเงา', '🦂', 'shadow', 'shadow_perfectAlt', { onBasic: { st: 'poison', dur: 5, ch: 30 } }, 'ตีธรรมดามีโอกาส 30% ติดพิษ 1 ชั้น'),
    S('shd_end', 'อวสานเงา', '🎭', 'shadow', 'shadow_ultimate', 'melee', 9, { power: 180, range: 62, wind: 8, execute: 100 }),
    P('shd_void', 'จักรวาลเงา', '🌌', 'shadow', 'shadow_ultimateAlt', { afterDodge: { critNext: true, bonus: 25 }, eva: 8, dodgeCdCut: 1.5 }, 'ค่าหลบ +8 คูลดาวน์หลบสั้นลง 1.5 วินาที (ไม่ต่ำกว่า 4 วินาที) และหลังหลบสำเร็จ การโจมตีครั้งถัดไปคริติคอลและแรงขึ้น 25%'),

    // ⚪ Neutral: unlocked from each line's Baby 2 form, usable by every element.
    S('n_rally', 'ตะโกนปลุกใจ', '📣', 'neutral', 'flame_baby2', 'self', 15, { wind: 4, fx: [self('atkUp', 5)] }),
    S('n_breath', 'พักหายใจ', '😮‍💨', 'neutral', 'tide_baby2', 'self', 15, { wind: 10, heal: 12 }),
    S('n_whip', 'ฟาดหาง', '🌀', 'neutral', 'leaf_baby2', 'melee', 6, { power: 120, range: 62, wind: 7, fx: [fx('slow', 1.5)] }),
    S('n_guard', 'ตั้งการ์ด', '🛡️', 'neutral', 'earth_baby2', 'self', 14, { wind: 4, shield: 8, shieldSec: 5, fx: [self('defUp', 5)] }),
    S('n_tackle', 'พุ่งชน', '💥', 'neutral', 'lightning_baby2', 'charge', 6, { power: 150, wind: 6 }),
    S('n_hawk', 'ตาเหยี่ยว', '🦅', 'neutral', 'holy_baby2', 'self', 14, { wind: 4, cleanseOnly: ['blind'], fx: [self('focus', 5)] }),
    S('n_chomp', 'กัดแรง', '🦷', 'neutral', 'dark_baby2', 'melee', 8, { power: 200, range: 60, wind: 9 }),
    S('n_rock', 'ปาหิน', '🪨', 'neutral', 'shadow_baby2', 'shot', 5, { power: 130, wind: 8 }),

    // 💨 Dodge skills: unlocked from each line's Baby 1 form, one goes in the dodge slot.
    // chance: added to the dodge roll. Dodge chance = 50 + 3 x (SPD - attacker SPD) + EVA + chance.
    D('dg_step', 'ก้าวหลบ', '👣', 'leaf_baby1', { cd: 6, chance: 0 }, 'หลบมาตรฐาน คูลดาวน์ปานกลาง'),
    D('dg_flip', 'ถอยฉาก', '🤸', 'flame_baby1', { cd: 8, chance: 5, onDodge: { haste: 2 } }, 'กระโดดถอยไกล หลบสำเร็จได้เร่งความเร็ว 2 วินาที'),
    D('dg_veil', 'ม่านน้ำ', '💧', 'tide_baby1', { cd: 8, chance: 0, onDodge: { cleanse: true } }, 'หลบสำเร็จล้างสถานะผิดปกติทั้งหมด'),
    D('dg_parry', 'ปัดป้อง', '🛡️', 'earth_baby1', { cd: 7, chance: 10, parry: 50 }, 'ไม่ถอย แต่ปัดดาเมจ 50% โอกาสสูงกว่า หลบ AOE ได้เหมือนกัน'),
    D('dg_blink', 'วาร์ปสายฟ้า', '⚡', 'lightning_baby1', { cd: 4, chance: -12 }, 'คูลดาวน์สั้นมาก แต่โอกาสหลบต่ำกว่า'),
    D('dg_flash', 'แสงพร่า', '🌟', 'holy_baby1', { cd: 10, chance: 0, onDodge: { blindAttacker: 2 } }, 'หลบสำเร็จ ผู้โจมตีตาบอด 2 วินาที'),
    D('dg_counter', 'สวนกลับ', '🥊', 'dark_baby1', { cd: 9, chance: -5, onDodge: { counter: 100 } }, 'หลบสำเร็จแล้วสวนทันที 100% ของ ATK'),
    D('dg_vanish', 'พรางกาย', '🌫️', 'shadow_baby1', { cd: 10, chance: 0, onDodge: { vanish: 1, critNext: true } }, 'หายตัว 1 วินาที และการโจมตีครั้งถัดไปคริติคอล'),
  ]

  // Innate skill per form = the skill that form unlocks.
  const INNATE = Object.fromEntries(SKILLS.filter((s) => !s.src.includes('baby')).map((s) => [s.src, s.id]))

  const scale = (base, m) => ({
    hp: Math.round(base.hp * m.hp),
    atk: Math.round(base.atk * m.atk),
    def: Math.round(base.def * m.def),
    spd: Math.round(base.spd * m.spd),
  })
  const ONE = { hp: 1, atk: 1, def: 1, spd: 1 }

  const ROSTER = {}
  for (const line of Object.keys(LINE_BIAS)) {
    for (const [form, stage, quality] of FORMS) {
      const id = `${line}_${form}`
      const q = QUALITY[quality]
      const stats = scale(scale(scale(STAGE_BASE[stage], LINE_BIAS[line]), form.endsWith('Alt') ? ALT_BIAS[line] : ONE), { hp: q, atk: q, def: q, spd: q })
      ROSTER[id] = {
        id,
        line,
        stage,
        form,
        name: NAMES[line][form][0],
        emoji: NAMES[line][form][1],
        element: line,
        ...stats,
        eva: LINE_EVA[line],
        acc: LINE_ACC[line],
        res: LINE_RES[line],
        innate: INNATE[id],
      }
    }
  }

  // Pack stages: several weaker foes at once, where area skills pay off.
  const PACKS = [
    // hp per stage of the player's monster, tuned so a random loadout clears it about 60% of the time.
    { id: 'wolves', name: 'ฝูงหมาป่าไพร', base: 'leaf_adultAlt', count: 3, hp: { adult: 28, perfect: 26, ultimate: 31 }, atk: 55, skills: ['leaf_fang'] },
    { id: 'bats', name: 'ฝูงค้างคาวรัตติกาล', base: 'dark_adultPoor', count: 4, hp: { adult: 31, perfect: 30, ultimate: 25 }, atk: 45, skills: ['dark_bite'] },
    { id: 'sparks', name: 'ฝูงนกฟ้าผ่า', base: 'lightning_adultGood', count: 3, hp: { adult: 36, perfect: 37, ultimate: 44 }, atk: 50, skills: ['ltn_wing'] },
  ]

  // ----- Adventure (game areas and stages; enemies: 1 skill, bosses: 2 skills) -----
  const E_ = (id, name, icon, el, kind, cd, opts = {}) => ({ id, name, icon, el, src: 'enemy', slot: 'active', kind, cd, wind: 8, power: 0, hits: 1, ...opts })
  const ENEMY_SKILLS = [
    E_('e_web', 'ใยเหนียว', '🕸️', 'leaf', 'shot', 6, { power: 80, fx: [fx('slow', 2)] }),
    E_('e_pinch', 'ก้ามหนีบ', '🦀', 'tide', 'melee', 5, { power: 140, range: 60, wind: 7 }),
    E_('e_firewing', 'ปีกไฟ', '🔥', 'flame', 'melee', 6, { power: 90, range: 60, wind: 6, fx: [fx('burn', 3)] }),
    E_('e_stomp', 'กระทืบพสุธา', '💢', 'leaf', 'burst', 9, { power: 130, radius: 100, wind: 14, fx: [fx('root', 1)] }),
    E_('e_carrot', 'แครอทฟื้นพลัง', '🥕', 'leaf', 'self', 14, { wind: 8, heal: 15 }),
    E_('e_swoop', 'โฉบคลื่น', '🌊', 'tide', 'charge', 6, { power: 150, wind: 6 }),
    E_('e_hotsting', 'เหล็กในร้อน', '🦂', 'flame', 'melee', 6, { power: 110, range: 60, wind: 6, fx: [fx('burn', 3)] }),
    E_('e_shellram', 'กระดองกระแทก', '🐢', 'tide', 'charge', 7, { power: 140, wind: 8, fx: [fx('slow', 2)] }),
    E_('e_mistbite', 'ขย้ำในหมอก', '🦷', 'tide', 'melee', 8, { power: 200, range: 62, wind: 9, fx: [fx('blind', 2)] }),
    E_('e_whirlpool', 'วังน้ำวน', '🌀', 'tide', 'zone', 11, { power: 160, radius: 90, wind: 10, delay: 14, fx: [fx('slow', 3)] }),
    E_('e_lavacoil', 'รัดหลอมละลาย', '🐍', 'flame', 'melee', 7, { power: 100, range: 60, wind: 7, fx: [fx('burn', 3), fx('slow', 1.5)] }),
    E_('e_rockcharge', 'พุ่งชนหินผา', '🐗', 'leaf', 'charge', 8, { power: 170, wind: 8, fx: [fx('root', 1)] }),
    E_('e_stormclaw', 'กรงเล็บพายุ', '🦅', 'leaf', 'multi', 6, { power: 60, hits: 3, range: 60, wind: 6, fx: [fx('poison', 4, 40)] }),
    E_('e_volcano', 'ลมหายใจภูเขาไฟ', '🌋', 'flame', 'beam', 9, { power: 200, width: 34, length: 320, wind: 14, fx: [fx('burn', 4)] }),
    E_('e_dragontail', 'หางมังกรฟาด', '🐉', 'flame', 'burst', 12, { power: 180, radius: 110, wind: 14, fx: [fx('defDown', 4)] }),
    E_('e_oregore', 'ขวิดแร่', '🪲', 'earth', 'charge', 9, { power: 170, wind: 8, fx: [fx('stun', 0.6)] }),
    E_('e_shockwing', 'ปีกช็อต', '🦇', 'lightning', 'shot', 6, { power: 120, wind: 7, fx: [fx('static', 3)] }),
    E_('e_orebite', 'กัดบดแร่', '🐜', 'earth', 'melee', 7, { power: 150, range: 60, wind: 8, fx: [fx('defDown', 3)] }),
    E_('e_crystalburst', 'ผลึกระเบิด', '💎', 'earth', 'zone', 11, { power: 220, radius: 100, wind: 10, delay: 16, fx: [fx('stun', 0.8)] }),
    E_('e_crystalshell', 'เกราะผลึก', '🛡️', 'earth', 'self', 15, { wind: 6, shield: 20, shieldSec: 5, fx: [self('defUp', 5)] }),
    E_('e_sparktail', 'หางสปาร์ก', '🐿️', 'lightning', 'multi', 5, { power: 45, hits: 4, range: 60, wind: 5, fx: [fx('static', 2, 30)] }),
    E_('e_cliffram', 'ขวิดผา', '🐐', 'earth', 'charge', 9, { power: 180, wind: 8, fx: [fx('stun', 0.6)] }),
    E_('e_thunderdive', 'โฉบอสนี', '🦅', 'lightning', 'charge', 7, { power: 160, wind: 5, fx: [self('haste', 3)] }),
    E_('e_plumes', 'ขนไฟฟ้าสาด', '🦚', 'lightning', 'spread', 7, { power: 60, hits: 5, wind: 10, fx: [fx('static', 2.5, 40)] }),
    E_('e_fan', 'รำแพนสายฟ้า', '⚡', 'lightning', 'burst', 13, { power: 200, radius: 130, wind: 18, fx: [fx('stun', 0.8)] }),
  ]
  // Baby forms: they fight with no skills and no dodge (adventure only).
  const BABY_BASE = { baby1: { hp: 24, atk: 5, def: 3, spd: 5 }, baby2: { hp: 40, atk: 8, def: 5, spd: 7 } }
  const STAGE_ALL = { ...BABY_BASE, ...STAGE_BASE }
  const BABIES = {}
  for (const line of Object.keys(LINE_BIAS)) {
    for (const form of ['baby1', 'baby2']) {
      const stats = scale(BABY_BASE[form], LINE_BIAS[line])
      BABIES[`${line}_${form}`] = { id: `${line}_${form}`, line, stage: form, form, name: NAMES[line][form][0], emoji: NAMES[line][form][1], element: line, ...stats, eva: LINE_EVA[line], acc: LINE_ACC[line], res: LINE_RES[line], innate: null }
    }
  }
  // str: the game's strength multiplier on the stage's base stats (hp/atk get the tuned `k` on top).
  const ST_ = (id, name, emoji, el, level, str, skills, boss = false) => ({ id, name, emoji, el, level, str, skills, boss })
  const AREAS = [
    { id: 'meadow', name: 'ทุ่งหญ้าเริ่มต้น', emoji: '🌾', prep: { stage: 'baby2', grade: null, level: 0, tree: 0 }, stages: [
      ST_('meadow_1', 'หนอนใบไม้', '🐛', 'leaf', 'baby1', 1, ['e_web']),
      ST_('meadow_2', 'ปูน้ำจืด', '🦀', 'tide', 'baby2', 0.8, ['e_pinch']),
      ST_('meadow_3', 'ค้างคาวถ่าน', '🦇', 'flame', 'baby2', 0.85, ['e_firewing']),
      ST_('meadow_boss', 'กระต่ายยักษ์', '🐇', 'leaf', 'adult', 0.75, ['e_stomp', 'e_carrot'], true),
    ] },
    { id: 'coast', name: 'ชายฝั่งหมอก', emoji: '🌊', prep: { stage: 'adult', grade: 'common', level: 5, tree: 5 }, stages: [
      ST_('coast_1', 'นกนางนวลซ่า', '🐦', 'tide', 'adult', 0.85, ['e_swoop']),
      ST_('coast_2', 'แมงป่องเพลิง', '🦂', 'flame', 'adult', 0.95, ['e_hotsting']),
      ST_('coast_3', 'เต่าหินผา', '🐢', 'tide', 'adult', 1.05, ['e_shellram']),
      ST_('coast_boss', 'ฉลามหมอก', '🦈', 'tide', 'perfect', 0.95, ['e_mistbite', 'e_whirlpool'], true),
    ] },
    { id: 'volcano', name: 'ภูเขาไฟหลับ', emoji: '🌋', prep: { stage: 'perfect', grade: 'rare', level: 5, tree: 10 }, stages: [
      ST_('volcano_1', 'งูลาวา', '🐍', 'flame', 'perfect', 0.9, ['e_lavacoil']),
      ST_('volcano_2', 'หมูป่าเกราะหิน', '🐗', 'leaf', 'perfect', 1, ['e_rockcharge']),
      ST_('volcano_3', 'อินทรีพายุ', '🦅', 'leaf', 'perfect', 1.1, ['e_stormclaw']),
      ST_('volcano_boss', 'มังกรหลับใหล', '🐉', 'flame', 'ultimate', 1, ['e_volcano', 'e_dragontail'], true),
    ] },
    { id: 'cavern', name: 'ถ้ำผลึกลึก', emoji: '💎', prep: { stage: 'ultimate', grade: 'epic', level: 5, tree: 15 }, stages: [
      ST_('cavern_1', 'ด้วงหินแร่', '🪲', 'earth', 'ultimate', 0.75, ['e_oregore']),
      ST_('cavern_2', 'ค้างคาวถ้ำฟ้า', '🦇', 'lightning', 'ultimate', 0.8, ['e_shockwing']),
      ST_('cavern_3', 'มดยักษ์ใต้ดิน', '🐜', 'earth', 'ultimate', 0.85, ['e_orebite']),
      ST_('cavern_boss', 'โกเลมผลึก', '💎', 'earth', 'ultimate', 1.05, ['e_crystalburst', 'e_crystalshell'], true),
    ] },
    { id: 'storm_peak', name: 'ยอดผาพายุ', emoji: '⛈️', prep: { stage: 'ultimate', grade: 'epic', level: 10, tree: 20 }, stages: [
      ST_('storm_1', 'กระรอกฟ้าผ่า', '🐿️', 'lightning', 'ultimate', 0.8, ['e_sparktail']),
      ST_('storm_2', 'แพะภูผา', '🐐', 'earth', 'ultimate', 0.85, ['e_cliffram']),
      ST_('storm_3', 'เหยี่ยวอสนี', '🦅', 'lightning', 'ultimate', 0.9, ['e_thunderdive']),
      ST_('storm_boss', 'นกยูงอสนี', '🦚', 'lightning', 'ultimate', { hp: 1.1, atk: 1.65, def: 1.1, spd: 1.1 }, ['e_plumes', 'e_fan'], true),
    ] },
  ]
  // What a target win rate looks like for the area's benchmark monster (random loadout).
  const ADVENTURE_TARGETS = { normal: [88, 82, 78, 72, 66], boss: [62, 60, 56, 50, 35] }
  // Bosses shrug off control: extra RES on top of their line's.
  const BOSS_RES = 15

  // Gear: the game's slot main stats x grade x enhance, plus the average secondary stats of a grade.
  const SLOT_MAIN = { atk: 4, def: 3, hp: 15, spd: 2 }
  const GRADE_MUL = { common: 1, rare: 1.5, epic: 2.2, legendary: 3 }
  const SUB_COUNT = { common: 0.5, rare: 1.5, epic: 2.5, legendary: 3.5 }
  const SUB_BASE = { hp: 6, atk: 2, def: 1.5, spd: 1 }
  const enhanceMul = (level) => 1 + 0.05 * level + 0.05 * Math.floor(level / 5)
  const gearFlat = (grade, level) => {
    if (!grade) return { hp: 0, atk: 0, def: 0, spd: 0 }
    const out = {}
    for (const k of Object.keys(SLOT_MAIN)) {
      const main = Math.round(Math.round(SLOT_MAIN[k] * GRADE_MUL[grade]) * enhanceMul(level))
      const subs = 4 * (SUB_COUNT[grade] / 4) * SUB_BASE[k] * GRADE_MUL[grade] * 0.75
      out[k] = Math.round(main + subs)
    }
    return out
  }
  // Trainer tree: per point, +1% ATK and +1% HP, and +0.15% crit chance (an even offence/defence spend).
  const treeBonus = (points) => ({ atk: points, hp: points, crit: Math.round(points * 0.15) })

  const SPECIES_NAME = (src) => {
    const [line, form] = src.split('_')
    return NAMES[line][form][0]
  }

  return { ELEMENTS, BEATS, STRONG, WEAK, STATUS, STATUS_NUMBERS, ROSTER, SKILLS, PACKS, SPECIES_NAME, NAMES, ENEMY_SKILLS, BABIES, AREAS, ADVENTURE_TARGETS, BOSS_RES, STAGE_ALL, LINE_BIAS, LINE_EVA, LINE_ACC, LINE_RES, gearFlat, treeBonus, GRADE_MUL }
})()

if (typeof module !== 'undefined') module.exports = ARENA_DATA
