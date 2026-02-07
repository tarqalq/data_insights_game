
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function fixSchema() {
    try {
        console.log('🔧 Fixing database schema...');

        // 1. Fix players_scores table
        await pool.query(`
            ALTER TABLE players_scores 
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);
        console.log('✅ Added updated_at/created_at to players_scores');

        // 2. Fix game_sessions table (just in case)
        await pool.query(`
            ALTER TABLE game_sessions 
            ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);
        console.log('✅ Checked game_sessions schema');

        // 3. Re-apply trigger just to be safe
        await pool.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS update_players_scores_updated_at ON players_scores;
            CREATE TRIGGER update_players_scores_updated_at
                BEFORE UPDATE ON players_scores
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        `);
        console.log('✅ Re-applied triggers');

    } catch (error) {
        console.error('❌ Error fixing schema:', error);
    } finally {
        await pool.end();
    }
}

fixSchema();
