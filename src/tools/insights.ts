import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { metaGetPaged } from "../services/meta-client.js";
import { Insights, DatePreset, InsightsLevel, BreakdownType } from "../types.js";
import { DEFAULT_FIELDS } from "../constants.js";

function getActionValue(actions: { action_type: string; value: string }[] | undefined, type: string): number {
  if (!actions) return 0;
  const a = actions.find((x) => x.action_type === type);
  return a ? parseFloat(a.value) : 0;
}

function formatInsightsSummary(insights: Insights[], currency = "HUF"): string {
  if (!insights.length) return "No data found for the selected period.";

  const lines = insights.map((i) => {
    const spend = parseFloat(i.spend || "0");
    const impressions = parseInt(i.impressions || "0");
    const clicks = parseInt(i.clicks || "0");
    const ctr = i.ctr ? `${parseFloat(i.ctr).toFixed(2)}%` : "N/A";
    const cpc = i.cpc ? `${parseFloat(i.cpc).toFixed(2)} ${currency}` : "N/A";
    const cpm = i.cpm ? `${parseFloat(i.cpm).toFixed(2)} ${currency}` : "N/A";
    const reach = i.reach ? parseInt(i.reach).toLocaleString("hu-HU") : "N/A";
    const purchases = getActionValue(i.actions, "purchase") || getActionValue(i.conversions, "purchase");
    const leads = getActionValue(i.actions, "lead");
    const roas = i.purchase_roas?.[0]?.value ? parseFloat(i.purchase_roas[0].value).toFixed(2) : "N/A";

    const nameLabel =
      i.ad_name ? `Ad: ${i.ad_name}` :
      i.adset_name ? `Ad Set: ${i.adset_name}` :
      i.campaign_name ? `Campaign: ${i.campaign_name}` :
      i.account_name ? `Account: ${i.account_name}` : "";

    return [
      nameLabel ? `**${nameLabel}**` : `**${i.date_start} – ${i.date_stop}**`,
      `  Spend: ${spend.toLocaleString("hu-HU", { minimumFractionDigits: 2 })} ${currency}`,
      `  Impressions: ${impressions.toLocaleString("hu-HU")} | Reach: ${reach}`,
      `  Clicks: ${clicks.toLocaleString("hu-HU")} | CTR: ${ctr}`,
      `  CPC: ${cpc} | CPM: ${cpm}`,
      purchases > 0 ? `  Purchases: ${purchases} | ROAS: ${roas}` : "",
      leads > 0 ? `  Leads: ${leads}` : "",
    ].filter(Boolean).join("\n");
  });

  return lines.join("\n\n");
}

