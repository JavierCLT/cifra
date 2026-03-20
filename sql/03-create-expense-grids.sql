USE `investment_forecasting_forecast`;

DROP TABLE IF EXISTS `incentive_expense_grids`;
CREATE TABLE `incentive_expense_grids` (
  `expense_grid_id` int NOT NULL AUTO_INCREMENT,
  `team_id` int NOT NULL,
  `version_id` int NOT NULL DEFAULT '0',
  `range_min` decimal(6,4) NOT NULL,
  `range_max` decimal(6,4) DEFAULT NULL,
  `qs_multiplier` decimal(12,4) DEFAULT NULL,
  `bg_multiplier` decimal(12,6) DEFAULT NULL,
  `ar_multiplier` decimal(12,6) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `updated_by` varchar(100) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`expense_grid_id`),
  KEY `idx_expense_grid_team_version` (`team_id`,`version_id`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
