-- 仅供用户手动执行，先停止API写入并备份reader_events，选中实际业务库。
-- 适用旧版按事件存储的reader_events，首次执行完成后不要重复执行ALTER。
-- 同用户/绘本优先保留最早的complete，否则保留最早的open。
-- 被保留行的编号、事件标识、会话标识及创建/更新时间均不修改。

START TRANSACTION;

DELETE stale
FROM reader_events AS stale
JOIN reader_events AS survivor
  ON survivor.user_id=stale.user_id AND survivor.book_id=stale.book_id
 AND (
     (survivor.event_kind='complete' AND stale.event_kind<>'complete')
     OR (
         (survivor.event_kind='complete')=(stale.event_kind='complete')
         AND survivor.id<stale.id
     )
 );

COMMIT;

ALTER TABLE reader_events
    DROP INDEX uk_reader_events_reading_kind,
    ADD UNIQUE KEY uk_reader_events_user_book (user_id,book_id),
    MODIFY event_id char(32) NOT NULL COMMENT '首次打开或首次读完时的客户端事件标识',
    MODIFY event_kind varchar(16) NOT NULL COMMENT '阅读状态，open已打开未读完、complete已读完；完成后不再更新',
    MODIFY reading_id char(32) NOT NULL COMMENT '首次打开或首次读完时的客户端会话标识',
    COMMENT='登录用户绘本阅读状态，每个用户每本书一条，完成后不再更新';
