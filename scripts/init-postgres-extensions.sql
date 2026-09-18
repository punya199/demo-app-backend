-- Migrations use uuid_generate_v4() (uuid-ossp); TypeOrmModule's runtime uuidExtension is
-- pgcrypto. Enable both so neither path breaks on a fresh local database.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
