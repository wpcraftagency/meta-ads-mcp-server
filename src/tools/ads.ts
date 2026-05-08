import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { metaGetPaged, metaGet, metaPost } from "../services/meta-client.js";
import { Ad } from "../types.js";
import { DEFAULT_FIELDS } from "../constants.js";

export function registerAdTools(server: McpServer): void {
  // ─── List Ads ────────────────────────────────────────────────────────────────
  server.registerTool(
    "meta_list_ads",
    {
      title: "List Ads",
      description: `List ads within a campaign, ad set, or account.

Args:
  - parent_id (string): Campaign ID, ad set ID, or ad account ID (act_XXXXXXXXXX)
  - status (string, optional): Filter — ACTIVE, PAUSED, ARCHIVED, DELETED, or ALL (default: ALL)
  - limit (number, optional): Max results, 1-100 (default: 50)

Returns: Ads with id, name, status, creative summary, effective status.

Examples:
  - Use when: "Show all ads in ad set 12345"
  - Use when: "List disapproved ads in campaign X"`,
      inputSchema: {
        parent_id: z.string().describe("Campaign ID, ad set ID, or account ID"),
        status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED", "ALL"]).default("ALL").describe("Filter by status"),
        limit: z.number().int().min(1).max(100).default(50).describe("Max ads to return"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ parent_id, status, limit }) => {
      const params: Record<string, unknown> = { fields: DEFAULT_FIELDS.ad };
      if (status !== "ALL") params.effective_status = JSON.stringify([status]);

      const ads = await metaGetPaged<Ad>(`/${parent_id}/ads`, params, limit);

      if (!ads.length) {
        return { content: [{ type: "text", text: `No ads found (filter: ${status}).` }] };
      }

      const lines = ads.map((ad) => {
        return [
          `**${ad.name}** [${ad.status}]`,
          `  ID: ${ad.id}`,
          `  Ad Set: ${ad.adset_id}`,
          `  Effective Status: ${ad.effective_status || "N/A"}`,
          ad.creative?.title ? `  Title: ${ad.creative.title}` : "",
          ad.creative?.body ? `  Body: ${ad.creative.body.substring(0, 80)}${(ad.creative.body.length > 80) ? "..." : ""}` : "",
          ad.creative?.call_to_action_type ? `  CTA: ${ad.creative.call_to_action_type}` : "",
        ].filter(Boolean).join("\n");
      });

      const output = `# Ads (${ads.length})\n\n${lines.join("\n\n")}`;
      return {
        content: [{ type: "text", text: output }],
        structuredContent: { ads, total: ads.length },
      };
    }
  );

  // ─── Get Ad ──────────────────────────────────────────────────────────────────
  server.registerTool(
    "meta_get_ad",
    {
      title: "Get Ad Details",
      description: `Get full details of a single ad including its creative.

Args:
  - ad_id (string): The ad ID

Returns: Ad details with creative info (title, body, image URL, CTA, destination URL), status, effective status.`,
      inputSchema: {
        ad_id: z.string().describe("Ad ID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ ad_id }) => {
      const ad = await metaGet<Ad>(`/${ad_id}`, { fields: DEFAULT_FIELDS.ad });

      const output = [
        `# Ad: ${ad.name}`,
        `**ID:** ${ad.id}`,
        `**Status:** ${ad.status}`,
        `**Effective Status:** ${ad.effective_status || "N/A"}`,
        `**Ad Set ID:** ${ad.adset_id}`,
        `**Campaign ID:** ${ad.campaign_id}`,
        "",
        "**Creative:**",
        ad.creative?.id ? `  Creative ID: ${ad.creative.id}` : "",
        ad.creative?.title ? `  Title: ${ad.creative.title}` : "",
        ad.creative?.body ? `  Body: ${ad.creative.body}` : "",
        ad.creative?.image_url ? `  Image: ${ad.creative.image_url}` : "",
        ad.creative?.call_to_action_type ? `  CTA: ${ad.creative.call_to_action_type}` : "",
        ad.creative?.object_url ? `  URL: ${ad.creative.object_url}` : "",
        "",
        `**Created:** ${new Date(ad.created_time).toLocaleString("hu-HU")}`,
        `**Updated:** ${new Date(ad.updated_time).toLocaleString("hu-HU")}`,
      ].filter(Boolean).join("\n");

      return {
        content: [{ type: "text", text: output }],
        structuredContent: ad,
      };
    }
  );

  // ─── Update Ad Status ────────────────────────────────────────────────────────
  server.registerTool(
    "meta_update_ad",
    {
      title: "Update Ad",
      description: `Update an ad's name or status.

Args:
  - ad_id (string): Ad ID to update
  - status (string, optional): ACTIVE, PAUSED, or ARCHIVED
  - name (string, optional): New ad name

Returns: Confirmation.

Examples:
  - Use when: "Pause ad 12345"
  - Use when: "Activate the summer sale ad"`,
      inputSchema: {
        ad_id: z.string().describe("Ad ID to update"),
        status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional().describe("New ad status"),
        name: z.string().min(1).optional().describe("New ad name"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ ad_id, status, name }) => {
      const payload: Record<string, unknown> = {};
      if (status) payload.status = status;
      if (name) payload.name = name;

      if (Object.keys(payload).length === 0) {
        return { content: [{ type: "text", text: "No changes specified." }] };
      }

      await metaPost<{ success: boolean }>(`/${ad_id}`, payload);

      return {
        content: [{
          type: "text",
          text: `✅ Ad ${ad_id} updated!\n${status ? `  Status → ${status}\n` : ""}${name ? `  Name → ${name}` : ""}`,
        }],
        structuredContent: { ad_id, updated: payload },
      };
    }
  );
}
