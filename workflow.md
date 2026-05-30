# FactoryDMS — System Workflow Documentation

> เวอร์ชัน 2.0 · โรงงาน ก จำกัด · อัปเดต พ.ค. 2568

---

## ภาพรวมระบบ

FactoryDMS เป็นระบบจัดการเอกสารโรงงานที่ควบคุมวงจรชีวิตของเอกสาร (Document Lifecycle) ตั้งแต่การสร้าง จนถึงการยกเลิกใช้งาน โดยมี 5 modules หลักที่ทำงานร่วมกัน

```
[พนักงาน / ผู้จัดการ]
       │
       ▼
  Document Store  ──▶  Revision Control
       │                      │
       ▼                      ▼
  Approval Workflow ◀──── (สร้าง Revision ใหม่)
       │
       ▼
  Audit Log (บันทึกทุก action อัตโนมัติ)
       │
       ▼
  Notification (แจ้งเตือนทุก event)
```

---

## 1. Workflow ระบบหลัก (Manager / QA / Director / Admin)

### 1.1 Document Lifecycle

```
         ┌─────────────────────────────────────────────────────────┐
         │                  DOCUMENT LIFECYCLE                      │
         └─────────────────────────────────────────────────────────┘

  [สร้างเอกสารใหม่]                    [แก้ไขเอกสารมีอยู่]
        │                                      │
        ▼                                      ▼
  ┌──────────┐                         ┌──────────────┐
  │  DRAFT   │◀────────────────────────│ สร้าง Revision│
  │ (ร่าง)  │                         │   ใหม่        │
  └──────────┘                         └──────────────┘
        │                                      │
        │ อัปโหลดไฟล์ + กรอก metadata          │
        │ เลือก Approval Workflow               │
        ▼                                      ▼
  ┌──────────┐                         ┌──────────────┐
  │ PENDING  │◀────────────────────────│   PENDING    │
  │(รออนุมัติ)│   ส่งขออนุมัติ          │ (รออนุมัติ)  │
  └──────────┘                         └──────────────┘
        │                                      │
        │          Approval Workflow            │
        ▼                                      ▼
   ┌─────────┐                          ┌─────────┐
   │ APPROVED│                          │ APPROVED│
   │ (Active)│                          │ (Active)│
   └─────────┘                          └─────────┘
        │                                      │
        │ ถ้าถูก Reject                          │ Rev ก่อนหน้า
        ▼                                      ▼
   ┌─────────┐                         ┌──────────────┐
   │  DRAFT  │◀── แก้ไขแล้วส่งใหม่       │  SUPERSEDED  │
   └─────────┘                         │ (ใช้ไม่ได้แล้ว)│
                                        └──────────────┘
        │ หมดอายุ / ถูกแทนที่
        ▼
   ┌──────────┐
   │ OBSOLETE │
   └──────────┘
        │ Admin archive
        ▼
   ┌──────────┐
   │ ARCHIVED │
   └──────────┘
```

**สถานะเอกสารและความหมาย**

| สถานะ | ความหมาย | ใครเห็น | ใช้งานได้? |
|---|---|---|---|
| `DRAFT` | ร่าง ยังไม่ส่ง | เฉพาะผู้สร้าง | ไม่ |
| `PENDING` | รออนุมัติอยู่ใน Workflow | ผู้สร้าง + ผู้อนุมัติ | ไม่ |
| `ACTIVE` | อนุมัติแล้ว ใช้งานได้ | ทุกคน | ✓ |
| `SUPERSEDED` | ถูกแทนที่โดย revision ใหม่ | ทุกคน (read-only) | ไม่ |
| `OBSOLETE` | ยกเลิกใช้งาน | Manager ขึ้นไป | ไม่ |
| `ARCHIVED` | เก็บถาวร | Admin เท่านั้น | ไม่ |

---

### 1.2 Approval Workflow

#### Standard Workflow (4 ขั้นตอน)