export function registerInsightsTools(server: McpServer): void {
  // ─── Get Insights ────────────────────────────────────────────────────────────
  server.registerTool(
    "meta_get_insights",
    {
      title: "Get Performance Insights",
      description: `Get performance metrics for campaigns, ad sets, or ads.

Args:
  - object_id (string): Account ID (act_XXXXXXXXXX), campaign ID, ad set ID, or ad ID
  - level (string): Data level — account, campaign, adset, or ad (default: campaign)
  - date_preset (string, optional): Predefined date range (default: last_30d)
    Options: today, yesterday, last_3d, last_7d, last_14d, last_28d, last_30d, last_90d, this_month, last_month, this_quarter, last_year, this_year
  - date_from (string, optional): Custom start date in YYYY-MM-DD format (overrides date_preset)
  - date_to (string, optional): Custom end date in YYYY-MM-DD format (overrides date_preset)
  - limit (number, optional): Max results, 1-100 (default: 25)

Returns: Metrics including spend, impressions, reach, clicks, CTR, CPC, CPM, purchases, leads, ROAS.

Examples:
  - Use when: "How did my campaigns perform last month?"
  - Use when: "Show me ROAS for all ad sets last 7 days"
  - Use when: "What's the CPC for campaign X this month?"`,
      inputSchema: {
        object_id: z.string().describe("Account ID (act_XXXXXXXXXX), campaign ID, ad set ID, or ad ID"),
        level: z.enum(["account", "campaign", "adset", "ad"]).default("campaign").describe("Aggregation level"),
        date_preset: z.enum([
          "today", "yesterday", "last_3d", "last_7d", "last_14d", "last_28d",
          "last_30d", "last_90d", "this_month", "last_month", "this_quarter",
          "last_year", "this_year",
        ] as const).default("last_30d").optional().describe("Predefined date range"),
        date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Custom start date: YYYY-MM-DD"),
        date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Custom end date: YYYY-MM-DD"),
        limit: z.number().int().min(1).max(100).default(25).describe("Max results to return"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ object_id, level, date_preset, date_from, date_to, limit }) => {
      const fields = [
        DEFAULT_FIELDS.insights,
        level === "campaign" ? "campaign_id,campaign_name" : "",
        level === "adset" ? "campaign_id,campaign_name,adset_id,adset_name" : "",
        level === "ad" ? "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name" : "",
        level === "account" ? "account_id,account_name" : "",
      ].filter(Boolean).join(",");

      const params: Record<string, unknown> = {
        fields,
        level,
        limit,
      };

      if (date_from && date_to) {
        params.time_range = JSON.stringify({ since: date_from, until: date_to });
      } else {
        params.date_preset = date_preset || "last_30d";
      }

      const insights = await metaGetPaged<Insights>(`/${object_id}/insights`, params, limit);
      const summary = formatInsightsSummary(insights);

      const header = date_from && date_to
        ? `**Period:** ${date_from} – ${date_to}`
        : `**Period:** ${date_preset || "last_30d"}`;

      const output = `# Meta Ads Insights — ${level.toUpperCase()} level\n${header}\n\n${summary}`;

      return {
        content: [{ type: "text", text: output }],
        structuredContent: { insights, level, total: insights.length },
      };
    }
  );

  // ─── Get Insights with Breakdown ─────────────────────────────────────────────
  server.registerTool(
    "meta_get_insights_breakdown",
    {
      title: "Get Insights with Breakdown",
      description: `Get performance insights broken down by age, gender, platform, or country.

Args:
  - object_id (string): Account ID (act_XXXXXXXXXX), campaign ID, or ad set ID
  - breakdown (string): How to break down the data:
    - "age" — by age group (18-24, 25-34, etc.)
    - "gender" — male vs female
    - "age,gender" — combined age and gender
    - "publisher_platform" — Facebook vs Instagram vs Audience Network
    - "platform_position" — feed, stories, reels, etc.
    - "device_platform" — mobile vs desktop
    - "country" — by country
    - "region" — by region/city
  - date_preset (string, optional): Date range (default: last_30d)
  - level (string, optional): account, campaign, or adset (default: account)
  - limit (number, optional): Max results, 1-200 (default: 100)

Returns: Metrics broken down by the selected dimension.

Examples:
  - Use when: "Break down campaign performance by age and gender"
  - Use when: "Which platform (Facebook vs Instagram) is performing better?"
  - Use when: "Show results by device type"`,
      inputSchema: {
        object_id: z.string().describe("Account ID (act_XXXXXXXXXX), campaign ID, or ad set ID"),
        breakdown: z.enum([
          "age", "gender", "age,gender",
          "publisher_platform", "platform_position",
          "device_platform", "country", "region",
        ] as const).describe("Breakdown dimension"),
        date_preset: z.enum([
          "today", "yesterday", "last_3d", "last_7d", "last_14d", "last_28d",
          "last_30d", "last_90d", "this_month", "last_month", "this_quarter",
          "last_year", "this_year",
        ] as const).default("last_30d").describe("Date range preset"),
        level: z.enum(["account", "campaign", "adset"]).default("account").describe("Aggregation level"),
        limit: z.number().int().min(1).max(200).default(100).describe("Max results"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ object_id, breakdown, date_preset, level, limit }) => {
      const params: Record<string, unknown> = {
        fields: "impressions,reach,clicks,spend,cpc,ctr,actions,purchase_roas," + breakdown,
        level,
        breakdowns: breakdown,
        date_preset,
        limit,
      };

      const insights = await metaGetPaged<Record<string, unknown>>(`/${object_id}/insights`, params, limit);

      if (!insights.length) {
        return { content: [{ type: "text", text: "No breakdown data found." }] };
      }

      const lines = insights.map((row) => {
        const breakdownLabel = breakdown.split(",").map((b) => `${b}: ${row[b] || "N/A"}`).join(" | ");
        const spend = parseFloat((row.spend as string) || "0");
        const impressions = parseInt((row.impressions as string) || "0");
        const clicks = parseInt((row.clicks as string) || "0");
        const ctr = row.ctr ? `${parseFloat(row.ctr as string).toFixed(2)}%` : "N/A";
        return `  ${breakdownLabel}\n    Spend: ${spend.toFixed(2)} | Impressions: ${impressions.toLocaleString("hu-HU")} | Clicks: ${clicks} | CTR: ${ctr}`;
      });

      const output = `# Insights Breakdown: ${breakdown.toUpperCase()}\n**Period:** ${date_preset} | **Level:** ${level}\n\n${lines.join("\n")}`;

      return {
        content: [{ type: "text", text: output }],
        structuredContent: { breakdown, insights, total: insights.length },
      };
    }
  );
}
