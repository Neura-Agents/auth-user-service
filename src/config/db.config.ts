import { Pool } from 'pg';
import { ENV } from './env.config';

console.log('--- DATABASE CONNECTION DEBUG ---');
console.log('Using URL:', ENV.DB.URL ? 'YES (Masked)' : 'NO');
console.log('Host:', ENV.DB.HOST);
console.log('User:', ENV.DB.USER);
console.log('Database:', ENV.DB.NAME);
console.log('Schema:', ENV.DB.SCHEMA);
console.log('Password Length:', ENV.DB.PASSWORD?.length || 0);
if (ENV.DB.URL) {
  const maskedUrl = ENV.DB.URL.replace(/:([^:@]+)@/, ':****@');
  console.log('Processed Connection URL:', maskedUrl);
}
console.log('---------------------------------');

export const pool = new Pool(
    ENV.DB.URL
        ? {
            connectionString: ENV.DB.URL,
            options: `-c search_path=${ENV.DB.SCHEMA},public`,
        }
        : {
            host: ENV.DB.HOST,
            port: ENV.DB.PORT,
            user: ENV.DB.USER,
            password: ENV.DB.PASSWORD,
            database: ENV.DB.NAME,
            options: `-c search_path=${ENV.DB.SCHEMA},public`,
        }
);

export const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                keycloak_id VARCHAR(255) PRIMARY KEY,
                username VARCHAR(255),
                email VARCHAR(255),
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
    }
};