```
  [ผู้เขียน / Author]
         │
         │ กรอกข้อมูล + อัปโหลดไฟล์
         │ เลือก Workflow template
         │ กด "ส่งขออนุมัติ"
         ▼
  ┌─────────────┐    ส่ง Email/In-app
  │ Step 1      │──────────────────────▶ แจ้งเตือน QA Lead
  │ QA Lead     │
  └─────────────┘
         │                    ┌─── Reject ──▶ [แจ้งผู้เขียน + เหตุผล]
         │ Approve                            │
         ▼                                   │ แก้ไขแล้วส่งใหม่
  ┌─────────────┐                            └──▶ กลับ Step 1
  │ Step 2      │──────────────────────▶ แจ้งเตือน ผจก. QA
  │ ผจก. QA    │
  └─────────────┘
         │                    ┌─── Reject ──▶ [แจ้งผู้เขียน + เหตุผล]
         │ Approve
         ▼
  ┌─────────────┐──────────────────────▶ แจ้งเตือน Director
  │ Step 3      │
  │ Director    │
  └─────────────┘
         │                    ┌─── Reject ──▶ [แจ้งทุกคนในสาย]
         │ Final Approve
         ▼
  ┌─────────────────────────────────┐
  │  เอกสารสถานะ → ACTIVE           │
  │  Rev ก่อนหน้า → SUPERSEDED      │
  │  แจ้งเตือนผู้เกี่ยวข้องทุกคน   │
  │  บันทึก Audit Log               │
  └─────────────────────────────────┘
```

#### Workflow Templates

| Template | ขั้นตอน | ใช้เมื่อ |
|---|---|---|
| Standard | Author → QA Lead → ผจก. QA → Director | เอกสารทั่วไป GMP |
| Fast-track | Author → QA Manager | Minor change เท่านั้น (typo, format) |
| Engineering | Author → Eng. Lead → Safety → ผจก. | เอกสารงานช่าง / safety |
| Emergency | Author → Director (direct) | กรณีเร่งด่วนมาก |

#### Escalation Rules

```
  เอกสารค้างอนุมัติ
        │
        ├── เกิน 1 วัน ──▶ แจ้งเตือน reminder ซ้ำ
        ├── เกิน 3 วัน ──▶ แจ้งเตือน "เกินกำหนด" (badge สีแดง)
        ├── เกิน 5 วัน ──▶ แจ้งเตือน Manager ของผู้รับผิดชอบ
        └── เกิน 7 วัน ──▶ Escalate ไป Director โดยอัตโนมัติ
```

---

### 1.3 Revision Control Workflow

```
  ต้องการแก้ไขเอกสาร ACTIVE
         │
         ▼
  [สร้าง Revision ใหม่]
  - เลือกเอกสารต้นทาง
  - อัปโหลดไฟล์ฉบับใหม่
  - กรอก Change Note (บังคับ)
  - เลือก Change Type: Minor / Major / Critical
  - เลือก Workflow template
         │
         ▼
  [ส่งเข้า Approval Workflow]
  - เอกสารเดิม ยังคง ACTIVE อยู่ระหว่างรออนุมัติ
  - ไม่กระทบการใช้งานจริง
         │
         ├── Approved ──▶ Rev ใหม่ = ACTIVE
         │                Rev เก่า = SUPERSEDED
         │
         └── Rejected ──▶ Rev ใหม่ = DRAFT (แก้ไขได้)
                          Rev เก่า = ยังคง ACTIVE

  [Restore Revision เก่า]
  - เลือก revision ที่ต้องการย้อนกลับ
  - กรอกเหตุผล (บังคับ)
  - ระบบสร้าง Revision ใหม่ที่มีเนื้อหาเหมือน revision เก่า
  - ส่งเข้า Approval Workflow ปกติ
  - ไม่มีการลบ history เดิม
```

---

### 1.4 Audit Log Workflow

```
  ทุก Action ในระบบ
  (upload, view, download, approve, reject,
   restore, delete, export, login)
         │
         ▼
  ┌─────────────────────────────────────┐
  │  สร้าง Audit Entry                  │
  │  - Sequence number (auto-increment) │
  │  - Timestamp + timezone             │
  │  - User ID + IP Address             │
  │  - Action type + Document ref       │
  │  - Detail / reason                  │
  └─────────────────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────────┐
  │  คำนวณ SHA-256 Hash                 │
  │  hash = SHA256(prevHash + entry)    │
  │  สร้าง Hash Chain ต่อเนื่อง         │
  └─────────────────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────────┐
  │  บันทึกลง Database (Append-only)    │
  │  ห้ามแก้ไข / ลบ record             │
  └─────────────────────────────────────┘
         │
         ▼
  [Integrity Verification]
  - ระบบตรวจสอบ Hash Chain ทุก 1 ชม.
  - ถ้า hash ขาด → แจ้งเตือน Admin ทันที
  - Export Verification Report ได้
```

---

### 1.5 Notification Workflow

