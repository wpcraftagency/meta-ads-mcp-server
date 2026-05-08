import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { metaGetPaged, metaPost } from "../services/meta-client.js";
import { AdSet, Insights, OptimizationResult } from "../types.js";
import { DEFAULT_FIELDS } from "../constants.js";

function getActionValue(actions: { action_type: string; value: string }[] | undefined, type: string): number {
  if (!actions) return 0;
  const a = actions.find((x) => x.action_type === type);
  return a ? parseFloat(a.value) : 0;
}

export function registerOptimizationTools(server: McpServer): void {
  // ─── Pause Underperformers ───────────────────────────────────────────────────
  server.registerTool(
    "meta_pause_underperformers",
    {
      title: "Pause Underperforming Ad Sets",
      description: `Automatically pause ad sets that exceed a cost threshold or fall below a performance threshold.

Analyzes active ad sets in a campaign or account, checks their last N days performance,
and pauses those that don't meet your criteria.

Args:
  - parent_id (string): Campaign ID or ad account ID (act_XXXXXXXXXX)
  - metric (string): Metric to evaluate:
    - "cpc" — cost per click (pause if ABOVE threshold)
    - "cpm" — cost per 1000 impressions (pause if ABOVE threshold)
    - "ctr" — click-through rate in % (pause if BELOW threshold)
    - "roas" — return on ad spend (pause if BELOW threshold)
    - "cpa" — cost per purchase/conversion (pause if ABOVE threshold)
  - threshold (number): The threshold value. Direction depends on metric.
  - days (number, optional): How many days to evaluate (default: 7)
  - dry_run (boolean, optional): If true, only report what would be paused without actually doing it (default: true)
  - min_spend (number, optional): Minimum spend required before evaluating (default: 1000 in account currency)

Returns: List of ad sets paused (or that would be paused in dry run mode), with their metric values.

Examples:
  - Use when: "Pause ad sets with CPC above 500 HUF"
  - Use when: "Pause underperforming ad sets where ROAS is below 2.0"
  - Use when: "Which ad sets should I pause based on CTR below 1%?"`,
      inputSchema: {
        parent_id: z.string().describe("Campaign ID or ad account ID (act_XXXXXXXXXX)"),
        metric: z.enum(["cpc", "cpm", "ctr", "roas", "cpa"]).describe("Performance metric to evaluate"),
        threshold: z.number().positive().describe("Threshold value (CPC/CPM/CPA: max allowed; CTR/ROAS: min required)"),
        days: z.number().int().min(1).max(90).default(7).describe("Days to evaluate (default: 7)"),
        dry_run: z.boolean().default(true).describe("If true, only simulate — don't actually pause (default: true for safety)"),
        min_spend: z.number().nonnegative().default(1000).describe("Min spend in account currency before evaluating (default: 1000)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ parent_id, metric, threshold, days, dry_run, min_spend }) => {
      // 1. Get active ad sets
      const adsets = await metaGetPaged<AdSet>(`/${parent_id}/adsets`, {
        fields: DEFAULT_FIELDS.adset,
        effective_status: JSON.stringify(["ACTIVE"]),
      });

      if (!adsets.length) {
        return { content: [{ type: "text", text: "No active ad sets found." }] };
      }

      // 2. Get insights for each ad set
      const datePreset = days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : days <= 28 ? "last_28d" : "last_90d";

      const insights = await metaGetPaged<Insights>(`/${parent_id}/insights`, {
        fields: "adset_id,adset_name,spend,cpc,cpm,ctr,actions,purchase_roas",
        level: "adset",
        date_preset: datePreset,
        limit: 100,
      });

      const insightsMap = new Map<string, Insights>();
      insights.forEach((i) => { if (i.adset_id) insightsMap.set(i.adset_id, i); });

      // 3. Evaluate each ad set
      const results: OptimizationResult[] = [];

      for (const adset of adsets) {
        const data = insightsMap.get(adset.id);

        if (!data) {
          results.push({ action: "skipped", id: adset.id, name: adset.name, reason: "No data available yet" });
          continue;
        }

        const spend = parseFloat(data.spend || "0");
        if (spend < min_spend / 100) {
          results.push({ action: "skipped", id: adset.id, name: adset.name, reason: `Insufficient spend (${spend.toFixed(2)} < ${min_spend / 100} min)` });
          continue;
        }

        let metricValue = 0;
        let shouldPause = false;

        switch (metric) {
          case "cpc":
            metricValue = parseFloat(data.cpc || "0");
            shouldPause = metricValue > threshold;
            break;
          case "cpm":
            metricValue = parseFloat(data.cpm || "0");
            shouldPause = metricValue > threshold;
            break;
          case "ctr":
            metricValue = parseFloat(data.ctr || "0");
            shouldPause = metricValue < threshold;
            break;
          case "roas":
            metricValue = data.purchase_roas?.[0] ? parseFloat(data.purchase_roas[0].value) : 0;
            shouldPause = metricValue < threshold;
            break;
          case "cpa":
            metricValue = getActionValue(data.cost_per_action_type, "purchase") || getActionValue(data.cost_per_action_type, "lead");
            shouldPause = metricValue > 0 && metricValue > threshold;
            break;
        }

        if (shouldPause) {
          if (!dry_run) {
            await metaPost(`/${adset.id}`, { status: "PAUSED" });
          }
          results.push({
            action: "paused",
            id: adset.id,
            name: adset.name,
            reason: `${metric.toUpperCase()} = ${metricValue.toFixed(2)} (threshold: ${threshold})`,
            metric_value: metricValue,
            threshold,
          });
        } else {
          results.push({
            action: "skipped",
            id: adset.id,
            name: adset.name,
            reason: `${metric.toUpperCase()} = ${metricValue.toFixed(2)} — within threshold`,
            metric_value: metricValue,
          });
        }
      }

      const paused = results.filter((r) => r.action === "paused");
      const skipped = results.filter((r) => r.action === "skipped");

      const pausedLines = paused.map((r) => `  ⏸ **${r.name}** (${r.id})\n    ${r.reason}`).join("\n");
      const skippedLines = skipped.map((r) => `  ✓ ${r.name}: ${r.reason}`).join("\n");

      const modeLabel = dry_run ? "🧪 DRY RUN — No actual changes made" : "✅ Changes applied";

      const output = [
        `# Optimization: Pause Underperformers`,
        `${modeLabel}`,
        `**Metric:** ${metric.toUpperCase()} | **Threshold:** ${threshold} | **Period:** last ${days} days`,
        `**Min spend:** ${min_spend} before evaluating`,
        "",
        paused.length > 0 ? `## Would Pause / Paused (${paused.length})\n${pausedLines}` : "## No ad sets to pause",
        "",
        skipped.length > 0 ? `## Kept Active / Skipped (${skipped.length})\n${skippedLines}` : "",
      ].filter(Boolean).join("\n");

      return {
        content: [{ type: "text", text: output }],
        structuredContent: { dry_run, paused, skipped, total_evaluated: results.length },
      };
    }
  );

  // ─── Scale Winners ───────────────────────────────────────────────────────────
  server.registerTool(
    "meta_scale_winners",
    {
      title: "Scale Winning Ad Sets",
      description: `Automatically increase budget on well-performing ad sets that exceed a performance threshold.

Analyzes active ad sets and increases their daily budget by a given percentage for those that meet the criteria.

Args:
  - parent_id (string): Campaign ID or ad account ID (act_XXXXXXXXXX)
  - metric (string): Metric to evaluate:
    - "roas" — return on ad spend (scale if ABOVE threshold)
    - "ctr" — click-through rate % (scale if ABOVE threshold)
    - "cpc" — cost per click (scale if BELOW threshold — cheaper = better)
  - threshold (number): The minimum/maximum threshold to qualify for scaling
  - scale_pct (number): Percentage to increase budget (e.g. 20 = +20%), max 100%
  - days (number, optional): Days to evaluate (default: 7)
  - dry_run (boolean, optional): Simulate only, don't apply changes (default: true)
  - max_budget (number, optional): Cap on daily budget in account currency (won't scale above this)
  - min_spend (number, optional): Min spend required before evaluating (default: 1000)

Returns: List of ad sets scaled (or that would be scaled) with old and new budgets.

Examples:
  - Use when: "Scale up ad sets with ROAS above 3.0 by 20%"
  - Use when: "Which ad sets should I increase budget on?"`,
      inputSchema: {
        parent_id: z.string().describe("Campaign ID or ad account ID (act_XXXXXXXXXX)"),
        metric: z.enum(["roas", "ctr", "cpc"]).describe("Metric to evaluate for scaling"),
        threshold: z.number().positive().describe("Threshold: for ROAS/CTR it's the minimum; for CPC it's the maximum"),
        scale_pct: z.number().min(1).max(100).describe("Budget increase percentage (e.g. 20 = +20%)"),
        days: z.number().int().min(1).max(90).default(7).describe("Days to evaluate (default: 7)"),
        dry_run: z.boolean().default(true).describe("If true, only simulate (default: true)"),
        max_budget: z.number().positive().optional().describe("Maximum daily budget cap in account currency"),
        min_spend: z.number().nonnegative().default(1000).describe("Min spend before evaluating"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ parent_id, metric, threshold, scale_pct, days, dry_run, max_budget, min_spend }) => {
      const adsets = await metaGetPaged<AdSet>(`/${parent_id}/adsets`, {
        fields: DEFAULT_FIELDS.adset,
        effective_status: JSON.stringify(["ACTIVE"]),
      });

      if (!adsets.length) {
        return { content: [{ type: "text", text: "No active ad sets found." }] };
      }

      const datePreset = days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : days <= 28 ? "last_28d" : "last_90d";

      const insights = await metaGetPaged<Insights>(`/${parent_id}/insights`, {
        fields: "adset_id,adset_name,spend,cpc,ctr,purchase_roas",
        level: "adset",
        date_preset: datePreset,
        limit: 100,
      });

      const insightsMap = new Map<string, Insights>();
      insights.forEach((i) => { if (i.adset_id) insightsMap.set(i.adset_id, i); });

      const results: OptimizationResult[] = [];

      for (const adset of adsets) {
        if (!adset.daily_budget) {
          results.push({ action: "skipped", id: adset.id, name: adset.name, reason: "No daily budget set (lifetime budget not scalable this way)" });
          continue;
        }

        const data = insightsMap.get(adset.id);
        if (!data) {
          results.push({ action: "skipped", id: adset.id, name: adset.name, reason: "No data available yet" });
          continue;
        }

        const spend = parseFloat(data.spend || "0");
        if (spend < min_spend / 100) {
          results.push({ action: "skipped", id: adset.id, name: adset.name, reason: `Insufficient spend (${spend.toFixed(2)})` });
          continue;
        }

        let metricValue = 0;
        let qualifies = false;

        switch (metric) {
          case "roas":
            metricValue = data.purchase_roas?.[0] ? parseFloat(data.purchase_roas[0].value) : 0;
            qualifies = metricValue >= threshold;
            break;
          case "ctr":
            metricValue = parseFloat(data.ctr || "0");
            qualifies = metricValue >= threshold;
            break;
          case "cpc":
            metricValue = parseFloat(data.cpc || "0");
            qualifies = metricValue > 0 && metricValue <= threshold;
            break;
        }

        if (qualifies) {
          const currentBudget = parseInt(adset.daily_budget) / 100;
          const newBudget = currentBudget * (1 + scale_pct / 100);
          const cappedBudget = max_budget ? Math.min(newBudget, max_budget) : newBudget;

          if (cappedBudget <= currentBudget) {
            results.push({ action: "skipped", id: adset.id, name: adset.name, reason: "Already at max budget cap" });
            continue;
          }

          if (!dry_run) {
            await metaPost(`/${adset.id}`, { daily_budget: Math.round(cappedBudget * 100) });
          }

          results.push({
            action: "scaled",
            id: adset.id,
            name: adset.name,
            reason: `${metric.toUpperCase()} = ${metricValue.toFixed(2)} (threshold: ${threshold})`,
            metric_value: metricValue,
            threshold,
            old_budget: currentBudget,
            new_budget: cappedBudget,
          });
        } else {
          results.push({
            action: "skipped",
            id: adset.id,
            name: adset.name,
            reason: `${metric.toUpperCase()} = ${metricValue.toFixed(2)} — doesn't meet threshold`,
            metric_value: metricValue,
          });
        }
      }

      const scaled = results.filter((r) => r.action === "scaled");
      const skipped = results.filter((r) => r.action === "skipped");

      const scaledLines = scaled.map((r) =>
        `  📈 **${r.name}**\n    ${r.reason}\n    Budget: ${r.old_budget?.toLocaleString("hu-HU")} → ${r.new_budget?.toLocaleString("hu-HU")} (+${scale_pct}%)`
      ).join("\n");

      const modeLabel = dry_run ? "🧪 DRY RUN — No actual changes made" : "✅ Budgets increased";

      const output = [
        `# Optimization: Scale Winners`,
        modeLabel,
        `**Metric:** ${metric.toUpperCase()} | **Threshold:** ${threshold} | **Scale:** +${scale_pct}% | **Period:** last ${days} days`,
        max_budget ? `**Budget cap:** ${max_budget.toLocaleString("hu-HU")}` : "",
        "",
        scaled.length > 0 ? `## Scaled (${scaled.length})\n${scaledLines}` : "## No qualifying ad sets found",
        "",
        `## Skipped (${skipped.length})`,
        ...skipped.map((r) => `  - ${r.name}: ${r.reason}`),
      ].filter(Boolean).join("\n");

      return {
        content: [{ type: "text", text: output }],
        structuredContent: { dry_run, scaled, skipped, total_evaluated: results.length },
      };
    }
  );
}
