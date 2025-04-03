const core = require("@actions/core");
const github = require("@actions/github");
const axios = require("axios");

// Helper function to get input regardless of case
function getInput(name) {
  const upperName = name.toUpperCase();
  const lowerName = name.toLowerCase();

  // Try both uppercase (for backward compatibility) and lowercase
  return core.getInput(upperName) || core.getInput(lowerName);
}

async function main() {
  const consumer_key = getInput("consumer-key");
  const consumer_token = getInput("consumer-token");
  const candidate = getInput("candidate");
  const version = getInput("version");
  const platform = getInput("platform");
  const url = getInput("url");
  const backend = getInput("backend");

  // EXTRACT CHECKSUMS INPUTS
  const checksum_md5 = getInput("checksum-md5");
  const checksum_sha1 = getInput("checksum-sha-1");
  const checksum_sha224 = getInput("checksum-sha-224");
  const checksum_sha256 = getInput("checksum-sha-256");
  const checksum_sha384 = getInput("checksum-sha-384");
  const checksum_sha512 = getInput("checksum-sha-512");

  const checksum_payload = {};

  if (checksum_md5) {
    checksum_payload["MD5"] = checksum_md5;
  }

  if (checksum_sha1) {
    checksum_payload["SHA-1"] = checksum_sha1;
  }

  if (checksum_sha224) {
    checksum_payload["SHA-224"] = checksum_sha224;
  }

  if (checksum_sha256) {
    checksum_payload["SHA-256"] = checksum_sha256;
  }

  if (checksum_sha384) {
    checksum_payload["SHA-384"] = checksum_sha384;
  }

  if (checksum_sha512) {
    checksum_payload["SHA-512"] = checksum_sha512;
  }

  const payload = {
    candidate: candidate,
    version: version,
    platform: platform,
    url: url,
    checksums: checksum_payload,
  };

  const query_config = {
    method: "POST",
    url: `${backend}/release`,
    headers: {
      "Consumer-Key": consumer_key,
      "Consumer-Token": consumer_token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    data: payload,
  };

  const response = await axios(query_config);

  console.log(response.data);
}

main();