```
  Event เกิดขึ้นในระบบ
  (approval needed, document approved/rejected,
   expiry warning, download alert, mention)
         │
         ▼
  ┌─────────────────────────────────┐
  │  ตรวจสอบ Trigger Settings       │
  │  ของผู้รับแต่ละคน               │
  └─────────────────────────────────┘
         │
         ├── In-app ──▶ แสดงใน Notification inbox
         ├── Email  ──▶ ส่ง Email (real-time หรือ Digest)
         ├── Line OA──▶ ส่ง Line message (ถ้า connect แล้ว)
         └── SMS    ──▶ ส่ง SMS (ถ้าตั้งค่าเบอร์แล้ว)
         │
         ▼
  [Quiet Hours check]
  - ถ้าอยู่ใน Quiet Hours → delay ถึงเวลาที่กำหนด
  - ยกเว้น: Priority Critical → ส่งทันที

  [Escalation]
  - ผู้รับไม่ดำเนินการภายใน X ชม.
  → แจ้งเตือนซ้ำ / escalate ตาม rule
```

---

## 2. Workflow ระบบพนักงาน (Operator)

พนักงานทั่วไปเข้าใช้งานผ่าน 4 หน้าจอที่ออกแบบเฉพาะ ไม่เห็น Audit Log หรือ Approval queue ของคนอื่น

### 2.1 การอัปโหลดเอกสาร / สร้าง Revision ใหม่

```
  พนักงาน (Operator)
         │
         ▼
  [เอกสารของฉัน] ──▶ กด "อัปโหลดเอกสาร" หรือ "สร้าง Revision"
         │
         ▼
  ┌──────────────────────────────────────┐
  │  กรอกข้อมูล                          │
  │  ① อัปโหลดไฟล์ (PDF / DOCX)         │
  │  ② รหัสเอกสาร + ชื่อเอกสาร          │
  │  ③ หมวดหมู่ (SOP / WI / FM)         │
  │  ④ แผนก                              │
  │  ⑤ Change Note (กรณี revision ใหม่) │
  │  ⑥ เลือก Workflow template           │
  └──────────────────────────────────────┘
         │
         ▼
  [บันทึก Draft] ─── บันทึกชั่วคราว ยังไม่ส่ง
         │
         ▼
  [ส่งขออนุมัติ]
         │
         ▼
  เอกสารสถานะ PENDING
  ปรากฏในหน้า "ติดตามสถานะ" ของพนักงาน
  ปรากฏในหน้า Approval ของ Manager / QA
         │
         ├── ระบบแจ้งเตือนพนักงานเมื่อ:
         │   - เอกสารถูก Approve → แสดงสถานะ Active
         │   - เอกสารถูก Reject  → แสดงเหตุผล + ต้องแก้ไข
         │   - เอกสารค้างนาน    → แจ้งเตือนสถานะ
         ▼
  [แก้ไขหลัง Reject]
  - เปิดเอกสาร Draft จากหน้า "ติดตามสถานะ"
  - แก้ไขไฟล์ + อัปเดต Change Note
  - ส่งขออนุมัติใหม่ → กลับไปที่ Approval Workflow
```

---

### 2.2 การค้นหาและดาวน์โหลดเอกสาร

```
  พนักงาน
         │
         ▼
  [ค้นหาเอกสาร] (emp-02-browse)
         │
         ├── ค้นหาด้วยรหัส / ชื่อ / แผนก / หมวดหมู่
         │
         ▼
  ┌──────────────────────────────────┐
  │  แสดงเฉพาะเอกสารสถานะ ACTIVE    │
  │  (ไม่เห็น Draft / Obsolete       │
  │   ของคนอื่น)                     │
  └──────────────────────────────────┘
         │
         ├── ดูรายละเอียด ──▶ อ่าน metadata + Change Note
         │
         └── ดาวน์โหลด ──▶ บันทึก Audit Log อัตโนมัติ
                            (action: DOWNLOADED + IP + timestamp)
```

---

### 2.3 การติดตามสถานะ Approval

```
  พนักงาน
         │
         ▼
  [ติดตามสถานะ] (emp-03-tracking)
         │
         ▼
  ┌──────────────────────────────────────────┐
  │  รายการเอกสารที่ฉันส่ง                   │
  │  แสดง Workflow steps พร้อม progress:     │
  │                                          │
  │  [Author ✓] ──▶ [QA ⏳] ──▶ [ผจก.] ──▶ [Director] │
  │                                          │
  │  เห็นเฉพาะ:                              │
  │  - เอกสารที่ตัวเองสร้าง                 │
  │  - ไม่เห็นเอกสารของคนอื่น              │
  └──────────────────────────────────────────┘
         │
         ├── สถานะ PENDING ──▶ แสดง step ที่รออยู่ + กำหนดเวลา
         ├── สถานะ APPROVED ──▶ แสดง "อนุมัติแล้ว" พร้อมวันที่
         └── สถานะ REJECTED ──▶ แสดงเหตุผล + ปุ่ม "แก้ไข"
                                 ──▶ เปิด Draft mode แก้ไขได้
```

