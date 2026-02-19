const axios = require("axios");
const fs = require("fs");
const path = require("path");

const NPM_REGISTRY = "https://registry.npmjs.org";
const MIRROR_DIR = process.env.MIRROR_CACHE_DIR || "/tmp/registry-mirror";

/**
 * Mirrors package tarballs locally for air-gapped or CI environments.
 * Downloads .tgz files for pinned dependency versions.
 */
class RegistryMirror {
  constructor(opts = {}) {
    this.registryUrl = opts.registryUrl || NPM_REGISTRY;
    this.cacheDir = opts.cacheDir || MIRROR_DIR;
    this.httpClient = axios.create({
      baseURL: this.registryUrl,
      timeout: 30_000,
      responseType: "json",
    });

    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Fetch package metadata from the registry.
   */
  async fetchPackageMetadata(packageName) {
    const response = await this.httpClient.get(
      `/${encodeURIComponent(packageName)}`
    );
    return response.data;
  }

  /**
   * Download a specific version tarball to the local mirror.
   */
  async downloadTarball(packageName, version) {
    const metadata = await this.fetchPackageMetadata(packageName);
    const versionData = metadata.versions?.[version];
    if (!versionData) {
      throw new Error(`Version ${version} not found for ${packageName}`);
    }

    const tarballUrl = versionData.dist.tarball;
    const integrity = versionData.dist.integrity || versionData.dist.shasum;

    const tarballResponse = await axios.get(tarballUrl, {
      responseType: "arraybuffer",
      timeout: 60_000,
    });

    const outDir = path.join(this.cacheDir, packageName);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const outPath = path.join(outDir, `${version}.tgz`);
    fs.writeFileSync(outPath, tarballResponse.data);

    return {
      package: packageName,
      version,
      path: outPath,
      size: tarballResponse.data.length,
      integrity,
      mirroredAt: new Date().toISOString(),
    };
  }

  /**
   * Mirror all dependencies from a package.json file.
   */
  async mirrorFromPackageJson(pkgJsonPath) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    const results = [];
    const failures = [];

    for (const [name, versionRange] of Object.entries(allDeps)) {
      const version = versionRange.replace(/^[\^~>=<]*/g, "");
      try {
        const result = await this.downloadTarball(name, version);
        results.push(result);
      } catch (err) {
        failures.push({ package: name, version, error: err.message });
      }
    }

    return {
      mirrored: results.length,
      failed: failures.length,
      total: Object.keys(allDeps).length,
      cacheDir: this.cacheDir,
      results,
      failures,
    };
  }
}

module.exports = { RegistryMirror };
