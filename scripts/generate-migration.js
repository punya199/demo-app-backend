const { execSync } = require('child_process')

const name = process.argv[2]
if (!name) {
  console.error('❌ Missing <migration-name>')
  console.log('📖 Example: yarn migration:generate <migration-name>')
  console.log('📖 Example: yarn migration:generate add-some-table')
  process.exit(1)
}

const command = `typeorm-ts-node-commonjs migration:generate src/db/migrations/${name} -d src/config/database.config.ts`
console.log('➡️ Running:', command)
execSync(command, { stdio: 'inherit' })
