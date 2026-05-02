/**
 * ChatPulse — WhatsApp Analytics Frontend
 * Clean, modular JS with Chart.js integration
 */

// ── State ─────────────────────────────────────────────────────
let analyticsData = null;
let charts = {};

// Professional SaaS palette
const COLORS = [
  '#4f46e5', // Indigo 600
  '#059669', // Emerald 600
  '#2563eb', // Blue 600
  '#d97706', // Amber 600
  '#dc2626', // Red 600
  '#7c3aed', // Violet 600
  '#0891b2', // Cyan 600
  '#db2777'  // Pink 600
];
const USER_COLORS = {};
const WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// ── Chart.js Global Defaults (set once, applies to all charts) ──
// These fire before any chart is constructed, so no per-chart duplication needed.
document.addEventListener('DOMContentLoaded', () => {
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.animation = false;                   // disable ALL animations globally
    Chart.defaults.plugins.tooltip.animation = false;
    Chart.defaults.hover.animationDuration = 0;
    Chart.defaults.responsiveAnimationDuration = 0;
  }
});

// ── DOM Helpers ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const showSection = id => {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $(`section-${id}`).classList.add('active');
  document.querySelector(`[data-section="${id}"]`).classList.add('active');
};

function toast(msg, type='success') {
  const t = $('toast');
  t.textContent = (type==='success' ? '✓ ' : '✗ ') + msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}

function setLoading(on, step=0) {
  const overlay = $('loadingOverlay');
  if (on) {
    overlay.classList.add('active');
    const steps = document.querySelectorAll('.step');
    steps.forEach((s, i) => {
      s.className = 'step' + (i < step ? ' done' : i === step ? ' active' : '');
    });
  } else {
    overlay.classList.remove('active');
  }
}

// ── Color assignment ──────────────────────────────────────────
function colorFor(user) {
  if (!USER_COLORS[user]) {
    const idx = Object.keys(USER_COLORS).length % COLORS.length;
    USER_COLORS[user] = COLORS[idx];
  }
  return USER_COLORS[user];
}

// ── Navigation ────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const section = item.dataset.section;
    if (section === 'pdf') {
      if (!analyticsData) { toast('Please upload a chat file first', 'error'); return; }
      downloadDashboardPDF();
      return;
    }
    if ((section !== 'upload') && !analyticsData) {
      toast('Please upload a chat file first', 'error');
      return;
    }
    showSection(section);
    closeSidebar();
    if (section === 'timeline' && analyticsData) {
      requestAnimationFrame(renderTimeline2);
    }
  });
});

// ── Theme Toggle ──────────────────────────────────────────────
$('themeToggle').addEventListener('click', () => {
  const html = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  $('themeIcon').textContent = isDark ? '🌙' : '☀️';
  // Redraw charts with new theme
  if (analyticsData) setTimeout(renderAllCharts, 50);
});

// ── Sidebar mobile ────────────────────────────────────────────
$('hamburger').addEventListener('click', () => {
  $('sidebar').classList.toggle('open');
});
function closeSidebar() {
  $('sidebar').classList.remove('open');
}

// ── File Upload ───────────────────────────────────────────────
const uploadZone = $('uploadZone');
const fileInput = $('fileInput');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

$('sampleBtn').addEventListener('click', () => loadSample());

