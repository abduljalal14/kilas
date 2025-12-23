// Toast Notification System
const Toast = {
    container: null,

    init: function () {
        // Create toast container if not exists
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
            `;
            document.body.appendChild(this.container);
        }
    },

    show: function (message, type = 'info', duration = 3000) {
        this.init();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Icon based on type
        const icons = {
            success: '<i class="fas fa-check-circle"></i>',
            error: '<i class="fas fa-exclamation-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>',
            info: '<i class="fas fa-info-circle"></i>'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-message">${message}</div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        toast.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 18px;
            background: var(--bg-card);
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
            border-left: 4px solid;
            min-width: 300px;
            max-width: 400px;
            pointer-events: auto;
            animation: toastSlideIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            opacity: 0;
            transform: translateX(400px);
        `;

        // Type-specific colors
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        toast.style.borderLeftColor = colors[type] || colors.info;

        // Add to container
        this.container.appendChild(toast);

        // Trigger animation
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);

        // Auto remove
        if (duration > 0) {
            setTimeout(() => {
                this.remove(toast);
            }, duration);
        }

        return toast;
    },

    remove: function (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(400px)';
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 300);
    },

    success: function (message, duration = 3000) {
        return this.show(message, 'success', duration);
    },

    error: function (message, duration = 4000) {
        return this.show(message, 'error', duration);
    },

    warning: function (message, duration = 3500) {
        return this.show(message, 'warning', duration);
    },

    info: function (message, duration = 3000) {
        return this.show(message, 'info', duration);
    }
};

// Make it globally available
if (typeof window !== 'undefined') {
    window.Toast = Toast;
}
