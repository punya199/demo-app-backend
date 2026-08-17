import { MigrationInterface, QueryRunner } from 'typeorm'
import * as bcrypt from 'bcrypt'

const SALT_ROUNDS = 10
// bcrypt hashes always look like $2a$10$..., $2b$10$..., or $2y$10$...
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/

export class HashExistingPasswords1786952647299 implements MigrationInterface {
  name = 'HashExistingPasswords1786952647299'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const users: { id: string; password: string }[] = await queryRunner.query(
      `SELECT id, password FROM "users"`
    )

    for (const user of users) {
      if (BCRYPT_HASH_PATTERN.test(user.password)) continue

      const hashed = await bcrypt.hash(user.password, SALT_ROUNDS)
      await queryRunner.query(`UPDATE "users" SET password = $1 WHERE id = $2`, [hashed, user.id])
    }
  }

  public async down(): Promise<void> {
    // Hashing is one-way - existing plaintext passwords can't be recovered.
  }
}