async function handleFile(file) {
  if (!file.name.endsWith('.txt')) {
    toast('Please upload a .txt file', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast('File too large (Max 10MB). Please export without media.', 'error');
    return;
  }
  setLoading(true, 0);
  const formData = new FormData();
  formData.append('file', file);
  try {
    setTimeout(() => setLoading(true, 1), 600);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setLoading(true, 2);
    analyticsData = json.data;
    await delay(50);
    setLoading(false);
    showSection('dashboard');
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    renderDashboard();
    toast(`Analyzed ${json.data.total_messages_parsed} messages from ${file.name}`);
  } catch (err) {
    setLoading(false);
    toast(err.message || 'Upload failed', 'error');
  }
}

async function loadSample() {
  setLoading(true, 0);
  try {
    setTimeout(() => setLoading(true, 1), 400);
    const res = await fetch('/api/sample');
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setLoading(true, 2);
    analyticsData = json.data;
    await delay(50);
    setLoading(false);
    showSection('dashboard');
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    renderDashboard();
    toast('Loaded sample chat — explore the analytics!');
  } catch (err) {
    setLoading(false);
    toast(err.message || 'Failed to load sample', 'error');
  }
}

// ── Render Master ─────────────────────────────────────────────
// Track which sections have been rendered already
const renderedSections = new Set();

async function renderDashboard() {
  const d = analyticsData;
  renderedSections.clear();
  d.users.forEach(u => colorFor(u));

  $('dashboardSubtitle').textContent =
    `${d.filename} · ${d.total_messages} messages · ${d.total_days} days · ${d.date_range.start} → ${d.date_range.end}`;

  renderStats(d);

  // Yield between each chart so browser paints them one by one
  const yld = () => new Promise(r => setTimeout(r, 0));
  renderTimelineChart(); await yld();
  renderBarChart();      await yld();
  renderPieChart();      await yld();
  renderHourChart();     await yld();
  renderDayChart();      await yld();

  // Off-screen sections last
  renderInsights(d);
  renderUserProfiles(d);
  renderTimeline(d);
  renderedSections.add('dashboard');
  renderedSections.add('insights');
  renderedSections.add('users');
  renderedSections.add('timeline');
}

// ── Stats Cards ───────────────────────────────────────────────
function renderStats(d) {
  const stats = [
    { icon: '💬', value: d.total_messages.toLocaleString(), label: 'Total Messages', color: 'var(--c-accent)' },
    { icon: '📅', value: d.total_days, label: 'Active Days', color: 'var(--c-text)' },
    { icon: '🎭', value: d.sentiment_label, label: 'Chat Vibe', color: 'var(--c-accent)' },
    { icon: '⏰', value: d.peak_hour_label, label: 'Peak Hour', color: 'var(--c-text)' },
    { icon: '🔥', value: shortName(d.most_active_user), label: 'Most Active', color: 'var(--c-text)' },
    { icon: '👻', value: shortName(d.least_active_user), label: 'Least Active', color: 'var(--c-text)' },
    { icon: '📆', value: d.most_active_day.substring(0,3), label: 'Best Day', color: 'var(--c-text)' },
    { icon: '👥', value: d.users.length, label: 'Members', color: 'var(--c-text)' },
  ];
  $('statsGrid').innerHTML = stats.map((s, i) => `
    <div class="stat-card" style="--accent-color:${s.color}; animation-delay:${i*0.02}s">
      <span class="stat-icon">${s.icon}</span>
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');
}

// ── Charts ────────────────────────────────────────────────────
function getChartDefaults() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  return {
    gridColor: isDark ? 'rgba(255,255,255,0.05)' : '#e2e8f0',
    textColor: isDark ? '#94a3b8' : '#64748b',
    tickColor: isDark ? '#7a849a' : '#6b7499',
  };
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

// Only renders the 5 charts visible on the Dashboard tab
function renderDashboardCharts() {
  renderTimelineChart();
  renderBarChart();
  renderPieChart();
  renderHourChart();
  renderDayChart();
}

// Called on theme toggle — rebuilds whatever is currently visible
function renderAllCharts() {
  renderDashboardCharts();
  if ($('section-timeline').classList.contains('active')) renderTimeline2();
}

function renderTimelineChart() {
  destroyChart('timeline');
  const d = analyticsData;
  const ctx = $('timelineChart').getContext('2d');
  const def = getChartDefaults();
  const labels = d.timeline.map(t => t.date);
  const values = d.timeline.map(t => t.count);
  const large = labels.length > 60;

  charts['timeline'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#6366f1',
        backgroundColor: large ? '#6366f111' : createGradient(ctx, '#6366f1'),
        borderWidth: 2,
        fill: !large,
        tension: 0,
        pointRadius: 0,
      }]
    },
    options: lineOpts(def)
  });
}

function renderBarChart() {
  destroyChart('bar');
  const d = analyticsData;
  const ctx = $('barChart').getContext('2d');
  const def = getChartDefaults();

  charts['bar'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: d.users.map(shortName),
      datasets: [{
        data: d.users.map(u => d.msg_count[u]),
        backgroundColor: '#6366f1',
        borderColor: '#6366f1',
        borderWidth: 1.5,
        borderRadius: 8,
      }]
    },
    options: {
      ...barOpts(def),
      plugins: { legend: { display: false } },
    }
  });
}

function renderPieChart() {
  destroyChart('pie');
  const d = analyticsData;
  const ctx = $('pieChart').getContext('2d');

  charts['pie'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: d.users.map(shortName),
      datasets: [{
        data: d.users.map(u => d.msg_count[u]),
        backgroundColor: d.users.map(u => colorFor(u)),
        borderColor: document.documentElement.dataset.theme === 'dark' ? '#121826' : '#fff',
        borderWidth: 3,
        hoverOffset: 8,
      }]
    },
    options: {
      cutout: '65%',
      animation: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: getChartDefaults().textColor, boxWidth: 12, padding: 12, font: { size: 11 } }
        }
      }
    }
  });
}

function renderHourChart() {
  destroyChart('hour');
  const d = analyticsData;
  const ctx = $('hourChart').getContext('2d');
  const def = getChartDefaults();
  const labels = Array.from({length:24}, (_,h) => h===0?'12A':h<12?`${h}A`:h===12?'12P':`${h-12}P`);

  charts['hour'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: d.hourly_data,
        backgroundColor: d.hourly_data.map((v,i) =>
          i === d.peak_hour ? '#ffca44' : '#7c6fff44'),
        borderColor: d.hourly_data.map((v,i) =>
          i === d.peak_hour ? '#ffca44' : '#7c6fff'),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: { ...barOpts(def), plugins: { legend: { display: false } } }
  });
}

function renderDayChart() {
  destroyChart('day');
  const d = analyticsData;
  const ctx = $('dayChart').getContext('2d');
  const def = getChartDefaults();

  charts['day'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: WEEKDAYS.map(d => d.substring(0,3)),
      datasets: [{
        data: d.weekday_data,
        backgroundColor: WEEKDAYS.map(day => day === d.most_active_day ? '#5dffb9' : '#5dffb933'),
        borderColor: WEEKDAYS.map(day => day === d.most_active_day ? '#5dffb9' : '#5dffb9'),
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: { ...barOpts(def), plugins: { legend: { display: false } } }
  });
}

function renderTimeline2() {
  // Mirror charts in timeline section
  destroyChart('timeline2');
  destroyChart('hour2');
  destroyChart('day2');
  const d = analyticsData;
  const def = getChartDefaults();

  const ctx2 = $('timelineChart2')?.getContext('2d');
  if (ctx2) {
    const large2 = d.timeline.length > 60;
    charts['timeline2'] = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: d.timeline.map(t => t.date),
        datasets: [{
          data: d.timeline.map(t => t.count),
          borderColor: '#ff6b9d',
          backgroundColor: large2 ? '#ff6b9d11' : createGradient(ctx2, '#ff6b9d'),
          borderWidth: 1.5,
          fill: !large2,
          tension: 0,
          pointRadius: 0,
        }]
      },
      options: lineOpts(def)
    });
  }

  const ctxH = $('hourChart2')?.getContext('2d');
  if (ctxH) {
    const labels = Array.from({length:24}, (_,h) => h===0?'12A':h<12?`${h}A`:h===12?'12P':`${h-12}P`);
    charts['hour2'] = new Chart(ctxH, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: d.hourly_data,
          backgroundColor: d.hourly_data.map((_,i) => i===d.peak_hour ? '#ffca44' : '#ffca4433'),
          borderColor: '#ffca44',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: { ...barOpts(def), plugins: { legend: { display: false } } }
    });
  }

  const ctxD = $('dayChart2')?.getContext('2d');
  if (ctxD) {
    charts['day2'] = new Chart(ctxD, {
      type: 'bar',
      data: {
        labels: WEEKDAYS.map(d => d.substring(0,3)),
        datasets: [{
          data: d.weekday_data,
          backgroundColor: WEEKDAYS.map(day => day === d.most_active_day ? '#44caff' : '#44caff33'),
          borderColor: '#44caff',
          borderWidth: 1,
          borderRadius: 6,
        }]
      },
      options: { ...barOpts(def), plugins: { legend: { display: false } } }
    });
  }
}

// ── Insights ──────────────────────────────────────────────────
function renderInsights(d) {
  const badgeDefs = [
    { key: 'group_king',       emoji: '👑', title: 'Group King',         desc: 'Highest message count',          color: '#ffca44' },
    { key: 'ghost_member',     emoji: '👻', title: 'Ghost Member',       desc: 'Quietest in the group',          color: '#7c6fff' },
    { key: 'night_owl',        emoji: '🦉', title: 'Night Owl',          desc: 'Most active late at night',      color: '#7c6fff' },
    { key: 'early_bird',       emoji: '🌅', title: 'Early Bird',         desc: 'Up and messaging at dawn',       color: '#ffca44' },
    { key: 'emoji_king',       emoji: '😂', title: 'Emoji King',         desc: 'Sends the most emojis',         color: '#ff6b9d' },
    { key: 'one_line_king',    emoji: '🧃', title: 'One-Line King',      desc: 'Sends short dry replies',       color: '#44caff' },
    { key: 'door_opener',      emoji: '🚪', title: 'Door Opener',        desc: 'Always starts conversations',   color: '#a0ff5d' },
    { key: 'last_word_legend', emoji: '🔚', title: 'Last Word Legend',   desc: 'Always ends chats',             color: '#ff9944' },
    { key: 'hibernating',      emoji: '💤', title: 'Hibernating Member', desc: 'Inactive for long periods',     color: '#5dffb9' },
    { key: 'stalker_mode',     emoji: '👁️', title: 'Stalker Mode',       desc: 'Reads everything, speaks less', color: '#ff5dab' },
  ];

  $('badgesGrid').innerHTML = badgeDefs.map(b => `
    <div class="badge-card" style="border-color:${b.color}22">
      <span class="badge-emoji">${b.emoji}</span>
      <div class="badge-title">${b.title}</div>
      <div class="badge-user" style="color:${colorFor(d.badges[b.key] || '')}">${shortName(d.badges[b.key] || 'N/A')}</div>
      <div class="badge-desc">${b.desc}</div>
    </div>
  `).join('');

  // MVP Leaderboard
  const scores = d.mvp_scores || {};
  const ranked = [...d.users].sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
  const medals = ['🥇', '🥈', '🥉'];
  $('mvpSection').innerHTML = `
    <div class="mvp-header">
      <span class="mvp-crown">🏆</span>
      <h3>Most Valuable Member</h3>
      <p>Scored by messages · words · reply activity</p>
    </div>
    <div class="mvp-list">
      ${ranked.map((u, i) => {
        const color = colorFor(u);
        const pct = Math.min(100, Math.round((scores[u] || 0)));
        return `
        <div class="mvp-row">
          <span class="mvp-medal">${medals[i] || '#' + (i+1)}</span>
          <div class="mvp-name" style="color:${color}">${u}</div>
          <div class="mvp-bar-wrap">
            <div class="mvp-bar" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="mvp-score">${(scores[u] || 0).toFixed(1)}</span>
        </div>`;
      }).join('')}
    </div>
  `;

  renderEmojiChart();
  renderWordCloud();
}

function renderHeatmap() {
  const d = analyticsData;
  const matrix = d.heatmap_matrix;
  const maxVal = Math.max(...matrix.flat(), 1);
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const hours = Array.from({length:24}, (_,h) =>
    h===0?'12a':h<12?(h%6===0?`${h}a`:''):h===12?'12p':((h-12)%6===0?`${h-12}p`:''));

  let html = `<table class="heatmap-table"><thead><tr><th></th>`;
  hours.forEach(h => { html += `<th>${h}</th>`; });
  html += `</tr></thead><tbody>`;

  matrix.forEach((row, di) => {
    html += `<tr><td class="row-label">${days[di]}</td>`;
    row.forEach((val, hi) => {
      const intensity = val / maxVal;
      const bg = val === 0
        ? 'var(--c-surface2)'
        : `rgba(93,255,185,${0.1 + intensity * 0.9})`;
      html += `<td class="hm-cell" style="background:${bg}" title="${days[di]} ${hi}:00 · ${val} msgs"></td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  $('heatmapContainer').innerHTML = html;
}

function renderEmojiChart() {
  const d = analyticsData;
  const emojis = d.top_emojis;
  if (!emojis.length) { $('emojiChart').innerHTML = '<p style="color:var(--c-text-muted);font-size:.85rem">No emojis found</p>'; return; }
  const max = emojis[0].count;
  $('emojiChart').innerHTML = emojis.map(e => `
    <div class="emoji-row">
      <span class="emoji-sym">${e.emoji}</span>
      <div class="emoji-bar-wrap">
        <div class="emoji-bar" style="width:${(e.count/max*100).toFixed(1)}%"></div>
      </div>
      <span class="emoji-count">${e.count}</span>
    </div>
  `).join('');
}

function renderWordCloud() {
  const d = analyticsData;
  const words = d.top_words;
  if (!words.length) { $('wordCloud').innerHTML = '<p style="color:var(--c-text-muted);font-size:.85rem">No words found</p>'; return; }
  const max = words[0].count, min = words[words.length-1].count;
  $('wordCloud').innerHTML = words.map(w => {
    const size = 0.75 + ((w.count - min) / (max - min || 1)) * 0.9;
    return `<span class="word-tag" style="--wsize:${size.toFixed(2)}rem" title="${w.count} times">${w.word}</span>`;
  }).join('');
}

// ── User Profiles ─────────────────────────────────────────────
function renderUserProfiles(d) {
  $('userProfiles').innerHTML = d.users.map((user, idx) => {
    const color = colorFor(user);
    const profile = d.user_time_profiles[user] || {};
    const words = (d.user_top_words[user] || []).slice(0,6);
    const initial = user.charAt(0).toUpperCase();
    const rank = idx === 0 ? '👑 Most Active' : idx === d.users.length-1 ? '👻 Quietest' : `#${idx+1} Member`;
    const streak = (d.user_streaks || {})[user] || 0;

    return `
    <div class="user-profile-card" style="animation-delay:${idx*0.08}s">
      <div class="up-header">
        <div class="up-avatar" style="background:${color}">${initial}</div>
        <div>
          <div class="up-name">${user}</div>
          <div class="up-role">${rank}</div>
        </div>
      </div>
      <div class="up-stats">
        <div class="up-stat">
          <div class="up-stat-val" style="color:${color}">${d.msg_count[user] || 0}</div>
          <div class="up-stat-lbl">Messages</div>
        </div>
        <div class="up-stat">
          <div class="up-stat-val" style="color:${color}">${d.word_count[user] || 0}</div>
          <div class="up-stat-lbl">Words</div>
        </div>
        <div class="up-stat">
          <div class="up-stat-val" style="color:${color}">${d.user_emojis[user] || 0}</div>
          <div class="up-stat-lbl">Emojis</div>
        </div>
        <div class="up-stat">
          <div class="up-stat-val" style="color:${color}">${streak}</div>
          <div class="up-stat-lbl">Active Streak</div>
        </div>
      </div>
      <div class="up-time-info">
        ⏰ Most active at <strong>${profile.peak_hour_label || 'N/A'}</strong>
        · Avg msg length: <strong>${d.avg_msg_length[user] || 0} chars</strong>
        · Media sent: <strong>${d.media_count[user] || 0}</strong>
      </div>
      <div class="up-suggestion">
        💡 ${profile.best_time_to_message || 'Activity data unavailable'}
      </div>
      ${words.length ? `
      <div class="up-words">
        ${words.map(w => `<span class="up-word">${w.word} (${w.count})</span>`).join('')}
      </div>` : ''}
    </div>`;
  }).join('');
}

// ── Timeline Section ──────────────────────────────────────────
function renderTimeline(d) {
  renderHeatmap();
  $('bestTimeSuggestions').innerHTML = d.users.map((user, i) => {
    const profile = d.user_time_profiles[user] || {};
    const color = colorFor(user);
    return `
    <div class="bt-card" style="animation-delay:${i*0.02}s; border-color:${color}22">
      <div class="bt-name" style="color:${color}">${user}</div>
      <div class="bt-tip">
        Best time: <span>${profile.peak_hour_label || 'N/A'}</span> ·
        Usually quiet at: <span>${profile.least_hour_label || 'N/A'}</span>
      </div>
      <div class="bt-tip" style="margin-top:6px">💡 ${profile.best_time_to_message || ''}</div>
    </div>`;
  }).join('');
}

// ── Chart option factories ────────────────────────────────────
function lineOpts(def) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: def.textColor, font: { size: 10 }, maxTicksLimit: 10 },
        grid: { color: def.gridColor }
      },
      y: {
        ticks: { color: def.textColor, font: { size: 10 } },
        grid: { color: def.gridColor }
      }
    }
  };
}

