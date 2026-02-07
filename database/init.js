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

async function initDatabase() {
    try {
        console.log('🔄 جاري تهيئة قاعدة البيانات...');
        
        // قراءة ملف schema.sql
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // تنفيذ الأوامر (نزيل أوامر psql الخاصة)
        // تنفيذ الأوامر (دفعة واحدة لتجنب مشاكل الفواصل المنقوطة داخل الدوال)
        // نقوم فقط بإزالة أوامر psql التي تبدأ بـ backslash
        const cleanedSchema = schema
            .split('\n')
            .filter(line => !line.trim().startsWith('\\'))
            .join('\n');

        if (cleanedSchema.trim()) {
            await pool.query(cleanedSchema);
        }
        
        console.log('✅ تم تهيئة قاعدة البيانات بنجاح!');
        
        // عرض الجداول الموجودة
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        console.log('📊 الجداول الموجودة:');
        result.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// تشغيل التهيئة
initDatabase();
