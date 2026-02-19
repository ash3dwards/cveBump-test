const axios = require("axios");
const fs = require("fs");
const path = require("path");

const REGISTRY_URL = "https://registry.npmjs.org";

/**
 * Checks the health and freshness of project dependencies
 * by querying the npm registry for each package.
 */
class DependencyHealthChecker {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.httpClient = axios.create({
      baseURL: REGISTRY_URL,
      timeout: 10_000,
      headers: { Accept: "application/json" },
    });
  }

  /**
   * Reads package.json and returns merged deps + devDeps.
   */
  _loadDependencies() {
    const pkgPath = path.join(this.projectRoot, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
  }

  /**
   * Queries the npm registry for latest version, deprecation status,
   * and last-publish date for a single package.
   */
  async checkPackage(name, currentVersion) {
    const response = await this.httpClient.get(`/${encodeURIComponent(name)}`);
    const data = response.data;
    const latest = data["dist-tags"]?.latest;
    const latestInfo = data.versions?.[latest] || {};
    const currentInfo = data.versions?.[currentVersion] || {};

    return {
      name,
      currentVersion,
      latestVersion: latest,
      isOutdated: latest !== currentVersion,
      isDeprecated: !!currentInfo.deprecated,
      deprecationMessage: currentInfo.deprecated || null,
      lastPublished: data.time?.[latest] || null,
      daysSincePublish: data.time?.[latest]
        ? Math.floor((Date.now() - new Date(data.time[latest]).getTime()) / 86400000)
        : null,
      license: latestInfo.license || "UNKNOWN",
    };
  }

  /**
   * Run a full health check across all dependencies.
   */
  async runFullCheck() {
    const deps = this._loadDependencies();
    const entries = Object.entries(deps);
    const results = [];
    const errors = [];

    for (const [name, version] of entries) {
      try {
        const report = await this.checkPackage(name, version.replace(/^[\^~]/, ""));
        results.push(report);
      } catch (err) {
        errors.push({ name, version, error: err.message });
      }
    }

    const outdatedCount = results.filter((r) => r.isOutdated).length;
    const deprecatedCount = results.filter((r) => r.isDeprecated).length;

    return {
      totalDependencies: entries.length,
      checked: results.length,
      outdated: outdatedCount,
      deprecated: deprecatedCount,
      errors: errors.length,
      healthScore: Math.round(((results.length - outdatedCount - deprecatedCount) / entries.length) * 100),
      results,
      errors,
      checkedAt: new Date().toISOString(),
    };
  }
}

module.exports = { DependencyHealthChecker };
