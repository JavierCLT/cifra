const DEFAULT_DEV_ADMINS = ['testuser@test.com', 'admin@example.com'];

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function getConfiguredAdminEmails() {
    const fromEnv = String(process.env.FORECAST_ADMIN_USERS || '')
        .split(',')
        .map(item => normalizeEmail(item))
        .filter(Boolean);

    if (fromEnv.length > 0) {
        return new Set(fromEnv);
    }

    if ((process.env.NODE_ENV || 'development') !== 'production') {
        return new Set(DEFAULT_DEV_ADMINS);
    }

    return new Set();
}

async function userHasAdminAccess(pool, userEmail) {
    const normalizedEmail = normalizeEmail(userEmail);
    if (!normalizedEmail) {
        return false;
    }

    const configuredAdmins = getConfiguredAdminEmails();
    if (configuredAdmins.has(normalizedEmail)) {
        return true;
    }

    try {
        const [rows] = await pool.query(
            `SELECT 1
             FROM forecast_permissions
             WHERE user_email = ?
               AND permission_type = 'admin'
             LIMIT 1`,
            [normalizedEmail]
        );
        return rows.length > 0;
    } catch (error) {
        if (error && error.code === 'ER_NO_SUCH_TABLE') {
            return false;
        }
        throw error;
    }
}

async function isVersionLocked(poolOrConnection, versionId) {
    const numericVersionId = Number(versionId);
    if (!Number.isFinite(numericVersionId) || numericVersionId <= 0) {
        return false;
    }

    const [rows] = await poolOrConnection.query(
        `SELECT is_locked
         FROM forecast_versions
         WHERE version_id = ?
         LIMIT 1`,
        [numericVersionId]
    );

    if (!rows.length) {
        return false;
    }

    return !!rows[0].is_locked;
}

async function rejectIfVersionLocked({ poolOrConnection, res, versionId }) {
    const locked = await isVersionLocked(poolOrConnection, versionId);
    if (!locked) {
        return false;
    }

    res.status(423).json({
        success: false,
        error: 'Forecast version is locked and cannot be edited'
    });
    return true;
}

module.exports = {
    normalizeEmail,
    userHasAdminAccess,
    isVersionLocked,
    rejectIfVersionLocked
};
