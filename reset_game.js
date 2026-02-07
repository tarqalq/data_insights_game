require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function resetGameState() {
    try {
        console.log('🗑️ جاري تصفير حالة اللعبة...');

        // مسح الجلسات والسجلات
        await pool.query('DELETE FROM game_sessions');
        await pool.query('DELETE FROM round_logs');

        // إعادة حالة اللعبة إلى اللوبي
        await pool.query(`
            UPDATE active_game_state 
            SET game_status = 'lobby', 
                current_round_index = 0, 
                start_time = 0, 
                end_time = 0,
                spy_question = NULL,
                general_question = NULL,
                is_answers_revealed = FALSE
        `);

        console.log('✅ تم التصفير بنجاح! السيرفر الآن نظيف تماماً.');
    } catch (error) {
        console.error('❌ خطأ أثناء التصفير:', error.message);
    } finally {
        await pool.end();
    }
}

resetGameState();
