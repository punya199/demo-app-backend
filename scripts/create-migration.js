const { execSync } = require('child_process')

const name = process.argv[2]
if (!name) {
  console.error('❌ Missing <migration-name>')
  console.log('📖 Example: yarn migration:create <migration-name>')
  console.log('📖 Example: yarn migration:create add-some-table')
  process.exit(1)
}

const command = `npm run typeorm -- migration:create src/migrations/${name}`
console.log('➡️ Running:', command)
execSync(command, { stdio: 'inherit' })
