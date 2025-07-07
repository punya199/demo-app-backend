# Database Migrations

This directory contains TypeORM migration files for the Saiyasat backend application.

## Available Commands

### Development Commands (TypeScript)

#### Generate Migration
Automatically generate a migration based on entity changes:
```bash
npm run migration:generate src/migrations/MigrationName
```

#### Create Empty Migration
Create an empty migration file to write custom SQL:
```bash
npm run migration:create src/migrations/MigrationName
```

#### Run Migrations
Execute pending migrations:
```bash
npm run migration:run
```

#### Revert Migration
Revert the last executed migration:
```bash
npm run migration:revert
```

#### Show Migration Status
Show which migrations have been executed:
```bash
npm run migration:show
```

### Production/Docker Commands (JavaScript)

These commands work with compiled JavaScript files and are suitable for Docker containers:

#### Run Migrations in Production
```bash
npm run migration:run:prod
```

#### Revert Migration in Production
```bash
npm run migration:revert:prod
```

#### Show Migration Status in Production
```bash
npm run migration:show:prod
```

## Migration Workflow

### Development Workflow
1. **Development**: Use `synchronize: true` in development for quick prototyping
2. **Entity Changes**: When you modify entities, generate migrations with `migration:generate`
3. **Test Migrations**: Run `migration:run` to test your migrations locally

### Production/Docker Workflow
1. **Build**: Run `npm run build` to compile TypeScript to JavaScript
2. **Deploy**: Deploy your Docker image with compiled code
3. **Migrate**: Run `npm run migration:run:prod` in your Docker container
4. **Monitor**: Use `npm run migration:show:prod` to verify migration status

## Docker Integration

Add these commands to your Dockerfile or docker-compose.yml:

```dockerfile
# Example Dockerfile commands
RUN npm run build
CMD ["npm", "run", "migration:run:prod", "&&", "npm", "run", "start:prod"]
```

```yaml
# Example docker-compose.yml
services:
  app:
    command: sh -c "npm run migration:run:prod && npm run start:prod"
```

## Important Notes

- Always review generated migrations before running them
- Test migrations on a copy of production data
- Keep migrations small and focused
- Never edit a migration that has been committed to version control
- Use descriptive names for your migrations
- Always build your project before running production migration commands

## Current Configuration

- **Development**:
  - Entities: `src/**/*.entity.ts`
  - Migrations: `src/migrations/*.ts`
- **Production**:
  - Entities: `dist/**/*.entity.js`
  - Migrations: `dist/migrations/*.js`
- **Migration table**: `migrations`

## Environment Setup

Make sure your `.env` file contains the database configuration:
```
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=your_user
DATABASE_PASSWORD=your_password
DATABASE_NAME=your_database
DATABASE_SSL=false
``` 