import assert from "node:assert/strict";
import test from "node:test";
import {
  getConfiguredAppUrl,
  getPublicAppUrlForRequest,
  PRODUCTION_APP_URL
} from "@/lib/appUrl";

type EnvPatch = Record<string, string | undefined>;

async function withEnv<T>(patch: EnvPatch, callback: () => T | Promise<T>) {
  const previous: EnvPatch = {};

  for (const key of Object.keys(patch)) {
    previous[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("configured app URL ignores stale localhost in CI", async () => {
  await withEnv(
    {
      CI: "true",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: undefined,
      RENDER: undefined,
      RENDER_EXTERNAL_URL: undefined
    },
    () => {
      assert.equal(getConfiguredAppUrl(), PRODUCTION_APP_URL);
    }
  );
});

test("configured app URL ignores stale localhost in production", async () => {
  await withEnv(
    {
      CI: undefined,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "production",
      RENDER: undefined,
      RENDER_EXTERNAL_URL: undefined
    },
    () => {
      assert.equal(getConfiguredAppUrl(), PRODUCTION_APP_URL);
    }
  );
});

test("public app URL uses forwarded host when configured URL is local", () => {
  const request = new Request("https://localhost:10000/admin", {
    headers: {
      "x-forwarded-host": "simplecity.app",
      "x-forwarded-proto": "https"
    }
  });

  assert.equal(
    getPublicAppUrlForRequest(request, "http://localhost:3000"),
    "https://simplecity.app"
  );
});
