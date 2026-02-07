require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function checkDB() {
    try {
        console.log('Checking database...');

        // Check tables
        const tablesRes = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('Tables found:', tablesRes.rows.map(r => r.table_name));

        // Check rows in players_scores
        const scoresRes = await pool.query('SELECT COUNT(*) FROM players_scores');
        console.log('Rows in players_scores:', scoresRes.rows[0].count);

        // Check rows in game_logs (if exists)
        const logsRes = await pool.query("SELECT to_regclass('public.game_logs')");
        if (logsRes.rows[0].to_regclass) {
            const logsCount = await pool.query('SELECT COUNT(*) FROM game_logs');
            console.log('Rows in game_logs:', logsCount.rows[0].count);
        } else {
            console.log('game_logs table does not exist.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

checkDB();
