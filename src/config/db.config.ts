import { Pool } from 'pg';
import { ENV } from './env.config';

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
