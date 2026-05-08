import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { metaGetPaged, metaGet, metaPost } from "../services/meta-client.js";
import { Campaign, CampaignStatus, CampaignObjective } from "../types.js";
import { DEFAULT_FIELDS } from "../constants.js";

export function registerCampaignTools(server: McpServer): void {
  // ─── List Campaigns ──────────────────────────────────────────────────────────
  server.registerTool(
    "meta_list_campaigns",
    {
      title: "List Campaigns",
      description: `List all campaigns in a Meta ad account with optional status filter.

Args:
  - account_id (string): Ad account ID in act_XXXXXXXXXX format
  - status (string, optional): Filter by status — ACTIVE, PAUSED, ARCHIVED, DELETED, or ALL (default: ALL)
  - limit (number, optional): Max results per page, 1-100 (default: 50)

Returns: List of campaigns with id, name, status, objective, budgets, dates, bid strategy.

Examples:
  - Use when: "Show me all active campaigns"
  - Use when: "List paused campaigns in account act_123"`,
      inputSchema: {
        account_id: z.string().describe("Ad account ID, e.g. act_1234567890"),
        status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED", "ALL"]).default("ALL").describe("Filter by campaign status"),
        limit: z.number().int().min(1).max(100).default(50).describe("Max campaigns to return"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ account_id, status, limit }) => {
      const params: Record<string, unknown> = { fields: DEFAULT_FIELDS.campaign };
      if (status !== "ALL") {
        params.effective_status = JSON.stringify([status]);
      }

      const campaigns = await metaGetPaged<Campaign>(`/${account_id}/campaigns`, params, limit);

      if (!campaigns.length) {
        return { content: [{ type: "text", text: `No campaigns found (filter: ${status}).` }] };
      }

      const lines = campaigns.map((c) => {
        const budget = c.daily_budget
          ? `Daily: ${(parseFloat(c.daily_budget) / 100).toLocaleString("hu-HU")}`
          : c.lifetime_budget
          ? `Lifetime: ${(parseFloat(c.lifetime_budget) / 100).toLocaleString("hu-HU")}`
          : "No budget set";
        return [
          `**${c.name}** [${c.status}]`,
          `  ID: ${c.id}`,
          `  Objective: ${c.objective}`,
          `  Budget: ${budget}`,
          c.budget_remaining ? `  Remaining: ${(parseFloat(c.budget_remaining) / 100).toLocaleString("hu-HU")}` : "",
          `  Bid Strategy: ${c.bid_strategy || "N/A"}`,
          `  Created: ${new Date(c.created_time).toLocaleDateString("hu-HU")}`,
        ].filter(Boolean).join("\n");
      });

      const output = `# Campaigns in ${account_id} (${campaigns.length})\n\n${lines.join("\n\n")}`;
      return {
        content: [{ type: "text", text: output }],
        structuredContent: { campaigns, total: campaigns.length },
      };
    }
  );

  // ─── Get Campaign ────────────────────────────────────────────────────────────
  server.registerTool(
    "meta_get_campaign",
    {
      title: "Get Campaign Details",
      description: `Get detailed information about a single campaign by ID.

Args:
  - campaign_id (string): The campaign ID

Returns: Full campaign details including budgets, objective, status, dates, bid strategy.`,
      inputSchema: {
        campaign_id: z.string().describe("Campaign ID, e.g. 120200000000000000"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ campaign_id }) => {
      const campaign = await metaGet<Campaign>(`/${campaign_id}`, {
        fields: DEFAULT_FIELDS.campaign,
      });

      const budget = campaign.daily_budget
        ? `Daily: ${(parseFloat(campaign.daily_budget) / 100).toLocaleString("hu-HU")}`
        : campaign.lifetime_budget
        ? `Lifetime: ${(parseFloat(campaign.lifetime_budget) / 100).toLocaleString("hu-HU")}`
        : "No budget set";

      const output = [
        `# Campaign: ${campaign.name}`,
        `**ID:** ${campaign.id}`,
        `**Status:** ${campaign.status}`,
        `**Objective:** ${campaign.objective}`,
        `**Budget:** ${budget}`,
        campaign.budget_remaining ? `**Remaining:** ${(parseFloat(campaign.budget_remaining) / 100).toLocaleString("hu-HU")}` : "",
        `**Bid Strategy:** ${campaign.bid_strategy || "N/A"}`,
        `**Buying Type:** ${campaign.buying_type || "N/A"}`,
        campaign.start_time ? `**Start:** ${new Date(campaign.start_time).toLocaleString("hu-HU")}` : "",
        campaign.stop_time ? `**End:** ${new Date(campaign.stop_time).toLocaleString("hu-HU")}` : "",
        `**Created:** ${new Date(campaign.created_time).toLocaleString("hu-HU")}`,
        `**Updated:** ${new Date(campaign.updated_time).toLocaleString("hu-HU")}`,
      ].filter(Boolean).join("\n");

      return {
        content: [{ type: "text", text: output }],
        structuredContent: campaign,
      };
    }
  );

  // ─── Create Campaign ─────────────────────────────────────────────────────────
  server.registerTool(
    "meta_create_campaign",
    {
      title: "Create Campaign",
      description: `Create a new Meta advertising campaign.

Args:
  - account_id (string): Ad account ID (act_XXXXXXXXXX)
  - name (string): Campaign name
  - objective (string): Campaign objective — OUTCOME_AWARENESS, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_APP_PROMOTION, OUTCOME_SALES
  - status (string): Initial status — ACTIVE or PAUSED (default: PAUSED)
  - daily_budget (number, optional): Daily budget in the account's currency (NOT cents)
  - lifetime_budget (number, optional): Lifetime budget in the account's currency (NOT cents)
  - bid_strategy (string, optional): LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP
  - special_ad_categories (array, optional): Required for credit/employment/housing/political ads

Returns: New campaign ID and confirmation.

Examples:
  - Use when: "Create a new traffic campaign with 5000 HUF daily budget"
  - Don't use when: You just need to update an existing campaign (use meta_update_campaign)`,
      inputSchema: {
        account_id: z.string().describe("Ad account ID, e.g. act_1234567890"),
        name: z.string().min(1).max(400).describe("Campaign name"),
        objective: z.enum([
          "OUTCOME_AWARENESS",
          "OUTCOME_TRAFFIC",
          "OUTCOME_ENGAGEMENT",
          "OUTCOME_LEADS",
          "OUTCOME_APP_PROMOTION",
          "OUTCOME_SALES",
        ]).describe("Campaign objective"),
        status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED").describe("Initial campaign status (default: PAUSED for safety)"),
        daily_budget: z.number().positive().optional().describe("Daily budget in account currency (e.g. 5000 for 5000 HUF)"),
        lifetime_budget: z.number().positive().optional().describe("Lifetime budget in account currency"),
        bid_strategy: z.enum(["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP"]).optional().describe("Bid strategy"),
        special_ad_categories: z.array(z.enum(["NONE", "EMPLOYMENT", "HOUSING", "CREDIT", "ISSUES_ELECTIONS_POLITICS"])).default(["NONE"]).describe("Special ad categories (required by Meta)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ account_id, name, objective, status, daily_budget, lifetime_budget, bid_strategy, special_ad_categories }) => {
      const payload: Record<string, unknown> = {
        name,
        objective,
        status,
        special_ad_categories,
      };

      if (daily_budget !== undefined) payload.daily_budget = Math.round(daily_budget * 100);
      if (lifetime_budget !== undefined) payload.lifetime_budget = Math.round(lifetime_budget * 100);
      if (bid_strategy) payload.bid_strategy = bid_strategy;

      const result = await metaPost<{ id: string }>(`/${account_id}/campaigns`, payload);

      return {
        content: [{
          type: "text",
          text: `✅ Campaign created successfully!\n\n**ID:** ${result.id}\n**Name:** ${name}\n**Objective:** ${objective}\n**Status:** ${status}\n\nYou can now create ad sets under this campaign using meta_create_adset with campaign_id: ${result.id}`,
        }],
        structuredContent: { id: result.id, name, objective, status },
      };
    }
  );

  // ─── Update Campaign ─────────────────────────────────────────────────────────
  server.registerTool(
    "meta_update_campaign",
    {
      title: "Update Campaign",
      description: `Update an existing campaign's name, status, or budget.

Args:
  - campaign_id (string): The campaign ID to update
  - name (string, optional): New campaign name
  - status (string, optional): New status — ACTIVE, PAUSED, or ARCHIVED
  - daily_budget (number, optional): New daily budget in account currency
  - lifetime_budget (number, optional): New lifetime budget in account currency

Returns: Confirmation with updated campaign ID.

Examples:
  - Use when: "Pause campaign 12345"
  - Use when: "Increase daily budget to 10000 HUF for campaign X"
  - Use when: "Rename campaign to 'Summer Sale 2025'"`,
      inputSchema: {
        campaign_id: z.string().describe("Campaign ID to update"),
        name: z.string().min(1).max(400).optional().describe("New campaign name"),
        status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional().describe("New campaign status"),
        daily_budget: z.number().positive().optional().describe("New daily budget in account currency"),
        lifetime_budget: z.number().positive().optional().describe("New lifetime budget in account currency"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ campaign_id, name, status, daily_budget, lifetime_budget }) => {
      const payload: Record<string, unknown> = {};
      if (name) payload.name = name;
      if (status) payload.status = status;
      if (daily_budget !== undefined) payload.daily_budget = Math.round(daily_budget * 100);
      if (lifetime_budget !== undefined) payload.lifetime_budget = Math.round(lifetime_budget * 100);

      if (Object.keys(payload).length === 0) {
        return { content: [{ type: "text", text: "No changes specified. Provide at least one field to update." }] };
      }

      await metaPost<{ success: boolean }>(`/${campaign_id}`, payload);

      const changes = Object.entries(payload)
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join("\n");

      return {
        content: [{
          type: "text",
          text: `✅ Campaign ${campaign_id} updated successfully!\n\nChanges applied:\n${changes}`,
        }],
        structuredContent: { campaign_id, updated: payload },
      };
    }
  );
}
