const _ = require("lodash");

/**
 * Validates and normalises configuration objects against a schema.
 * Uses lodash for deep defaults, path-based access, and type checking.
 */

const CONFIG_SCHEMA = {
  server: {
    port: { type: "number", default: 3000, min: 1, max: 65535 },
    host: { type: "string", default: "0.0.0.0" },
    cors: {
      origins: { type: "array", default: ["*"] },
      credentials: { type: "boolean", default: false },
    },
  },
  integrations: {
    github: {
      token: { type: "string", required: true },
      baseUrl: { type: "string", default: "https://api.github.com" },
    },
    jira: {
      baseUrl: { type: "string" },
      email: { type: "string" },
      apiToken: { type: "string" },
      projectKey: { type: "string", default: "SEC" },
    },
    slack: {
      webhookUrl: { type: "string" },
      channel: { type: "string", default: "#security-alerts" },
    },
  },
  processing: {
    batchSize: { type: "number", default: 50, min: 1, max: 500 },
    concurrency: { type: "number", default: 10, min: 1, max: 100 },
    timeout: { type: "number", default: 30000 },
    retries: { type: "number", default: 3, min: 0, max: 10 },
  },
};

/**
 * Recursively flattens the schema into dot-notation paths.
 */
function flattenSchema(schema, prefix = "") {
  return _.reduce(
    schema,
    (acc, value, key) => {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (_.has(value, "type")) {
        acc[fullPath] = value;
      } else if (_.isPlainObject(value)) {
        _.assign(acc, flattenSchema(value, fullPath));
      }
      return acc;
    },
    {}
  );
}

/**
 * Validates a config object against CONFIG_SCHEMA.
 * Returns { valid, errors, config } where config has defaults applied.
 */
function validateConfig(rawConfig) {
  const flat = flattenSchema(CONFIG_SCHEMA);
  const errors = [];
  const config = _.cloneDeep(rawConfig);

  _.forEach(flat, (rule, path) => {
    const value = _.get(config, path);

    // Apply default if missing
    if (_.isNil(value) && _.has(rule, "default")) {
      _.set(config, path, rule.default);
      return;
    }

    // Check required
    if (rule.required && _.isNil(value)) {
      errors.push({ path, message: `Required field "${path}" is missing` });
      return;
    }

    // Skip optional missing fields
    if (_.isNil(value)) return;

    // Type check
    const actualType = _.isArray(value) ? "array" : typeof value;
    if (actualType !== rule.type) {
      errors.push({
        path,
        message: `Expected ${rule.type} at "${path}", got ${actualType}`,
      });
      return;
    }

    // Range check for numbers
    if (rule.type === "number") {
      if (!_.isNil(rule.min) && value < rule.min) {
        errors.push({ path, message: `"${path}" must be >= ${rule.min}` });
      }
      if (!_.isNil(rule.max) && value > rule.max) {
        errors.push({ path, message: `"${path}" must be <= ${rule.max}` });
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    config,
  };
}

/**
 * Merges environment variables into config using a naming convention.
 * E.g., CONFVE_SERVER_PORT=8080 → config.server.port = 8080
 */
function mergeEnvOverrides(config, env = process.env) {
  const confveVars = _.pickBy(env, (_val, key) =>
    _.startsWith(key, "CONFVE_")
  );

  _.forEach(confveVars, (value, key) => {
    const path = key
      .replace(/^CONFVE_/, "")
      .toLowerCase()
      .replace(/_/g, ".");

    // Coerce types
    let coerced = value;
    if (value === "true") coerced = true;
    else if (value === "false") coerced = false;
    else if (/^\d+$/.test(value)) coerced = _.toNumber(value);

    _.set(config, path, coerced);
  });

  return config;
}

module.exports = { validateConfig, mergeEnvOverrides, flattenSchema, CONFIG_SCHEMA };
