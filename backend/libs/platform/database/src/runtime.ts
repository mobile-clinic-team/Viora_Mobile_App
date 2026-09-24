import { Pool } from 'pg';

export interface DatabaseQueryResult<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly rows: readonly Row[];
}

export interface DatabaseSession {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>>;
}

export interface TransactionalDatabase extends DatabaseSession {
  transaction<T>(
    work: (transaction: DatabaseSession) => Promise<T>,
  ): Promise<T>;

  close(): Promise<void>;
}

export function createPostgresDatabase(
  connectionString: string,
): TransactionalDatabase {
  if (!connectionString.trim()) {
    throw new Error('PostgreSQL connection string is required');
  }

  const pool = new Pool({
    connectionString,
  });

  let closed = false;

  const database: TransactionalDatabase = {
    async query<
      Row extends Record<string, unknown> = Record<string, unknown>,
    >(
      text: string,
      values?: readonly unknown[],
    ): Promise<DatabaseQueryResult<Row>> {
      if (closed) {
        throw new Error('database is closed');
      }

      const result = await pool.query<Row>(
        text,
        values === undefined ? undefined : [...values],
      );

      return {
        rows: result.rows,
      };
    },

    async transaction<T>(
      work: (transaction: DatabaseSession) => Promise<T>,
    ): Promise<T> {
      if (closed) {
        throw new Error('database is closed');
      }

      const client = await pool.connect();

      const transaction: DatabaseSession = {
        async query<
          Row extends Record<string, unknown> = Record<string, unknown>,
        >(
          text: string,
          values?: readonly unknown[],
        ): Promise<DatabaseQueryResult<Row>> {
          const result = await client.query<Row>(
            text,
            values === undefined ? undefined : [...values],
          );

          return {
            rows: result.rows,
          };
        },
      };

      try {
        await client.query('BEGIN');

        const result = await work(transaction);

        await client.query('COMMIT');

        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original transaction failure.
        }

        throw error;
      } finally {
        client.release();
      }
    },

    async close(): Promise<void> {
      if (closed) {
        return;
      }

      closed = true;
      await pool.end();
    },
  };

  return database;
}