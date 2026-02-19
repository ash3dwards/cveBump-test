const { uploadFile, uploadBatch } = require("./src/upload-service");
const { relayEvent, relayEventWithAttachment } = require("./lib/webhook-relay");
const { MultipartClient } = require("./utils/multipart-client");

async function main() {
  // Upload a single file
  if (process.argv[2] === "upload") {
    const result = await uploadFile(process.argv[3], {
      tags: ["manual-upload"],
      description: "CLI upload",
    });
    console.log("Uploaded:", result);
  }

  // Send a webhook event
  if (process.argv[2] === "notify") {
    await relayEvent(
      { type: "deployment", data: { version: "1.0.0" } },
      "slack"
    );
    console.log("Notification sent");
  }

  // Submit a compliance report
  if (process.argv[2] === "report") {
    const client = new MultipartClient(
      process.env.COMPLIANCE_URL || "https://compliance.example.com",
      process.env.COMPLIANCE_API_KEY || "dev-key"
    );
    const result = await client.submitReport({
      type: "vulnerability-scan",
      findings: [],
      passed: true,
    });
    console.log("Report submitted:", result);
  }
}

main().catch(console.error);
