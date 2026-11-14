-- 小小绘本馆 / pic：完整建表与基础字典初始化
-- 版本：2026-11-05，推荐 MySQL 8.4，旧版本兼容性以实际执行为准。
-- 手动执行：在 DBeaver / MySQL 客户端选中已经创建的目标数据库，再执行整个文件。
-- 本文件不包含 CREATE DATABASE、USE、账户或连接密码。
-- 共 10 张表，每张表使用 int unsigned 自增 id，业务标识另设唯一键。
-- 所有字段均有中文注释，开关字段使用 tinyint unsigned，0 否、1 是。
-- 初始化字典：3 个年龄段、6 个主题、2 种语言。
-- 逐页中英文音频路径在 book_pages，服务商和声音记录在 book_voices。
-- 重复执行不删表、不清空绘本，但会更新上述内置字典的名称、说明与顺序。
-- 本文件用于新建表，已存在的旧版同名表不会自动升级，须单独迁移。
-- MySQL DDL 会隐式提交，建表失败应修复错误后重跑整个文件。
-- 首批书目不在此写死，执行后用 cmd/importer 校验并事务导入。
-- 发布默认 published，授权默认 pending，初期不设置授权审核门槛。
-- 页数、页码和开关值由导入程序校验。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';

-- 一、绘本及来源授权

