CREATE DATABASE  IF NOT EXISTS `investment_forecasting_forecast` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `investment_forecasting_forecast`;
-- MySQL dump 10.13  Distrib 8.0.34, for Win64 (x86_64)
--
-- Host: localhost    Database: investment_forecasting_forecast
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
-- Table structure for table `forecast_audit_log`
--

DROP TABLE IF EXISTS `forecast_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forecast_audit_log` (
  `audit_id` int NOT NULL AUTO_INCREMENT,
  `forecast_id` int NOT NULL,
  `field_name` varchar(50) NOT NULL,
  `old_value` varchar(100) DEFAULT NULL,
  `new_value` varchar(100) DEFAULT NULL,
  `changed_by` varchar(100) DEFAULT NULL,
  `changed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `change_reason` text,
  PRIMARY KEY (`audit_id`),
  KEY `idx_forecast_id` (`forecast_id`),
  KEY `idx_changed_at` (`changed_at`),
  CONSTRAINT `forecast_audit_log_ibfk_1` FOREIGN KEY (`forecast_id`) REFERENCES `forecast_data` (`forecast_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `forecast_data`
--

DROP TABLE IF EXISTS `forecast_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forecast_data` (
  `forecast_id` int NOT NULL AUTO_INCREMENT,
  `team_id` int NOT NULL,
  `period_date` date NOT NULL,
  `version_id` int NOT NULL,
  `pg1_headcount` int DEFAULT '0',
  `pg2_headcount` int DEFAULT '0',
  `pg3_headcount` int DEFAULT '0',
  `pg4_headcount` int DEFAULT '0',
  `pg5_headcount` int DEFAULT '0',
  `pg6_headcount` int DEFAULT '0',
  `pg7_headcount` int DEFAULT '0',
  `productivity` decimal(4,2) DEFAULT '0.00',
  `product_a_mix` decimal(5,4) DEFAULT '0.0000',
  `product_b_mix` decimal(5,4) DEFAULT '0.0000',
  `product_c_mix` decimal(5,4) DEFAULT '0.0000',
  `product_d_mix` decimal(5,4) DEFAULT '0.0000',
  `product_a_abpa` decimal(12,2) DEFAULT '0.00',
  `product_b_abpa` decimal(12,2) DEFAULT '0.00',
  `product_c_abpa` decimal(12,2) DEFAULT '0.00',
  `product_d_abpa` decimal(12,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`forecast_id`),
  UNIQUE KEY `unique_team_period_version` (`team_id`,`period_date`,`version_id`),
  KEY `version_id` (`version_id`),
  KEY `idx_period_date` (`period_date`),
  KEY `idx_team_version` (`team_id`,`version_id`),
  CONSTRAINT `forecast_data_ibfk_1` FOREIGN KEY (`version_id`) REFERENCES `forecast_versions` (`version_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2686 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `forecast_locks`
--

DROP TABLE IF EXISTS `forecast_locks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forecast_locks` (
  `lock_id` int NOT NULL AUTO_INCREMENT,
  `version_id` int NOT NULL,
  `team_id` int DEFAULT NULL,
  `period_start` date DEFAULT NULL,
  `period_end` date DEFAULT NULL,
  `locked_by` varchar(100) DEFAULT NULL,
  `locked_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `lock_reason` text,
  PRIMARY KEY (`lock_id`),
  KEY `idx_version_team` (`version_id`,`team_id`),
  CONSTRAINT `forecast_locks_ibfk_1` FOREIGN KEY (`version_id`) REFERENCES `forecast_versions` (`version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `forecast_notes`
--

DROP TABLE IF EXISTS `forecast_notes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forecast_notes` (
  `note_id` int NOT NULL AUTO_INCREMENT,
  `version_id` int NOT NULL,
  `team_id` int DEFAULT NULL,
  `period_date` date DEFAULT NULL,
  `note_type` enum('assumption','adjustment','review','general') DEFAULT 'general',
  `note_text` text NOT NULL,
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`note_id`),
  KEY `idx_version_team_period` (`version_id`,`team_id`,`period_date`),
  CONSTRAINT `forecast_notes_ibfk_1` FOREIGN KEY (`version_id`) REFERENCES `forecast_versions` (`version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `forecast_permissions`
--

DROP TABLE IF EXISTS `forecast_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forecast_permissions` (
  `permission_id` int NOT NULL AUTO_INCREMENT,
  `user_email` varchar(100) NOT NULL,
  `team_id` int DEFAULT NULL,
  `permission_type` enum('read','write','admin') DEFAULT 'read',
  `granted_by` varchar(100) DEFAULT NULL,
  `granted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`permission_id`),
  KEY `idx_user_email` (`user_email`),
  KEY `idx_team_id` (`team_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `forecast_versions`
--

DROP TABLE IF EXISTS `forecast_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forecast_versions` (
  `version_id` int NOT NULL AUTO_INCREMENT,
  `version_name` varchar(50) NOT NULL,
  `forecast_start_date` date NOT NULL,
  `description` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `is_locked` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`version_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `v_forecast_metrics`
--

DROP TABLE IF EXISTS `v_forecast_metrics`;
/*!50001 DROP VIEW IF EXISTS `v_forecast_metrics`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_forecast_metrics` AS SELECT 
 1 AS `forecast_id`,
 1 AS `team_id`,
 1 AS `period_date`,
 1 AS `version_id`,
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
 1 AS `product_d_abpa`,
 1 AS `created_at`,
 1 AS `updated_at`,
 1 AS `updated_by`,
 1 AS `version_name`,
 1 AS `forecast_start_date`,
 1 AS `version_locked`,
 1 AS `period_string`,
 1 AS `year`,
 1 AS `month`,
 1 AS `quarter`*/;
SET character_set_client = @saved_cs_client;

--
-- Final view structure for view `v_forecast_metrics`
--

/*!50001 DROP VIEW IF EXISTS `v_forecast_metrics`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_forecast_metrics` AS select `fd`.`forecast_id` AS `forecast_id`,`fd`.`team_id` AS `team_id`,`fd`.`period_date` AS `period_date`,`fd`.`version_id` AS `version_id`,`fd`.`pg1_headcount` AS `pg1_headcount`,`fd`.`pg2_headcount` AS `pg2_headcount`,`fd`.`pg3_headcount` AS `pg3_headcount`,`fd`.`pg4_headcount` AS `pg4_headcount`,`fd`.`pg5_headcount` AS `pg5_headcount`,`fd`.`pg6_headcount` AS `pg6_headcount`,`fd`.`pg7_headcount` AS `pg7_headcount`,`fd`.`productivity` AS `productivity`,`fd`.`product_a_mix` AS `product_a_mix`,`fd`.`product_b_mix` AS `product_b_mix`,`fd`.`product_c_mix` AS `product_c_mix`,`fd`.`product_d_mix` AS `product_d_mix`,`fd`.`product_a_abpa` AS `product_a_abpa`,`fd`.`product_b_abpa` AS `product_b_abpa`,`fd`.`product_c_abpa` AS `product_c_abpa`,`fd`.`product_d_abpa` AS `product_d_abpa`,`fd`.`created_at` AS `created_at`,`fd`.`updated_at` AS `updated_at`,`fd`.`updated_by` AS `updated_by`,`fv`.`version_name` AS `version_name`,`fv`.`forecast_start_date` AS `forecast_start_date`,`fv`.`is_locked` AS `version_locked`,date_format(`fd`.`period_date`,'%b-%y') AS `period_string`,year(`fd`.`period_date`) AS `year`,month(`fd`.`period_date`) AS `month`,quarter(`fd`.`period_date`) AS `quarter` from (`forecast_data` `fd` join `forecast_versions` `fv` on((`fd`.`version_id` = `fv`.`version_id`))) */;
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


