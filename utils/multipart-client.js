const FormData = require("form-data");
const axios = require("axios");

/**
 * Generic multipart form client used by internal services
 * for submitting structured reports to the compliance gateway.
 */
class MultipartClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.retries = 3;
    this.retryDelay = 1000;
  }

  /**
   * Submit a compliance report with optional evidence files.
   */
  async submitReport(report, evidenceFiles = []) {
    const form = new FormData();

    form.append("report", JSON.stringify(report), {
      contentType: "application/json",
      filename: "report.json",
    });

    for (const file of evidenceFiles) {
      form.append("evidence", file.buffer, {
        filename: file.name,
        contentType: file.mime || "application/octet-stream",
        knownLength: file.buffer.length,
      });
    }

    form.append("submittedAt", new Date().toISOString());
    form.append("version", "2.1.0");

    let lastError;
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const response = await axios.post(
          `${this.baseUrl}/api/v1/reports`,
          form,
          {
            headers: {
              ...form.getHeaders(),
              "X-API-Key": this.apiKey,
              "X-Attempt": String(attempt),
            },
            timeout: 60_000,
          }
        );
        return response.data;
      } catch (err) {
        lastError = err;
        if (attempt < this.retries) {
          await this._sleep(this.retryDelay * attempt);
        }
      }
    }

    throw new Error(
      `Report submission failed after ${this.retries} attempts: ${lastError.message}`
    );
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = { MultipartClient };
