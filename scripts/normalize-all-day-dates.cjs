/**
 * 종일 태스크의 startAt/dueAt을 "떠 있는 날짜"(UTC 자정)로 정규화한다.
 * 예전에는 브라우저 로컬 자정으로 저장돼 캘린더(UTC 기준)와 하루가 어긋났다.
 * 의도한 달력 날짜는 사용자 타임존으로 해석해서 복원한다. 멱등하다.
 */
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DIRECT_URL,
  connectionTimeoutMillis: 15000,
});

const dateKeyIn = (raw, tz) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(raw.replace(" ", "T") + "Z"));

(async () => {
  const users = await pool.query('select id, timezone from "User"');
  let changed = 0;
  let checked = 0;

  for (const u of users.rows) {
    const tz = u.timezone || "Asia/Seoul";
    const rows = await pool.query(
      `select id, title, "startAt"::text as s, "dueAt"::text as d
       from "Task"
       where "userId" = $1 and "allDay" = true
         and ("startAt" is not null or "dueAt" is not null)`,
      [u.id],
    );

    for (const t of rows.rows) {
      checked++;
      const updates = [];
      const params = [];
      for (const [col, raw] of [["startAt", t.s], ["dueAt", t.d]]) {
        if (!raw) continue;
        const target = `${dateKeyIn(raw, tz)} 00:00:00`;
        if (raw !== target) {
          params.push(target);
          updates.push(`"${col}" = $${params.length}::timestamp`);
        }
      }
      if (updates.length === 0) continue;
      params.push(t.id);
      await pool.query(
        `update "Task" set ${updates.join(", ")} where id = $${params.length}`,
        params,
      );
      console.log(`  변환: ${t.title} (${updates.length}개 필드)`);
      changed++;
    }
  }
  console.log(`종일 태스크 ${checked}건 확인, ${changed}건 변환`);
  process.exit(0);
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
