import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { defineTool, createReadOnlyTool, createWriteTool } from "./tool-factory.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execAsync = promisify(exec);

const DatabaseQueryInputSchema = z.object({
  query: z.string().min(1, "query 不能为空"),
});

const DatabaseSchemaInputSchema = z.object({});

const DatabaseMigrateInputSchema = z.object({
  direction: z.enum(["up", "down"]).optional(),
  steps: z.number().int().positive().optional(),
});

const DatabaseSeedInputSchema = z.object({});

const DatabaseOutputSchema = z.object({
  message: z.string(),
  success: z.boolean().optional(),
});

export interface DatabaseConfig {
  type?: "postgres" | "mysql" | "sqlite" | "mongodb";
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  connectionString?: string;
}

export function createDatabaseTools(config: DatabaseConfig = {}): ToolDefinition[] {
  const dbType = config.type || process.env.DB_TYPE || "postgres";
  const connectionString = config.connectionString || process.env.DATABASE_URL || "";

  const getPostgresCommand = (query: string): string => {
    if (connectionString) {
      return `psql "${connectionString}" -c "${query.replace(/"/g, '\\"')}"`;
    }
    return `PGPASSWORD=${config.password || process.env.DB_PASSWORD || ""} psql -h ${config.host || "localhost"} -p ${config.port || 5432} -U ${config.username || "postgres"} -d ${config.database || ""} -c "${query.replace(/"/g, '\\"')}"`;
  };

  const getMysqlCommand = (query: string): string => {
    if (connectionString) {
      return `mysql "${connectionString}" -e "${query.replace(/"/g, '\\"')}"`;
    }
    return `mysql -h ${config.host || "localhost"} -P ${config.port || 3306} -u ${config.username || "root"} -p${config.password || process.env.DB_PASSWORD || ""} ${config.database || ""} -e "${query.replace(/"/g, '\\"')}"`;
  };

  const getSqliteCommand = (query: string): string => {
    const dbPath = config.database || process.env.DB_PATH || "database.sqlite";
    return `sqlite3 "${dbPath}" "${query.replace(/"/g, '\\"')}"`;
  };

  const getMongoCommand = (query: string): string => {
    const uri = connectionString || `mongodb://${config.host || "localhost"}:${config.port || 27017}/${config.database || ""}`;
    return `mongosh "${uri}" --eval '${query.replace(/'/g, "\\'")}'`;
  };

  const executeQuery = async (query: string): Promise<string> => {
    let command: string;

    switch (dbType) {
      case "postgres":
        command = getPostgresCommand(query);
        break;
      case "mysql":
        command = getMysqlCommand(query);
        break;
      case "sqlite":
        command = getSqliteCommand(query);
        break;
      case "mongodb":
        command = getMongoCommand(query);
        break;
      default:
        throw new Error(`Unsupported database type: ${dbType}`);
    }

    try {
      const { stdout } = await execAsync(command, { timeout: 30000 });
      return stdout || "Query executed successfully (no output)";
    } catch (error) {
      throw new Error(`Query failed: ${(error as Error).message}`);
    }
  };

  const databaseQueryTool = createReadOnlyTool({
    name: "DatabaseQuery",
    description: "Execute a SQL query against the configured database",
    inputSchema: DatabaseQueryInputSchema,
    outputSchema: DatabaseOutputSchema,
    resourceKeys: ["query"],
    handler: async (input) => {
      if (!connectionString && !config.host && !config.database) {
        throw new Error("Database connection is not configured. Set DATABASE_URL or provide database config.");
      }

      const result = await executeQuery(input.query);
      return { message: result };
    },
  });

  const databaseSchemaTool = createReadOnlyTool({
    name: "DatabaseSchema",
    description: "Get the database schema information",
    inputSchema: DatabaseSchemaInputSchema,
    outputSchema: DatabaseOutputSchema,
    handler: async () => {
      if (!connectionString && !config.host && !config.database) {
        throw new Error("Database connection is not configured.");
      }

      let query: string;

      switch (dbType) {
        case "postgres":
          query = `
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position;
          `;
          break;
        case "mysql":
          query = `
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            ORDER BY TABLE_NAME, ORDINAL_POSITION;
          `;
          break;
        case "sqlite":
          query = `.tables`;
          break;
        case "mongodb":
          return { message: "MongoDB schema inspection not supported via CLI. Use DatabaseQuery instead." };
        default:
          throw new Error(`Unsupported database type: ${dbType}`);
      }

      const result = await executeQuery(query);
      return { message: result };
    },
  });

  const databaseMigrateTool = createWriteTool({
    name: "DatabaseMigrate",
    description: "Run database migrations",
    inputSchema: DatabaseMigrateInputSchema,
    outputSchema: DatabaseOutputSchema,
    handler: async (input) => {
      const direction = input.direction || "up";
      const steps = input.steps;

      const packageJson = JSON.parse(await readFile("package.json", "utf-8").catch(() => "{}"));
      const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };

      let command: string;

      if (deps["knex"]) {
        command = `npx knex migrate:${direction === "up" ? "latest" : "rollback"}`;
        if (steps) {
          command += ` --steps ${steps}`;
        }
      } else if (deps["sequelize"]) {
        command = `npx sequelize-cli db:migrate${direction === "down" ? ":undo" : ""}`;
        if (steps && direction === "down") {
          command += ` --steps ${steps}`;
        }
      } else if (deps["prisma"]) {
        command = direction === "up" ? "npx prisma migrate deploy" : "npx prisma migrate reset --force";
      } else if (deps["typeorm"]) {
        command = `npx typeorm migration:${direction === "up" ? "run" : "revert"}`;
      } else {
        throw new Error("No supported migration tool found. Install knex, sequelize, prisma, or typeorm.");
      }

      try {
        const { stdout } = await execAsync(command, { timeout: 60000 });
        return { message: `Migration completed:\n${stdout}`, success: true };
      } catch (error) {
        throw new Error(`Migration failed: ${(error as Error).message}`);
      }
    },
  });

  const databaseSeedTool = createWriteTool({
    name: "DatabaseSeed",
    description: "Run database seeders to populate with test data",
    inputSchema: DatabaseSeedInputSchema,
    outputSchema: DatabaseOutputSchema,
    handler: async () => {
      const packageJson = JSON.parse(await readFile("package.json", "utf-8").catch(() => "{}"));
      const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };

      let command: string;

      if (deps["knex"]) {
        command = "npx knex seed:run";
      } else if (deps["sequelize"]) {
        command = "npx sequelize-cli db:seed:all";
      } else if (deps["prisma"]) {
        command = "npx prisma db seed";
      } else if (deps["typeorm"]) {
        command = "npx typeorm seed:run";
      } else {
        throw new Error("No supported seeder tool found. Install knex, sequelize, prisma, or typeorm.");
      }

      try {
        const { stdout } = await execAsync(command, { timeout: 60000 });
        return { message: `Seeding completed:\n${stdout}`, success: true };
      } catch (error) {
        throw new Error(`Seeding failed: ${(error as Error).message}`);
      }
    },
  });

  return [databaseQueryTool, databaseSchemaTool, databaseMigrateTool, databaseSeedTool];
}
