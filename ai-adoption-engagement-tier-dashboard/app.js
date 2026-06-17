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

function reportLabel(report) {
  if (report.id === "Firm_Total") return "Firm Leaderboard";
  if (report.id === "Practice_Line_Total") return "Line Leaderboard";
  if (report.id === "Practice_General_Total") return "General Leaderboard";
  if (report.id === "All_ERGs") return "ERG Leaderboard";
  return report.name;
}

function peopleFor(report) {
  const ids = new Set(report.employeeIds);
  return state.data.people.filter((person) => ids.has(person.employeeId));
}

function summarize(report, weekId, compareWeekId) {
  if (report.comparisons) {
    return report.comparisons[`${compareWeekId}__${weekId}`];
  }
  const counts = Object.fromEntries(state.data.tiers.map((tier) => [tier, 0]));
  const compare = Object.fromEntries(state.data.tiers.map((tier) => [tier, 0]));
  const transitions = Object.fromEntries(state.data.tiers.map((from) => [from, Object.fromEntries(state.data.tiers.map((to) => [to, 0]))]));
  let unmatched = 0;
  peopleFor(report).forEach((person) => {
    const current = person.tiers[weekId] || "";
    const prior = person.tiers[compareWeekId] || "";
    if (counts[current] !== undefined) counts[current] += 1;
    else unmatched += 1;
    if (compare[prior] !== undefined) compare[prior] += 1;
    if (transitions[prior] && transitions[prior][current] !== undefined) transitions[prior][current] += 1;
  });
  return {
    active: report.employeeIds.length,
    counts,
    deltas: Object.fromEntries(state.data.tiers.map((tier) => [tier, counts[tier] - compare[tier]])),
    unmatched,
    transitions,
  };
}

