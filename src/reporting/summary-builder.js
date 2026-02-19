const _ = require("lodash");

/**
 * Builds human-readable summary reports from CVE validation results.
 * Uses lodash extensively for data aggregation, sorting, and templating.
 */

/**
 * Generates a full validation summary from an array of validation results.
 */
function buildSummary(results) {
  const total = _.size(results);
  const bySeverity = _.countBy(results, (r) =>
    _.get(r, "severity", "UNKNOWN").toUpperCase()
  );
  const byClassification = _.countBy(results, (r) =>
    _.get(r, "classification", "UNCLASSIFIED")
  );

  // Group results by package ecosystem
  const byEcosystem = _.groupBy(results, (r) => {
    const purl = _.get(r, "packageUrl", "");
    const match = purl.match(/^pkg:(\w+)\//);
    return match ? match[1] : "unknown";
  });

  const ecosystemSummaries = _.mapValues(byEcosystem, (items, ecosystem) => ({
    ecosystem,
    count: _.size(items),
    critical: _.filter(items, (i) => _.get(i, "severity") === "CRITICAL").length,
    high: _.filter(items, (i) => _.get(i, "severity") === "HIGH").length,
    fixable: _.filter(items, (i) =>
      ["SAFE_PATCH", "MINOR_BUMP", "MAJOR_BUMP_SAFE"].includes(
        _.get(i, "classification")
      )
    ).length,
  }));

  // Find most urgent items
  const actionRequired = _.chain(results)
    .filter((r) => ["CRITICAL", "HIGH"].includes(_.get(r, "severity", "").toUpperCase()))
    .filter((r) =>
      ["SAFE_PATCH", "MINOR_BUMP"].includes(_.get(r, "classification"))
    )
    .sortBy((r) => {
      const order = { CRITICAL: 0, HIGH: 1 };
      return _.get(order, _.get(r, "severity", "").toUpperCase(), 99);
    })
    .take(10)
    .value();

  // Confidence distribution
  const confidences = _.compact(_.map(results, "confidence"));
  const avgConfidence = _.isEmpty(confidences)
    ? 0
    : _.round(_.mean(confidences), 2);
  const minConfidence = _.isEmpty(confidences) ? 0 : _.min(confidences);

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      totalVulnerabilities: total,
      bySeverity: _.defaults(bySeverity, {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
      }),
      byClassification,
    },
    ecosystems: ecosystemSummaries,
    actionRequired: {
      count: actionRequired.length,
      items: actionRequired.map((r) => ({
        id: _.get(r, "cveId"),
        package: _.get(r, "packageUrl"),
        severity: _.get(r, "severity"),
        classification: _.get(r, "classification"),
        fixVersion: _.get(r, "fixVersion"),
      })),
    },
    confidence: {
      average: avgConfidence,
      minimum: minConfidence,
      distribution: {
        high: _.filter(confidences, (c) => c >= 0.8).length,
        medium: _.filter(confidences, (c) => c >= 0.5 && c < 0.8).length,
        low: _.filter(confidences, (c) => c < 0.5).length,
      },
    },
  };
}

/**
 * Renders the summary as a markdown string for Slack / PR comments.
 */
function renderMarkdown(summary) {
  const ov = summary.overview;
  const lines = [
    `# Vulnerability Scan Summary`,
    ``,
    `**${ov.totalVulnerabilities}** vulnerabilities found | ` +
      `**${_.get(ov.bySeverity, "CRITICAL", 0)}** critical | ` +
      `**${_.get(ov.bySeverity, "HIGH", 0)}** high`,
    ``,
    `## By Classification`,
    ..._.map(ov.byClassification, (count, cls) => `- **${cls}**: ${count}`),
    ``,
    `## Ecosystems`,
    ..._.map(summary.ecosystems, (eco) =>
      `- **${eco.ecosystem}**: ${eco.count} vulns (${eco.fixable} fixable)`
    ),
    ``,
    `## Action Required (${summary.actionRequired.count})`,
    ..._.map(summary.actionRequired.items, (item) =>
      `- \`${item.id}\` in \`${item.package}\` — ${item.severity} / ${item.classification} → fix: ${item.fixVersion || "N/A"}`
    ),
    ``,
    `---`,
    `_Confidence: avg ${summary.confidence.average} | min ${summary.confidence.minimum}_`,
    `_Generated: ${summary.generatedAt}_`,
  ];

  return _.join(lines, "\n");
}

module.exports = { buildSummary, renderMarkdown };
