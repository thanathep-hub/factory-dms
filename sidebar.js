/* ===== Sidebar Role-aware Injector ===== */
/* Call buildSidebar(activePageId) after DOMContentLoaded */

const MANAGER_NAV = [
  { id:'00-dashboard',         icon:'layout-dashboard', label:'Dashboard',         href:'00-dashboard.html' },
  { id:'01-document-store',    icon:'files',            label:'จัดเก็บเอกสาร',    href:'01-document-store.html' },
  { id:'02-approval',          icon:'check-check',      label:'Approval',          href:'02-approval.html',  badge:'approval' },
  { id:'03-revision-control',  icon:'git-branch',       label:'Revision Control',  href:'03-revision-control.html' },
  { id:'04-audit-log',         icon:'clipboard-list',   label:'Audit Log',         href:'04-audit-log.html',  perm:'canViewAuditLog' },
  { id:'05-notification',      icon:'bell',             label:'Notification',      href:'05-notification.html', badge:'notif' },
];

const OPERATOR_NAV = [
  { id:'emp-01-my-documents',  icon:'file-text',  label:'เอกสารของฉัน',    href:'emp-01-my-documents.html' },
  { id:'emp-02-browse',        icon:'search',     label:'ค้นหาเอกสาร',    href:'emp-02-browse.html' },
  { id:'emp-03-tracking',      icon:'git-branch', label:'ติดตามสถานะ',     href:'emp-03-tracking.html', badge:'tracking' },
  { id:'emp-04-notification',  icon:'bell',       label:'แจ้งเตือน',       href:'emp-04-notification.html', badge:'notif' },
];

const BADGE_COUNTS = { approval:5, tracking:2, notif:3 };

function buildSidebar(activePage) {
  const role  = DMS_getRole();
  const info  = DMS_getRoleInfo();
  const perms = DMS_getPerms();
  const nav   = (role === 'operator') ? OPERATOR_NAV : MANAGER_NAV;

  const roleColors = {
    operator:'#16a34a', manager:'#2563eb', qa:'#7c3aed',
    director:'#b45309', admin:'#dc2626',
  };
  const col = roleColors[role] || '#2563eb';

  const navHtml = nav
    .filter(item => !item.perm || perms[item.perm])
    .map(item => {
      const isActive = item.id === activePage;
      const badgeCount = item.badge ? BADGE_COUNTS[item.badge] : 0;
      return `<div class="nav-item${isActive?' active':''}" onclick="location.href='${item.href}'">
        <i data-lucide="${item.icon}"></i>
        <span>${item.label}</span>
        ${badgeCount ? `<span class="nav-badge">${badgeCount}</span>` : ''}
      </div>`;
    }).join('');

  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <div class="logo-mark">DM</div>
      <div><div class="logo-text">FactoryDMS</div><div class="logo-sub">โรงงาน ก · QA System</div></div>
    </div>
    <nav class="sidebar-nav">
      ${role === 'operator'
        ? '<div class="nav-section">เมนูพนักงาน</div>'
        : '<div class="nav-section">หลัก</div>'}
      ${navHtml}
    </nav>
    <div class="sidebar-footer">
      <div style="padding:6px 8px 10px;border-bottom:1px solid var(--border);margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:6px;padding:4px 8px">
          <div style="width:6px;height:6px;border-radius:50%;background:${col}"></div>
          <span style="font-size:10px;font-weight:700;color:${col}" class="user-role-badge">${info.label}</span>
        </div>
      </div>
      <div class="user-card" onclick="DMS_logout()">
        <div class="avatar user-name" style="background:${col}18;color:${col};border-color:${col}40">${info.avatar}</div>
        <div style="overflow:hidden;flex:1">
          <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" class="user-name">${info.name}</div>
          <div style="font-size:10px;color:var(--text3)" class="user-dept">${info.dept}</div>
        </div>
        <i data-lucide="log-out" style="width:14px;height:14px;color:var(--text3);flex-shrink:0"></i>
      </div>
    </div>`;
  lucide.createIcons();
}

/* Role-gate: redirect if wrong role group */
function DMS_requireRole(allowedRoles) {
  const role = DMS_getRole();
  if (!allowedRoles.includes(role)) {
    const perms = DMS_getPerms();
    window.location.href = perms.home;
  }
}
