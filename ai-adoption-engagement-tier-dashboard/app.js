const tierColors = {
  "Non-user": "#9e9e9e",
  Infrequent: "#c9daf8",
  Moderate: "#f5a623",
  Frequent: "#6aa84f",
  Habitual: "#073763",
};

const state = {
  data: null,
  reportId: "Firm_Total",
  weekId: null,
  compareWeekId: null,
  movementFrom: "all",
  movementTo: "all",
  movementDirection: "both",
  coreTierOnly: false,
  activeEmployeesOnly: false,
  visualScope: "overall",
  disciplineFilter: "all",
};

const $ = (id) => document.getElementById(id);

function fmtDelta(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function fmtBlockDelta(value) {
  if (value > 0) return `+(${value})`;
  if (value < 0) return `-(${Math.abs(value)})`;
  return "(0)";
}

function weekIndex(weekId) {
  return state.data.weeks.findIndex((week) => week.id === weekId);
}

function enforceDateOrder(changed) {
  const fromIdx = weekIndex(state.compareWeekId);
  const toIdx = weekIndex(state.weekId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx <= toIdx) return;
  if (changed === "from") state.weekId = state.compareWeekId;
  else state.compareWeekId = state.weekId;
}

function getReport() {
  return state.data.reports.find((report) => report.id === state.reportId);
}

function reportById(id) {
  return state.data.reports.find((report) => report.id === id);
}

function visualReportFor(report) {
  if (report.id === "All_ERGs" && state.disciplineFilter !== "all") {
    return reportById(state.disciplineFilter) || report;
  }
  if (report.id !== "Firm_Total") return report;
  if (state.visualScope === "line") return reportById("Practice_Line_Total") || report;
  if (state.visualScope === "general") return reportById("Practice_General_Total") || report;
  return report;
}

function activeVisualDiscipline(report) {
  return hasDisciplineBreakout(report) ? state.disciplineFilter : "all";
}

function ergFilterReports() {
  return state.data.reports
    .filter((item) => item.group === "Specialty Groups" && !["RPO_and_Coverage_Leads", "All_ERGs"].includes(item.id))
    .sort((a, b) => reportLabel(a).localeCompare(reportLabel(b)));
}

function reportLabel(report) {
  if (report.id === "Firm_Total") return "Firm Leaderboard";
  if (report.id === "Practice_Line_Total") return "Line Leaderboard";
  if (report.id === "Practice_General_Total") return "General Leaderboard";
  if (report.id === "Office_Total") return "Office Leaderboard";
  if (report.id === "All_ERGs") return "ERG Leaderboard";
  return report.name;
}

function populationScopeLabel() {
  return state.activeEmployeesOnly ? "Active employees only" : "All assigned workers";
}

function populationScopeSentence() {
  return state.activeEmployeesOnly
    ? "Filtered to active employees only."
    : "Includes the full assigned worker population.";
}

function populationColumnLabel() {
  return state.activeEmployeesOnly ? "Active Employees" : "All";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function isActiveEmployee(person) {
  const workerStatus = String(person.status || person.workerStatus || person.employeeStatus || "").toLowerCase();
  const role = String(person.role || "").toLowerCase();
  const level = String(person.level || "").toLowerCase();
  if (workerStatus && !["active", "regular active"].includes(workerStatus)) return false;
  return !/\bintern\b/.test(`${role} ${level}`);
}

function disciplineName(person) {
  return String(person.discipline || "").trim() || "Unspecified";
}

function peopleFor(report, options = {}) {
  const ids = new Set(report.employeeIds);
  return state.data.people.filter((person) => {
    if (!ids.has(person.employeeId)) return false;
    if (state.activeEmployeesOnly && !isActiveEmployee(person)) return false;
    if (options.discipline && options.discipline !== "all" && disciplineName(person) !== options.discipline) return false;
    return true;
  });
}

function summarizePeople(people, weekId, compareWeekId) {
  const counts = Object.fromEntries(state.data.tiers.map((tier) => [tier, 0]));
  const compare = Object.fromEntries(state.data.tiers.map((tier) => [tier, 0]));
  const transitions = Object.fromEntries(state.data.tiers.map((from) => [from, Object.fromEntries(state.data.tiers.map((to) => [to, 0]))]));
  let unmatched = 0;
  let compareUnmatched = 0;
  people.forEach((person) => {
    const current = person.tiers[weekId] || "";
    const prior = person.tiers[compareWeekId] || "";
    if (counts[current] !== undefined) counts[current] += 1;
    else unmatched += 1;
    if (compare[prior] !== undefined) compare[prior] += 1;
    else compareUnmatched += 1;
    if (transitions[prior] && transitions[prior][current] !== undefined) transitions[prior][current] += 1;
  });
  return {
    active: people.length,
    counts,
    priorCounts: compare,
    deltas: Object.fromEntries(state.data.tiers.map((tier) => [tier, counts[tier] - compare[tier]])),
    unmatched,
    unmatchedDelta: unmatched - compareUnmatched,
    transitions,
  };
}

function summarize(report, weekId, compareWeekId, options = {}) {
  return summarizePeople(peopleFor(report, options), weekId, compareWeekId);
}

function disciplinesFor(report) {
  const names = [...new Set(peopleFor(report).map(disciplineName))].filter((name) => name !== "Unspecified");
  return names.sort((a, b) => a.localeCompare(b));
}

function hasDisciplineBreakout(report) {
  return report.group === "Practice Line"
    && !["Practice_Line_Total", "Firm_Total"].includes(report.id)
    && disciplinesFor(report).length > 1;
}

function ensureVisualFilter(report) {
  if (report.id === "All_ERGs") {
    const validErgIds = new Set(ergFilterReports().map((item) => item.id));
    if (state.disciplineFilter !== "all" && !validErgIds.has(state.disciplineFilter)) {
      state.disciplineFilter = "all";
    }
    return;
  }
  if (!hasDisciplineBreakout(report)) {
    state.disciplineFilter = "all";
    return;
  }
  const disciplines = disciplinesFor(report);
  if (state.disciplineFilter !== "all" && !disciplines.includes(state.disciplineFilter)) {
    state.disciplineFilter = "all";
  }
}

function deltaClass(delta) {
  return delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "";
}

function heatClass(delta) {
  if (delta > 0) return "heat-up";
  if (delta < 0) return "heat-other";
  return "heat-flat";
}

function tierMetricCell(count, delta) {
  return `<td class="metric ${heatClass(delta)}"><strong>${count}</strong> <span class="${deltaClass(delta)}">(${fmtDelta(delta)})</span></td>`;
}

function unmatchedMetricCell(summary) {
  const delta = summary.unmatchedDelta || 0;
  return `<td class="metric ${heatClass(delta)}"><strong>${summary.unmatched}</strong> <span class="${deltaClass(delta)}">(${fmtDelta(delta)})</span></td>`;
}

function populateControls() {
  const area = $("areaSelect");
  const specialty = $("specialtySelect");
  area.innerHTML = "";
  specialty.innerHTML = "";

  const leaderboardGroup = document.createElement("optgroup");
  leaderboardGroup.label = "Leaderboards";
  ["Firm_Total", "Practice_Line_Total", "Practice_General_Total", "Office_Total", "All_ERGs"].forEach((id) => {
    const report = state.data.reports.find((item) => item.id === id);
    if (!report) return;
    const option = document.createElement("option");
    option.value = report.id;
    option.textContent = reportLabel(report);
    leaderboardGroup.appendChild(option);
  });
  area.appendChild(leaderboardGroup);

  let lastGroup = "";
  const menuReports = state.data.reports.filter((report) =>
    !["Firm_Total", "Practice_Line_Total", "Practice_General_Total", "Office_Total", "All_ERGs"].includes(report.id)
      && report.group !== "Specialty Groups"
  );
  menuReports.forEach((report) => {
    if (report.group !== lastGroup) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = report.group;
      optgroup.dataset.group = report.group;
      area.appendChild(optgroup);
      lastGroup = report.group;
    }
    const option = document.createElement("option");
    option.value = report.id;
    option.textContent = reportLabel(report);
    area.lastElementChild.appendChild(option);
  });
  area.value = state.reportId;

  const specialtyPlaceholder = document.createElement("option");
  specialtyPlaceholder.value = "";
  specialtyPlaceholder.textContent = "Select specialty group...";
  specialty.appendChild(specialtyPlaceholder);
  const specialtyReports = state.data.reports.filter((report) => report.group === "Specialty Groups" && report.id !== "All_ERGs");
  specialtyReports.forEach((report) => {
    const option = document.createElement("option");
    option.value = report.id;
    option.textContent = reportLabel(report);
    specialty.appendChild(option);
  });
  specialty.value = specialtyReports.some((report) => report.id === state.reportId) ? state.reportId : "";

  [$("weekSelect"), $("compareSelect")].forEach((select) => {
    select.innerHTML = "";
    state.data.weeks.forEach((week) => {
      const option = document.createElement("option");
      option.value = week.id;
      option.textContent = week.label;
      select.appendChild(option);
    });
  });
  $("weekSelect").value = state.weekId;
  $("compareSelect").value = state.compareWeekId;

  [$("fromTierSelect"), $("toTierSelect")].forEach((select) => {
    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "All";
    select.appendChild(all);
    state.data.tiers.forEach((tier) => {
      const option = document.createElement("option");
      option.value = tier;
      option.textContent = tier;
      select.appendChild(option);
    });
  });
  $("fromTierSelect").value = state.movementFrom;
  $("toTierSelect").value = state.movementTo;
  $("directionSelect").value = state.movementDirection;
}

function renderTable(summary) {
  const report = getReport();
  const panel = $("reportTablePanel");
  if (["Firm_Total", "Practice_Line_Total", "Practice_General_Total", "Office_Total", "All_ERGs"].includes(report.id)) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";
  $("reportTableTitle").innerHTML = `AI adoption readout: ${reportLabel(report)} <button class="help" data-help="Counts show the selected end date. Values in parentheses show the change versus the selected start date. Tiers are ordered from least to most use.">?</button>`;
  $("reportTableMeta").textContent = `AI Champion lead(s): ${report.lead}. ${populationScopeLabel()} compared with the selected start date.`;
  const table = $("tierTable");
  const tierCells = state.data.tiers.map((tier) => {
    return tierMetricCell(summary.counts[tier], summary.deltas[tier]);
  }).join("");
  const extraHeaders = state.coreTierOnly ? "" : `<th>${populationColumnLabel()}</th><th>Unmatched</th>`;
  const extraCells = state.coreTierOnly ? "" : `<td class="metric">${summary.active}</td>${unmatchedMetricCell(summary)}`;
  table.innerHTML = `
    <thead>
      <tr>
        <th>Report</th>
        ${extraHeaders}
        ${state.data.tiers.map((tier) => `<th>${tier}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${reportLabel(report)}</td>
        ${extraCells}
        ${tierCells}
      </tr>
    </tbody>`;
}

function renderDisciplineDetails(report) {
  const panel = $("disciplineDetailPanel");
  const target = $("disciplineDetails");
  if (!hasDisciplineBreakout(report)) {
    panel.style.display = "none";
    target.innerHTML = "";
    return;
  }
  const disciplines = disciplinesFor(report);
  const rows = disciplines.map((discipline) => ({
    discipline,
    summary: summarize(report, state.weekId, state.compareWeekId, { discipline }),
  }));
  const extraHeaders = state.coreTierOnly ? "" : `<th>${populationColumnLabel()}</th><th>Unmatched</th>`;
  $("disciplineDetailMeta").textContent = `${reportLabel(report)} by discipline. ${populationScopeLabel()} compared with the selected start date.`;
  panel.style.display = "block";
  target.innerHTML = `
    <div class="detail-block">
      <h4>${reportLabel(report)} Discipline Detail</h4>
      <div class="tier-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>Discipline</th>
              ${extraHeaders}
              ${state.data.tiers.map((tier) => `<th>${tier}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(({ discipline, summary }) => `
              <tr>
                <td>${escapeHtml(discipline)}</td>
                ${state.coreTierOnly ? "" : `<td class="metric">${summary.active}</td>${unmatchedMetricCell(summary)}`}
                ${state.data.tiers.map((tier) => tierMetricCell(summary.counts[tier], summary.deltas[tier])).join("")}
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function displayName(report) {
  return reportLabel(report);
}

function childReports(group) {
  return state.data.reports.filter((report) => report.group === group && !report.name.includes("Total"));
}

function narrativeFor(summary) {
  const highDelta = summary.deltas.Frequent + summary.deltas.Habitual;
  const lowDelta = summary.deltas["Non-user"] + summary.deltas.Infrequent;
  const moderateDelta = summary.deltas.Moderate;
  let net = "Overall momentum is broadly stable, with no clear expansion in either high- or lower-engagement tiers.";
  if (highDelta > 0 && lowDelta <= 0) net = "Overall momentum is favorable: high-engagement tiers are expanding while lower-engagement tiers are flat or declining.";
  else if (highDelta > 0 && lowDelta > 0) net = "Overall momentum is mixed: high-engagement tiers are expanding, but lower-engagement tiers are also growing and should be watched.";
  else if (highDelta <= 0 && lowDelta > 0) net = "Overall momentum is unfavorable: high-engagement tiers are softening while lower-engagement tiers are growing.";

  const lower = lowDelta > 0
    ? "Lower-tier upward movement is increasing, so champions should treat light or non-use as an active reactivation opportunity."
    : "Lower-tier movement is not expanding, which suggests fewer users are sliding into light-use or non-use patterns.";
  const upper = highDelta < 0
    ? "Upper-tier downward movement is visible, so champions should look for regular users who may have lost workflow momentum."
    : "Upper-tier movement is stable or improving, which points to continued regular use among stronger adopters.";
  let action = "Recommended actions: keep targeted nudges and practical use-case coaching focused on Moderate users, because this tier is the main conversion pool for building regular AI habits.";
  if (moderateDelta > 0) action = "Recommended actions: focus Moderate-tier outreach on conversion. Identify newly reactivated users versus users slipping from higher tiers, then coach repeatable use cases that move them into Frequent or Habitual.";
  else if (moderateDelta < 0 && highDelta > 0) action = "Recommended actions: reinforce the behaviors moving people from Moderate into higher-use tiers, and turn those examples into peer stories or reusable prompts.";
  else if (moderateDelta < 0 && lowDelta > 0) action = "Recommended actions: treat Moderate decline as a reactivation risk and prioritize lightweight coaching before usage habits fade further.";
  return { net, lower, upper, action };
}

function renderNarrative(summary, report) {
  const n = narrativeFor(summary);
  const label = reportLabel(report);
  const highDelta = summary.deltas.Frequent + summary.deltas.Habitual;
  const lowDelta = summary.deltas["Non-user"] + summary.deltas.Infrequent;
  const moderateDelta = summary.deltas.Moderate;
  $("narrative").innerHTML = [
    ["Net", `${label}: ${n.net}`],
    ["Lower Movement", `${label}: ${n.lower} Lower-tier net change is ${fmtDelta(lowDelta)}.`],
    ["Upper Movement", `${label}: ${n.upper} Frequent/Habitual net change is ${fmtDelta(highDelta)}.`],
    ["So What / Next Steps", `${label}: ${n.action} Moderate net change is ${fmtDelta(moderateDelta)}.`],
  ].map(([label, text], index) => {
    const copy = index < 3 ? highlightFirstSentence(text) : escapeHtml(text);
    return `<div class="narrative-card"><span>${label}</span><p>${copy}</p></div>`;
  }).join("");
}

function highlightFirstSentence(text) {
  const safeText = escapeHtml(text);
  const match = safeText.match(/^([^:]+:)\s*(.*)$/);
  if (!match) return `<mark class="headline-highlight">${safeText}</mark>`;
  return `<mark class="headline-highlight">${match[1]}</mark>${match[2] ? ` ${match[2]}` : ""}`;
}

function renderReconciliation(summary, report) {
  const tierDeltaSum = state.data.tiers.reduce((sum, tier) => sum + summary.deltas[tier], 0);
  const unmatchedDelta = summary.unmatchedDelta || 0;
  const reconciliationTotal = tierDeltaSum + unmatchedDelta;
  $("reconciliationCallout").innerHTML = `
    <span>Reconciliation</span>
    <p>${reportLabel(report)} (${populationScopeLabel()}): engagement-tier deltas sum to ${fmtDelta(tierDeltaSum)}; unmatched engagement-band delta is ${fmtDelta(unmatchedDelta)}; selected-population reconciliation is ${fmtDelta(reconciliationTotal)}.</p>`;
}

function renderDetailTable(title, reports) {
  const rows = reports.map((report) => ({ report, summary: summarize(report, state.weekId, state.compareWeekId) }));
  const totals = rows.reduce((acc, { summary }) => {
    acc.active += summary.active;
    acc.unmatched += summary.unmatched;
    state.data.tiers.forEach((tier) => {
      acc.counts[tier] += summary.counts[tier];
      acc.deltas[tier] += summary.deltas[tier];
    });
    acc.unmatchedDelta += summary.unmatchedDelta || 0;
    return acc;
  }, {
    active: 0,
    unmatched: 0,
    unmatchedDelta: 0,
    counts: Object.fromEntries(state.data.tiers.map((tier) => [tier, 0])),
    deltas: Object.fromEntries(state.data.tiers.map((tier) => [tier, 0])),
  });
  const extraHeaders = state.coreTierOnly ? "" : `<th>${populationColumnLabel()}</th><th>Unmatched</th>`;
  const extraTotalCells = state.coreTierOnly ? "" : `<td class="metric">${totals.active}</td>${unmatchedMetricCell(totals)}`;
  const subtotalRow = `
    <tr class="subtotal-row">
      <td>${title} Subtotal</td>
      ${extraTotalCells}
      ${state.data.tiers.map((tier) => {
        return tierMetricCell(totals.counts[tier], totals.deltas[tier]);
      }).join("")}
    </tr>`;
  return `
    <div class="detail-block">
      <h4>${title}</h4>
      <div class="tier-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>Report</th>
              ${extraHeaders}
              ${state.data.tiers.map((tier) => `<th>${tier}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(({ report, summary }) => `
                <tr>
                  <td><button class="link-button" type="button" data-report-id="${report.id}">${report.name}</button></td>
                  ${state.coreTierOnly ? "" : `<td class="metric">${summary.active}</td>${unmatchedMetricCell(summary)}`}
                  ${state.data.tiers
                    .map((tier) => {
                      return tierMetricCell(summary.counts[tier], summary.deltas[tier]);
                    })
                    .join("")}
                </tr>`)
              .join("")}
            ${subtotalRow}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderERGDetailTable(allErgsReport, ergReports) {
  const allSummary = summarize(allErgsReport, state.weekId, state.compareWeekId);
  const extraHeaders = state.coreTierOnly ? "" : `<th>${populationColumnLabel()}</th><th>Unmatched</th>`;
  const allExtraCells = state.coreTierOnly ? "" : `<td class="metric">${allSummary.active}</td>${unmatchedMetricCell(allSummary)}`;
  return `
    <div class="detail-block">
      <h4>ERG Detail</h4>
      <div class="tier-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>Report</th>
              ${extraHeaders}
              ${state.data.tiers.map((tier) => `<th>${tier}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            <tr class="firm-row">
              <td>All ERGs distinct members</td>
              ${allExtraCells}
              ${state.data.tiers.map((tier) => tierMetricCell(allSummary.counts[tier], allSummary.deltas[tier])).join("")}
            </tr>
            ${ergReports.map((report) => {
              const summary = summarize(report, state.weekId, state.compareWeekId);
              return `
                <tr>
                  <td><button class="link-button" type="button" data-report-id="${report.id}">${report.name}</button></td>
                  ${state.coreTierOnly ? "" : `<td class="metric">${summary.active}</td>${unmatchedMetricCell(summary)}`}
                  ${state.data.tiers.map((tier) => tierMetricCell(summary.counts[tier], summary.deltas[tier])).join("")}
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderFirmTotalRow(report) {
  const summary = summarize(report, state.weekId, state.compareWeekId);
  const extraHeaders = state.coreTierOnly ? "" : `<th>${populationColumnLabel()}</th><th>Unmatched</th>`;
  const extraCells = state.coreTierOnly ? "" : `<td class="metric">${summary.active}</td>${unmatchedMetricCell(summary)}`;
  return `
    <div class="detail-block">
      <h4>Firmwide Total</h4>
      <div class="tier-table-wrap">
        <table class="detail-table firm-total-table">
          <thead>
            <tr>
              <th>Report</th>
              ${extraHeaders}
              ${state.data.tiers.map((tier) => `<th>${tier}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            <tr class="firm-row">
              <td>Firm Total</td>
              ${extraCells}
              ${state.data.tiers.map((tier) => {
                return tierMetricCell(summary.counts[tier], summary.deltas[tier]);
              }).join("")}
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

function bindDrilldown(target, selectId = "areaSelect") {
  target.querySelectorAll("[data-report-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.reportId = button.dataset.reportId;
      $(selectId).value = state.reportId;
      render();
    });
  });
}

function renderLeaderboardDetails(report) {
  const panel = $("leaderboardDetailPanel");
  const target = $("leaderboardDetails");
  const title = panel.querySelector("h3");
  const description = panel.querySelector(".panel-head p");
  if (report.id === "Practice_Line_Total") {
    panel.style.display = "block";
    title.innerHTML = `Line Leaderboard <button class="help" data-help="Click a practice line name to filter the report to that practice line.">?</button>`;
    description.textContent = "All practice line reports with subtotal.";
    target.innerHTML = renderDetailTable("Practice Line Detail", childReports("Practice Line"));
    bindDrilldown(target);
    return;
  }
  if (report.id === "Practice_General_Total") {
    panel.style.display = "block";
    title.innerHTML = `General Leaderboard <button class="help" data-help="Click a practice general name to filter the report to that function or group.">?</button>`;
    description.textContent = "All practice general reports with subtotal.";
    target.innerHTML = renderDetailTable("Practice General Detail", childReports("Practice General"));
    bindDrilldown(target);
    return;
  }
  if (report.id === "Office_Total") {
    panel.style.display = "block";
    title.innerHTML = `Office Leaderboard <button class="help" data-help="Click an office/location name to filter the report to that office.">?</button>`;
    description.textContent = "All office/location reports with subtotal.";
    target.innerHTML = renderDetailTable("Office Detail", childReports("Office"));
    bindDrilldown(target);
    return;
  }
  if (report.id === "All_ERGs") {
    panel.style.display = "block";
    title.innerHTML = `ERG Leaderboard <button class="help" data-help="Click an ERG name to filter the report to that ERG. One person can belong to more than one ERG, so ERG rows are not mutually exclusive.">?</button>`;
    description.textContent = "All ERGs distinct-member row first, followed by individual ERG membership rows. ERG rows are not mutually exclusive.";
    const ergReports = state.data.reports.filter((item) =>
      item.group === "Specialty Groups" && !["RPO_and_Coverage_Leads", "All_ERGs"].includes(item.id)
    );
    target.innerHTML = renderERGDetailTable(report, ergReports);
    bindDrilldown(target, "specialtySelect");
    return;
  }
  if (report.id !== "Firm_Total") {
    panel.style.display = "none";
    target.innerHTML = "";
    return;
  }
  panel.style.display = "block";
  title.innerHTML = `Practice Line and General Detail <button class="help" data-help="Click a practice or function name to filter the report to that area. This mirrors the leaderboard PDF detail layout.">?</button>`;
  description.textContent = "All practice line reports with subtotal, followed by all practice general reports with subtotal.";
  target.innerHTML = [
    renderFirmTotalRow(report),
    renderDetailTable("Practice Line Detail", childReports("Practice Line")),
    renderDetailTable("Practice General Detail", childReports("Practice General")),
  ].join("");
  bindDrilldown(target);
}

function svgEl(name, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function clearSvg(id) {
  const svg = $(id);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  return svg;
}

function addText(svg, text, x, y, cls = "svg-label", anchor = "start") {
  const node = svgEl("text", { x, y, class: cls, "text-anchor": anchor });
  node.textContent = text;
  svg.appendChild(node);
  return node;
}

function renderSankey(summary) {
  const svg = clearSvg("sankey");
  const tiers = state.data.tiers;
  const tierRank = Object.fromEntries(tiers.map((tier, index) => [tier, index]));
  const startTotals = summary.priorCounts || Object.fromEntries(
    tiers.map((tier) => [tier, tiers.reduce((sum, to) => sum + summary.transitions[tier][to], 0)])
  );
  const endTotals = summary.counts || Object.fromEntries(
    tiers.map((tier) => [tier, tiers.reduce((sum, from) => sum + summary.transitions[from][tier], 0)])
  );
  const highToLow = [...tiers].reverse();
  const startOrder = highToLow;
  const endOrder = highToLow;
  const leftX = 84;
  const rightX = 760;
  const leftY = Object.fromEntries(startOrder.map((tier, idx) => [tier, 86 + idx * 76]));
  const rightY = Object.fromEntries(endOrder.map((tier, idx) => [tier, 86 + idx * 76]));
  const flows = [];
  tiers.forEach((from) => tiers.forEach((to) => {
    const value = summary.transitions[from][to];
    const matchesFrom = state.movementFrom === "all" || state.movementFrom === from;
    const matchesTo = state.movementTo === "all" || state.movementTo === to;
    const direction = tierRank[to] - tierRank[from];
    const matchesDirection = state.movementDirection === "both"
      || (state.movementDirection === "up" && direction > 0)
      || (state.movementDirection === "down" && direction < 0);
    if (value && matchesFrom && matchesTo && matchesDirection) flows.push({ from, to, value });
  }));
  const max = Math.max(1, ...flows.map((flow) => flow.value));
  addText(svg, "Start date", leftX, 36, "svg-label svg-large");
  addText(svg, "End date", rightX, 36, "svg-label svg-large");
  if (!flows.length) {
    addText(svg, "No movement matches the selected filters.", 520, 250, "svg-label svg-empty", "middle");
  }
  flows.sort((a, b) => b.value - a.value).slice(0, 18).forEach((flow) => {
    const path = svgEl("path", {
      d: `M ${leftX + 180} ${leftY[flow.from]} C 360 ${leftY[flow.from]}, 545 ${rightY[flow.to]}, ${rightX - 30} ${rightY[flow.to]}`,
      fill: "none",
      stroke: tierColors[flow.from],
      "stroke-width": Math.max(2.5, (flow.value / max) * 22),
      "stroke-opacity": "0.46",
      "stroke-linecap": "round",
    });
    svg.appendChild(path);
    if (flow.value >= Math.max(5, max * 0.16)) {
      addText(svg, String(flow.value), 504, (leftY[flow.from] + rightY[flow.to]) / 2 - 8, "svg-small flow-label", "middle");
    }
  });
  [
    { x: leftX, order: startOrder, totals: startTotals, yMap: leftY, side: "start" },
    { x: rightX, order: endOrder, totals: endTotals, yMap: rightY, side: "end" },
  ].forEach(({ x, order, totals, yMap, side }) => {
    order.forEach((tier) => {
      const rect = svgEl("rect", { x, y: yMap[tier] - 22, width: 174, height: 44, rx: 5, fill: tierColors[tier] });
      svg.appendChild(rect);
      addText(svg, `${tier}: ${totals[tier]}`, x + 10, yMap[tier] + 5, "svg-block-label svg-large");
      if (side === "end") {
        const delta = summary.deltas ? summary.deltas[tier] : endTotals[tier] - startTotals[tier];
        const cls = delta > 0 ? "svg-label svg-large svg-delta-up" : delta < 0 ? "svg-label svg-large svg-delta-down" : "svg-label svg-large";
        addText(svg, fmtBlockDelta(delta), x + 184, yMap[tier] + 5, cls);
      }
    });
  });
}

function renderVisualScopeControls(report, visualReport) {
  const panel = $("visualScopePanel");
  const description = $("visualScopeDescription");
  const discipline = activeVisualDiscipline(visualReport);
  const disciplineText = discipline === "all" ? "" : ` Discipline: ${discipline}.`;
  if (report.id !== "Firm_Total") {
    panel.style.display = "none";
    description.textContent = `Start date to selected end date. Visuals reflect ${reportLabel(visualReport)}.${disciplineText} ${populationScopeSentence()}`;
    return;
  }
  panel.style.display = "block";
  $("visualScopeSelect").value = state.visualScope;
  description.textContent = `Start date to selected end date. Visuals currently reflect ${reportLabel(visualReport)}.${disciplineText} ${populationScopeSentence()}`;
}

function renderDisciplineFilterControls(report) {
  const panel = $("disciplineFilterPanel");
  const select = $("disciplineFilterSelect");
  const label = $("visualFilterLabel");
  if (report.id === "All_ERGs") {
    const ergs = ergFilterReports();
    panel.style.display = "block";
    label.textContent = "ERG";
    select.innerHTML = [
      `<option value="all">All</option>`,
      ...ergs.map((erg) => `<option value="${escapeHtml(erg.id)}">${escapeHtml(reportLabel(erg))}</option>`),
    ].join("");
    const validErgIds = new Set(ergs.map((erg) => erg.id));
    if (state.disciplineFilter !== "all" && !validErgIds.has(state.disciplineFilter)) {
      state.disciplineFilter = "all";
    }
    select.value = state.disciplineFilter;
    return;
  }
  const disciplines = hasDisciplineBreakout(report) ? disciplinesFor(report) : [];
  if (!disciplines.length) {
    panel.style.display = "none";
    select.innerHTML = "";
    state.disciplineFilter = "all";
    return;
  }
  panel.style.display = "block";
  label.textContent = "Discipline";
  select.innerHTML = [
    `<option value="all">All disciplines</option>`,
    ...disciplines.map((discipline) => `<option value="${escapeHtml(discipline)}">${escapeHtml(discipline)}</option>`),
  ].join("");
  if (state.disciplineFilter !== "all" && !disciplines.includes(state.disciplineFilter)) {
    state.disciplineFilter = "all";
  }
  select.value = state.disciplineFilter;
}

function renderWeeklyTierMix(report, options = {}) {
  const target = $("weeklyTierMix");
  const highToLow = [...state.data.tiers].reverse();
  const weeks = state.data.weeks;
  target.innerHTML = weeks.map((week) => {
    const summary = summarize(report, week.id, week.id, options);
    const denominator = Math.max(1, summary.active || Object.values(summary.counts).reduce((sum, value) => sum + value, 0));
    const segments = highToLow.map((tier) => {
      const count = summary.counts[tier] || 0;
      const pct = (count / denominator) * 100;
      const label = `${count} (${pct.toFixed(1)}%)`;
      const compact = pct < 7 ? " compact-segment" : "";
      return `
        <div class="tier-mix-segment${compact}" style="height:${pct}%; background:${tierColors[tier]}" title="${tier}: ${label}">
          <span>${tier}</span>
          <strong>${label}</strong>
        </div>`;
    }).join("");
    const unmatched = summary.unmatched || 0;
    const unmatchedPct = (unmatched / denominator) * 100;
    const unmatchedSegment = unmatched ? `
      <div class="tier-mix-segment unmatched-segment${unmatchedPct < 7 ? " compact-segment" : ""}" style="height:${unmatchedPct}%" title="Unmatched: ${unmatched} (${unmatchedPct.toFixed(1)}%)">
        <span>Unmatched</span>
        <strong>${unmatched} (${unmatchedPct.toFixed(1)}%)</strong>
      </div>` : "";
    return `
      <article class="tier-mix-week">
        <div class="tier-mix-bar">${segments}${unmatchedSegment}</div>
        <div class="tier-mix-label">
          <strong>${week.label}</strong>
          <span>${summary.active} ${state.activeEmployeesOnly ? "active employees" : "active"}</span>
        </div>
      </article>`;
  }).join("");
}

function render() {
  const report = getReport();
  ensureVisualFilter(report);
  const visualReport = visualReportFor(report);
  const visualDiscipline = activeVisualDiscipline(visualReport);
  const week = state.data.weeks.find((item) => item.id === state.weekId);
  const compare = state.data.weeks.find((item) => item.id === state.compareWeekId);
  const summary = summarize(report, state.weekId, state.compareWeekId);
  const visualSummary = summarize(visualReport, state.weekId, state.compareWeekId, { discipline: visualDiscipline });
  document.title = `${displayName(report)} | AI Adoption Engagement Tier Leaderboard`;
  if (report.group === "Specialty Groups" && report.id !== "All_ERGs") {
    $("areaSelect").value = "";
    $("specialtySelect").value = report.id;
  } else {
    $("areaSelect").value = report.id;
    $("specialtySelect").value = "";
  }
  $("reportTitle").textContent = displayName(report);
  $("reportMeta").textContent = report.id === "Firm_Total"
    ? `Practice line and practice general leaderboard | ${week.label} compared to ${compare.label} | ${populationScopeLabel()}`
    : report.id === "Practice_Line_Total"
      ? `Practice line leaderboard | ${week.label} compared to ${compare.label} | ${populationScopeLabel()}`
    : report.id === "Practice_General_Total"
      ? `Practice general leaderboard | ${week.label} compared to ${compare.label} | ${populationScopeLabel()}`
    : report.id === "Office_Total"
      ? `Office leaderboard | ${week.label} compared to ${compare.label} | ${populationScopeLabel()}`
    : report.id === "All_ERGs"
      ? `ERG leaderboard | ${week.label} compared to ${compare.label} | ${populationScopeLabel()}`
    : `${report.group} | AI Champion lead(s): ${report.lead} | ${week.label} compared to ${compare.label} | ${populationScopeLabel()}`;
  renderNarrative(summary, report);
  renderReconciliation(summary, report);
  renderTable(summary);
  renderDisciplineDetails(report);
  renderLeaderboardDetails(report);
  renderDisciplineFilterControls(report);
  renderVisualScopeControls(report, visualReport);
  renderSankey(visualSummary);
  renderWeeklyTierMix(visualReport, { discipline: visualDiscipline });
}

function bindEvents() {
  $("areaSelect").addEventListener("change", (event) => {
    if (!event.target.value) return;
    state.reportId = event.target.value;
    state.disciplineFilter = "all";
    $("specialtySelect").value = "";
    render();
  });
  $("specialtySelect").addEventListener("change", (event) => {
    if (!event.target.value) return;
    state.reportId = event.target.value;
    state.disciplineFilter = "all";
    $("areaSelect").value = "";
    render();
  });
  $("weekSelect").addEventListener("change", (event) => {
    state.weekId = event.target.value;
    enforceDateOrder("to");
    $("weekSelect").value = state.weekId;
    $("compareSelect").value = state.compareWeekId;
    render();
  });
  $("compareSelect").addEventListener("change", (event) => {
    state.compareWeekId = event.target.value;
    enforceDateOrder("from");
    $("weekSelect").value = state.weekId;
    $("compareSelect").value = state.compareWeekId;
    render();
  });
  $("fromTierSelect").addEventListener("change", (event) => {
    state.movementFrom = event.target.value;
    render();
  });
  $("toTierSelect").addEventListener("change", (event) => {
    state.movementTo = event.target.value;
    render();
  });
  $("directionSelect").addEventListener("change", (event) => {
    state.movementDirection = event.target.value;
    render();
  });
  $("coreTierOnlyToggle").addEventListener("change", (event) => {
    state.coreTierOnly = event.target.checked;
    render();
  });
  $("activeEmployeesOnlyToggle").addEventListener("change", (event) => {
    state.activeEmployeesOnly = event.target.checked;
    render();
  });
  $("visualScopeSelect").addEventListener("change", (event) => {
    state.visualScope = event.target.value;
    state.disciplineFilter = "all";
    render();
  });
  $("disciplineFilterSelect").addEventListener("change", (event) => {
    state.disciplineFilter = event.target.value;
    render();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".help, .tier-legend-chip");
    if (button) {
      const existing = document.querySelector(".help-popover");
      if (existing) {
        existing.remove();
        return;
      }
      const popover = document.createElement("div");
      popover.className = "help-popover";
      popover.innerHTML = `<p>${button.dataset.help}</p>`;
      document.body.appendChild(popover);
      const rect = button.getBoundingClientRect();
      popover.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
      popover.style.top = `${rect.bottom + 8}px`;
    }
  });
}

fetch("./data/leaderboard-data.json?v=20260618-techex-consolidated-v1")
  .then((response) => response.json())
  .then((data) => {
    state.data = data;
    state.weekId = data.weeks[data.weeks.length - 1].id;
    state.compareWeekId = data.weeks[data.weeks.length - 2]?.id || data.weeks[data.weeks.length - 1].id;
    populateControls();
    bindEvents();
    render();
  });
