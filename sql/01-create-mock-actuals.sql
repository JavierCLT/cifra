CREATE DATABASE  IF NOT EXISTS `mock_actuals_database` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `mock_actuals_database`;
-- MySQL dump 10.13  Distrib 8.0.34, for Win64 (x86_64)
--
-- Host: localhost    Database: mock_actuals_database
-- ------------------------------------------------------
-- Server version	8.0.35

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `actuals_data`
--

DROP TABLE IF EXISTS `actuals_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `actuals_data` (
  `actuals_id` int NOT NULL AUTO_INCREMENT,
  `team_id` int NOT NULL,
  `period_date` date NOT NULL,
  `headcount_pg1` int DEFAULT '0',
  `headcount_pg2` int DEFAULT '0',
  `headcount_pg3` int DEFAULT '0',
  `headcount_pg4` int DEFAULT '0',
  `headcount_pg5` int DEFAULT '0',
  `headcount_pg6` int DEFAULT '0',
  `headcount_pg7` int DEFAULT '0',
  `daily_productivity` decimal(4,2) DEFAULT '0.00',
  `mix_product_a` decimal(5,2) DEFAULT '0.00',
  `mix_product_b` decimal(5,2) DEFAULT '0.00',
  `mix_product_c` decimal(5,2) DEFAULT '0.00',
  `mix_product_d` decimal(5,2) DEFAULT '0.00',
  `avg_balance_product_a` decimal(12,2) DEFAULT '0.00',
  `avg_balance_product_b` decimal(12,2) DEFAULT '0.00',
  `avg_balance_product_c` decimal(12,2) DEFAULT '0.00',
  `avg_balance_product_d` decimal(12,2) DEFAULT '0.00',
  `data_source` varchar(50) DEFAULT 'SYSTEM',
  `load_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`actuals_id`),
  UNIQUE KEY `unique_team_period` (`team_id`,`period_date`),
  KEY `idx_period` (`period_date`),
  KEY `idx_team` (`team_id`)
) ENGINE=InnoDB AUTO_INCREMENT=353 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `business_days_calendar`
--

DROP TABLE IF EXISTS `business_days_calendar`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `business_days_calendar` (
  `period_date` date NOT NULL,
  `business_days` int NOT NULL,
  `is_holiday` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`period_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `teams_reference`
--

DROP TABLE IF EXISTS `teams_reference`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teams_reference` (
  `team_id` int NOT NULL,
  `team_name` varchar(50) NOT NULL,
  `team_group` varchar(10) NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`team_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `v_actuals_for_api`
--

DROP TABLE IF EXISTS `v_actuals_for_api`;
/*!50001 DROP VIEW IF EXISTS `v_actuals_for_api`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_actuals_for_api` AS SELECT 
 1 AS `team_id`,
 1 AS `period_date`,
 1 AS `period_string`,
 1 AS `business_days`,
 1 AS `data_type`,
 1 AS `pg1_headcount`,
 1 AS `pg2_headcount`,
 1 AS `pg3_headcount`,
 1 AS `pg4_headcount`,
 1 AS `pg5_headcount`,
 1 AS `pg6_headcount`,
 1 AS `pg7_headcount`,
 1 AS `productivity`,
 1 AS `product_a_mix`,
 1 AS `product_b_mix`,
 1 AS `product_c_mix`,
 1 AS `product_d_mix`,
 1 AS `product_a_abpa`,
 1 AS `product_b_abpa`,
 1 AS `product_c_abpa`,
 1 AS `product_d_abpa`*/;
SET character_set_client = @saved_cs_client;

--
-- Final view structure for view `v_actuals_for_api`
--

/*!50001 DROP VIEW IF EXISTS `v_actuals_for_api`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_actuals_for_api` AS select `a`.`team_id` AS `team_id`,`a`.`period_date` AS `period_date`,date_format(`a`.`period_date`,'%b-%y') AS `period_string`,`bd`.`business_days` AS `business_days`,'actual' AS `data_type`,`a`.`headcount_pg1` AS `pg1_headcount`,`a`.`headcount_pg2` AS `pg2_headcount`,`a`.`headcount_pg3` AS `pg3_headcount`,`a`.`headcount_pg4` AS `pg4_headcount`,`a`.`headcount_pg5` AS `pg5_headcount`,`a`.`headcount_pg6` AS `pg6_headcount`,`a`.`headcount_pg7` AS `pg7_headcount`,`a`.`daily_productivity` AS `productivity`,(`a`.`mix_product_a` / 100) AS `product_a_mix`,(`a`.`mix_product_b` / 100) AS `product_b_mix`,(`a`.`mix_product_c` / 100) AS `product_c_mix`,(`a`.`mix_product_d` / 100) AS `product_d_mix`,`a`.`avg_balance_product_a` AS `product_a_abpa`,`a`.`avg_balance_product_b` AS `product_b_abpa`,`a`.`avg_balance_product_c` AS `product_c_abpa`,`a`.`avg_balance_product_d` AS `product_d_abpa` from (`actuals_data` `a` join `business_days_calendar` `bd` on((`a`.`period_date` = `bd`.`period_date`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-06-11 14:35:31
