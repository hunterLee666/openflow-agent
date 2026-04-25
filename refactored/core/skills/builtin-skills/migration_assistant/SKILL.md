---
name: migration_assistant
version: 1.0.0
description: Assist with database migrations, schema changes, and data transformations
trigger: [migration, migrate, schema change, database migration, alter table, data migration]
---

# Migration Assistant Skill

## Purpose
Help plan, create, and execute database migrations safely. Analyze schema changes, generate migration scripts, and ensure data integrity during transformations.

## When to Use
- Create database migrations
- Modify database schema
- Migrate data between structures
- Rollback failed migrations
- Review migration scripts

## Process

1. **Analyze Current Schema**
   - Use DatabaseSchema tool to inspect current structure
   - Read existing migration files
   - Identify current schema version

2. **Plan Migration**
   - Determine required changes (add/drop/modify columns, indexes, constraints)
   - Assess impact on existing data
   - Plan rollback strategy
   - Estimate migration time

3. **Generate Migration Script**
   - Create up migration (apply changes)
   - Create down migration (rollback changes)
   - Include data transformation logic if needed
   - Add proper error handling

4. **Validate Migration**
   - Check syntax and SQL validity
   - Verify no data loss scenarios
   - Test on copy of data if possible
   - Review locking implications

5. **Execute Migration**
   - Use DatabaseMigrate tool to apply
   - Monitor execution
   - Verify results
   - Document changes

## Migration Patterns

### Adding a Column
```sql
-- Up
ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';
CREATE INDEX idx_users_status ON users(status);

-- Down
DROP INDEX idx_users_status;
ALTER TABLE users DROP COLUMN status;
```

### Renaming a Column (Zero Downtime)
```sql
-- Step 1: Add new column
ALTER TABLE users ADD COLUMN email_new VARCHAR(255);

-- Step 2: Copy data
UPDATE users SET email_new = email;

-- Step 3: Update application to use new column

-- Step 4: Drop old column
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users RENAME COLUMN email_new TO email;
```

### Changing Column Type
```sql
-- Up
ALTER TABLE products ALTER COLUMN price TYPE DECIMAL(10,2) USING price::DECIMAL(10,2);

-- Down
ALTER TABLE products ALTER COLUMN price TYPE INTEGER USING price::INTEGER;
```

## Safety Guidelines

1. **Always provide down migrations**
2. **Test migrations on staging first**
3. **Backup data before running**
4. **Use transactions when possible**
5. **Avoid long-running locks on production**
6. **Monitor migration progress**

## Tools to Use
- DatabaseSchema: Inspect current schema
- DatabaseQuery: Test migration SQL
- DatabaseMigrate: Apply migrations
- Read: Review existing migration files
- Write: Create new migration files
