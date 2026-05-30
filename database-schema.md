# FactoryDMS — Database Schema

> เวอร์ชัน 2.0 · โรงงาน ก จำกัด · อัปเดต พ.ค. 2568  
> Database Engine: **PostgreSQL 15+** · Character Set: `UTF8` · Timezone: `Asia/Bangkok`

---

## ภาพรวม Entity Relationship

```
users ──────────────────┐
  │                     │
  │ (created_by)        │ (approved_by)
  ▼                     ▼
documents ──────▶ document_revisions ──────▶ approval_workflows
  │                     │                          │
  │                     │                          │
  ▼                     ▼                          ▼
document_tags    revision_files           workflow_steps
                                                   │
                                                   ▼
                                           approval_actions
                                                   │
                                                   ▼
audit_logs ◀──────────────── (บันทึกทุก action)
  │
  ▼
audit_chain_integrity

notifications ──▶ notification_settings ──▶ notification_channels
```

---

## Tables

---

### 1. `users` — ผู้ใช้งานในระบบ

```sql
CREATE TABLE users (
  id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   VARCHAR(20)     NOT NULL UNIQUE,   -- รหัสพนักงาน เช่น EMP-0042
  username      VARCHAR(100)    NOT NULL UNIQUE,
  full_name     VARCHAR(200)    NOT NULL,
  email         VARCHAR(255)    NOT NULL UNIQUE,
  phone         VARCHAR(20),
  department_id UUID            REFERENCES departments(id),
  role          VARCHAR(20)     NOT NULL CHECK (role IN (
                  'operator','manager','qa','director','admin')),
  is_active     BOOLEAN         NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_employee_id ON users(employee_id);
CREATE INDEX idx_users_role        ON users(role);
CREATE INDEX idx_users_department  ON users(department_id);
```

**คำอธิบาย**

| Column | คำอธิบาย |
|---|---|
| `id` | Primary key แบบ UUID ป้องกันการเดา sequence |
| `employee_id` | รหัสพนักงานจาก HR system ใช้ login |
| `role` | กำหนด 5 ระดับ ตรงกับ `session.js` ในระบบ |
| `department_id` | FK ไป `departments` ใช้กรองสิทธิ์เห็นเอกสาร |
| `is_active` | Soft delete — ไม่ลบ user จริง |

---

### 2. `departments` — แผนกในโรงงาน

```sql
CREATE TABLE departments (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20)   NOT NULL UNIQUE,  -- เช่น PROD, QA, ENG
  name        VARCHAR(200)  NOT NULL,
  parent_id   UUID          REFERENCES departments(id), -- สำหรับโครงสร้างลำดับ
  manager_id  UUID          REFERENCES users(id),
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

**ตัวอย่างข้อมูล**

| code | name |
|---|---|
| `PROD` | Production |
| `QA` | QA / QC |
| `ENG` | Engineering |
| `WH` | Warehouse |
| `MGMT` | Management |

---

### 3. `documents` — เอกสารหลัก (master record)

```sql
CREATE TABLE documents (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_code        VARCHAR(50)   NOT NULL UNIQUE,  -- รหัส เช่น SOP-PRD-001
  title           VARCHAR(500)  NOT NULL,
  category        VARCHAR(10)   NOT NULL CHECK (category IN ('SOP','WI','FM','QC','ENG')),
  department_id   UUID          NOT NULL REFERENCES departments(id),
  owner_id        UUID          NOT NULL REFERENCES users(id),     -- เจ้าของเอกสาร
  current_rev_id  UUID          REFERENCES document_revisions(id), -- FK revision ปัจจุบัน
  status          VARCHAR(20)   NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','pending','active','obsolete','archived')),
  review_cycle_months  SMALLINT NOT NULL DEFAULT 12,  -- review cycle เป็นเดือน
  next_review_date     DATE,
  tags            TEXT[],           -- array of tag strings
  created_by      UUID          NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_docs_code       ON documents(doc_code);
CREATE INDEX idx_docs_status     ON documents(status);
CREATE INDEX idx_docs_dept       ON documents(department_id);
CREATE INDEX idx_docs_category   ON documents(category);
CREATE INDEX idx_docs_review     ON documents(next_review_date);
```

**คำอธิบาย**

| Column | คำอธิบาย |
|---|---|
| `doc_code` | รหัสไม่ซ้ำ เช่น `SOP-PRD-001` กำหนดตาม naming convention |
| `category` | หมวด SOP / WI / FM / QC / ENG |
| `current_rev_id` | FK ชี้ไป revision ที่ ACTIVE ล่าสุด (nullable ตอนเพิ่งสร้าง) |
| `status` | สถานะของ document-level ไม่ใช่ revision-level |
| `review_cycle_months` | กำหนด cycle สำหรับ review เช่น 12 = รีวิวปีละครั้ง |
| `next_review_date` | คำนวณอัตโนมัติเมื่ออนุมัติ revision ใหม่ |
| `tags` | PostgreSQL array สำหรับ tag-based search |

---

### 4. `document_revisions` — revision แต่ละเวอร์ชัน

```sql
CREATE TABLE document_revisions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID          NOT NULL REFERENCES documents(id),
  revision_number VARCHAR(20)   NOT NULL,          -- เช่น Rev 1, Rev 5
  rev_sequence    SMALLINT      NOT NULL,           -- 1, 2, 3... สำหรับ sort
  status          VARCHAR(20)   NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','pending','active','superseded','rejected')),
  change_type     VARCHAR(20)   CHECK (change_type IN ('minor','major','critical')),
  change_note     TEXT          NOT NULL,           -- บังคับต้องกรอก
  is_restored_from UUID         REFERENCES document_revisions(id), -- ถ้า restore
  effective_date  DATE,                             -- วันที่มีผล
  created_by      UUID          NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,
  superseded_at   TIMESTAMPTZ,

  UNIQUE (document_id, rev_sequence)
);

