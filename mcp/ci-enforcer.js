#!/usr/bin/env node

import { createServer } from "@modelcontextprotocol/sdk/server/index.js";
import fetch from "node-fetch";

const GITHUB_API = "https://api.github.com";

const server = createServer({
  name: "ci-enforcer",
  version: "1.0.0"
});

// TOOL 1: Get latest CI status for a PR
server.tool("getCiStatus", {
  description: "Get CI/CD status for a pull request",
  inputSchema: {
    type: "object",
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      pull_number: { type: "number" }
    },
    required: ["owner", "repo", "pull_number"]
  }
}, async ({ owner, repo, pull_number }) => {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${pull_number}`,
    {
        headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "User-Agent": "ci-enforcer-mcp/1.0.0"
      }
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
      }
    }
  );

  const pr = await res.json();

  return {
    status: pr.mergeable_state,
    head_sha: pr.head.sha
  };
});

// TOOL 2: Get failed checks
server.tool("getFailedChecks", {
  description: "List failed CI checks for a commit",
  inputSchema: {
    type: "object",
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      sha: { type: "string" }
    },
    required: ["owner", "repo", "sha"]
  }
}, async ({ owner, repo, sha }) => {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${sha}/check-runs`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json"
      }
    }
  );

  const data = await res.json();

  const failed = data.check_runs.filter(
    check => check.conclusion === "failure"
  );

  return failed.map(check => ({
    name: check.name,
    url: check.html_url,
    summary: check.output?.summary || "No summary"
  }));
});

// TOOL 3: Suggest fixes (basic heuristic)
server.tool("suggestFixes", {
  description: "Suggest fixes for failed CI checks",
  inputSchema: {
    type: "object",
    properties: {
      failures: { type: "array" }
    },
    required: ["failures"]
  }
}, async ({ failures }) => {
  return failures.map(f => {
    let suggestion = "Review logs";

    if (f.name.toLowerCase().includes("lint")) {
      suggestion = "Run linter locally and fix formatting issues";
    } else if (f.name.toLowerCase().includes("test")) {
      suggestion = "Run tests locally and inspect failing cases";
    } else if (f.name.toLowerCase().includes("build")) {
      suggestion = "Check build config and dependencies";
    }

    return {
      check: f.name,
      suggestion
    };
  });
});

server.listen();
