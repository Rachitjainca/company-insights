#!/usr/bin/env node

const REQUIRED_MAJOR = 20;
const REQUIRED_MINOR = 9;

function parseVersion(v) {
  const [major, minor, patch] = v.split(".").map((n) => Number.parseInt(n, 10));
  return {
    major: Number.isFinite(major) ? major : 0,
    minor: Number.isFinite(minor) ? minor : 0,
    patch: Number.isFinite(patch) ? patch : 0,
  };
}

function isSupported(v) {
  if (v.major > REQUIRED_MAJOR) return true;
  if (v.major < REQUIRED_MAJOR) return false;
  return v.minor >= REQUIRED_MINOR;
}

const current = parseVersion(process.versions.node);

if (!isSupported(current)) {
  console.error("\n[Node Version Error]");
  console.error(
    `This project requires Node >= ${REQUIRED_MAJOR}.${REQUIRED_MINOR}.0 but found ${process.versions.node}.`
  );
  console.error("Please switch Node version and retry.");
  console.error("\nRecommended options:");
  console.error("- nvm use 20");
  console.error("- fnm use 20");
  process.exit(1);
}