CREATE INDEX idx_revs_document  ON document_revisions(document_id);
CREATE INDEX idx_revs_status    ON document_revisions(status);
CREATE INDEX idx_revs_created   ON document_revisions(created_at DESC);
```

**คำอธิบาย**

| Column | คำอธิบาย |
|---|---|
| `revision_number` | text ที่แสดงต่อผู้ใช้ เช่น "Rev 5" |
| `rev_sequence` | integer สำหรับ sort และ auto-increment |
| `change_type` | minor / major / critical กำหนด workflow |
| `change_note` | บังคับกรอก — ใช้ใน diff view และ audit |
| `is_restored_from` | self-reference: ถ้า revision นี้เกิดจาก restore |
| `effective_date` | วันที่เริ่มใช้จริง อาจต่างจาก approved_at |

---

### 5. `revision_files` — ไฟล์ที่แนบกับ revision

```sql
CREATE TABLE revision_files (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id     UUID          NOT NULL REFERENCES document_revisions(id),
  file_name       VARCHAR(255)  NOT NULL,
  file_path       TEXT          NOT NULL,         -- path ใน object storage
  file_size_bytes BIGINT        NOT NULL,
  mime_type       VARCHAR(100)  NOT NULL,
  checksum_sha256 CHAR(64)      NOT NULL,         -- ตรวจสอบความสมบูรณ์ของไฟล์
  storage_bucket  VARCHAR(100)  NOT NULL DEFAULT 'dms-documents',
  uploaded_by     UUID          NOT NULL REFERENCES users(id),
  uploaded_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_files_revision ON revision_files(revision_id);
```

**คำอธิบาย**

| Column | คำอธิบาย |
|---|---|
| `file_path` | path ใน S3 / MinIO object storage ไม่เก็บไฟล์ใน DB |
| `checksum_sha256` | ตรวจสอบว่าไฟล์ไม่ถูกแก้ไขหลังอัปโหลด |
| `storage_bucket` | แยก bucket ตาม environment (prod/dev) |

---

### 6. `workflow_templates` — เทมเพลต Approval Workflow

```sql
CREATE TABLE workflow_templates (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200)  NOT NULL,          -- เช่น Standard, Fast-track
  code        VARCHAR(50)   NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_template_steps (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID          NOT NULL REFERENCES workflow_templates(id),
  step_order      SMALLINT      NOT NULL,
  step_name       VARCHAR(100)  NOT NULL,   -- เช่น QA Lead, ผจก. QA
  approver_role   VARCHAR(20)   REFERENCES -- role ที่อนุมัติได้
                  users(role),            -- CHECK ทำใน application layer
  deadline_hours  SMALLINT      NOT NULL DEFAULT 72,  -- SLA เป็นชั่วโมง
  allow_delegate  BOOLEAN       NOT NULL DEFAULT TRUE,

  UNIQUE (template_id, step_order)
);
```

**ตัวอย่าง Standard Workflow**

| step_order | step_name | approver_role | deadline_hours |
|---|---|---|---|
| 1 | Author submit | operator / manager | 24 |
| 2 | QA Lead review | qa | 48 |
| 3 | ผจก. QA | manager | 72 |
| 4 | Director final | director | 48 |

---

### 7. `approval_workflows` — instance ของ workflow ต่อ revision

```sql
CREATE TABLE approval_workflows (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id     UUID          NOT NULL REFERENCES document_revisions(id) UNIQUE,
  template_id     UUID          NOT NULL REFERENCES workflow_templates(id),
  current_step    SMALLINT      NOT NULL DEFAULT 1,
  status          VARCHAR(20)   NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress','approved','rejected','cancelled')),
  submitted_by    UUID          NOT NULL REFERENCES users(id),
  submitted_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  deadline_at     TIMESTAMPTZ   NOT NULL   -- SLA deadline โดยรวม
);

CREATE INDEX idx_wf_revision ON approval_workflows(revision_id);
CREATE INDEX idx_wf_status   ON approval_workflows(status);
```

---

### 8. `approval_actions` — การกระทำแต่ละขั้นตอน

```sql
CREATE TABLE approval_actions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID          NOT NULL REFERENCES approval_workflows(id),
  step_number     SMALLINT      NOT NULL,
  step_name       VARCHAR(100)  NOT NULL,
  action          VARCHAR(20)   NOT NULL
                  CHECK (action IN ('pending','approved','rejected','delegated')),
  actor_id        UUID          REFERENCES users(id),  -- NULL = ยังไม่มีคนทำ
  delegated_to    UUID          REFERENCES users(id),  -- ถ้า delegate
  comment         TEXT,                                -- ความเห็นประกอบ
  rejection_reason VARCHAR(100),                       -- เหตุผลที่ reject
  acted_at        TIMESTAMPTZ,
  deadline_at     TIMESTAMPTZ   NOT NULL,
  is_overdue      BOOLEAN       NOT NULL DEFAULT FALSE,

  UNIQUE (workflow_id, step_number)
);

