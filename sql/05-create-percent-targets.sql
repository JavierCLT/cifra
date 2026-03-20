CREATE TABLE IF NOT EXISTS incentive_percent_targets (
    team_id INT NOT NULL,
    version_id INT NOT NULL DEFAULT 0,
    qs_percent DECIMAL(6,4) NOT NULL DEFAULT 1.0800,
    bg_percent DECIMAL(6,4) NOT NULL DEFAULT 1.0800,
    ar_percent DECIMAL(6,4) NOT NULL DEFAULT 1.0800,
    updated_by VARCHAR(255) DEFAULT 'system',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, version_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
