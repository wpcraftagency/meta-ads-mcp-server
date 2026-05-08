import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { metaGetPaged } from "../services/meta-client.js";
import { AdAccount } from "../types.js";
import { DEFAULT_FIELDS, ACCOUNT_STATUS_MAP } from "../constants.js";

export function registerAccountTools(server: McpServer): void {
  // ─── List Ad Accounts ────────────────────────────────────────────────────────
  server.registerTool(
    "meta_get_ad_accounts",
    {
      title: "Get Ad Accounts",
      description: `List all Meta ad accounts accessible by the current access token.

Returns account IDs, names, status, currency, timezone, and spend info.
Use this first to get the account_id (format: act_XXXXXXXXXX) needed by other tools.

Returns: List of ad accounts with:
  - id: Full account ID (act_XXXXXXXXXX format)
  - account_id: Numeric ID only
  - name: Account display name
  - status: ACTIVE, DISABLED, etc.
  - currency: e.g. HUF, EUR, USD
  - timezone_name: e.g. Europe/Budapest
  - amount_spent: Total lifetime spend (in cents)
  - balance: Current balance (in cents)

Examples:
  - Use when: "Which ad accounts do I have access to?"
  - Use when: "What's the account ID for client X?"`,
      inputSchema: {
        user_id: z.string()
          .default("me")
          .describe("Facebook user ID or 'me' for the token owner (default: 'me')"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ user_id }) => {
      const accounts = await metaGetPaged<AdAccount>(
        `/${user_id}/adaccounts`,
        { fields: DEFAULT_FIELDS.account }
      );

      if (!accounts.length) {
        return { content: [{ type: "text", text: "No ad accounts found for this token." }] };
      }

      const lines = accounts.map((acc) => {
        const status = ACCOUNT_STATUS_MAP[acc.account_status] || `STATUS_${acc.account_status}`;
        const spent = acc.amount_spent ? `${(parseFloat(acc.amount_spent) / 100).toLocaleString("hu-HU")} ${acc.currency}` : "N/A";
        return [
          `**${acc.name}**`,
          `  ID: ${acc.id}`,
          `  Status: ${status}`,
          `  Currency: ${acc.currency}`,
          `  Timezone: ${acc.timezone_name}`,
          `  Lifetime Spend: ${spent}`,
          acc.business ? `  Business: ${acc.business.name} (${acc.business.id})` : "",
        ].filter(Boolean).join("\n");
      });

      const output = `# Meta Ad Accounts (${accounts.length})\n\n${lines.join("\n\n")}`;
      return {
        content: [{ type: "text", text: output }],
        structuredContent: { accounts },
      };
    }
  );
}
