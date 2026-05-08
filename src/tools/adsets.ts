import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { metaGetPaged, metaGet, metaPost } from "../services/meta-client.js";
import { AdSet } from "../types.js";
import { DEFAULT_FIELDS } from "../constants.js";

export function registerAdSetTools(server: McpServer): void {
  // ─── List Ad Sets ────────────────────────────────────────────────────────────
  server.registerTool(
    "meta_list_adsets",
    {
      title: "List Ad Sets",
      description: `List ad sets within a campaign or ad account.

Args:
  - parent_id (string): Campaign ID or ad account ID (act_XXXXXXXXXX)
  - status (string, optional): Filter by status — ACTIVE, PAUSED, ARCHIVED, DELETED, or ALL (default: ALL)
  - limit (number, optional): Max results, 1-100 (default: 50)

Returns: Ad sets with id, name, status, budgets, targeting summary, optimization goal.

Examples:
  - Use when: "Show ad sets in campaign 120200000000"
  - Use when: "List all active ad sets in account act_123"`,
      inputSchema: {
        parent_id: z.string().describe("Campaign ID or ad account ID (act_XXXXXXXXXX)"),
        status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED", "ALL"]).default("ALL").describe("Filter by status"),
        limit: z.number().int().min(1).max(100).default(50).describe("Max ad sets to return"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ parent_id, status, limit }) => {
      const params: Record<string, unknown> = { fields: DEFAULT_FIELDS.adset };
      if (status !== "ALL") params.effective_status = JSON.stringify([status]);

      const adsets = await metaGetPaged<AdSet>(`/${parent_id}/adsets`, params, limit);

      if (!adsets.length) {
        return { content: [{ type: "text", text: `No ad sets found (filter: ${status}).` }] };
      }

      const lines = adsets.map((a) => {
        const budget = a.daily_budget
          ? `Daily: ${(parseFloat(a.daily_budget) / 100).toLocaleString("hu-HU")}`
          : a.lifetime_budget
          ? `Lifetime: ${(parseFloat(a.lifetime_budget) / 100).toLocaleString("hu-HU")}`
          : "No budget";
        const targeting = a.targeting;
        const geoSummary = targeting?.geo_locations?.countries?.join(", ") || "Not specified";
        const ageSummary = (targeting?.age_min || targeting?.age_max)
          ? `${targeting?.age_min || "N/A"}–${targeting?.age_max || "N/A"}`
          : "All ages";

        return [
          `**${a.name}** [${a.status}]`,
          `  ID: ${a.id}`,
          `  Campaign: ${a.campaign_id}`,
          `  Budget: ${budget}`,
          `  Goal: ${a.optimization_goal || "N/A"} | Billing: ${a.billing_event || "N/A"}`,
          `  Geo: ${geoSummary} | Age: ${ageSummary}`,
          `  Updated: ${new Date(a.updated_time).toLocaleDateString("hu-HU")}`,
        ].join("\n");
      });

      const output = `# Ad Sets (${adsets.length})\n\n${lines.join("\n\n")}`;
      return {
        content: [{ type: "text", text: output }],
        structuredContent: { adsets, total: adsets.length },
      };
    }
  );

  // ─── Get Ad Set ──────────────────────────────────────────────────────────────
  server.registerTool(
    "meta_get_adset",
    {
      title: "Get Ad Set Details",
      description: `Get full details of a single ad set including targeting.

Args:
  - adset_id (string): The ad set ID

Returns: Full ad set details including targeting (age, gender, geo, interests, custom audiences), budget, optimization goal.`,
      inputSchema: {
        adset_id: z.string().describe("Ad set ID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ adset_id }) => {
      const adset = await metaGet<AdSet>(`/${adset_id}`, { fields: DEFAULT_FIELDS.adset });

      const t = adset.targeting || {};
      const targetingLines = [
        t.age_min || t.age_max ? `  Age: ${t.age_min || "N/A"}–${t.age_max || "N/A"}` : "",
        t.genders?.length ? `  Gender: ${t.genders.map((g) => (g === 1 ? "Male" : "Female")).join(", ")}` : "",
        t.geo_locations?.countries?.length ? `  Countries: ${t.geo_locations.countries.join(", ")}` : "",
        t.geo_locations?.cities?.length ? `  Cities: ${t.geo_locations.cities.map((c) => c.name).join(", ")}` : "",
        t.interests?.length ? `  Interests: ${t.interests.map((i) => i.name).join(", ")}` : "",
        t.custom_audiences?.length ? `  Custom Audiences: ${t.custom_audiences.map((a) => a.name).join(", ")}` : "",
        t.excluded_custom_audiences?.length ? `  Excluded: ${t.excluded_custom_audiences.map((a) => a.name).join(", ")}` : "",
      ].filter(Boolean);

      const budget = adset.daily_budget
        ? `Daily: ${(parseFloat(adset.daily_budget) / 100).toLocaleString("hu-HU")}`
        : adset.lifetime_budget
        ? `Lifetime: ${(parseFloat(adset.lifetime_budget) / 100).toLocaleString("hu-HU")}`
        : "No budget set";

      const output = [
        `# Ad Set: ${adset.name}`,
        `**ID:** ${adset.id}`,
        `**Status:** ${adset.status}`,
        `**Campaign ID:** ${adset.campaign_id}`,
        `**Budget:** ${budget}`,
        adset.budget_remaining ? `**Remaining:** ${(parseFloat(adset.budget_remaining) / 100).toLocaleString("hu-HU")}` : "",
        `**Optimization Goal:** ${adset.optimization_goal || "N/A"}`,
        `**Billing Event:** ${adset.billing_event || "N/A"}`,
        adset.bid_amount ? `**Bid Amount:** ${adset.bid_amount / 100}` : "",
        `**Bid Strategy:** ${adset.bid_strategy || "N/A"}`,
        "",
        "**Targeting:**",
        ...targetingLines,
        "",
        `**Updated:** ${new Date(adset.updated_time).toLocaleString("hu-HU")}`,
      ].filter((l) => l !== undefined).join("\n");

      return {
        content: [{ type: "text", text: output }],
        structuredContent: adset,
      };
    }
  );

  // ─── Update Ad Set ───────────────────────────────────────────────────────────
  server.registerTool(
    "meta_update_adset",
    {
      title: "Update Ad Set",
      description: `Update an ad set's name, status, budget, or bid amount.

Args:
  - adset_id (string): Ad set ID to update
  - name (string, optional): New name
  - status (string, optional): ACTIVE, PAUSED, or ARCHIVED
  - daily_budget (number, optional): New daily budget in account currency
  - lifetime_budget (number, optional): New lifetime budget in account currency
  - bid_amount (number, optional): New bid amount in account currency

Returns: Confirmation of the update.

Examples:
  - Use when: "Pause ad set 12345"
  - Use when: "Increase ad set budget to 3000 HUF"`,
      inputSchema: {
        adset_id: z.string().describe("Ad set ID to update"),
        name: z.string().min(1).optional().describe("New ad set name"),
        status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional().describe("New status"),
        daily_budget: z.number().positive().optional().describe("New daily budget in account currency"),
        lifetime_budget: z.number().positive().optional().describe("New lifetime budget in account currency"),
        bid_amount: z.number().positive().optional().describe("New bid amount in account currency"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ adset_id, name, status, daily_budget, lifetime_budget, bid_amount }) => {
      const payload: Record<string, unknown> = {};
      if (name) payload.name = name;
      if (status) payload.status = status;
      if (daily_budget !== undefined) payload.daily_budget = Math.round(daily_budget * 100);
      if (lifetime_budget !== undefined) payload.lifetime_budget = Math.round(lifetime_budget * 100);
      if (bid_amount !== undefined) payload.bid_amount = Math.round(bid_amount * 100);

      if (Object.keys(payload).length === 0) {
        return { content: [{ type: "text", text: "No changes specified." }] };
      }

      await metaPost<{ success: boolean }>(`/${adset_id}`, payload);

      const changes = Object.entries(payload).map(([k, v]) => `  - ${k}: ${v}`).join("\n");
      return {
        content: [{
          type: "text",
          text: `✅ Ad set ${adset_id} updated!\n\nChanges:\n${changes}`,
        }],
        structuredContent: { adset_id, updated: payload },
      };
    }
  );
}