CREATE INDEX idx_actions_workflow ON approval_actions(workflow_id);
CREATE INDEX idx_actions_actor    ON approval_actions(actor_id);
CREATE INDEX idx_actions_overdue  ON approval_actions(is_overdue) WHERE is_overdue = TRUE;
```

**คำอธิบาย**

| Column | คำอธิบาย |
|---|---|
| `action` | สถานะของขั้นตอนนั้น |
| `rejection_reason` | category ที่เลือกจาก dropdown (spec/gmp/ref/format/content/other) |
| `comment` | รายละเอียดที่พิมพ์ประกอบ |
| `is_overdue` | flag อัปเดตโดย scheduled job ทุกชั่วโมง |
| `delegated_to` | ถ้า delegate งาน จะชี้ไปยัง user ที่รับงานแทน |

---

### 9. `audit_logs` — บันทึกทุก action แบบ tamper-proof

```sql
CREATE TABLE audit_logs (
  id              BIGSERIAL     PRIMARY KEY,   -- integer sequence สำหรับ chain
  event_type      VARCHAR(30)   NOT NULL
                  CHECK (event_type IN (
                    'LOGIN','LOGOUT','UPLOAD','CREATE','EDIT','VIEW',
                    'DOWNLOAD','SUBMIT','APPROVE','REJECT','RESTORE',
                    'OBSOLETE','DELETE','EXPORT','DELEGATE','SETTINGS'
                  )),
  document_id     UUID          REFERENCES documents(id),
  revision_id     UUID          REFERENCES document_revisions(id),
  user_id         UUID          REFERENCES users(id),
  ip_address      INET          NOT NULL,
  user_agent      TEXT,
  session_id      VARCHAR(100),
  detail          JSONB,                       -- ข้อมูลเพิ่มเติมตาม event type
  is_sensitive    BOOLEAN       NOT NULL DEFAULT FALSE, -- DOWNLOAD, RESTORE, DELETE
  -- Hash chain fields
  entry_hash      CHAR(64)      NOT NULL,      -- SHA-256 hash ของ record นี้
  prev_hash       CHAR(64)      NOT NULL,      -- hash ของ record ก่อนหน้า
  hmac_signature  CHAR(64)      NOT NULL,      -- HMAC-SHA256 ด้วย server key
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- append-only: ห้าม UPDATE หรือ DELETE
CREATE RULE no_update_audit AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

CREATE INDEX idx_audit_user      ON audit_logs(user_id);
CREATE INDEX idx_audit_document  ON audit_logs(document_id);
CREATE INDEX idx_audit_type      ON audit_logs(event_type);
CREATE INDEX idx_audit_created   ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_sensitive ON audit_logs(is_sensitive) WHERE is_sensitive = TRUE;
```

**คำอธิบาย Hash Chain**

```
entry_hash = SHA256(
  prev_hash ||
  id::text ||
  event_type ||
  user_id::text ||
  ip_address::text ||
  created_at::text
)

hmac_signature = HMAC_SHA256(entry_hash, SERVER_SECRET_KEY)
```

**ตัวอย่าง `detail` JSONB ตาม event_type**

```json
// DOWNLOAD
{ "file_name": "SOP-PRD-001_Rev5.pdf", "file_size_bytes": 2457600, "reason": "offline review" }

// APPROVE
{ "step": 3, "step_name": "ผจก. QA", "comment": "ตรวจสอบแล้ว ผ่าน spec" }

// REJECT
{ "step": 2, "reason_code": "spec", "comment": "กรุณาระบุ dissolution limit" }

// RESTORE
{ "from_revision": "Rev 3", "to_revision": "Rev 6 (restored)", "reason": "Rev 5 พบ error" }
```

---

### 10. `audit_chain_integrity` — ผลการตรวจสอบ Hash Chain

```sql
CREATE TABLE audit_chain_integrity (
  id            BIGSERIAL     PRIMARY KEY,
  checked_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  total_records BIGINT        NOT NULL,
  valid_records BIGINT        NOT NULL,
  broken_at_id  BIGINT        REFERENCES audit_logs(id),  -- NULL = ผ่านทั้งหมด
  is_intact     BOOLEAN       NOT NULL,
  checked_by    VARCHAR(50)   NOT NULL DEFAULT 'system'   -- system / admin
);
```

---

### 11. `notifications` — การแจ้งเตือน

```sql
CREATE TABLE notifications (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    UUID          NOT NULL REFERENCES users(id),
  event_type      VARCHAR(50)   NOT NULL,   -- approval_needed, doc_approved, expiry, etc.
  priority        VARCHAR(20)   NOT NULL DEFAULT 'info'
                  CHECK (priority IN ('critical','warning','info','success','neutral')),
  title           VARCHAR(300)  NOT NULL,
  body            TEXT          NOT NULL,
  detail          TEXT,
  document_id     UUID          REFERENCES documents(id),
  revision_id     UUID          REFERENCES document_revisions(id),
  is_read         BOOLEAN       NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  action_url      VARCHAR(500),            -- URL สำหรับ deep link
  expires_at      TIMESTAMPTZ,             -- แจ้งเตือนหมดอายุ
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_recipient ON notifications(recipient_id, is_read);
CREATE INDEX idx_notif_priority  ON notifications(priority);
CREATE INDEX idx_notif_created   ON notifications(created_at DESC);
```

---

### 12. `notification_settings` — การตั้งค่าแจ้งเตือนรายคน

```sql
CREATE TABLE notification_settings (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id) UNIQUE,
  -- Channel toggles
  channel_inapp   BOOLEAN       NOT NULL DEFAULT TRUE,
  channel_email   BOOLEAN       NOT NULL DEFAULT TRUE,
  channel_line    BOOLEAN       NOT NULL DEFAULT FALSE,
  channel_sms     BOOLEAN       NOT NULL DEFAULT FALSE,
  -- Contact info
  line_user_id    VARCHAR(100),   -- Line OA user ID หลัง connect
  sms_phone       VARCHAR(20),    -- เบอร์โทร (verified)
  -- Email digest
  email_digest    VARCHAR(20)   NOT NULL DEFAULT 'realtime'
                  CHECK (email_digest IN ('realtime','hourly','daily','weekly')),
  email_digest_hour SMALLINT    DEFAULT 8,  -- เวลาส่ง digest (0-23)
  -- Quiet hours
  quiet_hours_enabled BOOLEAN   NOT NULL DEFAULT FALSE,
  quiet_start     TIME,           -- เช่น 22:00
  quiet_end       TIME,           -- เช่น 07:00
  quiet_except_critical BOOLEAN  NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

---

### 13. `notification_trigger_settings` — ตั้งค่า trigger แต่ละ event

```sql
CREATE TABLE notification_trigger_settings (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id),
  trigger_code    VARCHAR(50)   NOT NULL,  -- เช่น approval_needed, doc_rejected
  channel_inapp   BOOLEAN       NOT NULL DEFAULT TRUE,
  channel_email   BOOLEAN       NOT NULL DEFAULT TRUE,
  channel_line    BOOLEAN       NOT NULL DEFAULT FALSE,
  channel_sms     BOOLEAN       NOT NULL DEFAULT FALSE,
  delay_minutes   SMALLINT      NOT NULL DEFAULT 0,  -- หน่วงเวลาก่อนส่ง

  UNIQUE (user_id, trigger_code)
);
```

**Trigger Codes ที่ใช้ในระบบ**

| trigger_code | เหตุการณ์ | Default channels |
|---|---|---|
| `approval_needed` | มีเอกสารรอฉันอนุมัติ | inapp + email |
| `approval_overdue` | เกินกำหนด approve | inapp + email + sms |
| `doc_approved` | เอกสารที่ฉันส่งผ่านแล้ว | inapp + email |
| `doc_rejected` | เอกสารที่ฉันส่งถูกคืน | inapp + email |
| `doc_expiry_30d` | เอกสารใกล้ครบ review 30 วัน | inapp + email |
| `new_revision` | มี revision ใหม่ของเอกสารที่ดูแล | inapp |
| `doc_downloaded` | มีคนดาวน์โหลดเอกสารของฉัน | inapp |
| `mentioned` | มีคน @mention ฉัน | inapp + email |
| `doc_obsoleted` | เอกสารถูกตั้งเป็น Obsolete | inapp + email |
| `daily_digest` | สรุปประจำวัน | email |

---

### 14. `document_subscriptions` — ติดตามเอกสาร

```sql
CREATE TABLE document_subscriptions (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users(id),
  document_id UUID          NOT NULL REFERENCES documents(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, document_id)
);
```

*ใช้สำหรับพนักงานที่ต้องการติดตามเอกสารที่ตัวเองไม่ได้เป็นเจ้าของ*

---

### 15. `document_comments` — ความเห็นใน review

```sql
CREATE TABLE document_comments (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id     UUID          NOT NULL REFERENCES document_revisions(id),
  workflow_action_id UUID       REFERENCES approval_actions(id),
  author_id       UUID          NOT NULL REFERENCES users(id),
  content         TEXT          NOT NULL,
  mentioned_users UUID[],       -- @mention users
  parent_id       UUID          REFERENCES document_comments(id),  -- reply
  is_resolved     BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_revision ON document_comments(revision_id);
```

---

## Views ที่แนะนำ

```sql
-- v_active_documents: เอกสาร Active พร้อม revision ปัจจุบัน
CREATE VIEW v_active_documents AS
SELECT
  d.id, d.doc_code, d.title, d.category,
  d.status, d.next_review_date,
  r.revision_number AS current_revision,
  r.change_note AS last_change_note,
  r.approved_at AS last_approved_at,
  u.full_name AS owner_name,
  dep.name AS department_name
FROM documents d
LEFT JOIN document_revisions r ON d.current_rev_id = r.id
LEFT JOIN users u ON d.owner_id = u.id
LEFT JOIN departments dep ON d.department_id = dep.id
WHERE d.status = 'active';

-- v_pending_approvals: รายการรออนุมัติพร้อม deadline
CREATE VIEW v_pending_approvals AS
SELECT
  wf.id AS workflow_id,
  d.doc_code, d.title,
  r.revision_number,
  wt.name AS workflow_template,
  wf.current_step,
  aa.step_name AS waiting_at,
  aa.deadline_at,
  aa.is_overdue,
  u_submit.full_name AS submitted_by,
  wf.submitted_at,
  EXTRACT(EPOCH FROM (NOW() - wf.submitted_at))/3600 AS hours_waiting
FROM approval_workflows wf
JOIN document_revisions r ON wf.revision_id = r.id
JOIN documents d ON r.document_id = d.id
JOIN workflow_templates wt ON wf.template_id = wt.id
JOIN approval_actions aa ON aa.workflow_id = wf.id AND aa.step_number = wf.current_step
JOIN users u_submit ON wf.submitted_by = u_submit.id
WHERE wf.status = 'in_progress';
```

---

## Indexes สำคัญเพิ่มเติม

```sql
-- Full-text search สำหรับค้นหาเอกสาร
CREATE INDEX idx_docs_fulltext ON documents
  USING gin(to_tsvector('thai', title || ' ' || doc_code));

-- Partial index สำหรับ review cycle monitoring
CREATE INDEX idx_docs_review_upcoming ON documents(next_review_date)
  WHERE status = 'active' AND next_review_date IS NOT NULL;

-- Partial index สำหรับ audit sensitive actions
CREATE INDEX idx_audit_sensitive_recent ON audit_logs(created_at DESC)
  WHERE is_sensitive = TRUE;
```

---

## Constraints สำคัญ

```sql
-- ป้องกัน revision_number ซ้ำในเอกสารเดียวกัน
ALTER TABLE document_revisions
  ADD CONSTRAINT uq_revision_per_doc UNIQUE (document_id, revision_number);

-- ป้องกัน current_rev_id ชี้ไป revision ที่ไม่ใช่ของ document นั้น
ALTER TABLE documents
  ADD CONSTRAINT fk_current_rev_belongs CHECK (
    current_rev_id IS NULL OR EXISTS (
      SELECT 1 FROM document_revisions
      WHERE id = current_rev_id AND document_id = documents.id
    )
  );
```

---

## ER Diagram สรุป

```
departments (1) ──── (N) users
     │                    │
     │                    │ (owner_id, created_by)
     │ (N)                ▼
     └──────── (N) documents (1) ──── (N) document_revisions
                                              │
                          ┌───────────────────┼───────────────────┐
                          ▼                   ▼                   ▼
                   revision_files    approval_workflows     document_comments
                                             │
                                    ┌────────┴────────┐
                                    ▼                 ▼
                          workflow_templates    approval_actions
                          workflow_template_steps

users (1) ──── (N) audit_logs (hash-chained, append-only)
users (1) ──── (1) notification_settings
users (1) ──── (N) notification_trigger_settings
users (1) ──── (N) notifications
users (N) ──── (N) documents  [via document_subscriptions]
```

---

## หมายเหตุการ Deploy

- **Audit Log**: ใช้ PostgreSQL `RULE` ป้องกัน UPDATE/DELETE จาก application layer และควรตั้ง Row-Level Security (RLS) เพิ่มเติม
- **File Storage**: เก็บไฟล์จริงใน S3-compatible object storage (AWS S3 / MinIO) ไม่เก็บ binary ใน database
- **Hash Chain**: คำนวณ `entry_hash` ใน application layer ก่อน INSERT เพื่อให้ hash ถูกต้อง 100%
- **Full-text Search**: ใช้ `pg_trgm` extension สำหรับ fuzzy search ภาษาไทยร่วมด้วย
- **Timezone**: ทุก `TIMESTAMPTZ` เก็บเป็น UTC แต่แสดงผลเป็น `Asia/Bangkok` (+07:00)

---

*เอกสารนี้สร้างจาก FactoryDMS Prototype v2.0 — ออกแบบให้รองรับ GMP / ISO 9001:2015*
