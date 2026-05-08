// ─── Meta API Types ───────────────────────────────────────────────────────────

export interface MetaApiError {
  message: string;
  type: string;
  code: number;
  fbtrace_id?: string;
}

export interface MetaApiResponse<T> {
  data: T;
  paging?: {
    cursors?: { before: string; after: string };
    next?: string;
    previous?: string;
  };
  error?: MetaApiError;
}

// Index signature base for structuredContent compatibility
export interface MetaObject {
  [key: string]: unknown;
}

// ─── Ad Account ───────────────────────────────────────────────────────────────

export interface AdAccount extends MetaObject {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  amount_spent: string;
  balance: string;
  spend_cap?: string;
  business?: { id: string; name: string };
}

// ─── Campaign ─────────────────────────────────────────────────────────────────

export type CampaignStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
export type CampaignObjective =
  | "OUTCOME_AWARENESS"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS"
  | "OUTCOME_APP_PROMOTION"
  | "OUTCOME_SALES";

export interface Campaign extends MetaObject {
  id: string;
  name: string;
  status: CampaignStatus;
  objective: CampaignObjective;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  start_time?: string;
  stop_time?: string;
  created_time: string;
  updated_time: string;
  buying_type?: string;
  bid_strategy?: string;
  special_ad_categories?: string[];
}

// ─── Ad Set ───────────────────────────────────────────────────────────────────

export type AdSetStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";

export interface Targeting {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: {
    countries?: string[];
    cities?: { key: string; name: string; country: string }[];
    regions?: { key: string; name: string; country: string }[];
  };
  interests?: { id: string; name: string }[];
  custom_audiences?: { id: string; name: string }[];
  excluded_custom_audiences?: { id: string; name: string }[];
}

export interface AdSet extends MetaObject {
  id: string;
  name: string;
  campaign_id: string;
  status: AdSetStatus;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  start_time?: string;
  end_time?: string;
  targeting?: Targeting;
  optimization_goal?: string;
  billing_event?: string;
  bid_amount?: number;
  bid_strategy?: string;
  created_time: string;
  updated_time: string;
}

// ─── Ad ───────────────────────────────────────────────────────────────────────

export type AdStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED" | "DISAPPROVED";

export interface AdCreative {
  id: string;
  name?: string;
  title?: string;
  body?: string;
  image_url?: string;
  video_id?: string;
  call_to_action_type?: string;
  object_url?: string;
}

export interface Ad extends MetaObject {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: AdStatus;
  creative?: AdCreative;
  created_time: string;
  updated_time: string;
  effective_status?: string;
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export type DatePreset =
  | "today"
  | "yesterday"
  | "last_3d"
  | "last_7d"
  | "last_14d"
  | "last_28d"
  | "last_30d"
  | "last_90d"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_year"
  | "this_year";

export type InsightsLevel = "account" | "campaign" | "adset" | "ad";

export type BreakdownType = "age" | "gender" | "age,gender" | "publisher_platform" | "platform_position" | "device_platform" | "country" | "region";

export interface InsightsAction {
  action_type: string;
  value: string;
}

export interface Insights extends MetaObject {
  account_id?: string;
  account_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start: string;
  date_stop: string;
  impressions: string;
  reach?: string;
  clicks: string;
  spend: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  frequency?: string;
  unique_clicks?: string;
  cost_per_unique_click?: string;
  actions?: InsightsAction[];
  conversions?: InsightsAction[];
  cost_per_action_type?: InsightsAction[];
  purchase_roas?: InsightsAction[];
  outbound_clicks?: InsightsAction[];
  website_purchase_roas?: InsightsAction[];
}

// ─── Optimization ─────────────────────────────────────────────────────────────

export interface OptimizationResult {
  action: "paused" | "scaled" | "skipped";
  id: string;
  name: string;
  reason: string;
  metric_value?: number;
  threshold?: number;
  old_budget?: number;
  new_budget?: number;
}
