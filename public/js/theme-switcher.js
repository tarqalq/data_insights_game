// نظام تبديل الثيم
(function () {
    'use strict';

    // الحصول على الثيم المحفوظ أو استخدام الداكن كافتراضي
    const savedTheme = localStorage.getItem('theme') || 'dark';

    // تطبيق الثيم فوراً لتجنب الوميض
    document.documentElement.setAttribute('data-theme', savedTheme);

    // انتظار تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function () {
        initThemeToggle();
    });

    function initThemeToggle() {
        // إنشاء زر التبديل إذا لم يكن موجوداً
        let toggleBtn = document.getElementById('themeToggle');

        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'themeToggle';
            toggleBtn.className = 'theme-toggle';
            toggleBtn.setAttribute('aria-label', 'تبديل الوضع الفاتح/الداكن');
            toggleBtn.setAttribute('title', 'تبديل الوضع الفاتح/الداكن');
            document.body.appendChild(toggleBtn);
        }

        // تحديث أيقونة الزر
        updateToggleIcon(toggleBtn);

        // إضافة مستمع للنقر
        toggleBtn.addEventListener('click', function () {
            toggleTheme(toggleBtn);
        });

        // دعم اختصار لوحة المفاتيح (Ctrl/Cmd + Shift + T)
        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                toggleTheme(toggleBtn);
            }
        });
    }

    function toggleTheme(button) {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        // إضافة كلاس الأنيميشن
        button.classList.add('switching');

        // تطبيق الثيم الجديد
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        // تحديث الأيقونة
        updateToggleIcon(button);

        // إزالة كلاس الأنيميشن بعد انتهائها
        setTimeout(() => {
            button.classList.remove('switching');
        }, 600);

        // إرسال حدث مخصص للمكونات الأخرى
        window.dispatchEvent(new CustomEvent('themeChanged', {
            detail: { theme: newTheme }
        }));
    }

    function updateToggleIcon(button) {
        const theme = document.documentElement.getAttribute('data-theme');
        button.innerHTML = theme === 'dark' ? '☀️' : '🌙';
    }

    // تصدير الدوال للاستخدام الخارجي
    window.ThemeManager = {
        getCurrentTheme: () => document.documentElement.getAttribute('data-theme'),
        setTheme: (theme) => {
            if (theme === 'light' || theme === 'dark') {
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
                const button = document.getElementById('themeToggle');
                if (button) updateToggleIcon(button);
            }
        }
    };
})();