CREATE TABLE IF NOT EXISTS `books` (
    `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    `book_id` varchar(64) NOT NULL COMMENT '绘本业务标识，如 moon-rabbit',
    `title_zh` varchar(255) NOT NULL COMMENT '中文书名',
    `title_original` varchar(255) NOT NULL DEFAULT '' COMMENT '原文书名',
    `author` varchar(255) NOT NULL COMMENT '作者名称',
    `illustrator` varchar(255) NOT NULL COMMENT '插画师名称',
    `description_zh` text NOT NULL COMMENT '中文内容简介',
    `reading_value` varchar(80) NOT NULL DEFAULT '' COMMENT '推荐理由，基于故事内容的一句亲子阅读价值短句',
    `cover` varchar(1024) NOT NULL COMMENT '封面图片路径',
    `page_count` smallint unsigned NOT NULL COMMENT '绘本总页数，从1开始',
    `reading_minutes` smallint unsigned NOT NULL DEFAULT '0' COMMENT '预计阅读时长，单位分钟',
    `featured_order` int unsigned NOT NULL DEFAULT '0' COMMENT '精选展示顺序，0 非精选，正整数越小越靠前',
    `published_at` datetime(3) NOT NULL COMMENT '发布时间，UTC',
    `publish_status` enum('draft','published','offline') NOT NULL DEFAULT 'published' COMMENT '发布状态，draft 草稿、published 已发布、offline 已下架',
    `content_version` varchar(100) NOT NULL COMMENT '内容版本，图文或音频更新时同步递增',
    `is_demo` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '是否演示绘本，0 否、1 是',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_books_book_id` (`book_id`),
    KEY `idx_books_status_published` (`publish_status`, `published_at`, `book_id`),
    KEY `idx_books_status_featured` (`publish_status`, `featured_order`, `book_id`),
    KEY `idx_books_status_title` (`publish_status`, `title_zh`, `book_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='绘本元数据';

CREATE TABLE IF NOT EXISTS `book_licenses` (
    `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    `book_id` varchar(64) NOT NULL COMMENT '绘本业务标识，如 moon-rabbit',
    `license_type` varchar(255) NOT NULL COMMENT '授权类型及版本',
    `source_url` varchar(2048) NOT NULL DEFAULT '' COMMENT '原始作品来源链接',
    `license_url` varchar(2048) NOT NULL DEFAULT '' COMMENT '授权依据链接',
    `attribution` text NOT NULL COMMENT '来源要求的完整署名文本',
    `review_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态，pending 待审核、approved 已通过、rejected 未通过',
    `commercial_use` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '是否允许商业使用，0 否、1 是',
    `self_hosting` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '是否允许自托管，0 否、1 是',
    `translation_allowed` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '是否允许翻译，0 否、1 是',
    `audio_derivative_allowed` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '是否允许有声制作，0 否、1 是',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_book_licenses_book_id` (`book_id`),
    CONSTRAINT `fk_licenses_book` FOREIGN KEY (`book_id`) REFERENCES `books` (`book_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='来源和授权';

-- 二、年龄、主题、语言字典

CREATE TABLE IF NOT EXISTS `age_ranges` (
    `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    `age_id` varchar(16) NOT NULL COMMENT '年龄段业务标识，如 0-2、3-4、5-6',
    `name` varchar(50) NOT NULL COMMENT '展示名称',
    `description` varchar(255) NOT NULL DEFAULT '' COMMENT '说明文字',
    `sort_order` int NOT NULL DEFAULT '0' COMMENT '展示顺序，数值越小越靠前',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_age_ranges_age_id` (`age_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='年龄字典';

CREATE TABLE IF NOT EXISTS `categories` (
    `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    `category_id` varchar(32) NOT NULL COMMENT '主题业务标识，如 animals、bedtime',
    `name` varchar(50) NOT NULL COMMENT '展示名称',
    `description` varchar(255) NOT NULL DEFAULT '' COMMENT '说明文字',
    `sort_order` int NOT NULL DEFAULT '0' COMMENT '展示顺序，数值越小越靠前',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_categories_category_id` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='主题字典';

CREATE TABLE IF NOT EXISTS `languages` (
    `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    `language_id` varchar(16) NOT NULL COMMENT '语言业务标识，zh 中文、en 英文',
    `name` varchar(50) NOT NULL COMMENT '展示名称',
    `description` varchar(255) NOT NULL DEFAULT '' COMMENT '说明文字',
    `sort_order` int NOT NULL DEFAULT '0' COMMENT '展示顺序，数值越小越靠前',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_languages_language_id` (`language_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='语言字典';

-- 三、绘本与字典的多对多关联

CREATE TABLE IF NOT EXISTS `book_age_ranges` (
    `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    `book_id` varchar(64) NOT NULL COMMENT '绘本业务标识，如 moon-rabbit',
    `age_id` varchar(16) NOT NULL COMMENT '年龄段业务标识，如 0-2、3-4、5-6',
    `sort_order` int NOT NULL DEFAULT '0' COMMENT '展示顺序，数值越小越靠前',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_book_age_ranges_book_age` (`book_id`, `age_id`),
    KEY `idx_age_books` (`age_id`, `book_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='绘本与年龄多对多';

CREATE TABLE IF NOT EXISTS `book_categories` (
    `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    `book_id` varchar(64) NOT NULL COMMENT '绘本业务标识，如 moon-rabbit',
    `category_id` varchar(32) NOT NULL COMMENT '主题业务标识，如 animals、bedtime',
    `sort_order` int NOT NULL DEFAULT '0' COMMENT '展示顺序，数值越小越靠前',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_book_categories_book_category` (`book_id`, `category_id`),
    KEY `idx_category_books` (`category_id`, `book_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='绘本与主题多对多，保留主题展示顺序';

CREATE TABLE IF NOT EXISTS `book_languages` (
    `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    `book_id` varchar(64) NOT NULL COMMENT '绘本业务标识，如 moon-rabbit',
    `language_id` varchar(16) NOT NULL COMMENT '语言业务标识，zh 中文、en 英文',
    `sort_order` int NOT NULL DEFAULT '0' COMMENT '展示顺序，数值越小越靠前',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_book_languages_book_language` (`book_id`, `language_id`),
    KEY `idx_language_books` (`language_id`, `book_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='绘本支持的阅读语言';

-- 四、逐页图文音频与语音生产记录

CREATE TABLE IF NOT EXISTS `book_pages` (
    `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    `book_id` varchar(64) NOT NULL COMMENT '绘本业务标识，如 moon-rabbit',
    `page_number` smallint unsigned NOT NULL COMMENT '页码，从1开始，同一本书不重复',
    `image_path` varchar(1024) NOT NULL COMMENT '本页插画路径',
    `image_alt` text NOT NULL COMMENT '插画替代文字',
    `text_zh` text NOT NULL COMMENT '本页中文文本',
    `text_original` text NOT NULL COMMENT '本页英文原文',
    `audio_zh_path` varchar(1024) NOT NULL DEFAULT '' COMMENT '本页中文预生成音频路径，空字符串表示未配音',
    `audio_original_path` varchar(1024) NOT NULL DEFAULT '' COMMENT '本页英文预生成音频路径，空字符串表示未配音',
    `dialogue_layout` json DEFAULT NULL COMMENT '可选对白排版，含双语文字范围、角色、气泡位置及正文校验哈希；空值表示普通正文',
    `content_version` varchar(100) NOT NULL COMMENT '内容版本，图文或音频更新时同步递增',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_book_pages_book_page` (`book_id`, `page_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='逐页图片、双语文本及预生成音频路径';

CREATE TABLE IF NOT EXISTS `book_voices` (
    `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT '自增ID',
    `book_id` varchar(64) NOT NULL COMMENT '绘本业务标识，如 moon-rabbit',
    `language_id` varchar(16) NOT NULL COMMENT '语言业务标识，zh 中文、en 英文',
    `provider` varchar(100) NOT NULL COMMENT '语音服务商名称',
    `voice_id` varchar(255) NOT NULL COMMENT '服务商声音标识',
    `generated_at` datetime(3) NOT NULL COMMENT '音频生成时间，UTC',
    `review_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态，pending 待审核、approved 已通过、rejected 未通过',
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_book_voices_book_language` (`book_id`, `language_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='逐语言语音生产记录';

-- 五、基础字典初始化
-- DDL 已在上方完成，仅以下字典写入使用事务。

START TRANSACTION;

INSERT INTO `age_ranges` (`age_id`, `name`, `description`, `sort_order`) VALUES
('0-2','0–2 岁','看图认知 · 亲子陪伴',1),
('3-4','3–4 岁','发现世界 · 快乐成长',2),
('5-6','5–6 岁','独立思考 · 自主阅读',3)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`),
    `sort_order` = VALUES(`sort_order`);

INSERT INTO `categories` (`category_id`, `name`, `description`, `sort_order`) VALUES
('animals','动物朋友','认识可爱的动物伙伴',1),
('habits','生活习惯','在故事里慢慢长大',2),
('emotions','情绪表达','和每一种心情做朋友',3),
('bedtime','睡前故事','给今天一个温柔的晚安',4),
('nature','自然探索','发现身边的小小世界',5),
('cognition','认知启蒙','颜色、数字与想象力',6)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`),
    `sort_order` = VALUES(`sort_order`);

INSERT INTO `languages` (`language_id`, `name`, `description`, `sort_order`) VALUES
('zh','中文','中文阅读',1),('en','英文','英文阅读',2)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`),
    `sort_order` = VALUES(`sort_order`);

COMMIT;
