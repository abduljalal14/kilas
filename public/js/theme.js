/**
 * Theme Manager
 * Handles light/dark theme switching and localStorage persistence
 */

class ThemeManager {
    constructor() {
        this.STORAGE_KEY = 'wa-gateway-theme';
        this.THEME_LIGHT = 'light';
        this.THEME_DARK = 'dark';

        // Initialize theme on load
        this.init();
    }

    init() {
        // Load saved theme or default to light
        const savedTheme = this.getSavedTheme();
        this.applyTheme(savedTheme);

        // Setup toggle button listener
        this.setupToggleButton();
    }

    getSavedTheme() {
        return localStorage.getItem(this.STORAGE_KEY) || this.THEME_LIGHT;
    }

    saveTheme(theme) {
        localStorage.setItem(this.STORAGE_KEY, theme);
    }

    getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') || this.THEME_LIGHT;
    }

    applyTheme(theme) {
        // Remove existing theme
        document.documentElement.removeAttribute('data-theme');

        // Apply new theme
        if (theme === this.THEME_DARK) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }

        // Update toggle button icon if it exists
        this.updateToggleIcon(theme);
    }

    toggleTheme() {
        const currentTheme = this.getCurrentTheme();
        const newTheme = currentTheme === this.THEME_LIGHT ? this.THEME_DARK : this.THEME_LIGHT;

        this.applyTheme(newTheme);
        this.saveTheme(newTheme);

        // Dispatch custom event for other components
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: newTheme } }));
    }

    updateToggleIcon(theme) {
        const toggleBtn = document.getElementById('themeToggle');
        if (!toggleBtn) return;

        const icon = toggleBtn.querySelector('i');
        if (!icon) return;

        // Update icon based on theme
        if (theme === this.THEME_DARK) {
            icon.className = 'fas fa-sun';
            toggleBtn.setAttribute('title', 'Switch to Light Mode');
        } else {
            icon.className = 'fas fa-moon';
            toggleBtn.setAttribute('title', 'Switch to Dark Mode');
        }
    }

    setupToggleButton() {
        const toggleBtn = document.getElementById('themeToggle');
        if (!toggleBtn) {
            console.warn('Theme toggle button not found');
            return;
        }

        toggleBtn.addEventListener('click', () => this.toggleTheme());
    }
}

// Initialize theme manager when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.themeManager = new ThemeManager();
    });
} else {
    window.themeManager = new ThemeManager();
}
