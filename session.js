/* ===== FactoryDMS — Session & Role Management ===== */
const DMS_SESSION_KEY = 'dms_session';

const ROLES = {
  operator:  { label:'พนักงานทั่วไป',  color:'#16a34a',  avatar:'AT', name:'อนุชา ทองดี',  dept:'Engineering' },
  manager:   { label:'ผู้จัดการ / QA', color:'#2563eb',  avatar:'SK', name:'สมชาย กิตติ',  dept:'Production'  },
  qa:        { label:'QA Manager',      color:'#7c3aed',  avatar:'NP', name:'นภา พงษ์สวัสดิ์', dept:'QA'         },
  director:  { label:'ผู้อำนวยการ',    color:'#b45309',  avatar:'DI', name:'วิชัย ศิริพงษ์', dept:'Management'  },
  admin:     { label:'Admin',           color:'#dc2626',  avatar:'AD', name:'Admin System',   dept:'IT'          },
};

const ROLE_PERMISSIONS = {
  operator: {
    canApprove:false, canReject:false, canViewAllDocs:false,
    canViewAuditLog:false, canManageUsers:false, canViewAllApprovals:false,
    canCreateRevision:true, canUpload:true, canDownload:true,
    pages: ['emp-01-my-documents','emp-02-browse','emp-03-tracking','emp-04-notification'],
    home: 'emp-01-my-documents.html',
  },
  manager: {
    canApprove:true, canReject:true, canViewAllDocs:true,
    canViewAuditLog:true, canManageUsers:false, canViewAllApprovals:true,
    canCreateRevision:true, canUpload:true, canDownload:true,
    pages: ['00-dashboard','01-document-store','02-approval','03-revision-control','04-audit-log','05-notification'],
    home: '00-dashboard.html',
  },
  qa: {
    canApprove:true, canReject:true, canViewAllDocs:true,
    canViewAuditLog:true, canManageUsers:false, canViewAllApprovals:true,
    canCreateRevision:true, canUpload:true, canDownload:true,
    pages: ['00-dashboard','01-document-store','02-approval','03-revision-control','04-audit-log','05-notification'],
    home: '00-dashboard.html',
  },
  director: {
    canApprove:true, canReject:true, canViewAllDocs:true,
    canViewAuditLog:true, canManageUsers:false, canViewAllApprovals:true,
    canCreateRevision:false, canUpload:false, canDownload:true,
    pages: ['00-dashboard','01-document-store','02-approval','03-revision-control','04-audit-log','05-notification'],
    home: '00-dashboard.html',
  },
  admin: {
    canApprove:true, canReject:true, canViewAllDocs:true,
    canViewAuditLog:true, canManageUsers:true, canViewAllApprovals:true,
    canCreateRevision:true, canUpload:true, canDownload:true,
    pages: ['00-dashboard','01-document-store','02-approval','03-revision-control','04-audit-log','05-notification'],
    home: '00-dashboard.html',
  },
};

function DMS_setSession(role) {
  sessionStorage.setItem(DMS_SESSION_KEY, JSON.stringify({ role, ts: Date.now() }));
}
function DMS_getSession() {
  try { return JSON.parse(sessionStorage.getItem(DMS_SESSION_KEY)); } catch { return null; }
}
function DMS_getRole() {
  const s = DMS_getSession();
  return (s && ROLES[s.role]) ? s.role : 'manager'; // default fallback
}
function DMS_getPerms() { return ROLE_PERMISSIONS[DMS_getRole()]; }
function DMS_getRoleInfo() { return ROLES[DMS_getRole()]; }
function DMS_logout() { sessionStorage.removeItem(DMS_SESSION_KEY); location.href = '00-login.html'; }

/* Apply role UI to any page that calls this */
function DMS_applyRoleUI() {
  const role = DMS_getRole();
  const info = ROLES[role];
  const perms = ROLE_PERMISSIONS[role];

  // Update user card in sidebar
  const avatarEl = document.querySelector('.sidebar .avatar');
  const nameEl   = document.querySelector('.sidebar .user-name');
  const deptEl   = document.querySelector('.sidebar .user-dept');
  const roleEl   = document.querySelector('.sidebar .user-role-badge');
  if (avatarEl) avatarEl.textContent = info.avatar;
  if (nameEl)   nameEl.textContent   = info.name;
  if (deptEl)   deptEl.textContent   = info.dept;
  if (roleEl)   { roleEl.textContent = info.label; roleEl.style.color = info.color; }

  // Show role badge in topbar if exists
  const topRoleBadge = document.getElementById('topbar-role');
  if (topRoleBadge) {
    topRoleBadge.textContent = info.label;
    topRoleBadge.style.background = info.color + '18';
    topRoleBadge.style.color = info.color;
    topRoleBadge.style.border = `1px solid ${info.color}30`;
  }

  // Hide restricted elements
  document.querySelectorAll('[data-role-hide]').forEach(el => {
    const restricted = el.dataset.roleHide.split(',').map(s => s.trim());
    if (restricted.includes(role)) el.style.display = 'none';
  });
  document.querySelectorAll('[data-role-show]').forEach(el => {
    const allowed = el.dataset.roleShow.split(',').map(s => s.trim());
    el.style.display = allowed.includes(role) ? '' : 'none';
  });
  document.querySelectorAll('[data-perm]').forEach(el => {
    const perm = el.dataset.perm;
    if (!perms[perm]) el.style.display = 'none';
  });
}
