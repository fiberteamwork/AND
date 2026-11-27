(function () {
    'use strict';

    const SESSION_LABEL = 'eastRegionalSession';
    let authClient;
    let activeAccount = null;
    let editingAccountId = null;
    let editingOwnAccount = false;
    window.dashboardSupabaseClient = null;
    window.dashboardActiveAccount = null;
    let resolveReady;
    const ready = new Promise(resolve => {
        resolveReady = resolve;
    });
    window.dashboardAuthReady = ready;

    const byId = id => document.getElementById(id);

    let mapLoadPromise = null;
    function loadMapApplication() {
        if (mapLoadPromise) return mapLoadPromise;

        const scripts = [
            'resources/qgis2web_expressions.js',
            'resources/xlsx-lite.js',
            'resources/functions.js',
            'resources/ol.js',
            'resources/ol-layerswitcher.js',
            'resources/photon-geocoder-autocomplete.min.js',
            'resources/olms.js',
            'layers/SIDOARJO_1.js',
            'layers/Denpasar_1.js',
            'layers/surabaya_2.js',
            'styles/SIDOARJO_1_style.js',
            'styles/surabaya_2_style.js',
            'layers/layers.js?v=20261117.18',
            'resources/Autolinker.min.js',
            'resources/qgis2web.js',
            'https://cdn.jsdelivr.net/npm/chart.js',
            'resources/customer-map.js?v=20261127.1'
        ];

        const loadingMessage = byId('map-loading-message');
        if (loadingMessage) loadingMessage.textContent = 'Memuat komponen peta...';
        mapLoadPromise = Promise.all(scripts.map(src => new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.async = false;
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Gagal memuat komponen peta: ' + src));
            document.body.appendChild(script);
        }))).catch(error => {
            console.error('[MAP] Pemuatan peta gagal:', error);
            if (loadingMessage) {
                loadingMessage.textContent = 'Peta gagal dimuat. Periksa koneksi lalu muat ulang halaman.';
            }
            return null;
        });
        return mapLoadPromise;
    }

    function setMessage(id, message) {
        const element = byId(id);
        if (element) element.textContent = message;
    }

    function getErrorMessage(error, fallback) {
        return error && error.message ? error.message : fallback;
    }

    async function accountApi(action, values) {
        const { data, error } = await authClient.functions.invoke('account-api', {
            body: { action, ...(values || {}) }
        });

        if (error) {
            let responseData = data;
            if (!responseData && error.context instanceof Response) {
                responseData = await error.context.clone().json().catch(() => null);
            }
            throw new Error(responseData && responseData.error
                ? responseData.error
                : error.message || 'Layanan akun tidak dapat dihubungi.');
        }
        if (!data || data.error) {
            throw new Error(data && data.error ? data.error : 'Respons layanan akun tidak valid.');
        }
        return data;
    }

    function loginAccount(account) {
        activeAccount = { username: account.username, role: account.role };
        window.dashboardSupabaseClient = authClient;
        window.dashboardActiveAccount = activeAccount;
        sessionStorage.setItem(SESSION_LABEL, account.username);
        byId('auth-session-label').textContent =
            `${activeAccount.username} ${activeAccount.role === 'admin' ? 'Admin' : 'User'}`;
        byId('auth-manage-users').hidden = activeAccount.role !== 'admin';
        byId('auth-project-running').hidden = activeAccount.role !== 'admin';
        setProfileMenuOpen(false);
        byId('auth-gate').hidden = true;
        document.body.classList.add('auth-ready');
        const mapLoading = byId('map-loading');
        if (mapLoading) {
            mapLoading.hidden = window.customerMapReady === true;
        }
        resolveReady(activeAccount);
        loadMapApplication();
    }

    function showLogin() {
        activeAccount = null;
        window.dashboardSupabaseClient = null;
        window.dashboardActiveAccount = null;
        byId('auth-project-running').hidden = true;
        setProfileMenuOpen(false);
        sessionStorage.removeItem(SESSION_LABEL);
        document.body.classList.remove('auth-ready');
        byId('auth-gate').hidden = false;
        byId('auth-setup-view').hidden = true;
        byId('auth-login-view').hidden = false;
        byId('user-management-modal').hidden = true;
        byId('change-password-modal').hidden = true;
        byId('project-running-modal').hidden = true;
        byId('project-running-toast').hidden = true;
        byId('auth-login-username').focus();
    }

    function showSetup() {
        byId('auth-subtitle').textContent = 'Buat admin pertama untuk digunakan bersama di semua perangkat.';
        byId('auth-setup-view').hidden = false;
        byId('auth-login-view').hidden = true;
        byId('auth-setup-username').focus();
    }

    function renderAccounts(accounts) {
        const list = byId('auth-account-list');
        list.replaceChildren();
        if (!accounts.length) {
            const empty = document.createElement('li');
            empty.textContent = 'Belum ada akun.';
            list.appendChild(empty);
            return;
        }

        accounts
            .sort((left, right) => left.username.localeCompare(right.username))
            .forEach(account => {
                const item = document.createElement('li');
                const info = document.createElement('div');
                info.className = 'auth-account-info';
                const name = document.createElement('strong');
                const role = document.createElement('strong');
                const actions = document.createElement('div');
                actions.className = 'auth-account-actions';
                const isCurrentAccount = activeAccount &&
                    account.username.toLowerCase() === activeAccount.username.toLowerCase();
                name.textContent = account.username;
                role.textContent = account.role === 'admin' ? 'Admin' : 'User';
                const details = document.createElement('small');
                details.textContent = isCurrentAccount ? `${role.textContent} · akun Anda` : role.textContent;
                const edit = document.createElement('button');
                edit.type = 'button';
                edit.dataset.accountAction = 'edit';
                edit.textContent = 'Ubah';
                edit.addEventListener('click', () => beginAccountEdit(account));
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.dataset.accountAction = 'delete';
                remove.textContent = 'Hapus';
                remove.disabled = isCurrentAccount;
                if (isCurrentAccount) remove.title = 'Akun yang sedang digunakan tidak dapat dihapus.';
                remove.addEventListener('click', () => deleteManagedAccount(account, remove));
                info.append(name, details);
                actions.append(edit, remove);
                item.append(info, actions);
                list.appendChild(item);
            });
    }

    function resetAccountForm() {
        editingAccountId = null;
        editingOwnAccount = false;
        byId('admin-user-form').reset();
        byId('admin-password-label').textContent = 'Password (minimal 8 karakter)';
        byId('admin-new-password').required = true;
        byId('admin-password-help').textContent = 'Buat password untuk akun ini. Password minimal 8 karakter.';
        byId('admin-new-role').disabled = false;
        byId('admin-user-submit').textContent = 'Tambah Akun';
        byId('admin-user-cancel-edit').hidden = true;
    }

    function beginAccountEdit(account) {
        editingAccountId = account.user_id;
        editingOwnAccount = Boolean(activeAccount &&
            account.username.toLowerCase() === activeAccount.username.toLowerCase());
        byId('admin-new-username').value = account.username;
        byId('admin-new-password').value = '';
        byId('admin-new-password').required = false;
        byId('admin-new-role').value = account.role;
        byId('admin-new-role').disabled = editingOwnAccount;
        byId('admin-password-label').textContent = 'Password baru (opsional)';
        byId('admin-password-help').textContent = 'Kosongkan jika password tidak ingin diubah.';
        byId('admin-user-submit').textContent = 'Simpan Perubahan';
        byId('admin-user-cancel-edit').hidden = false;
        setMessage('admin-user-message', '');
        byId('admin-new-username').focus();
    }

    function setProfileMenuOpen(open) {
        const toggle = byId('auth-profile-toggle');
        const dropdown = byId('auth-profile-dropdown');
        if (!toggle || !dropdown) return;
        toggle.setAttribute('aria-expanded', String(open));
        dropdown.hidden = !open;
    }

    async function refreshAccounts() {
        const result = await accountApi('list');
        renderAccounts(result.accounts);
    }

    async function signIn(username, password) {
        if (!authClient || !authClient.auth) {
            throw new Error('Layanan autentikasi belum siap. Tunggu sebentar lalu coba lagi.');
        }
        const email = `${username.trim().toLowerCase()}@accounts.eastregional.invalid`;
        const { error } = await authClient.auth.signInWithPassword({ email, password });
        if (error) throw new Error('Username atau password salah.');
        const result = await accountApi('me');
        loginAccount(result.account);
    }

    function bindEvents() {
        byId('auth-profile-toggle').addEventListener('click', () => {
            const isOpen = byId('auth-profile-toggle').getAttribute('aria-expanded') === 'true';
            setProfileMenuOpen(!isOpen);
        });
        document.addEventListener('click', event => {
            if (!byId('auth-profile-menu').contains(event.target)) {
                setProfileMenuOpen(false);
            }
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && byId('auth-profile-toggle').getAttribute('aria-expanded') === 'true') {
                setProfileMenuOpen(false);
                byId('auth-profile-toggle').focus();
            }
        });

        byId('auth-setup-form').addEventListener('submit', async event => {
            event.preventDefault();
            const button = event.currentTarget.querySelector('button[type="submit"]');
            button.disabled = true;
            setMessage('auth-setup-message', '');
            try {
                const username = byId('auth-setup-username').value;
                const password = byId('auth-setup-password').value;
                const setupKey = byId('auth-setup-key').value;
                await accountApi('setup', { username, password, setupKey });
                await signIn(username, password);
            } catch (error) {
                const message = getErrorMessage(error, 'Admin pertama gagal dibuat.');
                if (message.includes('sudah dibuat')) {
                    byId('auth-setup-view').hidden = true;
                    byId('auth-login-view').hidden = false;
                    setMessage('auth-login-message', message);
                    byId('auth-login-username').focus();
                } else {
                    setMessage('auth-setup-message', message);
                }
            } finally {
                button.disabled = false;
            }
        });

        byId('auth-login-form').addEventListener('submit', async event => {
            event.preventDefault();
            const button = byId('auth-login-button');
            button.disabled = true;
            setMessage('auth-login-message', '');
            try {
                await signIn(byId('auth-login-username').value, byId('auth-login-password').value);
            } catch (error) {
                setMessage('auth-login-message', getErrorMessage(error, 'Login gagal.'));
            } finally {
                button.disabled = false;
            }
        });

        byId('auth-logout').addEventListener('click', async () => {
            setProfileMenuOpen(false);
            const { error } = await authClient.auth.signOut();
            if (error) {
                console.error('[AUTH] Logout gagal:', error);
                setMessage('auth-login-message', 'Logout gagal. Silakan coba lagi.');
                return;
            }
            showLogin();
        });

        byId('auth-change-password').addEventListener('click', () => {
            setProfileMenuOpen(false);
            setMessage('change-password-message', '');
            byId('change-password-form').reset();
            byId('change-password-modal').hidden = false;
            byId('auth-current-password').focus();
        });
        byId('change-password-close').addEventListener('click', () => {
            byId('change-password-modal').hidden = true;
        });
        byId('change-password-modal').addEventListener('click', event => {
            if (event.target === byId('change-password-modal')) {
                byId('change-password-modal').hidden = true;
            }
        });
        byId('change-password-form').addEventListener('submit', async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const button = byId('change-password-submit');
            const newPassword = byId('auth-new-password').value;
            button.disabled = true;
            setMessage('change-password-message', '');
            try {
                if (newPassword !== byId('auth-confirm-password').value) {
                    throw new Error('Konfirmasi password baru tidak sama.');
                }
                await accountApi('change-password', {
                    currentPassword: byId('auth-current-password').value,
                    newPassword
                });
                form.reset();
                setMessage('change-password-message', 'Password berhasil diubah.');
            } catch (error) {
                setMessage('change-password-message', getErrorMessage(error, 'Password gagal diubah.'));
            } finally {
                button.disabled = false;
            }
        });

        byId('auth-manage-users').addEventListener('click', async () => {
            setProfileMenuOpen(false);
            if (activeAccount && activeAccount.role === 'admin') {
                setMessage('admin-user-message', '');
                try {
                    await refreshAccounts();
                    byId('user-management-modal').hidden = false;
                    byId('admin-new-username').focus();
                } catch (error) {
                    setMessage('admin-user-message', getErrorMessage(error, 'Daftar akun gagal dimuat.'));
                }
            }
        });
        byId('user-management-close').addEventListener('click', () => {
            byId('user-management-modal').hidden = true;
        });
        byId('user-management-modal').addEventListener('click', event => {
            if (event.target === byId('user-management-modal')) {
                byId('user-management-modal').hidden = true;
            }
        });

        byId('admin-user-form').addEventListener('submit', async event => {
            event.preventDefault();
            const button = byId('admin-user-submit');
            const wasEditing = Boolean(editingAccountId);
            const wasEditingOwnAccount = editingOwnAccount;
            const username = byId('admin-new-username').value;
            const role = byId('admin-new-role').value;
            const password = byId('admin-new-password').value;
            button.disabled = true;
            setMessage('admin-user-message', '');
            try {
                if (wasEditing) {
                    await accountApi('update', {
                        userId: editingAccountId,
                        username,
                        password,
                        role
                    });
                    if (wasEditingOwnAccount && activeAccount) {
                        activeAccount.username = username.trim();
                        sessionStorage.setItem(SESSION_LABEL, activeAccount.username);
                        byId('auth-session-label').textContent =
                            `${activeAccount.username} ${activeAccount.role === 'admin' ? 'Admin' : 'User'}`;
                    }
                    resetAccountForm();
                    setMessage('admin-user-message', 'Akun bersama berhasil diperbarui.');
                } else {
                    await accountApi('create', { username, password, role });
                    resetAccountForm();
                    setMessage('admin-user-message', 'Akun bersama berhasil ditambahkan.');
                }
            } catch (error) {
                setMessage(
                    'admin-user-message',
                    getErrorMessage(error, wasEditing ? 'Akun gagal diperbarui.' : 'Akun gagal ditambahkan.')
                );
                button.disabled = false;
                return;
            }

            try {
                await refreshAccounts();
            } catch (error) {
                console.error('[AUTH] Perubahan berhasil, tetapi daftar akun gagal dimuat:', error);
                setMessage(
                    'admin-user-message',
                    `Perubahan berhasil, tetapi daftar akun gagal dimuat: ${getErrorMessage(error, 'coba muat ulang daftar.')}`
                );
            }
            button.disabled = false;
        });
        byId('admin-user-cancel-edit').addEventListener('click', resetAccountForm);
    }

    async function deleteManagedAccount(account, button) {
        if (!activeAccount || activeAccount.role !== 'admin') return;
        if (!window.confirm(`Hapus akun "${account.username}"? Tindakan ini tidak dapat dibatalkan.`)) return;

        button.disabled = true;
        setMessage('admin-user-message', '');
        try {
            await accountApi('delete', { userId: account.user_id });
            if (editingAccountId === account.user_id) resetAccountForm();
        } catch (error) {
            setMessage('admin-user-message', getErrorMessage(error, 'Akun gagal dihapus.'));
            button.disabled = false;
            return;
        }

        try {
            await refreshAccounts();
            setMessage('admin-user-message', `Akun "${account.username}" berhasil dihapus.`);
        } catch (error) {
            console.error('[AUTH] Akun berhasil dihapus, tetapi daftar gagal dimuat:', error);
            setMessage(
                'admin-user-message',
                `Akun berhasil dihapus, tetapi daftar gagal dimuat: ${getErrorMessage(error, 'coba muat ulang daftar.')}`
            );
        }
        button.disabled = false;
    }

    function loadSupabaseLibrary() {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/@supabase/supabase-js@2.119.2/dist/umd/supabase.js';
            script.onload = () => {
                if (window.supabase && typeof window.supabase.createClient === 'function') {
                    resolve();
                } else {
                    reject(new Error('Library Supabase tidak menyediakan createClient.'));
                }
            };
            script.onerror = () => reject(new Error('Library Supabase gagal dimuat dari CDN.'));
            document.head.appendChild(script);
        });
    }

    async function initialize() {
        bindEvents();
        const config = window.EAST_REGIONAL_SUPABASE;
        if (!config || !config.url || !config.anonKey ||
            config.url.includes('YOUR-PROJECT') || config.anonKey.includes('YOUR-ANON-KEY')) {
            const message = 'Backend akun belum dikonfigurasi. Isi URL dan anon key Supabase di resources/supabase-config.js.';
            byId('auth-subtitle').textContent = message;
            setMessage('auth-login-message', message);
            byId('auth-login-view').hidden = false;
            console.error('[AUTH] Konfigurasi Supabase belum diisi.');
            return;
        }

        try {
            await loadSupabaseLibrary();
            const client = window.supabase.createClient(config.url, config.anonKey, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
            });
            if (!client || !client.auth || !client.functions) {
                throw new Error('Client Supabase tidak valid. Periksa pemuatan library lalu muat ulang halaman.');
            }
            authClient = client;
            byId('auth-login-button').disabled = false;
            const { data: { session }, error } = await authClient.auth.getSession();
            if (error) throw error;
            if (session) {
                try {
                    const result = await accountApi('me');
                    loginAccount(result.account);
                    return;
                } catch (error) {
                    await authClient.auth.signOut();
                    console.warn('[AUTH] Sesi sebelumnya tidak berlaku:', error);
                }
            }

            const status = await accountApi('status');
            if (status.hasAccounts) {
                byId('auth-login-view').hidden = false;
            } else {
                showSetup();
            }
        } catch (error) {
            const message = getErrorMessage(error, 'Layanan akun gagal dimuat.');
            byId('auth-subtitle').textContent = message;
            setMessage('auth-login-message', message);
            byId('auth-login-view').hidden = false;
            console.error('[AUTH] Inisialisasi autentikasi gagal:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