function barOpts(def) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: def.textColor, font: { size: 10 } },
        grid: { display: false }
      },
      y: {
        ticks: { color: def.textColor, font: { size: 10 } },
        grid: { color: def.gridColor }
      }
    }
  };
}

function createGradient(ctx, color) {
  try {
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, color + '55');
    gradient.addColorStop(1, color + '00');
    return gradient;
  } catch { return color + '22'; }
}

// ── Utils ─────────────────────────────────────────────────────
function shortName(name) {
  if (!name) return 'N/A';
  return name.length > 12 ? name.split(' ')[0] : name;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── PDF Download ──────────────────────────────────────────────
async function downloadDashboardPDF() {
  toast('Preparing dashboard report...');
  await delay(50);
  
  const section = $('section-dashboard');
  const originalDisplay = section.style.display;
  const originalAnimation = section.style.animation;
  const originalHeight = section.style.height;
  const originalOverflow = section.style.overflow;
  const isDark = document.documentElement.dataset.theme === 'dark';
  
  try {
    // Ensure section is fully expanded and visible for capture
    section.style.display = 'block';
    section.style.animation = 'none';
    section.style.height = 'auto';
    section.style.overflow = 'visible';
    section.classList.add('active');

    // Convert Canvas charts to Images for reliable capturing
    const canvases = section.querySelectorAll('canvas');
    const replacements = [];
    canvases.forEach(cv => {
      const img = document.createElement('img');
      img.src = cv.toDataURL('image/png');
      // Use fixed pixel dimensions for the replacement image to prevent layout shifts
      img.style.cssText = `width:${cv.offsetWidth}px; height:${cv.offsetHeight}px; display:block;`;
      cv.parentNode.insertBefore(img, cv);
      cv.style.display = 'none';
      replacements.push({ cv, img });
    });

    await delay(300); // Allow extra time for the DOM to stabilize

    const canvas = await html2canvas(section, {
      scale: 2, // High DPI for professional look
      backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
      logging: false,
      useCORS: true,
      allowTaint: true,
      width: section.offsetWidth,
      height: section.scrollHeight,
      x: 0,
      y: 0,
    });

    // Cleanup replacements
    replacements.forEach(({ cv, img }) => { cv.style.display = ''; img.remove(); });
    
    // Restore original state if we weren't on the dashboard
    if (!document.querySelector('[data-section="dashboard"]').classList.contains('active')) {
        section.style.display = originalDisplay;
        section.classList.remove('active');
    }
    section.style.height = originalHeight;
    section.style.overflow = originalOverflow;
    section.style.animation = originalAnimation;

    const link = document.createElement('a');
    link.download = `ChatPulse-Report-${analyticsData.filename.replace('.txt', '')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Report downloaded successfully!');
  } catch (e) {
    section.style.display = originalDisplay;
    section.style.animation = originalAnimation;
    toast('Download failed: ' + e.message, 'error');
  }
}
