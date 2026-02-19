const FormData = require("form-data");
const https = require("https");
const { Buffer } = require("buffer");

const WEBHOOK_ENDPOINTS = {
  slack: process.env.SLACK_WEBHOOK_URL,
  custom: process.env.CUSTOM_WEBHOOK_URL,
};

/**
 * Relays event payloads to downstream webhook consumers.
 * Uses multipart form encoding for payloads that include attachments.
 */
function relayEventWithAttachment(event, attachmentBuffer, targetEndpoint) {
  return new Promise((resolve, reject) => {
    const form = new FormData();

    form.append("payload_json", JSON.stringify({
      event_type: event.type,
      source: event.source || "cvebump-test",
      timestamp: event.timestamp || new Date().toISOString(),
      data: event.data,
    }));

    if (attachmentBuffer) {
      form.append("attachment", attachmentBuffer, {
        filename: event.attachmentName || "report.pdf",
        contentType: event.attachmentMime || "application/pdf",
        knownLength: attachmentBuffer.length,
      });
    }

    const endpoint = WEBHOOK_ENDPOINTS[targetEndpoint] || targetEndpoint;
    const url = new URL(endpoint);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        ...form.getHeaders(),
        "User-Agent": "cvebump-relay/1.0",
        "X-Webhook-Signature": computeSignature(event),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body });
        } else {
          reject(new Error(`Webhook failed: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on("error", reject);
    form.pipe(req);
  });
}

function computeSignature(event) {
  const crypto = require("crypto");
  const secret = process.env.WEBHOOK_SECRET || "dev-secret";
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(event))
    .digest("hex");
}

/**
 * Sends a plain JSON webhook (no attachment).
 */
async function relayEvent(event, targetEndpoint) {
  return relayEventWithAttachment(event, null, targetEndpoint);
}

module.exports = { relayEvent, relayEventWithAttachment };
