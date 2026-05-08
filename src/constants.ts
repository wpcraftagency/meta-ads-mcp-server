export const META_API_VERSION = "v21.0";
export const META_API_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export const CHARACTER_LIMIT = 50000;

export const DEFAULT_FIELDS = {
  account: "id,name,account_id,account_status,currency,timezone_name,amount_spent,balance,spend_cap,business",
  campaign: "id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,created_time,updated_time,buying_type,bid_strategy,special_ad_categories",
  adset: "id,name,campaign_id,status,daily_budget,lifetime_budget,budget_remaining,start_time,end_time,targeting,optimization_goal,billing_event,bid_amount,bid_strategy,created_time,updated_time",
  ad: "id,name,adset_id,campaign_id,status,creative{id,name,title,body,image_url,call_to_action_type,object_url},created_time,updated_time,effective_status",
  insights: "impressions,reach,clicks,spend,cpc,cpm,ctr,frequency,unique_clicks,cost_per_unique_click,actions,conversions,cost_per_action_type,purchase_roas,outbound_clicks,website_purchase_roas",
};

export const ACCOUNT_STATUS_MAP: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
  201: "ANY_ACTIVE",
  202: "ANY_CLOSED",
};
