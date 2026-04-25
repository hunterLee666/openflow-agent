import type { ToolDefinition } from "../types/index.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execAsync = promisify(exec);

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
        return `Error: Unsupported database type: ${dbType}`;
    }

    try {
      const { stdout } = await execAsync(command, { timeout: 30000 });
      return stdout || "Query executed successfully (no output)";
    } catch (error) {
      return `Query failed: ${(error as Error).message}`;
    }
  };

  return [
    {
      name: "DatabaseQuery",
      description: "Execute a SQL query against the configured database",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "SQL query to execute" },
        },
        required: ["query"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const { query } = input as { query: string };

        if (!connectionString && !config.host && !config.database) {
          return "Error: Database connection is not configured. Set DATABASE_URL or provide database config.";
        }

        return executeQuery(query);
      },
    },
    {
      name: "DatabaseSchema",
      description: "Get the database schema information",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
      isReadOnly: true,
      handler: async () => {
        if (!connectionString && !config.host && !config.database) {
          return "Error: Database connection is not configured.";
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
            return "MongoDB schema inspection not supported via CLI. Use DatabaseQuery instead.";
          default:
            return `Error: Unsupported database type: ${dbType}`;
        }

        return executeQuery(query);
      },
    },
    {
      name: "DatabaseMigrate",
      description: "Run database migrations",
      inputSchema: {
        type: "object",
        properties: {
          direction: { type: "string", description: "Migration direction: up or down", enum: ["up", "down"] },
          steps: { type: "number", description: "Number of migrations to run (default: all)" },
        },
        required: [],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const { direction = "up", steps } = input as { direction?: string; steps?: number };

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
          return "Error: No supported migration tool found. Install knex, sequelize, prisma, or typeorm.";
        }

        try {
          const { stdout } = await execAsync(command, { timeout: 60000 });
          return `Migration completed:\n${stdout}`;
        } catch (error) {
          return `Migration failed: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "DatabaseSeed",
      description: "Run database seeders to populate with test data",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
      isReadOnly: false,
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
          return "Error: No supported seeder tool found. Install knex, sequelize, prisma, or typeorm.";
        }

        try {
          const { stdout } = await execAsync(command, { timeout: 60000 });
          return `Seeding completed:\n${stdout}`;
        } catch (error) {
          return `Seeding failed: ${(error as Error).message}`;
        }
      },
    },
  ];
}
