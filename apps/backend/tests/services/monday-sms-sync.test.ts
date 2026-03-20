import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("monday-sms-sync configuration", () => {
  describe("parseBool", () => {
    it("should parse true string to true", () => {
      process.env.MONDAY_SMS_REPORTS_SYNC_ENABLED = "true";
      const result = process.env.MONDAY_SMS_REPORTS_SYNC_ENABLED;
      assert.equal(result, "true");
    });

    it("should parse false string to false", () => {
      process.env.MONDAY_SMS_REPORTS_SYNC_ENABLED = "false";
      const result = process.env.MONDAY_SMS_REPORTS_SYNC_ENABLED;
      assert.equal(result, "false");
    });

    it("should return fallback for empty string", () => {
      process.env.MONDAY_SMS_REPORTS_SYNC_ENABLED = "";
      const result = process.env.MONDAY_SMS_REPORTS_SYNC_ENABLED;
      assert.equal(result, "");
    });
  });

  describe("parseCsv", () => {
    it("should parse CSV string to array", () => {
      process.env.MONDAY_SMS_SYNC_BOARD_IDS = "123,456,789";
      const result = process.env.MONDAY_SMS_SYNC_BOARD_IDS.split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      assert.equal(result.length, 3);
      assert.equal(result[0], "123");
      assert.equal(result[1], "456");
      assert.equal(result[2], "789");
    });

    it("should return empty array for empty string", () => {
      process.env.MONDAY_SMS_SYNC_BOARD_IDS = "";
      const result = process.env.MONDAY_SMS_SYNC_BOARD_IDS.split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      assert.equal(result.length, 0);
    });
  });
});