---

### 2.4 Notification ของพนักงาน

```
  Event ที่พนักงานได้รับแจ้ง:
  ┌─────────────────────────────────────────────┐
  │ ✓  เอกสารของฉันได้รับการอนุมัติแล้ว        │
  │ ✗  เอกสารของฉันถูกส่งกลับ + เหตุผล         │
  │ ⏰  เอกสารของฉันค้างอนุมัตินาน              │
  │ 💬  QA / Manager กล่าวถึงฉันใน comment       │
  │ 📅  เอกสารที่ฉันดูแลใกล้ครบ review cycle     │
  └─────────────────────────────────────────────┘

  Event ที่พนักงาน ไม่ได้รับ (เฉพาะ Manager ขึ้นไป):
  ┌─────────────────────────────────────────────┐
  │ ✗  Approval queue ของคนอื่น                 │
  │ ✗  Download alert ของเอกสารคนอื่น           │
  │ ✗  Audit Log alerts                          │
  │ ✗  System-wide activity digest               │
  └─────────────────────────────────────────────┘
```

---

## 3. Role Permission Matrix

| Action | Operator | Manager | QA Mgr | Director | Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| ดูเอกสาร Active | ✓ (แผนกตัวเอง) | ✓ (ทั้งหมด) | ✓ | ✓ | ✓ |
| อัปโหลดเอกสาร | ✓ | ✓ | ✓ | ✗ | ✓ |
| สร้าง Revision | ✓ | ✓ | ✓ | ✗ | ✓ |
| ส่งขออนุมัติ | ✓ | ✓ | ✓ | ✗ | ✓ |
| อนุมัติเอกสาร | ✗ | ✓ (step ตัวเอง) | ✓ | ✓ (final) | ✓ |
| ส่งกลับแก้ไข | ✗ | ✓ | ✓ | ✓ | ✓ |
| ดู Revision History | ✓ (ตัวเอง) | ✓ | ✓ | ✓ | ✓ |
| Restore Revision | ✗ | ✓ | ✓ | ✗ | ✓ |
| ดู Audit Log | ✗ | ✓ | ✓ | ✓ | ✓ |
| Export Audit Log | ✗ | ✓ | ✓ | ✓ | ✓ |
| ตั้งค่า Obsolete | ✗ | ✓ | ✓ | ✓ | ✓ |
| ลบเอกสาร | ✗ | ✗ | ✗ | ✗ | ✓ |
| จัดการ User | ✗ | ✗ | ✗ | ✗ | ✓ |
| ตั้งค่า Workflow | ✗ | ✗ | ✗ | ✗ | ✓ |
| ดาวน์โหลด | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 4. Document Review Cycle

เอกสารทุกฉบับมี Review Cycle กำหนดไว้ เพื่อให้มั่นใจว่าเนื้อหายังคงถูกต้องตามมาตรฐาน

```
  เอกสาร Active
         │
         ▼
  ตรวจสอบ Review Date ทุกวัน (Scheduled Job)
         │
         ├── เหลือ 30 วัน ──▶ แจ้งเตือน "ใกล้ครบ review" (Warning)
         ├── เหลือ 14 วัน ──▶ แจ้งเตือนซ้ำ (Urgent)
         ├── เหลือ 7 วัน  ──▶ แจ้งเตือนทุกวัน + แจ้ง Manager
         └── ครบกำหนด     ──▶ เอกสาร flag "Overdue Review"
                              ต้องสร้าง Revision หรือยืนยันขยายเวลา
         │
         ▼
  [ผู้รับผิดชอบดำเนินการ]
         │
         ├── ไม่มีการเปลี่ยนแปลง ──▶ สร้าง Revision ว่าง "No change review"
         │                            ส่ง Approval → อนุมัติ → Review Date รีเซ็ต
         │
         └── มีการเปลี่ยนแปลง ──▶ สร้าง Revision ใหม่ตาม workflow ปกติ
```

---

*เอกสารนี้สร้างจาก FactoryDMS Prototype v2.0 — อ้างอิงจาก session.js, sidebar.js และ module ทั้ง 5 ของระบบ*
