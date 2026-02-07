require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function updateDatabase() {
    try {
        console.log('🔄 جاري تحديث قاعدة البيانات...');

        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // تنظيف الـ comments الخاصة بـ psql (\c, \dt etc) لأن الـ driver لا يفهمها
        const cleanedSchema = schema
            .split('\n')
            .filter(line => !line.trim().startsWith('\\'))
            .join('\n');

        if (cleanedSchema.trim()) {
            await pool.query(cleanedSchema);
        }

        console.log('✅ تم تحديث الجداول بنجاح!');

        // عرض الجداول للتأكد
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);

        console.log('📊 الجداول الحالية:');
        result.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });

    } catch (error) {
        console.error('❌ خطأ في التحديث:', error.message);
    } finally {
        await pool.end();
    }
}

updateDatabase();
