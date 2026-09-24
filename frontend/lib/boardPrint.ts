// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ExportComment {
  id: string;
  text: string;
  author: string;
  author_email: string;
  created_at: string;
}

export interface ExportActivity {
  action: string;
  metadata: Record<string, unknown>;
  user_name: string | null;
  created_at: string;
}

export interface ExportCard {
  id: string;
  name: string;
  list_id: string;
  description: string | null;
  due_date: string | null;
  labels: { color: string; text: string | null }[];
  members: { name: string; email: string }[];
  comments: ExportComment[];
  activity: ExportActivity[];
}

export interface ExportAttachment {
  attachment_id: string;
  name: string;
  uploaded_by: string;
  card_id: string;
  list_id: string | null;
  due_date: string | null;
}

export interface ExportChatMessage {
  content: string;
  sent_by: string;
  time: string;
}

export interface ExportListItem {
  id: string;
  name: string;
  total_cards: number;
}

export interface ExportUser {
  name: string;
  email: string;
  role: string;
  joined_date: string;
}

export interface BoardExport {
  board: {
    id: string;
    name: string;
    is_favourite: boolean;
    generated_at: string;
  };
  users: ExportUser[];
  lists: {
    total: number;
    items: ExportListItem[];
  };
  cards: {
    total: number;
    items: ExportCard[];
  };
  attachments: ExportAttachment[];
  chat: ExportChatMessage[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LABEL_COLORS: Record<string, { bg: string; fg: string }> = {
  red:    { bg: '#fee2e2', fg: '#991b1b' },
  orange: { bg: '#ffedd5', fg: '#9a3412' },
  yellow: { bg: '#fef3c7', fg: '#854d0e' },
  green:  { bg: '#dcfce7', fg: '#166534' },
  blue:   { bg: '#dbeafe', fg: '#1e40af' },
  purple: { bg: '#ede9fe', fg: '#6d28d9' },
  pink:   { bg: '#fce7f3', fg: '#9d174d' },
};

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function roleStyle(role: string): { color: string; bg: string } {
  if (role === 'owner')  return { color: '#4f46e5', bg: '#eef2ff' };
  if (role === 'editor') return { color: '#0891b2', bg: '#ecfeff' };
  return { color: '#6b7280', bg: '#f9fafb' };
}

function fmtAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function secHead(title: string, count?: number): string {
  const badge = count !== undefined
    ? `<span class="sec-badge">${count}</span>`
    : '';
  return `
    <div class="sec-head">
      <span class="sec-title">${title}</span>
      ${badge}
      <div class="sec-rule"></div>
    </div>`;
}

// ── Cover page ────────────────────────────────────────────────────────────────

function buildCover(data: BoardExport): string {
  const { board, users, lists, cards, attachments, chat } = data;
  const totalComments = cards.items.reduce((s, c) => s + c.comments.length, 0);

  const favHtml = board.is_favourite
    ? `<span class="fav-yes">&#9733; Favourite</span>`
    : `<span class="fav-no">&#9734; Not Favourite</span>`;

  return `
    <div class="cover">
      <div class="cover-banner">
        <div class="cover-top-row">
          <span class="brand">TaskBoard</span>
          <div class="cover-meta">
            ${favHtml}
            <span class="gen-date">Generated ${fmtDate(board.generated_at)}</span>
          </div>
        </div>
        <div class="cover-title">${esc(board.name)}</div>
        <div class="cover-id">Board ID: ${esc(board.id)}</div>
      </div>
      <div class="cover-body">
        <div class="stats-grid">
          <div class="stat-card"><span class="stat-val">${lists.total}</span><span class="stat-lbl">Lists</span></div>
          <div class="stat-card"><span class="stat-val">${cards.total}</span><span class="stat-lbl">Cards</span></div>
          <div class="stat-card"><span class="stat-val">${users.length}</span><span class="stat-lbl">Members</span></div>
          <div class="stat-card"><span class="stat-val">${totalComments}</span><span class="stat-lbl">Comments</span></div>
          <div class="stat-card"><span class="stat-val">${attachments.length}</span><span class="stat-lbl">Attachments</span></div>
          <div class="stat-card"><span class="stat-val">${chat.length}</span><span class="stat-lbl">Chat Msgs</span></div>
        </div>
      </div>
    </div>`;
}

// ── Users section ─────────────────────────────────────────────────────────────

function buildUsersSection(users: ExportUser[]): string {
  if (!users.length) return '';
  const rows = users.map((u) => {
    const rs = roleStyle(u.role);
    return `
      <tr>
        <td class="td-name">${esc(u.name)}</td>
        <td><span class="role-chip" style="color:${rs.color};background:${rs.bg}">${esc(u.role)}</span></td>
        <td class="td-meta">${esc(u.email)}</td>
        <td class="td-meta">${fmtDate(u.joined_date)}</td>
      </tr>`;
  }).join('');
  return `
    ${secHead('Members', users.length)}
    <table class="data-table">
      <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Joined</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Lists section ─────────────────────────────────────────────────────────────

function buildListsSection(lists: BoardExport['lists']): string {
  if (!lists.items.length) return '';
  const rows = lists.items.map((l) => `
    <tr>
      <td>${esc(l.name)}</td>
      <td class="td-mono">${esc(l.id)}</td>
      <td class="td-num">${l.total_cards}</td>
    </tr>`).join('');
  return `
    ${secHead('Lists', lists.total)}
    <table class="data-table">
      <thead><tr><th>List Name</th><th>List ID</th><th style="text-align:center">Total Cards</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Cards section ─────────────────────────────────────────────────────────────

function buildCardBlock(card: ExportCard): string {
  const now = new Date();
  const due = card.due_date ? new Date(card.due_date) : null;
  const isOverdue = due ? due < now : false;
  const isDueSoon = due && !isOverdue ? (due.getTime() - now.getTime()) < 86_400_000 * 3 : false;

  const dueHtml = due
    ? `<span class="due-badge ${isOverdue ? 'due-over' : isDueSoon ? 'due-soon' : 'due-ok'}">${isOverdue ? 'Overdue' : 'Due'}: ${fmtDate(card.due_date!)}</span>`
    : '';

  const labelsHtml = card.labels.length
    ? `<div class="card-labels">${card.labels.map((l) => {
        const p = LABEL_COLORS[l.color] ?? { bg: '#f3f4f6', fg: '#374151' };
        return `<span class="label-pill" style="background:${p.bg};color:${p.fg}">${esc(l.text || l.color)}</span>`;
      }).join('')}</div>`
    : '';

  const membersHtml = card.members.length
    ? `<div class="card-members">&#128100; ${card.members.map((m) => esc(m.name)).join(', ')}</div>`
    : '';

  const descHtml = card.description
    ? `<div class="card-desc">${esc(card.description)}</div>`
    : '';

  const commentsHtml = card.comments.length
    ? `<div class="card-subsec">
        <div class="sub-head">Comments (${card.comments.length})</div>
        ${card.comments.map((c) => `
          <div class="comment-block">
            <div class="comment-hdr">
              <span class="comment-author">${esc(c.author)}</span>
              <span class="comment-date">${fmtDate(c.created_at)}</span>
            </div>
            <div class="comment-text">${esc(c.text)}</div>
          </div>`).join('')}
      </div>`
    : '';

  const activityHtml = card.activity.length
    ? `<div class="card-subsec">
        <div class="sub-head">Activity (${card.activity.length})</div>
        ${card.activity.map((a) => `
          <div class="act-entry">
            <span class="act-action">${esc(fmtAction(a.action))}</span>
            ${a.user_name ? `<span class="act-user">by ${esc(a.user_name)}</span>` : ''}
            <span class="act-date">${fmtDate(a.created_at)}</span>
          </div>`).join('')}
      </div>`
    : '';

  return `
    <div class="card-block">
      <div class="card-hdr">
        <div class="card-title">${esc(card.name)}</div>
        ${dueHtml}
      </div>
      <div class="card-ids">
        <span class="id-chip">Card: ${esc(card.id)}</span>
        <span class="id-chip">List: ${esc(card.list_id)}</span>
      </div>
      ${labelsHtml}
      ${membersHtml}
      ${descHtml}
      ${commentsHtml}
      ${activityHtml}
    </div>`;
}

function buildCardsSection(data: BoardExport): string {
  const { cards, lists } = data;
  if (!cards.items.length) return '';

  const listMap = Object.fromEntries(lists.items.map((l) => [l.id, l.name]));

  const grouped: Record<string, ExportCard[]> = {};
  const listOrder: string[] = [];
  for (const card of cards.items) {
    if (!grouped[card.list_id]) {
      grouped[card.list_id] = [];
      listOrder.push(card.list_id);
    }
    grouped[card.list_id].push(card);
  }

  const groupsHtml = listOrder.map((listId) => {
    const listCards = grouped[listId];
    const listName = listMap[listId] || listId;
    return `
      <div class="list-group">
        <div class="list-group-hdr">
          <span class="list-group-name">${esc(listName)}</span>
          <span class="list-group-id">${esc(listId)}</span>
          <span class="list-group-count">${listCards.length} card${listCards.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="list-group-body">${listCards.map(buildCardBlock).join('')}</div>
      </div>`;
  }).join('');

  return `${secHead('Cards', cards.total)}${groupsHtml}`;
}

// ── Attachments section ───────────────────────────────────────────────────────

function buildAttachmentsSection(attachments: ExportAttachment[]): string {
  if (!attachments.length) return '';
  const rows = attachments.map((a) => `
    <tr>
      <td class="td-mono">${esc(a.attachment_id)}</td>
      <td>${esc(a.name)}</td>
      <td>${esc(a.uploaded_by)}</td>
      <td class="td-mono">${esc(a.card_id)}</td>
      <td class="td-mono">${esc(a.list_id || '—')}</td>
      <td class="td-meta">${a.due_date ? fmtDate(a.due_date) : '—'}</td>
    </tr>`).join('');
  return `
    ${secHead('Attachments', attachments.length)}
    <table class="data-table">
      <thead>
        <tr>
          <th>Attachment ID</th><th>Name</th><th>Uploaded By</th>
          <th>Card ID</th><th>List ID</th><th>Card Due Date</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Chat section ──────────────────────────────────────────────────────────────

function buildChatSection(chat: ExportChatMessage[]): string {
  if (!chat.length) return '';
  const msgs = chat.map((m) => `
    <div class="chat-msg">
      <div class="chat-hdr">
        <span class="chat-sender">${esc(m.sent_by)}</span>
        <span class="chat-time">${fmtDateTime(m.time)}</span>
      </div>
      <div class="chat-text">${esc(m.content)}</div>
    </div>`).join('');
  return `${secHead('Chat Messages', chat.length)}<div class="chat-list">${msgs}</div>`;
}

// ── HTML document ─────────────────────────────────────────────────────────────

function buildHtml(data: BoardExport): string {
  return `<div class="pdf-root">
  <style>
    .pdf-root *, .pdf-root *::before, .pdf-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
    .pdf-root {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 9.5pt; color: #1f2937; background: #fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; width: 794px;
    }

    /* ── Cover ── */
    .pdf-root .cover { width: 100%; page-break-after: always; }
    .pdf-root .cover-banner { background: #4f46e5; padding: 36pt 2.4cm 28pt; }
    .pdf-root .cover-top-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18pt; }
    .pdf-root .brand { font-size: 8.5pt; font-weight: 800; letter-spacing: 2pt; color: #a5b4fc; text-transform: uppercase; }
    .pdf-root .cover-meta { display: flex; align-items: center; gap: 12pt; }
    .pdf-root .fav-yes { font-size: 8pt; font-weight: 700; color: #fef08a; background: rgba(255,255,255,0.15); padding: 2.5pt 9pt; border-radius: 10pt; }
    .pdf-root .fav-no { font-size: 8pt; font-weight: 600; color: #a5b4fc; background: rgba(255,255,255,0.1); padding: 2.5pt 9pt; border-radius: 10pt; }
    .pdf-root .gen-date { font-size: 7.5pt; color: #a5b4fc; }
    .pdf-root .cover-title { font-size: 28pt; font-weight: 800; color: #fff; line-height: 1.15; letter-spacing: -0.5pt; word-break: break-word; margin-bottom: 8pt; }
    .pdf-root .cover-id { font-size: 7.5pt; font-family: 'Courier New', monospace; color: #818cf8; }
    .pdf-root .cover-body { padding: 28pt 2.4cm 36pt; }
    .pdf-root .stats-grid { display: flex; gap: 10pt; }
    .pdf-root .stat-card { flex: 1; background: #f9fafb; border: 1pt solid #e5e7eb; border-radius: 8pt; padding: 14pt 8pt; text-align: center; }
    .pdf-root .stat-val { display: block; font-size: 22pt; font-weight: 800; color: #4f46e5; line-height: 1; margin-bottom: 5pt; }
    .pdf-root .stat-lbl { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6pt; color: #9ca3af; }

    /* ── Content ── */
    .pdf-root .content { padding: 24pt 2.4cm 32pt; }

    /* ── Section heading ── */
    .pdf-root .sec-head { display: flex; align-items: center; gap: 8pt; margin: 28pt 0 14pt; }
    .pdf-root .sec-title { font-size: 7.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5pt; color: #4f46e5; white-space: nowrap; }
    .pdf-root .sec-badge { font-size: 7pt; font-weight: 700; background: #eef2ff; color: #4f46e5; padding: 1.5pt 7pt; border-radius: 10pt; }
    .pdf-root .sec-rule { flex: 1; height: 1pt; background: #e5e7eb; }

    /* ── Data table ── */
    .pdf-root .data-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 4pt; }
    .pdf-root .data-table th { background: #f9fafb; border: 1pt solid #e5e7eb; padding: 6pt 9pt; text-align: left; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5pt; color: #6b7280; }
    .pdf-root .data-table td { border: 1pt solid #e5e7eb; padding: 6pt 9pt; vertical-align: top; line-height: 1.5; }
    .pdf-root .data-table tr:nth-child(even) td { background: #fafafa; }
    .pdf-root .td-mono { font-family: 'Courier New', monospace; font-size: 7pt; color: #6b7280; word-break: break-all; }
    .pdf-root .td-num { text-align: center; font-weight: 700; color: #4f46e5; }
    .pdf-root .td-name { font-weight: 600; color: #111827; }
    .pdf-root .td-meta { color: #6b7280; font-size: 8pt; }

    /* ── Role chip ── */
    .pdf-root .role-chip { display: inline-block; font-size: 7pt; font-weight: 700; text-transform: capitalize; padding: 2pt 8pt; border-radius: 10pt; }

    /* ── List group ── */
    .pdf-root .list-group { margin-bottom: 20pt; break-inside: avoid; }
    .pdf-root .list-group-hdr { display: flex; align-items: center; gap: 8pt; background: #4f46e5; color: #fff; padding: 8pt 12pt; border-radius: 6pt 6pt 0 0; }
    .pdf-root .list-group-name { font-size: 10pt; font-weight: 700; }
    .pdf-root .list-group-id { font-size: 6.5pt; font-family: 'Courier New', monospace; color: #a5b4fc; flex: 1; word-break: break-all; }
    .pdf-root .list-group-count { font-size: 7pt; font-weight: 600; background: rgba(255,255,255,0.2); padding: 2pt 7pt; border-radius: 10pt; white-space: nowrap; }
    .pdf-root .list-group-body { border: 1pt solid #e5e7eb; border-top: none; border-radius: 0 0 6pt 6pt; overflow: hidden; }

    /* ── Card block ── */
    .pdf-root .card-block { padding: 12pt 14pt; border-bottom: 1pt solid #f3f4f6; break-inside: avoid; }
    .pdf-root .card-block:last-child { border-bottom: none; }
    .pdf-root .card-block:nth-child(even) { background: #fafafa; }
    .pdf-root .card-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 10pt; margin-bottom: 5pt; }
    .pdf-root .card-title { font-size: 10pt; font-weight: 700; color: #111827; line-height: 1.3; }
    .pdf-root .due-badge { display: inline-block; font-size: 7pt; font-weight: 600; padding: 2.5pt 8pt; border-radius: 10pt; white-space: nowrap; flex-shrink: 0; }
    .pdf-root .due-ok   { background: #f3f4f6; color: #374151; }
    .pdf-root .due-soon { background: #fef3c7; color: #854d0e; }
    .pdf-root .due-over { background: #fee2e2; color: #991b1b; }
    .pdf-root .card-ids { display: flex; flex-wrap: wrap; gap: 4pt; margin-bottom: 6pt; }
    .pdf-root .id-chip { font-size: 6.5pt; font-family: 'Courier New', monospace; color: #6b7280; background: #f3f4f6; padding: 1.5pt 6pt; border-radius: 4pt; word-break: break-all; }
    .pdf-root .card-labels { display: flex; flex-wrap: wrap; gap: 4pt; margin-bottom: 5pt; }
    .pdf-root .label-pill { font-size: 7pt; font-weight: 700; padding: 2pt 8pt; border-radius: 10pt; }
    .pdf-root .card-members { font-size: 8pt; color: #6b7280; margin-bottom: 5pt; }
    .pdf-root .card-desc { font-size: 8.5pt; color: #374151; line-height: 1.75; margin: 7pt 0; padding: 7pt 10pt; background: #f9fafb; border-left: 3pt solid #e5e7eb; border-radius: 0 4pt 4pt 0; white-space: pre-wrap; }

    /* ── Subsections (comments / activity) ── */
    .pdf-root .card-subsec { margin-top: 9pt; padding-top: 7pt; border-top: 1pt solid #f3f4f6; }
    .pdf-root .sub-head { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6pt; color: #9ca3af; margin-bottom: 6pt; }
    .pdf-root .comment-block { background: #f9fafb; border: 1pt solid #e5e7eb; border-left: 3pt solid #4f46e5; border-radius: 0 4pt 4pt 0; padding: 6pt 9pt; margin-bottom: 4pt; }
    .pdf-root .comment-block:last-child { margin-bottom: 0; }
    .pdf-root .comment-hdr { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3pt; }
    .pdf-root .comment-author { font-size: 7.5pt; font-weight: 700; color: #111827; }
    .pdf-root .comment-date { font-size: 6.5pt; color: #9ca3af; }
    .pdf-root .comment-text { font-size: 8pt; color: #374151; line-height: 1.6; white-space: pre-wrap; }
    .pdf-root .act-entry { display: flex; align-items: baseline; gap: 5pt; font-size: 7.5pt; padding: 3pt 0; border-bottom: 1pt solid #f9fafb; }
    .pdf-root .act-entry:last-child { border-bottom: none; }
    .pdf-root .act-action { font-weight: 600; color: #111827; }
    .pdf-root .act-user { color: #4f46e5; }
    .pdf-root .act-date { color: #9ca3af; margin-left: auto; white-space: nowrap; }

    /* ── Chat ── */
    .pdf-root .chat-list { display: flex; flex-direction: column; gap: 7pt; }
    .pdf-root .chat-msg { background: #f9fafb; border: 1pt solid #e5e7eb; border-radius: 6pt; padding: 8pt 10pt; break-inside: avoid; }
    .pdf-root .chat-hdr { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4pt; }
    .pdf-root .chat-sender { font-size: 8pt; font-weight: 700; color: #4f46e5; }
    .pdf-root .chat-time { font-size: 7pt; color: #9ca3af; }
    .pdf-root .chat-text { font-size: 8.5pt; color: #374151; line-height: 1.65; white-space: pre-wrap; }

    /* ── Footer ── */
    .pdf-root .pdf-footer { margin-top: 28pt; padding-top: 10pt; border-top: 1pt solid #e5e7eb; display: flex; justify-content: space-between; font-size: 7.5pt; color: #9ca3af; }
  </style>

  ${buildCover(data)}

  <div class="content">
    ${buildUsersSection(data.users)}
    ${buildListsSection(data.lists)}
    ${buildCardsSection(data)}
    ${buildAttachmentsSection(data.attachments)}
    ${buildChatSection(data.chat)}

    <div class="pdf-footer">
      <span>TaskBoard &mdash; ${esc(data.board.name)}</span>
      <span>Exported ${fmtDate(data.board.generated_at)}</span>
    </div>
  </div>
</div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function downloadBoardPDF(data: BoardExport): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;
  const html = buildHtml(data);

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:0;z-index:-9999;pointer-events:none;';
  container.innerHTML = html;
  document.body.appendChild(container);

  const root = container.querySelector('.pdf-root') as HTMLElement;
  const safe = data.board.name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').toLowerCase();

  try {
    await html2pdf()
      .set({
        margin: 0,
        filename: `${safe}_board.pdf`,
        image: { type: 'jpeg', quality: 0.97 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: 794,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        ...({ pagebreak: { mode: ['css', 'legacy'] } } as any),
      })
      .from(root)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}
