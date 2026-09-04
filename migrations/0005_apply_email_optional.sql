-- email 从 NOT NULL 改为可空。
--
-- 表单一直把 email 标为选填（无 required 属性），worker 也只校验
-- name/tg/scenario，但 schema 是 NOT NULL —— 用户不填 email 时 INSERT
-- 违反约束抛异常，线索被静默丢弃。id 自增到 4 而表中只有 1 行，与此吻合。
--
-- SQLite 无法直接放宽列约束，按官方推荐做法重建表并搬迁数据。

CREATE TABLE applications_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT,
  scenario TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  tg TEXT,
  agent_tools TEXT,
  pain TEXT,
  ai_spend TEXT,
  issue_volume TEXT
);

INSERT INTO applications_new (
  id, name, email, role, scenario, created_at, tg, agent_tools, pain, ai_spend, issue_volume
)
SELECT
  id, name, email, role, scenario, created_at, tg, agent_tools, pain, ai_spend, issue_volume
FROM applications;

DROP TABLE applications;

ALTER TABLE applications_new RENAME TO applications;
