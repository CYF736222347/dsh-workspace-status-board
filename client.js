/*
 * Workspace status board — Client half.
 *
 * Registers at priority -1 into the sidebar's `sidebar.workspaces` single slot,
 * shadowing the shipped WorkspaceBrowser. The shipped browser returns when this
 * bundle is disabled or removed.
 *
 * Sorting contract:
 *   1. needs-input  (pending approval / plan review / question)
 *   2. running      (own turn or a running direct subagent)
 *   3. done         (idle / completed)
 * Within one state: session summary `updatedAt` descending. That field is
 * max(session created time, latest human-authored prompt or steer time), the
 * same recency the shipped "Last updated" order uses.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-workspace-status-board',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'workspaceStatusBoard'
    const STATES = ['attention', 'running', 'done']
    const RANK = { attention: 0, running: 1, done: 2 }
    const COLLAPSE_KEY = 'dsh.workspace-status-board.collapsed.v1'
    const ARCHIVED_WORKSPACES_KEY = 'dsh.workspace-status-board.archived-workspaces.v1'
    const AUTO_SORT_KEY = 'dsh.workspace-status-board.auto-sort.v1'
    const DONE_PREVIEW_LIMIT = 3
    const EMPTY_MAP = new Map()
    const EMPTY_SESSIONS = { phase: 'ready', ids: [], byId: {}, projectionsBySession: {} }

    const en = {
      title: 'Workspaces',
      'title.rail': 'Workspace status',
      total: '{n} workspaces',
      'summary.attention': '{n} need you',
      'summary.running': '{n} running',
      'summary.done': '{n} done',
      'state.attention': 'Needs input',
      'state.running': 'Running',
      'state.done': 'Done',
      'pending.approval': 'Approval',
      'pending.plan': 'Plan review',
      'pending.question': 'Answer',
      'pending.approval.full': 'Waiting for approval',
      'pending.plan.full': 'Plan awaiting review',
      'pending.question.full': 'Waiting for answer',
      'running.children': 'Subagents {n}',
      'tasks.none': 'No tasks yet',
      'tasks.one': '1 task',
      'tasks.other': '{n} tasks',
      active: 'Active {time}',
      newSession: 'New session in {name}',
      addWorkspace: 'Add workspace',
      'addWorkspace.error': 'Could not add workspace: {message}',
      'addWorkspace.pathTitle': 'Add workspace by path',
      'addWorkspace.pathPlaceholder': 'Absolute directory path',
      'addWorkspace.pathHint': 'The native folder picker is unavailable here. Enter an absolute directory path.',
      'addWorkspace.add': 'Add',
      'addWorkspace.cancel': 'Cancel',
      'search.label': 'Search workspaces and tasks',
      'search.placeholder': 'Search workspaces or tasks',
      'search.clear': 'Clear search',
      'search.empty': 'No matching workspaces or tasks',
      'search.hint': 'Search by workspace name, path, or task title.',
      'total.results': '{n} results',
      'done.more': '{n} more done',
      'done.less': 'Show less',
      dragWorkspace: 'Drag to reorder workspace',
      dragTask: 'Drag to reorder task',
      'autoSort.short': 'Auto',
      'autoSort.on': 'Auto sort on (turn off to drag)',
      'autoSort.off': 'Auto sort off; drag to adjust order',
      'archive.action': 'Archive task',
      'archive.confirm': '"{name}" still has running work. Stop it and archive?',
      'archive.stop': 'Stop and archive',
      'archive.cancel': 'Cancel',
      'archive.error': 'Could not archive: {message}',
      'archived.title': 'Archived ({n})',
      'archiveWorkspace.action': 'Archive workspace',
      'archivedWorkspaces.title': 'Archived workspaces ({n})',
      'archived.restore': 'Restore',
      'archived.restoreError': 'Could not restore: {message}',
      'rename.action': 'Rename workspace',
      'rename.title': 'Rename workspace',
      'rename.placeholder': 'Workspace name',
      'rename.save': 'Save',
      'rename.cancel': 'Cancel',
      'rename.error': 'Could not rename: {message}',
      'renameTask.action': 'Rename task',
      'renameTask.title': 'Rename task',
      'renameTask.placeholder': 'Task title',
      'renameTask.error': 'Could not rename task: {message}',
      expand: 'Expand {name}',
      collapse: 'Collapse {name}',
      ungrouped: 'Ungrouped',
      loading: 'Loading workspaces…',
      'empty.title': 'No workspaces yet',
      'empty.hint': 'Add a folder to start a workspace.',
      'time.now': 'just now',
      'time.unknown': 'no activity yet',
      'time.minutes': '{n} min ago',
      'time.hours': '{n} h ago',
      'time.days': '{n} d ago',
      untitled: 'Untitled workspace',
      unnamedSession: 'Untitled session',
      current: 'Open now',
      path: '{path}',
    }

    const zh = {
      title: '工作区',
      'title.rail': '工作区状态',
      total: '{n} 个工作区',
      'summary.attention': '{n} 需介入',
      'summary.running': '{n} 执行中',
      'summary.done': '{n} 已完成',
      'state.attention': '需要介入',
      'state.running': '执行中',
      'state.done': '已完成',
      'pending.approval': '待批准',
      'pending.plan': '待确认计划',
      'pending.question': '待回答',
      'pending.approval.full': '等待批准',
      'pending.plan.full': '计划等待确认',
      'pending.question.full': '等待回答',
      'running.children': '子任务 {n}',
      'tasks.none': '暂无任务',
      'tasks.one': '1 个任务',
      'tasks.other': '{n} 个任务',
      active: '最近活动 {time}',
      newSession: '在 {name} 中新建会话',
      addWorkspace: '添加工作区',
      'addWorkspace.error': '无法添加工作区：{message}',
      'addWorkspace.pathTitle': '按路径添加工作区',
      'addWorkspace.pathPlaceholder': '绝对目录路径',
      'addWorkspace.pathHint': '当前环境没有原生文件夹选择器，请直接输入绝对目录路径。',
      'addWorkspace.add': '添加',
      'addWorkspace.cancel': '取消',
      'search.label': '搜索工作区与任务',
      'search.placeholder': '搜索工作区或任务',
      'search.clear': '清除搜索',
      'search.empty': '没有匹配的工作区或任务',
      'search.hint': '可搜索工作区名称、路径或任务标题。',
      'total.results': '{n} 个结果',
      'done.more': '另外 {n} 个已完成',
      'done.less': '收起已完成',
      dragWorkspace: '拖动调整工作区顺序',
      dragTask: '拖动调整任务顺序',
      'autoSort.short': '自动',
      'autoSort.on': '自动排序：开（关闭后可拖拽）',
      'autoSort.off': '自动排序：关，可拖拽调整顺序',
      'archive.action': '归档任务',
      'archive.confirm': '“{name}”仍有正在执行的工作。停止并归档？',
      'archive.stop': '停止并归档',
      'archive.cancel': '取消',
      'archive.error': '归档失败：{message}',
      'archived.title': '已归档（{n}）',
      'archiveWorkspace.action': '归档工作区',
      'archivedWorkspaces.title': '已归档工作区（{n}）',
      'archived.restore': '恢复',
      'archived.restoreError': '恢复失败：{message}',
      'rename.action': '重命名工作区',
      'rename.title': '重命名工作区',
      'rename.placeholder': '工作区名称',
      'rename.save': '保存',
      'rename.cancel': '取消',
      'rename.error': '重命名失败：{message}',
      'renameTask.action': '重命名任务',
      'renameTask.title': '重命名任务',
      'renameTask.placeholder': '任务标题',
      'renameTask.error': '任务重命名失败：{message}',
      expand: '展开 {name}',
      collapse: '收起 {name}',
      ungrouped: '未归组',
      loading: '正在载入工作区…',
      'empty.title': '还没有工作区',
      'empty.hint': '添加一个文件夹即可开始。',
      'time.now': '刚刚',
      'time.unknown': '暂无活动',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',
      untitled: '未命名工作区',
      unnamedSession: '未命名会话',
      current: '当前打开',
      path: '{path}',
    }

    const CSS = [
      '.wsb-root{--wsb-accent:var(--dsw-alias-state-success-primary,#3fb950);display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.4}',
      '.wsb-root *,.wsb-root *::before,.wsb-root *::after{box-sizing:border-box}',
      '.wsb-root [data-state="attention"],.wsb-rail [data-state="attention"]{--wsb-accent:var(--dsw-alias-state-warn-primary,#d99a2b)}',
      '.wsb-root [data-state="running"],.wsb-rail [data-state="running"]{--wsb-accent:var(--dsw-alias-brand-primary,#4c8df6)}',
      '.wsb-root [data-state="done"],.wsb-rail [data-state="done"]{--wsb-accent:var(--dsw-alias-state-success-primary,#3fb950)}',
      '.wsb-visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
      '.wsb-head{display:flex;flex-direction:column;gap:6px;padding:8px 8px 6px}',
      '.wsb-head-row{display:flex;align-items:center;gap:6px;min-height:22px}',
      '.wsb-title{flex:1;min-width:0;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.wsb-total{flex:none;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.wsb-autosort{flex:none;display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 4px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;white-space:nowrap;cursor:pointer}',
      '.wsb-autosort:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.wsb-autosort-label{line-height:1}',
      '.wsb-autosort-track{position:relative;width:24px;height:14px;border-radius:7px;background:var(--dsw-alias-border-l2);transition:background .15s ease}',
      '.wsb-autosort-track[data-on="true"]{background:var(--dsw-alias-brand-primary,#4c8df6)}',
      '.wsb-autosort-thumb{position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#fff;transition:transform .15s ease}',
      '.wsb-autosort-track[data-on="true"] .wsb-autosort-thumb{transform:translateX(10px)}',
      '@media (prefers-reduced-motion:reduce){.wsb-autosort-track,.wsb-autosort-thumb{transition:none}}',
      '.wsb-add{flex:none;width:22px;height:22px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
      '.wsb-add:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.wsb-add:disabled{opacity:.5;cursor:default}',
      '.wsb-add:focus-visible,.wsb-autosort:focus-visible,.wsb-chip:focus-visible,.wsb-toggle:focus-visible,.wsb-new:focus-visible,.wsb-ws-archive:focus-visible,.wsb-rename-action:focus-visible,.wsb-rename-save:focus-visible,.wsb-rename-cancel:focus-visible,.wsb-session-main:focus-visible,.wsb-session-rename:focus-visible,.wsb-session-archive:focus-visible,.wsb-rail-btn:focus-visible,.wsb-empty-action:focus-visible,.wsb-more:focus-visible,.wsb-search-clear:focus-visible,.wsb-confirm-primary:focus-visible,.wsb-confirm-secondary:focus-visible,.wsb-archived-head:focus-visible,.wsb-restore:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c8df6);outline-offset:1px}',
      '.wsb-search{display:flex;align-items:center;gap:6px;height:28px;padding:0 8px;border:1px solid transparent;border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.wsb-search:focus-within{border-color:var(--dsw-alias-brand-primary,#4c8df6);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.wsb-search-icon{flex:none;display:inline-flex;align-items:center;justify-content:center}',
      '.wsb-search-input{flex:1;min-width:0;border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.4;padding:0;outline:none;appearance:none}',
      '.wsb-search-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.85}',
      '.wsb-search-input::-webkit-search-cancel-button{display:none}',
      '.wsb-search-clear{flex:none;width:18px;height:18px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
      '.wsb-search-clear:hover{background:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}',
      '.wsb-summary{display:flex;align-items:center;gap:5px;flex-wrap:wrap}',
      '.wsb-chip{display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--wsb-accent);font-size:10.5px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.wsb-chip[data-zero="true"]{opacity:.45}',
      '.wsb-error{margin:0 8px 4px;padding:5px 7px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 12%,transparent);color:var(--dsw-alias-state-error-primary,#e5484d);font-size:11px;line-height:1.4;overflow-wrap:anywhere}',
      '.wsb-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:2px 6px 12px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}',
      '.wsb-scroll::-webkit-scrollbar{width:6px}',
      '.wsb-scroll::-webkit-scrollbar-thumb{border-radius:3px;background:var(--dsw-alias-border-l2)}',
      '.wsb-scroll::-webkit-scrollbar-track{background:transparent}',
      '.wsb-group{margin:2px 0;border-radius:8px;min-width:0}',
      '.wsb-group[data-workspace-dragging="true"]{opacity:.55}',
      '.wsb-group[data-workspace-drop="before"] .wsb-group-head{box-shadow:inset 0 2px 0 var(--dsw-alias-brand-primary,#4c8df6),inset 2px 0 0 var(--wsb-accent)}',
      '.wsb-group[data-workspace-drop="after"] .wsb-group-head{box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary,#4c8df6),inset 2px 0 0 var(--wsb-accent)}',
      '.wsb-group-head{display:flex;align-items:center;gap:3px;min-height:30px;padding:3px 3px 3px 4px;border-radius:8px;box-shadow:inset 2px 0 0 var(--wsb-accent);background:transparent}',
      '.wsb-group[data-state="attention"] .wsb-group-head{background:color-mix(in srgb,var(--wsb-accent) 10%,transparent)}',
      '.wsb-group-head:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsb-group[data-state="attention"] .wsb-group-head:hover{background:color-mix(in srgb,var(--wsb-accent) 16%,transparent)}',
      '.wsb-toggle{flex:1;min-width:0;display:flex;align-items:center;gap:5px;padding:3px 2px;border:none;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.wsb-ws-grip{flex:none;width:14px;height:22px;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);opacity:0;cursor:grab;user-select:none}',
      '.wsb-group-head:hover .wsb-ws-grip{opacity:.7}',
      '.wsb-ws-grip:active{cursor:grabbing}',
      '.wsb-chevron{flex:none;display:inline-flex;color:var(--dsw-alias-label-secondary);transition:transform .15s ease}',
      '.wsb-toggle[aria-expanded="false"] .wsb-chevron{transform:rotate(-90deg)}',
      '.wsb-ws-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500}',
      '.wsb-pill{flex:none;display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px;border-radius:999px;font-size:10.5px;font-weight:600;white-space:nowrap;color:var(--wsb-accent);background:var(--dsw-alias-bg-layer-2);border:1px solid color-mix(in srgb,var(--wsb-accent) 38%,transparent);background:color-mix(in srgb,var(--wsb-accent) 13%,transparent)}',
      '.wsb-new{flex:none;width:22px;height:22px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;opacity:0}',
      '.wsb-group:hover .wsb-new,.wsb-new:focus-visible{opacity:1}',
      '.wsb-new:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '@media (hover:none){.wsb-new{opacity:1}}',
      '.wsb-ws-archive{flex:none;width:22px;height:22px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;opacity:0}',
      '.wsb-group:hover .wsb-ws-archive,.wsb-ws-archive:focus-visible{opacity:1}',
      '.wsb-ws-archive:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '@media (hover:none){.wsb-ws-archive{opacity:1}}',
      '.wsb-rename-action{flex:none;width:22px;height:22px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;opacity:0}',
      '.wsb-group:hover .wsb-rename-action,.wsb-rename-action:focus-visible{opacity:1}',
      '.wsb-rename-action:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '@media (hover:none){.wsb-rename-action{opacity:1}}',
      '.wsb-rename{display:flex;align-items:center;gap:5px;padding:2px 6px 5px 24px}',
      '.wsb-rename-session{padding-left:39px}',
      '.wsb-rename-input{flex:1;min-width:0;height:26px;padding:0 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none}',
      '.wsb-rename-input:focus{border-color:var(--dsw-alias-brand-primary,#4c8df6)}',
      '.wsb-rename-input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.wsb-rename-save,.wsb-rename-cancel{flex:none;height:26px;padding:0 8px;border-radius:6px;font:inherit;font-size:11px;cursor:pointer}',
      '.wsb-rename-save{border:none;background:var(--dsw-alias-brand-primary,#4c8df6);color:#fff}',
      '.wsb-rename-save:disabled{opacity:.5;cursor:default}',
      '.wsb-rename-cancel{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}',
      '.wsb-rename-cancel:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsb-add-path{display:flex;flex-direction:column;gap:4px;margin:0 8px 6px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-2)}',
      '.wsb-add-path-row{display:flex;align-items:center;gap:5px}',
      '.wsb-add-path-input{flex:1;min-width:0;height:26px;padding:0 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none}',
      '.wsb-add-path-input:focus{border-color:var(--dsw-alias-brand-primary,#4c8df6)}',
      '.wsb-add-path-hint{font-size:10px;line-height:1.4;color:var(--dsw-alias-label-secondary)}',
      '@media (hover:none){.wsb-ws-grip{opacity:.65}}',
      '.wsb-sessions{display:flex;flex-direction:column;gap:1px;padding:0 2px 3px}',
      '.wsb-session{display:flex;align-items:center;width:100%;min-height:26px;border-radius:6px;background:transparent;color:inherit}',
      '.wsb-session:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsb-session[data-state="attention"]{background:color-mix(in srgb,var(--wsb-accent) 7%,transparent)}',
      '.wsb-session[data-state="attention"]:hover{background:color-mix(in srgb,var(--wsb-accent) 13%,transparent)}',
      '.wsb-session[data-current="true"]{background:var(--dsw-alias-bg-layer-2)}',
      '.wsb-session[data-dragging="true"]{opacity:.55}',
      '.wsb-session[data-session-drop="before"]{box-shadow:inset 0 2px 0 var(--dsw-alias-brand-primary,#4c8df6)}',
      '.wsb-session[data-session-drop="after"]{box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary,#4c8df6)}',
      '.wsb-session-grip{flex:none;width:15px;height:22px;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);opacity:0;cursor:grab;user-select:none}',
      '.wsb-session:hover .wsb-session-grip{opacity:.7}',
      '.wsb-session-grip:active{cursor:grabbing}',
      '.wsb-session-main{flex:1;min-width:0;display:flex;align-items:center;gap:7px;padding:4px 2px;border:none;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.wsb-session-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;color:var(--wsb-accent)}',
      '.wsb-session-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}',
      '.wsb-session[data-current="true"] .wsb-session-title{font-weight:600}',
      '.wsb-session-tail{flex:none;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.wsb-session[data-state="attention"] .wsb-session-tail{color:var(--wsb-accent);font-weight:600}',
      '.wsb-session[data-state="running"] .wsb-session-tail{color:var(--wsb-accent)}',
      '.wsb-session-rename{flex:none;width:22px;height:22px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;padding:0}',
      '.wsb-session:hover .wsb-session-rename{opacity:.75}',
      '.wsb-session-rename:focus-visible{opacity:1}',
      '.wsb-session-rename:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);opacity:1}',
      '.wsb-session-rename:disabled{opacity:.4;cursor:default}',
      '.wsb-session-archive{flex:none;width:22px;height:22px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;padding:0;margin-right:2px}',
      '.wsb-session:hover .wsb-session-archive{opacity:.75}',
      '.wsb-session-archive:focus-visible{opacity:1}',
      '.wsb-session-archive:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);opacity:1}',
      '.wsb-session-archive:disabled{opacity:.4;cursor:default}',
      '@media (hover:none){.wsb-session-grip,.wsb-session-rename,.wsb-session-archive{opacity:.65}}',
      '.wsb-more{display:flex;align-items:center;gap:4px;width:100%;padding:3px 7px 3px 24px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;text-align:left;cursor:pointer}',
      '.wsb-more:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.wsb-more .wsb-chevron{width:10px;height:10px}',
      '.wsb-confirm{margin:0 8px 6px;padding:7px 8px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d99a2b) 35%,transparent);border-radius:7px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d99a2b) 10%,transparent);color:var(--dsw-alias-label-primary);font-size:11px;line-height:1.45;display:flex;flex-direction:column;gap:6px}',
      '.wsb-confirm-text{overflow-wrap:anywhere}',
      '.wsb-confirm-actions{display:flex;gap:6px}',
      '.wsb-confirm-primary,.wsb-confirm-secondary{padding:3px 9px;border-radius:6px;font:inherit;font-size:11px;cursor:pointer}',
      '.wsb-confirm-primary{border:none;background:var(--dsw-alias-brand-primary,#4c8df6);color:#fff}',
      '.wsb-confirm-secondary{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}',
      '.wsb-confirm-secondary:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsb-confirm-primary:disabled,.wsb-confirm-secondary:disabled{opacity:.55;cursor:default}',
      '.wsb-archived{margin:6px 0 2px;padding-top:4px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.wsb-archived-head{display:flex;align-items:center;gap:5px;width:100%;padding:4px 4px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;text-align:left;cursor:pointer}',
      '.wsb-archived-head:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.wsb-archived-list{display:flex;flex-direction:column;gap:1px;padding:0 2px}',
      '.wsb-archived-row{display:flex;align-items:center;gap:7px;min-height:26px;padding:3px 6px 3px 10px;border-radius:6px}',
      '.wsb-archived-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsb-archived-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;color:var(--dsw-alias-label-secondary)}',
      '.wsb-archived-text{flex:1;min-width:0;display:flex;flex-direction:column}',
      '.wsb-archived-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.wsb-archived-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.wsb-restore{flex:none;padding:2px 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:10.5px;cursor:pointer}',
      '.wsb-restore:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.wsb-restore:disabled{opacity:.55;cursor:default}',
      '.wsb-none{padding:2px 8px 6px 25px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
      '.wsb-empty{display:flex;flex-direction:column;align-items:center;gap:4px;padding:26px 12px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      '.wsb-empty-title{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.wsb-empty-icon{display:inline-flex;color:var(--dsw-alias-label-secondary);margin-bottom:2px}',
      '.wsb-empty-hint{font-size:11px;line-height:1.5}',
      '.wsb-empty-action{margin-top:8px;padding:4px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;cursor:pointer}',
      '.wsb-empty-action:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsb-rail{display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;padding:8px 0}',
      '.wsb-rail-btn{position:relative;width:36px;height:36px;border:none;border-radius:10px;background:transparent;color:var(--wsb-accent);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
      '.wsb-rail-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsb-rail-btn[data-zero="true"]{opacity:.42}',
      '.wsb-rail-count{position:absolute;right:3px;bottom:2px;min-width:13px;height:13px;padding:0 2px;border-radius:7px;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base));color:var(--wsb-accent);font-size:9px;font-weight:700;line-height:13px;text-align:center;font-variant-numeric:tabular-nums}',
      '.wsb-spin{animation:wsb-rotate 1.15s linear infinite;transform-origin:50% 50%}',
      '@keyframes wsb-rotate{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion:reduce){.wsb-spin{animation:none}.wsb-chevron{transition:none}}',
    ].join('\n')

    // ---------------------------------------------------------------------
    // Pure derivation
    // ---------------------------------------------------------------------

    function pendingKindOf(status) {
      const kind = status !== undefined && status !== null && status.pendingInteraction !== undefined && status.pendingInteraction !== null
        ? status.pendingInteraction.kind
        : undefined
      return kind === 'approval' || kind === 'plan-review' || kind === 'question' ? kind : null
    }

    function pendingLabelKey(kind) {
      if (kind === 'approval') return 'pending.approval'
      if (kind === 'plan-review') return 'pending.plan'
      return 'pending.question'
    }

    function pendingFullKey(kind) {
      if (kind === 'approval') return 'pending.approval.full'
      if (kind === 'plan-review') return 'pending.plan.full'
      return 'pending.question.full'
    }

    function basenameOf(path) {
      if (typeof path !== 'string' || path.length === 0) return ''
      const trimmed = path.replace(/[/\\]+$/, '')
      const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
      return trimmed.slice(cut + 1)
    }

    function sessionTitleOf(summary) {
      const title = typeof summary.title === 'string' ? summary.title.trim() : ''
      if (title.length > 0) return title
      const display = typeof summary.displayTitle === 'string' ? summary.displayTitle.trim() : ''
      return display.length > 0 ? display : ''
    }

    function runningChildCount(list, parentId, statuses) {
      const catalog = list !== undefined && list !== null && list.projectionsBySession !== undefined
        ? list.projectionsBySession[parentId]
        : undefined
      const children = catalog !== undefined && catalog !== null && catalog.values !== undefined
        ? catalog.values.subagentCatalog
        : undefined
      if (!Array.isArray(children)) return 0
      let count = 0
      for (const child of children) {
        if (child === null || child === undefined || child.mode === 'external') continue
        const childStatus = statuses.get(child.id)
        const childRunning = childStatus !== undefined && childStatus !== null
          ? childStatus.running
          : list.byId !== undefined && list.byId[child.id] !== undefined
            ? list.byId[child.id].running
            : undefined
        if (childRunning === true) count += 1
      }
      return count
    }

    function sessionRowOf(summary, status, list, statuses) {
      const pendingKind = pendingKindOf(status)
      const ownRunning = status !== undefined && status !== null && status.running !== undefined
        ? status.running === true
        : summary.running === true
      const runningChildren = runningChildCount(list, summary.id, statuses)
      const state = pendingKind !== null ? 'attention' : ownRunning || runningChildren > 0 ? 'running' : 'done'
      return {
        id: summary.id,
        title: sessionTitleOf(summary),
        state,
        rank: RANK[state],
        pendingKind,
        ownRunning,
        runningChildren,
        unread: status !== undefined && status !== null && status.completionUnread === true,
        updatedAt: typeof summary.updatedAt === 'number' && Number.isFinite(summary.updatedAt) ? summary.updatedAt : 0,
        current: summary.retainedBy !== undefined && summary.retainedBy !== null && (summary.retainedBy.mainView === undefined ? 0 : summary.retainedBy.mainView) > 0,
      }
    }

    function compareSessionRows(left, right) {
      if (left.rank !== right.rank) return left.rank - right.rank
      if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
      return String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0
    }

    function compareWorkspaceRows(left, right) {
      if (left.rank !== right.rank) return left.rank - right.rank
      if (left.activity !== right.activity) return right.activity - left.activity
      if (left.ungrouped !== right.ungrouped) return left.ungrouped ? 1 : -1
      const titleOrder = left.title.localeCompare(right.title)
      if (titleOrder !== 0) return titleOrder
      return String(left.key) < String(right.key) ? -1 : 1
    }

    function aggregateState(sessions) {
      let attention = false
      let running = false
      for (const session of sessions) {
        if (session.state === 'attention') attention = true
        else if (session.state === 'running') running = true
      }
      return attention ? 'attention' : running ? 'running' : 'done'
    }

    function workspaceActivity(sessions, workspace) {
      if (sessions.length > 0) {
        let latest = 0
        for (const session of sessions) if (session.updatedAt > latest) latest = session.updatedAt
        if (latest > 0) return latest
      }
      const updated = typeof workspace.updatedAt === 'string' ? Date.parse(workspace.updatedAt) : NaN
      if (Number.isFinite(updated) && updated > 0) return updated
      const created = typeof workspace.createdAt === 'string' ? Date.parse(workspace.createdAt) : NaN
      return Number.isFinite(created) && created > 0 ? created : 0
    }

    function workspaceRowOf(workspace, memberIds, byId, statuses, list, archived) {
      const sessions = []
      for (const id of memberIds) {
        const summary = byId[id]
        if (summary === undefined || summary === null) continue
        if (summary.origin === 'subagent' || summary.blank === true || archived.has(id)) continue
        sessions.push(sessionRowOf(summary, statuses.get(id), list, statuses))
      }
      sessions.sort(compareSessionRows)
      const state = aggregateState(sessions)
      const firstAttention = sessions.find((session) => session.state === 'attention')
      return {
        key: 'ws:' + String(workspace.workspaceId),
        workspaceId: workspace.workspaceId,
        ungrouped: false,
        title: (typeof workspace.title === 'string' ? workspace.title.trim() : '') || basenameOf(workspace.path),
        path: typeof workspace.path === 'string' ? workspace.path : '',
        sessions,
        state,
        rank: RANK[state],
        activity: workspaceActivity(sessions, workspace),
        pendingKind: firstAttention === undefined ? null : firstAttention.pendingKind,
      }
    }

    function ungroupedRowOf(memberIds, byId, statuses, list, archived) {
      const sessions = []
      for (const id of memberIds) {
        const summary = byId[id]
        if (summary === undefined || summary === null) continue
        if (summary.origin === 'subagent' || summary.blank === true || archived.has(id)) continue
        sessions.push(sessionRowOf(summary, statuses.get(id), list, statuses))
      }
      if (sessions.length === 0) return null
      sessions.sort(compareSessionRows)
      const state = aggregateState(sessions)
      const latest = sessions.reduce((value, session) => (session.updatedAt > value ? session.updatedAt : value), 0)
      const firstAttention = sessions.find((session) => session.state === 'attention')
      return {
        key: 'ungrouped',
        workspaceId: null,
        ungrouped: true,
        title: '',
        path: '',
        sessions,
        state,
        rank: RANK[state],
        activity: latest,
        pendingKind: firstAttention === undefined ? null : firstAttention.pendingKind,
      }
    }

    function buildModel(workspacesState, sessionsState, statuses, archivedWorkspaceIds) {
      const items = workspacesState !== undefined && workspacesState !== null && Array.isArray(workspacesState.items) ? workspacesState.items : []
      const archivedIds = workspacesState !== undefined && workspacesState !== null && Array.isArray(workspacesState.archivedSessionIds)
        ? workspacesState.archivedSessionIds
        : []
      const archived = new Set(archivedIds)
      const archivedGroups = archivedWorkspaceIds instanceof Set ? archivedWorkspaceIds : null
      const list = sessionsState !== undefined && sessionsState !== null && sessionsState.byId !== undefined ? sessionsState : EMPTY_SESSIONS
      const byId = list.byId !== undefined && list.byId !== null ? list.byId : {}
      const ids = Array.isArray(list.ids) ? list.ids : []
      const map = statuses instanceof Map ? statuses : EMPTY_MAP
      const accounted = new Set()
      const rows = []
      for (const workspace of items) {
        const memberIds = Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []
        for (const id of memberIds) accounted.add(id)
        if (archivedGroups !== null && archivedGroups.has(workspace.workspaceId)) continue
        rows.push(workspaceRowOf(workspace, memberIds, byId, map, list, archived))
      }
      const strayIds = ids.filter((id) => !accounted.has(id))
      const ungrouped = strayIds.length === 0 ? null : ungroupedRowOf(strayIds, byId, map, list, archived)
      if (ungrouped !== null) rows.push(ungrouped)
      rows.sort(compareWorkspaceRows)
      return rows
    }

    function currentSessionId(list) {
      if (list === undefined || list === null || list.byId === undefined || list.byId === null) return null
      for (const id of Object.keys(list.byId)) {
        const summary = list.byId[id]
        if (summary !== undefined && summary !== null && summary.retainedBy !== undefined && summary.retainedBy !== null && (summary.retainedBy.mainView === undefined ? 0 : summary.retainedBy.mainView) > 0) return id
      }
      return null
    }

    function matchesText(value, needle) {
      return typeof value === 'string' && value.toLowerCase().includes(needle)
    }

    function withSessions(row, sessions) {
      const sorted = sessions.slice().sort(compareSessionRows)
      const state = aggregateState(sorted)
      const firstAttention = sorted.find((session) => session.state === 'attention')
      const activity = sorted.length === 0
        ? row.activity
        : sorted.reduce((latest, session) => (session.updatedAt > latest ? session.updatedAt : latest), 0)
      return Object.assign({}, row, {
        sessions: sorted,
        state,
        rank: RANK[state],
        activity,
        pendingKind: firstAttention === undefined ? null : firstAttention.pendingKind,
      })
    }

    /**
     * Narrow the board for a search query. A matching task title shows only the
     * matching tasks; a workspace title/path match with no task match keeps the
     * workspace and its tasks. Rows are re-aggregated from what is displayed and
     * re-sorted by the same state/recency contract.
     */
    function filterRows(rows, query, tr) {
      const needle = typeof query === 'string' ? query.trim().toLowerCase() : ''
      if (needle.length === 0) return rows
      const out = []
      for (const row of rows) {
        const title = row.ungrouped ? tr('ungrouped') : row.title.length > 0 ? row.title : tr('untitled')
        const titleHit = matchesText(title, needle) || matchesText(row.path, needle)
        const sessionHits = row.sessions.filter((session) => matchesText(session.title, needle))
        if (!titleHit && sessionHits.length === 0) continue
        out.push(withSessions(row, sessionHits.length > 0 ? sessionHits : row.sessions))
      }
      out.sort(compareWorkspaceRows)
      return out
    }

    /**
     * Project archived sessions for the bottom restore section: newest first,
     * excluding subagent and blank rows, with the owning Workspace title.
     */
    function buildArchivedItems(workspacesState, sessionsState) {
      const items = workspacesState !== undefined && workspacesState !== null && Array.isArray(workspacesState.items) ? workspacesState.items : []
      const archivedIds = workspacesState !== undefined && workspacesState !== null && Array.isArray(workspacesState.archivedSessionIds)
        ? workspacesState.archivedSessionIds
        : []
      const list = sessionsState !== undefined && sessionsState !== null && sessionsState.byId !== undefined ? sessionsState : EMPTY_SESSIONS
      const byId = list.byId !== undefined && list.byId !== null ? list.byId : {}
      const ownerById = new Map()
      for (const workspace of items) {
        for (const id of Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []) ownerById.set(id, workspace)
      }
      const result = []
      for (const id of archivedIds) {
        const summary = byId[id]
        if (summary === undefined || summary === null || summary.origin === 'subagent' || summary.blank === true) continue
        const owner = ownerById.get(id)
        const workspaceTitle = owner === undefined
          ? ''
          : (typeof owner.title === 'string' ? owner.title.trim() : '') || basenameOf(owner.path)
        result.push({
          id,
          title: sessionTitleOf(summary),
          workspaceTitle,
          updatedAt: typeof summary.updatedAt === 'number' && Number.isFinite(summary.updatedAt) ? summary.updatedAt : 0,
        })
      }
      result.sort((left, right) => right.updatedAt - left.updatedAt)
      return result
    }

    /**
     * Freeze the current order while automatic sorting is off. Rows and sessions
     * missing from the snapshot (newly added) append in their existing relative
     * order; archived/deleted ones simply disappear.
     */
    function applyFrozenOrder(rows, snapshot) {
      const workspaceOrder = snapshot !== null && snapshot !== undefined && Array.isArray(snapshot.workspaces) ? snapshot.workspaces : []
      const workspaceRank = new Map(workspaceOrder.map((key, index) => [key, index]))
      const rowIndex = new Map(rows.map((row, index) => [row.key, index]))
      const ordered = rows.slice().sort((left, right) => {
        const leftRank = workspaceRank.has(left.key) ? workspaceRank.get(left.key) : Infinity
        const rightRank = workspaceRank.has(right.key) ? workspaceRank.get(right.key) : Infinity
        if (leftRank !== rightRank) return leftRank - rightRank
        return rowIndex.get(left.key) - rowIndex.get(right.key)
      })
      const sessionOrder = snapshot !== null && snapshot !== undefined && snapshot.sessions !== null && typeof snapshot.sessions === 'object' && !Array.isArray(snapshot.sessions)
        ? snapshot.sessions
        : {}
      return ordered.map((row) => {
        const frozen = sessionOrder[row.key]
        if (!Array.isArray(frozen)) return row
        const sessionRank = new Map(frozen.map((id, index) => [id, index]))
        const sessionIndex = new Map(row.sessions.map((session, index) => [session.id, index]))
        const sessions = row.sessions.slice().sort((left, right) => {
          const leftRank = sessionRank.has(left.id) ? sessionRank.get(left.id) : Infinity
          const rightRank = sessionRank.has(right.id) ? sessionRank.get(right.id) : Infinity
          if (leftRank !== rightRank) return leftRank - rightRank
          return sessionIndex.get(left.id) - sessionIndex.get(right.id)
        })
        let changed = false
        for (let index = 0; index < sessions.length; index++) {
          if (sessions[index] !== row.sessions[index]) {
            changed = true
            break
          }
        }
        return changed ? Object.assign({}, row, { sessions }) : row
      })
    }

    // ---------------------------------------------------------------------
    // Time presentation
    // ---------------------------------------------------------------------

    function localeTag() {
      try {
        const tag = document.documentElement.getAttribute('lang')
        return typeof tag === 'string' && tag.length > 0 ? tag : undefined
      } catch {
        return undefined
      }
    }

    function absoluteDate(timestamp) {
      try {
        return new Intl.DateTimeFormat(localeTag(), { month: 'short', day: 'numeric' }).format(new Date(timestamp))
      } catch {
        return new Date(timestamp).toLocaleDateString()
      }
    }

    function absoluteMoment(timestamp) {
      try {
        return new Intl.DateTimeFormat(localeTag(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
      } catch {
        return new Date(timestamp).toLocaleString()
      }
    }

    function relativeLabel(timestamp, now, tr) {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return tr('time.unknown')
      const diff = Math.max(0, now - timestamp)
      if (diff < 60000) return tr('time.now')
      const minutes = Math.floor(diff / 60000)
      if (minutes < 60) return tr('time.minutes', { n: minutes })
      const hours = Math.floor(diff / 3600000)
      if (hours < 24) return tr('time.hours', { n: hours })
      const days = Math.floor(diff / 86400000)
      if (days < 7) return tr('time.days', { n: days })
      return absoluteDate(timestamp)
    }

    function useNow(intervalMs) {
      const [now, setNow] = React.useState(() => Date.now())
      React.useEffect(() => {
        const tick = () => setNow(Date.now())
        const handle = setInterval(tick, intervalMs)
        const onVisibility = () => {
          if (!document.hidden) tick()
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          clearInterval(handle)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [intervalMs])
      return now
    }

    function readStoredMap(key) {
      try {
        const raw = localStorage.getItem(key)
        if (raw === null) return {}
        const parsed = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch {
        return {}
      }
    }

    function writeStoredMap(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* localStorage may be unavailable in a sandboxed frame */
      }
    }

    function readCollapsed() {
      return readStoredMap(COLLAPSE_KEY)
    }

    function readArchivedWorkspaces() {
      return readStoredMap(ARCHIVED_WORKSPACES_KEY)
    }

    function readAutoSort() {
      const raw = readStoredMap(AUTO_SORT_KEY)
      if (raw.enabled === false && Array.isArray(raw.workspaces)) {
        return {
          enabled: false,
          workspaces: raw.workspaces.filter((key) => typeof key === 'string'),
          sessions: raw.sessions !== null && typeof raw.sessions === 'object' && !Array.isArray(raw.sessions) ? raw.sessions : {},
        }
      }
      return { enabled: true, workspaces: [], sessions: {} }
    }

    function writeAutoSort(value) {
      writeStoredMap(AUTO_SORT_KEY, value)
    }

    function reorderIds(ids, sourceId, targetId, half) {
      if (sourceId === targetId) return ids
      const next = ids.filter((id) => id !== sourceId)
      const targetIndex = next.indexOf(targetId)
      if (targetIndex === -1) return ids
      next.splice(targetIndex + (half === 'after' ? 1 : 0), 0, sourceId)
      return next
    }

    function isActiveArchiveRefusal(reason) {
      if (reason === null || typeof reason !== 'object') return false
      if (reason.name === 'WorkspaceArchiveError' && reason.rpcError !== undefined && reason.rpcError !== null && reason.rpcError.code === 'workspace/session-active') return true
      const message = typeof reason.message === 'string' ? reason.message : ''
      return message.includes('workspace/session-active')
    }

    function messageOf(reason) {
      if (reason !== null && reason !== undefined && typeof reason.message === 'string' && reason.message.length > 0) return reason.message
      return String(reason)
    }

    // ---------------------------------------------------------------------
    // Icons
    // ---------------------------------------------------------------------

    function StatusIcon({ state, size }) {
      const dimension = size === undefined ? 14 : size
      const common = {
        width: dimension,
        height: dimension,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      }
      if (state === 'attention') {
        return h('svg', common, h('path', { d: 'M12 3.4 21.3 20.2H2.7L12 3.4Z' }), h('path', { d: 'M12 9.3v4.7' }), h('circle', { cx: 12, cy: 17.2, r: 1.15, fill: 'currentColor', stroke: 'none' }))
      }
      if (state === 'running') {
        return h(
          'svg',
          Object.assign({}, common, { className: 'wsb-spin' }),
          h('circle', { cx: 12, cy: 12, r: 8.4, opacity: 0.3 }),
          h('path', { d: 'M20.4 12A8.4 8.4 0 0 0 12 3.6' }),
        )
      }
      return h('svg', common, h('circle', { cx: 12, cy: 12, r: 8.4 }), h('path', { d: 'm8.1 12.2 2.7 2.7 5.1-5.4' }))
    }

    function ChevronIcon({ open }) {
      return h(
        'svg',
        { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        h('path', { d: open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6' }),
      )
    }

    function PlusIcon({ size }) {
      const dimension = size === undefined ? 14 : size
      return h(
        'svg',
        { width: dimension, height: dimension, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        h('path', { d: 'M12 5v14M5 12h14' }),
      )
    }

    function SearchIcon({ size }) {
      const dimension = size === undefined ? 13 : size
      return h(
        'svg',
        { width: dimension, height: dimension, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }),
        h('path', { d: 'm15.4 15.4 5 5' }),
      )
    }

    function CloseIcon({ size }) {
      const dimension = size === undefined ? 11 : size
      return h(
        'svg',
        { width: dimension, height: dimension, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        h('path', { d: 'M6 6l12 12M18 6l-12 12' }),
      )
    }

    function GripIcon({ size }) {
      const dimension = size === undefined ? 12 : size
      return h(
        'svg',
        { width: dimension, height: dimension, viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        [4, 8, 12].map((cy) => [5.5, 10.5].map((cx) => h('circle', { key: cx + ':' + cy, cx, cy, r: 1.15 }))),
      )
    }

    function ArchiveIcon({ size }) {
      const dimension = size === undefined ? 13 : size
      return h(
        'svg',
        { width: dimension, height: dimension, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        h('rect', { x: 3.5, y: 4.5, width: 17, height: 4, rx: 1 }),
        h('path', { d: 'M5.5 8.5v9A1.5 1.5 0 0 0 7 19h10a1.5 1.5 0 0 0 1.5-1.5v-9' }),
        h('path', { d: 'M10 12.5h4' }),
      )
    }

    function PencilIcon({ size }) {
      const dimension = size === undefined ? 13 : size
      return h(
        'svg',
        { width: dimension, height: dimension, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        h('path', { d: 'M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4Z' }),
        h('path', { d: 'm13.5 6.5 4 4' }),
      )
    }

    // ---------------------------------------------------------------------
    // Presentation pieces
    // ---------------------------------------------------------------------

    function CountChip({ state, count, tr }) {
      return h(
        'span',
        {
          className: 'wsb-chip',
          'data-state': state,
          'data-zero': count === 0 ? 'true' : 'false',
          title: tr('summary.' + state, { n: count }),
        },
        h(StatusIcon, { state, size: 10 }),
        h('span', null, String(count)),
      )
    }

    function WorkspaceEntry({ row, now, collapsed, queryActive, dragEnabled, doneExpanded, workspaceDragging, workspaceDropHalf, workspaceCanDrop, onWorkspaceDragStart, onWorkspaceDragEnd, onWorkspaceHover, onWorkspaceDrop, onToggle, onToggleDone, onOpenSession, onNewSession, onReorderSessions, onArchive, archiveBusy, onArchiveWorkspace, onRename, onRenameSession, currentId, tr }) {
      const [sessionDrag, setSessionDrag] = React.useState(null)
      const [sessionDrop, setSessionDrop] = React.useState(null)
      const [renaming, setRenaming] = React.useState(false)
      const [renameDraft, setRenameDraft] = React.useState('')
      const [renameBusy, setRenameBusy] = React.useState(false)
      const expanded = queryActive ? true : collapsed !== true
      const title = row.ungrouped ? tr('ungrouped') : row.title.length > 0 ? row.title : tr('untitled')
      const pillLabel = row.state === 'attention'
        ? row.pendingKind === null
          ? tr('state.attention')
          : tr(pendingLabelKey(row.pendingKind))
        : row.state === 'running'
          ? tr('state.running')
          : tr('state.done')
      const pillFull = row.state === 'attention' && row.pendingKind !== null ? tr(pendingFullKey(row.pendingKind)) : pillLabel
      const toggleLabel = expanded ? tr('collapse', { name: title }) : tr('expand', { name: title })

      const halfOf = (event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      }

      const startSessionDrag = (session) => {
        if (!dragEnabled) return
        setSessionDrag({ id: session.id, state: session.state })
        setSessionDrop(null)
      }
      const endSessionDrag = () => {
        setSessionDrag(null)
        setSessionDrop(null)
      }
      const dragOverSession = (session) => (event) => {
        if (!dragEnabled || sessionDrag === null) return null
        if (sessionDrag.state !== session.state || sessionDrag.id === session.id) return null
        const half = halfOf(event)
        setSessionDrop({ id: session.id, half })
        return half
      }
      const dropSession = (session) => (event) => {
        if (!dragEnabled || sessionDrag === null) return
        const half = halfOf(event)
        onReorderSessions(row.key, sessionDrag.state, sessionDrag.id, session.id, half)
        setSessionDrag(null)
        setSessionDrop(null)
      }

      const startRename = () => {
        if (row.ungrouped || queryActive) return
        setRenameDraft(row.title)
        setRenaming(true)
      }
      const cancelRename = () => {
        if (renameBusy) return
        setRenaming(false)
        setRenameDraft('')
      }
      const submitRename = async () => {
        if (renameBusy) return
        const next = renameDraft.trim()
        if (next.length === 0 || next === row.title) {
          setRenaming(false)
          setRenameDraft('')
          return
        }
        setRenameBusy(true)
        try {
          await onRename(row.workspaceId, next)
          setRenaming(false)
          setRenameDraft('')
        } catch {
          /* the parent renders the error notice and keeps the editor open */
        } finally {
          setRenameBusy(false)
        }
      }

      const header = h(
        'div',
        {
          className: 'wsb-group-head',
          onDragOver: (event) => {
            if (!workspaceCanDrop) return
            event.preventDefault()
            if (event.dataTransfer !== null && event.dataTransfer !== undefined) event.dataTransfer.dropEffect = 'move'
            onWorkspaceHover(halfOf(event))
          },
          onDrop: (event) => {
            if (!workspaceCanDrop) return
            event.preventDefault()
            onWorkspaceDrop(halfOf(event))
          },
        },
        !dragEnabled
          ? null
          : h(
            'span',
            {
              className: 'wsb-ws-grip',
              draggable: true,
              title: tr('dragWorkspace'),
              'aria-hidden': 'true',
              onDragStart: (event) => {
                event.stopPropagation()
                if (event.dataTransfer !== null && event.dataTransfer !== undefined) {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', row.key)
                }
                onWorkspaceDragStart()
              },
              onDragEnd: onWorkspaceDragEnd,
            },
            h(GripIcon),
          ),
        h(
          'button',
          {
            type: 'button',
            className: 'wsb-toggle',
            'aria-expanded': expanded,
            title: title,
            onClick: () => onToggle(row.key),
          },
          h('span', { className: 'wsb-chevron', 'aria-hidden': 'true' }, h(ChevronIcon, { open: expanded })),
          h('span', { className: 'wsb-ws-title' }, title),
          h('span', { className: 'wsb-visually-hidden' }, toggleLabel),
        ),
        h('span', { className: 'wsb-pill', 'data-state': row.state, title: pillFull }, h(StatusIcon, { state: row.state, size: 11 }), h('span', null, pillLabel)),
        !row.ungrouped && !queryActive
          ? h(
            'button',
            {
              type: 'button',
              className: 'wsb-ws-archive',
              title: tr('archiveWorkspace.action'),
              'aria-label': tr('archiveWorkspace.action'),
              onClick: (event) => {
                event.stopPropagation()
                onArchiveWorkspace(row)
              },
            },
            h(ArchiveIcon, { size: 13 }),
          )
          : null,
        !row.ungrouped && !queryActive
          ? h(
            'button',
            {
              type: 'button',
              className: 'wsb-rename-action',
              title: tr('rename.action'),
              'aria-label': tr('rename.action'),
              onClick: (event) => {
                event.stopPropagation()
                startRename()
              },
            },
            h(PencilIcon, { size: 13 }),
          )
          : null,
        row.ungrouped
          ? null
          : h(
            'button',
            {
              type: 'button',
              className: 'wsb-new',
              title: tr('newSession', { name: title }),
              'aria-label': tr('newSession', { name: title }),
              onClick: () => onNewSession(row.workspaceId),
            },
            h(PlusIcon, { size: 13 }),
          ),
      )

      let body = null
      if (expanded) {
        if (row.sessions.length === 0) {
          body = h('div', { className: 'wsb-none' }, tr('tasks.none'))
        } else {
          const activeSessions = row.sessions.filter((session) => session.state !== 'done')
          const doneSessions = row.sessions.filter((session) => session.state === 'done')
          const visibleDone = doneExpanded ? doneSessions : doneSessions.slice(0, DONE_PREVIEW_LIMIT)
          const hiddenDone = doneSessions.length - visibleDone.length
          const children = activeSessions.concat(visibleDone).map((session) => h(SessionEntry, {
            key: session.id,
            session,
            now,
            currentId,
            queryActive,
            dragEnabled,
            archiveBusy,
            dragActive: sessionDrag !== null && sessionDrag.id === session.id,
            dropHalf: sessionDrop !== null && sessionDrop.id === session.id ? sessionDrop.half : null,
            onOpen: onOpenSession,
            onArchive,
            onRename: onRenameSession,
            onDragStart: () => startSessionDrag(session),
            onDragEnd: endSessionDrag,
            onDragOver: dragOverSession(session),
            onDrop: dropSession(session),
            tr,
          }))
          if (doneSessions.length > DONE_PREVIEW_LIMIT) {
            children.push(h(
              'button',
              {
                key: 'done-more',
                type: 'button',
                className: 'wsb-more',
                'aria-expanded': doneExpanded === true,
                onClick: () => onToggleDone(row.key),
              },
              h('span', { className: 'wsb-chevron', 'aria-hidden': 'true' }, h(ChevronIcon, { open: doneExpanded === true })),
              h('span', null, doneExpanded ? tr('done.less') : tr('done.more', { n: hiddenDone })),
            ))
          }
          body = h('div', { className: 'wsb-sessions', role: 'group', 'aria-label': title }, children)
        }
      }

      const renameBar = renaming
        ? h(
          'div',
          { className: 'wsb-rename', role: 'group', 'aria-label': tr('rename.title') },
          h('input', {
            className: 'wsb-rename-input',
            type: 'text',
            value: renameDraft,
            autoFocus: true,
            placeholder: tr('rename.placeholder'),
            'aria-label': tr('rename.title'),
            disabled: renameBusy,
            onChange: (event) => setRenameDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                cancelRename()
              } else if (event.key === 'Enter') {
                event.preventDefault()
                submitRename()
              }
            },
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'wsb-rename-save',
              disabled: renameBusy || renameDraft.trim().length === 0,
              onClick: submitRename,
            },
            tr('rename.save'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'wsb-rename-cancel',
              disabled: renameBusy,
              onClick: cancelRename,
            },
            tr('rename.cancel'),
          ),
        )
        : null

      return h(
        'section',
        {
          className: 'wsb-group',
          role: 'listitem',
          'data-state': row.state,
          'data-ungrouped': row.ungrouped ? 'true' : 'false',
          'data-workspace-dragging': workspaceDragging ? 'true' : 'false',
          'data-workspace-drop': workspaceDropHalf === null ? 'none' : workspaceDropHalf,
        },
        header,
        renameBar,
        body,
      )
    }

    function SessionEntry({ session, now, currentId, dragActive, dropHalf, queryActive, dragEnabled, archiveBusy, onOpen, onArchive, onRename, onDragStart, onDragEnd, onDragOver, onDrop, tr }) {
      const [renaming, setRenaming] = React.useState(false)
      const [renameDraft, setRenameDraft] = React.useState('')
      const [renameBusy, setRenameBusy] = React.useState(false)
      const title = session.title.length > 0 ? session.title : tr('unnamedSession')
      const tail = session.state === 'attention'
        ? tr(pendingLabelKey(session.pendingKind))
        : session.state === 'running'
          ? session.ownRunning
            ? tr('state.running')
            : tr('running.children', { n: session.runningChildren })
          : relativeLabel(session.updatedAt, now, tr)
      const statusText = session.state === 'attention'
        ? tr(pendingFullKey(session.pendingKind))
        : session.state === 'running'
          ? session.ownRunning
            ? tr('state.running')
            : tr('running.children', { n: session.runningChildren })
          : tr('state.done')
      const isCurrent = currentId !== null && currentId === session.id
      const tooltip = title + ' · ' + statusText + (session.updatedAt > 0 ? ' · ' + absoluteMoment(session.updatedAt) : '')

      const startRename = () => {
        if (queryActive) return
        setRenameDraft(session.title)
        setRenaming(true)
      }
      const cancelRename = () => {
        if (renameBusy) return
        setRenaming(false)
        setRenameDraft('')
      }
      const submitRename = async () => {
        if (renameBusy) return
        const next = renameDraft.trim()
        if (next.length === 0 || next === session.title) {
          setRenaming(false)
          setRenameDraft('')
          return
        }
        setRenameBusy(true)
        try {
          await onRename(session.id, next)
          setRenaming(false)
          setRenameDraft('')
        } catch {
          /* the parent renders the error notice and keeps the editor open */
        } finally {
          setRenameBusy(false)
        }
      }

      const renameBar = renaming
        ? h(
          'div',
          { className: 'wsb-rename wsb-rename-session', role: 'group', 'aria-label': tr('renameTask.title') },
          h('input', {
            className: 'wsb-rename-input',
            type: 'text',
            value: renameDraft,
            autoFocus: true,
            placeholder: tr('renameTask.placeholder'),
            'aria-label': tr('renameTask.title'),
            disabled: renameBusy,
            onChange: (event) => setRenameDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                cancelRename()
              } else if (event.key === 'Enter') {
                event.preventDefault()
                submitRename()
              }
            },
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'wsb-rename-save',
              disabled: renameBusy || renameDraft.trim().length === 0,
              onClick: submitRename,
            },
            tr('rename.save'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'wsb-rename-cancel',
              disabled: renameBusy,
              onClick: cancelRename,
            },
            tr('rename.cancel'),
          ),
        )
        : null

      return h(
        React.Fragment,
        null,
        h(
          'div',
          {
            className: 'wsb-session',
            'data-state': session.state,
            'data-current': isCurrent ? 'true' : 'false',
            'data-dragging': dragActive ? 'true' : 'false',
            'data-session-drop': dropHalf === null ? 'none' : dropHalf,
            onDragOver: (event) => {
              const half = onDragOver(event)
              if (half === null) return
              event.preventDefault()
              if (event.dataTransfer !== null && event.dataTransfer !== undefined) event.dataTransfer.dropEffect = 'move'
            },
            onDrop: (event) => {
              if (dropHalf === null) return
              event.preventDefault()
              onDrop(event)
            },
          },
        !dragEnabled
          ? null
          : h(
            'span',
            {
              className: 'wsb-session-grip',
              draggable: true,
              title: tr('dragTask'),
              'aria-hidden': 'true',
              onDragStart: (event) => {
                event.stopPropagation()
                if (event.dataTransfer !== null && event.dataTransfer !== undefined) {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', session.id)
                }
                onDragStart()
              },
              onDragEnd: onDragEnd,
            },
            h(GripIcon),
          ),
        h(
          'button',
          {
            type: 'button',
            className: 'wsb-session-main',
            'aria-current': isCurrent ? 'true' : undefined,
            title: tooltip,
            onClick: () => onOpen(session.id),
          },
          h('span', { className: 'wsb-session-icon' }, h(StatusIcon, { state: session.state, size: 14 })),
          h('span', { className: 'wsb-session-title' }, title),
          isCurrent ? h('span', { className: 'wsb-visually-hidden' }, tr('current')) : null,
          h('span', { className: 'wsb-session-tail' }, tail),
        ),
        queryActive
          ? null
          : h(
            'button',
            {
              type: 'button',
              className: 'wsb-session-rename',
              title: tr('renameTask.action'),
              'aria-label': tr('renameTask.action'),
              onClick: (event) => {
                event.stopPropagation()
                startRename()
              },
            },
            h(PencilIcon, { size: 13 }),
          ),
        h(
          'button',
          {
            type: 'button',
            className: 'wsb-session-archive',
            title: tr('archive.action'),
            'aria-label': tr('archive.action'),
            disabled: archiveBusy,
            onClick: (event) => {
              event.stopPropagation()
              onArchive(session)
            },
          },
          h(ArchiveIcon, { size: 13 }),
        ),
      ),
      renameBar,
      )
    }

    function ArchivedSection({ items, expanded, restoringId, now, onToggle, onRestore, tr }) {
      const header = h(
        'button',
        {
          type: 'button',
          className: 'wsb-archived-head',
          'aria-expanded': expanded,
          onClick: onToggle,
        },
        h('span', { className: 'wsb-chevron', 'aria-hidden': 'true' }, h(ChevronIcon, { open: expanded })),
        h('span', null, tr('archived.title', { n: items.length })),
      )
      return h(
        'section',
        { className: 'wsb-archived' },
        header,
        expanded
          ? h(
            'div',
            { className: 'wsb-archived-list' },
            items.map((item) => h(
              'div',
              { className: 'wsb-archived-row', key: item.id, title: item.title },
              h('span', { className: 'wsb-archived-icon' }, h(ArchiveIcon, { size: 13 })),
              h(
                'span',
                { className: 'wsb-archived-text' },
                h('span', { className: 'wsb-archived-title' }, item.title.length > 0 ? item.title : tr('unnamedSession')),
                h('span', { className: 'wsb-archived-meta' }, (item.workspaceTitle.length > 0 ? item.workspaceTitle : tr('ungrouped')) + ' · ' + relativeLabel(item.updatedAt, now, tr)),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'wsb-restore',
                  disabled: restoringId !== null,
                  onClick: () => onRestore(item.id),
                },
                tr('archived.restore'),
              ),
            )),
          )
          : null,
      )
    }

    function ArchivedWorkspacesSection({ items, expanded, onToggle, onRestore, tr }) {
      if (items.length === 0) return null
      return h(
        'section',
        { className: 'wsb-archived' },
        h(
          'button',
          {
            type: 'button',
            className: 'wsb-archived-head',
            'aria-expanded': expanded,
            onClick: onToggle,
          },
          h('span', { className: 'wsb-chevron', 'aria-hidden': 'true' }, h(ChevronIcon, { open: expanded })),
          h('span', null, tr('archivedWorkspaces.title', { n: items.length })),
        ),
        expanded
          ? h(
            'div',
            { className: 'wsb-archived-list' },
            items.map((item) => h(
              'div',
              { className: 'wsb-archived-row', key: item.id, title: item.title },
              h('span', { className: 'wsb-archived-icon' }, h(ArchiveIcon, { size: 13 })),
              h('span', { className: 'wsb-archived-text' }, h('span', { className: 'wsb-archived-title' }, item.title)),
              h(
                'button',
                {
                  type: 'button',
                  className: 'wsb-restore',
                  onClick: () => onRestore(item.id),
                },
                tr('archived.restore'),
              ),
            )),
          )
          : null,
      )
    }

    // ---------------------------------------------------------------------
    // Component
    // ---------------------------------------------------------------------

    function StatusBoard(props) {
      const tr = typeof props.t === 'function' ? props.t : (key) => key
      const wide = props.wide !== false
      const expandSidebar = typeof props.expandSidebar === 'function' ? props.expandSidebar : () => {}
      const openSession = typeof props.openSession === 'function' ? props.openSession : () => {}
      const startSession = typeof props.startSession === 'function' ? props.startSession : () => {}
      const addWorkspace = typeof props.addWorkspace === 'function' ? props.addWorkspace : async () => null
      const pickDirectory = typeof props.pickDirectory === 'function' ? props.pickDirectory : async () => null
      const archiveSession = typeof props.archiveSession === 'function' ? props.archiveSession : async () => {}
      const unarchiveSession = typeof props.unarchiveSession === 'function' ? props.unarchiveSession : async () => {}
      const renameWorkspace = typeof props.renameWorkspace === 'function' ? props.renameWorkspace : async () => {}
      const renameSession = typeof props.renameSession === 'function' ? props.renameSession : async () => {}

      const useWorkspaces = props.useWorkspaces
      const useSessions = props.useSessions
      const useSessionStatus = props.useSessionStatus
      const usePanelInfo = props.usePanelInfo

      const workspacesState = useWorkspaces((state) => state)
      const sessionsState = useSessions((state) => state)
      const statuses = useSessionStatus((state) => state)
      const panelActive = usePanelInfo((info) => info.activePanelId !== null)

      const now = useNow(30000)
      const [collapsed, setCollapsed] = React.useState(readCollapsed)
      const [doneExpanded, setDoneExpanded] = React.useState({})
      const [archivedWorkspaces, setArchivedWorkspaces] = React.useState(readArchivedWorkspaces)
      const [autoSort, setAutoSort] = React.useState(readAutoSort)
      const [query, setQuery] = React.useState('')
      const [adding, setAdding] = React.useState(false)
      const [addError, setAddError] = React.useState(null)
      const [addPathOpen, setAddPathOpen] = React.useState(false)
      const [addPathDraft, setAddPathDraft] = React.useState('')
      const [notice, setNotice] = React.useState(null)
      const [workspaceDrag, setWorkspaceDrag] = React.useState(null)
      const [workspaceDrop, setWorkspaceDrop] = React.useState(null)
      const [archiveConfirm, setArchiveConfirm] = React.useState(null)
      const [archiveBusy, setArchiveBusy] = React.useState(false)
      const [archivedOpen, setArchivedOpen] = React.useState(false)
      const [archivedWorkspacesOpen, setArchivedWorkspacesOpen] = React.useState(false)
      const [restoringId, setRestoringId] = React.useState(null)

      React.useEffect(() => {
        if (addError === null) return undefined
        const handle = setTimeout(() => setAddError(null), 6000)
        return () => clearTimeout(handle)
      }, [addError])

      React.useEffect(() => {
        if (notice === null) return undefined
        const handle = setTimeout(() => setNotice(null), 6000)
        return () => clearTimeout(handle)
      }, [notice])

      const archivedWorkspaceSet = React.useMemo(() => {
        const set = new Set()
        for (const [id, flag] of Object.entries(archivedWorkspaces)) if (flag === true) set.add(id)
        return set
      }, [archivedWorkspaces])
      const automaticRows = React.useMemo(
        () => buildModel(workspacesState, sessionsState, statuses, archivedWorkspaceSet),
        [workspacesState, sessionsState, statuses, archivedWorkspaceSet],
      )
      const rows = React.useMemo(
        () => (autoSort.enabled ? automaticRows : applyFrozenOrder(automaticRows, autoSort)),
        [automaticRows, autoSort],
      )
      const queryActive = query.trim().length > 0
      const dragEnabled = !autoSort.enabled && !queryActive
      const visibleRows = React.useMemo(() => filterRows(rows, query, tr), [rows, query, tr])
      const counts = React.useMemo(() => {
        const next = { attention: 0, running: 0, done: 0 }
        for (const row of rows) next[row.state] += 1
        return next
      }, [rows])
      const visibleCounts = React.useMemo(() => {
        const next = { attention: 0, running: 0, done: 0 }
        for (const row of visibleRows) next[row.state] += 1
        return next
      }, [visibleRows])
      const archivedItems = React.useMemo(() => buildArchivedItems(workspacesState, sessionsState), [workspacesState, sessionsState])
      const archivedWorkspaceItems = React.useMemo(() => {
        const items = workspacesState !== undefined && workspacesState !== null && Array.isArray(workspacesState.items) ? workspacesState.items : []
        return items
          .filter((workspace) => archivedWorkspaceSet.has(workspace.workspaceId))
          .map((workspace) => ({
            id: workspace.workspaceId,
            title: (typeof workspace.title === 'string' ? workspace.title.trim() : '') || basenameOf(workspace.path) || tr('untitled'),
          }))
          .sort((left, right) => left.title.localeCompare(right.title))
      }, [workspacesState, archivedWorkspaceSet, tr])
      const currentId = panelActive ? null : currentSessionId(sessionsState)

      const toggle = (key) => {
        setCollapsed((previous) => {
          const next = Object.assign({}, previous)
          if (next[key] === true) delete next[key]
          else next[key] = true
          writeStoredMap(COLLAPSE_KEY, next)
          return next
        })
      }

      const toggleDone = (key) => {
        setDoneExpanded((previous) => {
          const next = Object.assign({}, previous)
          if (next[key] === true) delete next[key]
          else next[key] = true
          return next
        })
      }

      const archiveWorkspace = (row) => {
        if (row.ungrouped || row.workspaceId === undefined || row.workspaceId === null) return
        setArchivedWorkspaces((previous) => {
          const next = Object.assign({}, previous, { [row.workspaceId]: true })
          writeStoredMap(ARCHIVED_WORKSPACES_KEY, next)
          return next
        })
      }

      const restoreWorkspace = (workspaceId) => {
        setArchivedWorkspaces((previous) => {
          const next = Object.assign({}, previous)
          delete next[workspaceId]
          writeStoredMap(ARCHIVED_WORKSPACES_KEY, next)
          return next
        })
      }

      const toggleAutoSort = () => {
        setWorkspaceDrag(null)
        setWorkspaceDrop(null)
        if (autoSort.enabled) {
          const snapshot = {
            enabled: false,
            workspaces: rows.map((row) => row.key),
            sessions: Object.fromEntries(rows.map((row) => [row.key, row.sessions.map((session) => session.id)])),
          }
          writeAutoSort(snapshot)
          setAutoSort(snapshot)
        } else {
          const next = { enabled: true, workspaces: [], sessions: {} }
          writeAutoSort(next)
          setAutoSort(next)
        }
      }

      const reorderSessions = (groupKey, state, sourceId, targetId, half) => {
        const row = rows.find((candidate) => candidate.key === groupKey)
        if (row === undefined) return
        const full = row.sessions.map((session) => session.id)
        if (!full.includes(sourceId) || !full.includes(targetId)) return
        const nextList = reorderIds(full, sourceId, targetId, half)
        setAutoSort((previous) => {
          const next = Object.assign({}, previous, {
            sessions: Object.assign({}, previous.sessions, { [groupKey]: nextList }),
          })
          writeAutoSort(next)
          return next
        })
      }

      const startWorkspaceDrag = (row) => {
        if (queryActive || autoSort.enabled) return
        setWorkspaceDrag({ key: row.key, state: row.state })
        setWorkspaceDrop(null)
      }

      const endWorkspaceDrag = () => {
        setWorkspaceDrag(null)
        setWorkspaceDrop(null)
      }

      const hoverWorkspace = (key, half) => {
        if (workspaceDrag === null || workspaceDrag.key === key) return
        setWorkspaceDrop({ key, half })
      }

      const dropWorkspace = (key, half) => {
        if (workspaceDrag === null || autoSort.enabled) {
          endWorkspaceDrag()
          return
        }
        const source = rows.find((candidate) => candidate.key === workspaceDrag.key)
        const target = rows.find((candidate) => candidate.key === key)
        if (source === undefined || target === undefined || source.state !== target.state || source.key === target.key) {
          endWorkspaceDrag()
          return
        }
        const full = rows.map((candidate) => candidate.key)
        const nextList = reorderIds(full, source.key, target.key, half)
        setAutoSort((previous) => {
          const next = Object.assign({}, previous, { workspaces: nextList })
          writeAutoSort(next)
          return next
        })
        endWorkspaceDrag()
      }

      const requestArchive = async (session) => {
        if (archiveBusy) return
        setNotice(null)
        setArchiveConfirm(null)
        setArchiveBusy(true)
        try {
          await archiveSession(session.id, { stopActivity: false })
        } catch (error) {
          if (isActiveArchiveRefusal(error)) {
            setArchiveConfirm({ id: session.id, title: session.title.length > 0 ? session.title : tr('unnamedSession') })
          } else {
            setNotice(tr('archive.error', { message: messageOf(error) }))
          }
        } finally {
          setArchiveBusy(false)
        }
      }

      const confirmArchive = async () => {
        if (archiveConfirm === null || archiveBusy) return
        setArchiveBusy(true)
        setNotice(null)
        try {
          await archiveSession(archiveConfirm.id, { stopActivity: true })
          setArchiveConfirm(null)
        } catch (error) {
          setNotice(tr('archive.error', { message: messageOf(error) }))
          setArchiveConfirm(null)
        } finally {
          setArchiveBusy(false)
        }
      }

      const restoreSession = async (sessionId) => {
        if (restoringId !== null) return
        setRestoringId(sessionId)
        setNotice(null)
        try {
          await unarchiveSession(sessionId)
        } catch (error) {
          setNotice(tr('archived.restoreError', { message: messageOf(error) }))
        } finally {
          setRestoringId(null)
        }
      }

      const handleRename = async (workspaceId, title) => {
        setNotice(null)
        try {
          await renameWorkspace(workspaceId, title)
        } catch (error) {
          setNotice(tr('rename.error', { message: messageOf(error) }))
          throw error
        }
      }

      const handleSessionRename = async (sessionId, title) => {
        setNotice(null)
        try {
          await renameSession(sessionId, title)
        } catch (error) {
          setNotice(tr('renameTask.error', { message: messageOf(error) }))
          throw error
        }
      }

      const handleAdd = async () => {
        if (adding) return
        setAddError(null)
        setAdding(true)
        try {
          const path = await pickDirectory()
          if (path === undefined) {
            setAddPathOpen(true)
            setAddPathDraft('')
            return
          }
          if (typeof path !== 'string' || path.length === 0) return
          await addWorkspace(path)
        } catch (error) {
          const message = error !== null && error !== undefined && typeof error.message === 'string' && error.message.length > 0
            ? error.message
            : String(error)
          setAddError(tr('addWorkspace.error', { message }))
          setAddPathOpen(true)
        } finally {
          setAdding(false)
        }
      }

      const submitAddPath = async () => {
        if (adding) return
        const path = addPathDraft.trim()
        if (path.length === 0) return
        setAdding(true)
        setAddError(null)
        try {
          await addWorkspace(path)
          setAddPathOpen(false)
          setAddPathDraft('')
        } catch (error) {
          const message = error !== null && error !== undefined && typeof error.message === 'string' && error.message.length > 0
            ? error.message
            : String(error)
          setAddError(tr('addWorkspace.error', { message }))
        } finally {
          setAdding(false)
        }
      }

      const cancelAddPath = () => {
        if (adding) return
        setAddPathOpen(false)
        setAddPathDraft('')
        setAddError(null)
      }

      if (!wide) {
        return h(
          React.Fragment,
          null,
          h('style', { key: 'wsb-style' }, CSS),
          h(
            'div',
            { className: 'wsb-rail', role: 'group', 'aria-label': tr('title.rail') },
            STATES.map((state) => h(
              'button',
              {
                key: state,
                type: 'button',
                className: 'wsb-rail-btn',
                'data-state': state,
                'data-zero': counts[state] === 0 ? 'true' : 'false',
                title: tr('summary.' + state, { n: counts[state] }),
                'aria-label': tr('summary.' + state, { n: counts[state] }),
                onClick: expandSidebar,
              },
              h(StatusIcon, { state, size: 18 }),
              h('span', { className: 'wsb-rail-count' }, String(counts[state])),
            )),
          ),
        )
      }

      const loading = rows.length === 0 && (workspacesState.phase === 'pending' || sessionsState.phase === 'pending')

      let content
      if (loading) {
        content = h('div', { className: 'wsb-empty' }, h('div', { className: 'wsb-empty-hint' }, tr('loading')))
      } else if (queryActive && visibleRows.length === 0) {
        content = h(
          'div',
          { className: 'wsb-empty' },
          h('span', { className: 'wsb-empty-icon' }, h(SearchIcon, { size: 22 })),
          h('div', { className: 'wsb-empty-title' }, tr('search.empty')),
          h('div', { className: 'wsb-empty-hint' }, tr('search.hint')),
          h('button', { type: 'button', className: 'wsb-empty-action', onClick: () => setQuery('') }, tr('search.clear')),
        )
      } else if (visibleRows.length === 0 && (queryActive || (archivedItems.length === 0 && archivedWorkspaceItems.length === 0))) {
        content = h(
          'div',
          { className: 'wsb-empty' },
          h('div', { className: 'wsb-empty-title' }, tr('empty.title')),
          h('div', { className: 'wsb-empty-hint' }, tr('empty.hint')),
          h('button', { type: 'button', className: 'wsb-empty-action', onClick: handleAdd }, tr('addWorkspace')),
        )
      } else {
        content = h(
          'div',
          { className: 'wsb-scroll' },
          h(
            'div',
            { role: 'list', 'aria-label': tr('title') },
            visibleRows.map((row) => h(WorkspaceEntry, {
              key: row.key,
              row,
              now,
              collapsed: collapsed[row.key] === true,
              queryActive,
              dragEnabled,
              doneExpanded: doneExpanded[row.key] === true,
              workspaceDragging: workspaceDrag !== null && workspaceDrag.key === row.key,
              workspaceDropHalf: workspaceDrop !== null && workspaceDrop.key === row.key ? workspaceDrop.half : null,
              workspaceCanDrop: dragEnabled && workspaceDrag !== null && workspaceDrag.key !== row.key && workspaceDrag.state === row.state,
              onWorkspaceDragStart: () => startWorkspaceDrag(row),
              onWorkspaceDragEnd: endWorkspaceDrag,
              onWorkspaceHover: (half) => hoverWorkspace(row.key, half),
              onWorkspaceDrop: (half) => dropWorkspace(row.key, half),
              onToggle: toggle,
              onToggleDone: toggleDone,
              onOpenSession: openSession,
              onNewSession: startSession,
              onReorderSessions: reorderSessions,
              onArchive: requestArchive,
              onArchiveWorkspace: archiveWorkspace,
              onRename: handleRename,
              onRenameSession: handleSessionRename,
              archiveBusy,
              currentId,
              tr,
            })),
          ),
          !queryActive && archivedWorkspaceItems.length > 0
            ? h(ArchivedWorkspacesSection, {
              key: 'archived-workspaces',
              items: archivedWorkspaceItems,
              expanded: archivedWorkspacesOpen,
              onToggle: () => setArchivedWorkspacesOpen((value) => !value),
              onRestore: restoreWorkspace,
              tr,
            })
            : null,
          !queryActive && archivedItems.length > 0
            ? h(ArchivedSection, {
              key: 'archived',
              items: archivedItems,
              expanded: archivedOpen,
              restoringId,
              now,
              onToggle: () => setArchivedOpen((value) => !value),
              onRestore: restoreSession,
              tr,
            })
            : null,
        )
      }

      return h(
        React.Fragment,
        null,
        h('style', { key: 'wsb-style' }, CSS),
        h(
          'div',
          { className: 'wsb-root' },
          h(
            'div',
            { className: 'wsb-head' },
            h(
              'div',
              { className: 'wsb-head-row' },
              h('span', { className: 'wsb-title' }, tr('title')),
              h('span', { className: 'wsb-total' }, tr(queryActive ? 'total.results' : 'total', { n: visibleRows.length })),
              h(
                'button',
                {
                  type: 'button',
                  className: 'wsb-autosort',
                  role: 'switch',
                  'aria-checked': autoSort.enabled,
                  title: tr(autoSort.enabled ? 'autoSort.on' : 'autoSort.off'),
                  onClick: toggleAutoSort,
                },
                h('span', { className: 'wsb-autosort-label' }, tr('autoSort.short')),
                h(
                  'span',
                  { className: 'wsb-autosort-track', 'data-on': autoSort.enabled ? 'true' : 'false', 'aria-hidden': 'true' },
                  h('span', { className: 'wsb-autosort-thumb' }),
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'wsb-add',
                  title: tr('addWorkspace'),
                  'aria-label': tr('addWorkspace'),
                  disabled: adding,
                  onClick: handleAdd,
                },
                h(PlusIcon, { size: 15 }),
              ),
            ),
            h(
              'div',
              { className: 'wsb-search', role: 'search' },
              h('span', { className: 'wsb-search-icon', 'aria-hidden': 'true' }, h(SearchIcon, { size: 13 })),
              h('input', {
                className: 'wsb-search-input',
                type: 'search',
                value: query,
                placeholder: tr('search.placeholder'),
                'aria-label': tr('search.label'),
                autoComplete: 'off',
                spellCheck: false,
                onChange: (event) => setQuery(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setQuery('')
                  }
                },
              }),
              query.length > 0
                ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'wsb-search-clear',
                    title: tr('search.clear'),
                    'aria-label': tr('search.clear'),
                    onClick: () => setQuery(''),
                  },
                  h(CloseIcon, { size: 11 }),
                )
                : null,
            ),
            h('div', { className: 'wsb-summary' }, STATES.map((state) => h(CountChip, { key: state, state, count: visibleCounts[state], tr }))),
          ),
          addPathOpen
            ? h(
              'div',
              { className: 'wsb-add-path', role: 'group', 'aria-label': tr('addWorkspace.pathTitle') },
              h(
                'div',
                { className: 'wsb-add-path-row' },
                h('input', {
                  className: 'wsb-add-path-input',
                  type: 'text',
                  value: addPathDraft,
                  autoFocus: true,
                  placeholder: tr('addWorkspace.pathPlaceholder'),
                  'aria-label': tr('addWorkspace.pathTitle'),
                  disabled: adding,
                  spellCheck: false,
                  onChange: (event) => setAddPathDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelAddPath()
                    } else if (event.key === 'Enter') {
                      event.preventDefault()
                      submitAddPath()
                    }
                  },
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'wsb-rename-save',
                    disabled: adding || addPathDraft.trim().length === 0,
                    onClick: submitAddPath,
                  },
                  tr('addWorkspace.add'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'wsb-rename-cancel',
                    disabled: adding,
                    onClick: cancelAddPath,
                  },
                  tr('addWorkspace.cancel'),
                ),
              ),
              h('div', { className: 'wsb-add-path-hint' }, tr('addWorkspace.pathHint')),
            )
            : null,
          addError === null ? null : h('div', { className: 'wsb-error', role: 'alert' }, addError),
          notice === null ? null : h('div', { className: 'wsb-error', role: 'alert' }, notice),
          archiveConfirm === null
            ? null
            : h(
              'div',
              { className: 'wsb-confirm', role: 'alert', 'aria-label': tr('archive.action') },
              h('div', { className: 'wsb-confirm-text' }, tr('archive.confirm', { name: archiveConfirm.title })),
              h(
                'div',
                { className: 'wsb-confirm-actions' },
                h(
                  'button',
                  { type: 'button', className: 'wsb-confirm-primary', disabled: archiveBusy, onClick: confirmArchive },
                  tr('archive.stop'),
                ),
                h(
                  'button',
                  { type: 'button', className: 'wsb-confirm-secondary', disabled: archiveBusy, onClick: () => setArchiveConfirm(null) },
                  tr('archive.cancel'),
                ),
              ),
            ),
          content,
        ),
      )
    }

    // ---------------------------------------------------------------------
    // Plugin
    // ---------------------------------------------------------------------

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'workspace-status-board: dictionaries')

      ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
        name: 'sidebar.workspaces',
        // The shipped browser registers at priority 0; the lowest priority renders.
        priority: -1,
        locale: NS,
        inject: () => ({
          openSession: (sessionId) => ctx.uiWorkspace.openSession(sessionId),
          startSession: (workspaceId) => ctx.uiWorkspace.startSession(workspaceId),
          archiveSession: (sessionId, options) => ctx.workspaces.archiveSession(sessionId, options),
          unarchiveSession: (sessionId) => ctx.workspaces.unarchiveSession(sessionId),
          renameWorkspace: (workspaceId, title) => ctx.workspaces.rename(workspaceId, title),
          renameSession: (sessionId, title) => ctx.sessions
            .using(sessionId, { source: 'workspaceOperation' }, (reference) => reference.binding.session.rename(title))
            .then((result) => {
              if (result === undefined || result === null || result.ok !== true) {
                throw new Error(result && result.error && result.error.message ? result.error.message : 'Session rename failed')
              }
              return result.value
            }),
          addWorkspace: async (path) => {
            if (typeof path !== 'string' || path === '') return null
            await ctx.workspaces.create({ path })
            return path
          },
          pickDirectory: async () => {
            if (typeof window === 'undefined') return undefined
            const desktop = window.__DSH_DIRECTORY_PICKER__
            if (desktop !== undefined && desktop !== null && typeof desktop.pick === 'function') {
              const result = await desktop.pick()
              return typeof result === 'string' && result.length > 0 ? result : null
            }
            const legacy = window.__DSH_DESKTOP_PICK_DIRECTORY__
            if (typeof legacy === 'function') {
              const result = await legacy()
              return typeof result === 'string' && result.length > 0 ? result : null
            }
            return undefined
          },
        }),
      }, StatusBoard))
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace', 'workspaces', 'sessions'],
      apply,
    }
  },
})
