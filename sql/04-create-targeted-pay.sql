USE `investment_forecasting_forecast`;

DROP TABLE IF EXISTS `incentive_targeted_pay`;
CREATE TABLE `incentive_targeted_pay` (
  `targeted_pay_id` int NOT NULL AUTO_INCREMENT,
  `team_id` int NOT NULL,
  `fiscal_year` int NOT NULL,
  `targeted_pay` decimal(12,2) NOT NULL DEFAULT '40000.00',
  `updated_by` varchar(100) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`targeted_pay_id`),
  UNIQUE KEY `uniq_team_year` (`team_id`,`fiscal_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
