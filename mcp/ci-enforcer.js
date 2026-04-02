#!/usr/bin/env node

const { createServer } = require("@modelcontextprotocol/sdk/server/index.js");

const GITHUB_API = "https://api.github.com";

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is not set");
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "ci-enforcer-mcp/1.0.0"
  };
}

async function githubFetch(url) {
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `GitHub API error ${res.status}: ${body.message || res.statusText}`
    );
  }
  return res.json();
}

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
      pull_number: { type: "integer" }
    },
    required: ["owner", "repo", "pull_number"]
  }
}, async ({ owner, repo, pull_number }) => {
  const pr = await githubFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${pull_number}`
  );

  const headSha = pr && pr.head && pr.head.sha ? pr.head.sha : null;

  if (!headSha) {
    return {
      status: "unknown",
      head_sha: null
    };
  }

  const statusData = await githubFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${headSha}/status`
  );

  return {
    status: statusData && typeof statusData.state === "string" ? statusData.state : "unknown",
    head_sha: headSha
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
  const data = await githubFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${sha}/check-runs`
  );

  const failed = (data.check_runs || []).filter(
    check => check.conclusion === "failure"
  );

  return failed.map(check => ({
    name: check.name,
    url: check.html_url,
    summary: check.output && check.output.summary ? check.output.summary : "No summary"
  }));
});

// TOOL 3: Suggest fixes (basic heuristic)
server.tool("suggestFixes", {
  description: "Suggest fixes for failed CI checks",
  inputSchema: {
    type: "object",
    properties: {
      failures: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" }
          },
          required: ["name"]
        }
      }
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
