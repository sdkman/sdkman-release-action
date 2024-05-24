const core = require("@actions/core");
const github = require("@actions/github");
const axios = require("axios");

async function main() {
  const consumer_key = core.getInput("CONSUMER-KEY");
  const consumer_token = core.getInput("CONSUMER-KEY");
  const candidate = core.getInput("CANDIDATE");
  const version = core.getInput("VERSION");
  const platform = core.getInput("PLATFORM");
  const url = core.getInput("URL");
  const backend = core.getInput("BACKEND");

  // EXTRACT CHECKSUMS INPUTS
  const checksum_md5 = core.getInput("CHECKSUM-MD5");
  const checksum_sha1 = core.getInput("CHECKSUM-SHA-1");
  const checksum_sha224 = core.getInput("CHECKSUM-SHA-224");
  const checksum_sha256 = core.getInput("CHECKSUM-SHA-256");
  const checksum_sha384 = core.getInput("CHECKSUM-SHA-384");
  const checksum_sha512 = core.getInput("CHECKSUM-SHA-512");

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