function populateControls() {
  const area = $("areaSelect");
  const specialty = $("specialtySelect");
  area.innerHTML = "";
  specialty.innerHTML = "";

  const leaderboardGroup = document.createElement("optgroup");
  leaderboardGroup.label = "Leaderboards";
  ["Firm_Total", "Practice_Line_Total", "Practice_General_Total", "All_ERGs"].forEach((id) => {
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
    !["Firm_Total", "Practice_Line_Total", "Practice_General_Total", "All_ERGs"].includes(report.id)
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
  if (["Firm_Total", "Practice_Line_Total", "Practice_General_Total", "All_ERGs"].includes(report.id)) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";
  $("reportTableTitle").innerHTML = `AI adoption readout: ${reportLabel(report)} <button class="help" data-help="Counts show the selected end date. Values in parentheses show the change versus the selected start date. Tiers are ordered from least to most use.">?</button>`;
  $("reportTableMeta").textContent = `AI Champion lead(s): ${report.lead}. Assigned active-worker population compared with the selected start date.`;
  const table = $("tierTable");
  const tierCells = state.data.tiers.map((tier) => {
    const delta = summary.deltas[tier];
    const cls = delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "";
    const heat = delta > 0 ? "heat-up" : "heat-other";
    return `<td class="metric ${heat}"><strong>${summary.counts[tier]}</strong> <span class="${cls}">(${fmtDelta(delta)})</span></td>`;
  }).join("");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Report</th>
        <th>Active</th>
        <th>Unmatched</th>
        ${state.data.tiers.map((tier) => `<th>${tier}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${reportLabel(report)}</td>
        <td class="metric">${summary.active}</td>
        <td class="metric">${summary.unmatched}</td>
        ${tierCells}
      </tr>
    </tbody>`;
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

function renderNarrative(summary) {
  const n = narrativeFor(summary);
  $("narrative").innerHTML = [
    ["Net", n.net],
    ["Lower Movement", n.lower],
    ["Upper Movement", n.upper],
    ["So What / Next Steps", n.action],
  ].map(([label, text]) => `<div class="narrative-card"><span>${label}</span><p>${text}</p></div>`).join("");
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
    return acc;
  }, {
    active: 0,
    unmatched: 0,
    counts: Object.fromEntries(state.data.tiers.map((tier) => [tier, 0])),
    deltas: Object.fromEntries(state.data.tiers.map((tier) => [tier, 0])),
  });
  const subtotalRow = `
    <tr class="subtotal-row">
      <td>${title} Subtotal</td>
      <td class="metric">${totals.active}</td>
      <td class="metric">${totals.unmatched}</td>
      ${state.data.tiers.map((tier) => {
        const delta = totals.deltas[tier];
        const cls = delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "";
        const heat = delta > 0 ? "heat-up" : "heat-other";
        return `<td class="metric ${heat}"><strong>${totals.counts[tier]}</strong> <span class="${cls}">(${fmtDelta(delta)})</span></td>`;
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
              <th>Active</th>
              <th>Unmatched</th>
              ${state.data.tiers.map((tier) => `<th>${tier}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(({ report, summary }) => `
                <tr>
                  <td><button class="link-button" type="button" data-report-id="${report.id}">${report.name}</button></td>
                  <td class="metric">${summary.active}</td>
                  <td class="metric">${summary.unmatched}</td>
                  ${state.data.tiers
                    .map((tier) => {
                      const delta = summary.deltas[tier];
                      const cls = delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "";
                      const heat = delta > 0 ? "heat-up" : "heat-other";
                      return `<td class="metric ${heat}"><strong>${summary.counts[tier]}</strong> <span class="${cls}">(${fmtDelta(delta)})</span></td>`;
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

function renderFirmTotalRow(report) {
  const summary = summarize(report, state.weekId, state.compareWeekId);
  return `
    <div class="detail-block">
      <h4>Firmwide Total</h4>
      <div class="tier-table-wrap">
        <table class="detail-table firm-total-table">
          <thead>
            <tr>
              <th>Report</th>
              <th>Active</th>
              <th>Unmatched</th>
              ${state.data.tiers.map((tier) => `<th>${tier}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            <tr class="firm-row">
              <td>Firm Total</td>
              <td class="metric">${summary.active}</td>
              <td class="metric">${summary.unmatched}</td>
              ${state.data.tiers.map((tier) => {
                const delta = summary.deltas[tier];
                const cls = delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "";
                const heat = delta > 0 ? "heat-up" : "heat-other";
                return `<td class="metric ${heat}"><strong>${summary.counts[tier]}</strong> <span class="${cls}">(${fmtDelta(delta)})</span></td>`;
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
  if (report.id === "All_ERGs") {
    panel.style.display = "block";
    title.innerHTML = `ERG Leaderboard <button class="help" data-help="Click an ERG name to filter the report to that ERG. One person can belong to more than one ERG, so ERG rows are not mutually exclusive.">?</button>`;
    description.textContent = "All ERG reports with subtotal. ERG rows are not mutually exclusive.";
    const ergReports = state.data.reports.filter((item) =>
      item.group === "Specialty Groups" && !["RPO_and_Coverage_Leads", "All_ERGs"].includes(item.id)
    );
    target.innerHTML = renderDetailTable("ERG Detail", ergReports);
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
  const startTotals = Object.fromEntries(
    tiers.map((tier) => [tier, tiers.reduce((sum, to) => sum + summary.transitions[tier][to], 0)])
  );
  const endTotals = Object.fromEntries(
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
        const delta = endTotals[tier] - startTotals[tier];
        const cls = delta > 0 ? "svg-label svg-large svg-delta-up" : delta < 0 ? "svg-label svg-large svg-delta-down" : "svg-label svg-large";
        addText(svg, fmtBlockDelta(delta), x + 184, yMap[tier] + 5, cls);
      }
    });
  });
}

function render() {
  const report = getReport();
  const week = state.data.weeks.find((item) => item.id === state.weekId);
  const compare = state.data.weeks.find((item) => item.id === state.compareWeekId);
  const summary = summarize(report, state.weekId, state.compareWeekId);
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
    ? `Practice line and practice general leaderboard | ${week.label} compared to ${compare.label}`
    : report.id === "Practice_Line_Total"
      ? `Practice line leaderboard | ${week.label} compared to ${compare.label}`
    : report.id === "Practice_General_Total"
      ? `Practice general leaderboard | ${week.label} compared to ${compare.label}`
    : report.id === "All_ERGs"
      ? `ERG leaderboard | ${week.label} compared to ${compare.label}`
    : `${report.group} | AI Champion lead(s): ${report.lead} | ${week.label} compared to ${compare.label}`;
  renderNarrative(summary);
  renderTable(summary);
  renderLeaderboardDetails(report);
  renderSankey(summary);
}

function bindEvents() {
  $("areaSelect").addEventListener("change", (event) => {
    if (!event.target.value) return;
    state.reportId = event.target.value;
    $("specialtySelect").value = "";
    render();
  });
  $("specialtySelect").addEventListener("change", (event) => {
    if (!event.target.value) return;
    state.reportId = event.target.value;
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
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".help");
    if (button) {
      const existing = document.querySelector(".help-popover");
      if (existing) existing.remove();
      const popover = document.createElement("div");
      popover.className = "help-popover";
      popover.textContent = button.dataset.help;
      document.body.appendChild(popover);
      const rect = button.getBoundingClientRect();
      popover.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
      popover.style.top = `${rect.bottom + 8}px`;
      setTimeout(() => popover.remove(), 6500);
    }
  });
}

fetch("./data/leaderboard-data.json")
  .then((response) => response.json())
  .then((data) => {
    state.data = data;
    state.weekId = data.weeks[data.weeks.length - 1].id;
    state.compareWeekId = data.weeks[data.weeks.length - 2]?.id || data.weeks[data.weeks.length - 1].id;
    populateControls();
    bindEvents();
    render();
  });
