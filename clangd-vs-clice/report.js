const runs = globalThis.indexRuns ?? [];
const servers = ["clangd", "clice"];
const metrics = [
  { key: "seconds", title: "Elapsed time", unit: "s", digits: 1 },
  { key: "average_rss_mib", title: "Average RSS", unit: "MiB", digits: 0 },
  { key: "peak_rss_mib", title: "Peak RSS", unit: "MiB", digits: 0 },
  { key: "index_size_mib", title: "Index on disk", unit: "MiB", digits: 1 },
];

function add(parent, tag, label, className) {
  const node = document.createElement(tag);
  if (label) node.textContent = label;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function completed(run) {
  return run.completed_units_in_log === run.requested_units &&
    run.failed_units_in_log === 0 && run.shard_write_errors === 0;
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function format(value, unit, digits) {
  return value.toLocaleString("en", { maximumFractionDigits: digits, minimumFractionDigits: digits }) + " " + unit;
}

const groups = servers.map(tool => runs.filter(run => run.tool === tool));
const completeGroups = groups.map(group => group.filter(completed));
const comparable = completeGroups.every(group => group.length > 0);
const plottedGroups = comparable ? completeGroups : groups;
const note = document.querySelector("#benchmark-note");
if (groups.every(group => group.length)) {
  const [clangd, clice] = plottedGroups.map(group => median(group.map(run => run.seconds)));
  const slower = clangd < clice ? "clice" : "clangd";
  const ratio = (Math.max(clangd, clice) / Math.min(clangd, clice)).toFixed(2);
  if (comparable) {
    note.textContent = `On completed runs, ${slower} took ${ratio}× as long. Bars show the medians for completed runs.`;
  } else {
    const coverage = groups.map(group => {
      const counts = [...new Set(group.map(run => run.completed_units_in_log))].sort((a, b) => a - b);
      return counts.join("–") + "/" + group[0].requested_units;
    });
    const failed = [...new Set(groups[1].flatMap(run => run.missing_units ?? []))];
    const memoryKills = groups[1].every(run => run.memory_worker_kills > 0);
    note.textContent = `clangd indexed ${coverage[0]} units and clice indexed ${coverage[1]}. clice reported the end of its pass after ${(clice / clangd).toFixed(2)}× clangd’s elapsed time. Bars show the observed medians, including incomplete runs.`;
    if (memoryKills) {
      note.textContent += failed.length === 1
        ? ` clice skipped ${failed[0].split("/").at(-1)} under memory pressure.`
        : " clice logged worker terminations under memory pressure in all runs.";
    }
  }
} else {
  note.textContent = "Measurements are being verified.";
}

for (const metric of metrics) {
  const values = plottedGroups.map(group => group.length ? median(group.map(run => run[metric.key])) : null);
  if (values.every(value => value === null)) continue;
  const card = add(document.querySelector("#metric-cards"), "article", "", "metric");
  add(card, "h3", metric.title);
  const max = Math.max(1, ...values);
  servers.forEach((tool, i) => {
    const value = values[i];
    const row = add(card, "div", "", "bar-row");
    const label = add(row, "div", "", "bar-label");
    add(label, "span", tool);
    add(label, "strong", value === null ? "Pending" : format(value, metric.unit, metric.digits));
    if (value === null) return;
    const track = add(row, "div", "", "track");
    track.setAttribute("aria-hidden", "true");
    add(track, "div", "", `bar ${tool}`).style.width = `${100 * value / max}%`;
  });
}

if (runs.length) {
  const table = add(document.querySelector("#run-table"), "table");
  const header = table.createTHead().insertRow();
  for (const title of ["Run", "Server", "TUs indexed", "Time", "Avg RSS", "Peak RSS", "Index size", "Max descendants", "Memory kills"]) {
    add(header, "th", title).scope = "col";
  }
  const body = table.createTBody();
  runs.forEach((run, index) => {
    const row = body.insertRow();
    add(row, "th", String(index + 1)).scope = "row";
    for (const value of [
      run.tool, `${run.completed_units_in_log}/${run.requested_units}${completed(run) ? "" : " (incomplete)"}`,
      format(run.seconds, "s", 1), format(run.average_rss_mib, "MiB", 0),
      format(run.peak_rss_mib, "MiB", 0), format(run.index_size_mib, "MiB", 1),
      String(run.max_descendants), String(run.memory_worker_kills),
    ]) add(row, "td", value);
  });
} else {
  document.querySelector("#runs").hidden = true;
}
