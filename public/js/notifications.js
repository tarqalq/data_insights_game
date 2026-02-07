// نظام الإشعارات Toast
(function () {
    'use strict';

    // إنشاء حاوية الإشعارات
    function createToastContainer() {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    // إنشاء إشعار
    function createToast(message, type = 'info', duration = 3000) {
        const container = createToastContainer();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} toast-enter`;

        // الأيقونات حسب النوع
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="إغلاق">×</button>
        `;

        container.appendChild(toast);

        // تفعيل الأنيميشن
        setTimeout(() => toast.classList.add('toast-show'), 10);

        // زر الإغلاق
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => removeToast(toast));

        // الإغلاق التلقائي
        if (duration > 0) {
            setTimeout(() => removeToast(toast), duration);
        }

        return toast;
    }

    // إزالة إشعار
    function removeToast(toast) {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-exit');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    // تصدير الدوال
    window.Toast = {
        success: (message, duration) => createToast(message, 'success', duration),
        error: (message, duration) => createToast(message, 'error', duration),
        warning: (message, duration) => createToast(message, 'warning', duration),
        info: (message, duration) => createToast(message, 'info', duration),
        show: createToast
    };

})();

// إضافة الستايلات للإشعارات
(function () {
    const style = document.createElement('style');
    style.textContent = `
        .toast-container {
            position: fixed;
            top: 100px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 400px;
        }
        
        .toast {
            background: var(--card-bg);
            border: 2px solid var(--card-border);
            border-radius: 12px;
            padding: 15px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: var(--shadow-lg);
            backdrop-filter: blur(10px);
            opacity: 0;
            transform: translateX(400px);
            transition: all 0.3s ease;
        }
        
        .toast-show {
            opacity: 1;
            transform: translateX(0);
        }
        
        .toast-exit {
            opacity: 0;
            transform: translateX(400px);
        }
        
        .toast-icon {
            font-size: 1.5rem;
            flex-shrink: 0;
        }
        
        .toast-message {
            flex-grow: 1;
            color: var(--text-primary);
            font-weight: 600;
            font-size: 1rem;
        }
        
        .toast-close {
            background: none;
            border: none;
            color: var(--text-muted);
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s;
        }
        
        .toast-close:hover {
            background: rgba(255, 255, 255, 0.1);
            color: var(--text-primary);
        }
        
        .toast-success {
            border-color: var(--success-border);
            background: var(--success-bg);
        }
        
        .toast-error {
            border-color: var(--error-border);
            background: var(--error-bg);
        }
        
        .toast-warning {
            border-color: var(--warning-border);
            background: var(--warning-bg);
        }
        
        .toast-info {
            border-color: var(--card-border);
        }
        
        @media (max-width: 480px) {
            .toast-container {
                right: 10px;
                left: 10px;
                max-width: none;
            }
        }
    `;
    document.head.appendChild(style);
})();
