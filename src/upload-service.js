const FormData = require("form-data");
const fs = require("fs");
const axios = require("axios");

const API_BASE = process.env.UPLOAD_API_URL || "https://api.example.com";

/**
 * Uploads a file to the remote storage service.
 * Handles chunked transfer for files over 5MB.
 */
async function uploadFile(filePath, metadata = {}) {
  const stats = fs.statSync(filePath);
  const stream = fs.createReadStream(filePath);

  const form = new FormData();
  form.append("file", stream, {
    filename: filePath.split("/").pop(),
    contentType: "application/octet-stream",
    knownLength: stats.size,
  });

  if (metadata.tags) {
    form.append("tags", JSON.stringify(metadata.tags));
  }
  if (metadata.description) {
    form.append("description", metadata.description);
  }
  form.append("timestamp", new Date().toISOString());

  const headers = form.getHeaders();
  headers["Authorization"] = `Bearer ${process.env.UPLOAD_TOKEN}`;
  headers["X-Request-Id"] = crypto.randomUUID();

  const response = await axios.post(`${API_BASE}/v2/files/upload`, form, {
    headers,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 120_000,
  });

  return {
    id: response.data.id,
    url: response.data.url,
    size: stats.size,
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Uploads multiple files as a single batch request.
 */
async function uploadBatch(filePaths, batchLabel) {
  const form = new FormData();

  for (const fp of filePaths) {
    const stream = fs.createReadStream(fp);
    form.append("files", stream, { filename: fp.split("/").pop() });
  }
  form.append("batchLabel", batchLabel || `batch-${Date.now()}`);
  form.append("count", String(filePaths.length));

  const headers = form.getHeaders();
  headers["Authorization"] = `Bearer ${process.env.UPLOAD_TOKEN}`;

  const response = await axios.post(`${API_BASE}/v2/files/batch`, form, {
    headers,
    timeout: 300_000,
  });

  return response.data;
}

module.exports = { uploadFile, uploadBatch };
