# meta-ads-mcp-server

MCP server for Meta Ads (Facebook/Instagram) — campaign management, insights & optimization.

Built for [Azuryth Digital](https://azuryth.io) by György.

## Tools

### Accounts
| Tool | Description |
|------|-------------|
| `meta_get_ad_accounts` | List all accessible ad accounts |

### Campaigns
| Tool | Description |
|------|-------------|
| `meta_list_campaigns` | List campaigns with status filter |
| `meta_get_campaign` | Get campaign details |
| `meta_create_campaign` | Create a new campaign |
| `meta_update_campaign` | Update name/status/budget |

### Ad Sets
| Tool | Description |
|------|-------------|
| `meta_list_adsets` | List ad sets in a campaign/account |
| `meta_get_adset` | Get full ad set details + targeting |
| `meta_update_adset` | Update status/budget/bid |

### Ads
| Tool | Description |
|------|-------------|
| `meta_list_ads` | List ads in an ad set/campaign/account |
| `meta_get_ad` | Get ad details + creative |
| `meta_update_ad` | Update status/name |

### Insights
| Tool | Description |
|------|-------------|
| `meta_get_insights` | Performance metrics (spend, ROAS, CTR, CPC, etc.) |
| `meta_get_insights_breakdown` | Metrics broken down by age/gender/platform/country |

### Optimization
| Tool | Description |
|------|-------------|
| `meta_pause_underperformers` | Auto-pause ad sets exceeding cost thresholds |
| `meta_scale_winners` | Auto-increase budget on top performers |

## Setup

### 1. Get Meta Access Token

1. Go to [Meta Business Manager](https://business.facebook.com)
2. Create a Meta App at [developers.facebook.com](https://developers.facebook.com)
3. Add **Marketing API** product
4. Generate a **System User Token** with permissions:
   - `ads_read`
   - `ads_management`
   - `business_management`
5. Assign the token to your ad accounts

Or for testing, use [Graph API Explorer](https://developers.facebook.com/tools/explorer/) with `ads_read` + `ads_management` permissions.

### 2. Install & Build

```bash
npm install
npm run build
```

### 3. Run

**stdio (for Claude Desktop / local MCP clients):**
```bash
META_ACCESS_TOKEN=your_token node dist/index.js
```

**HTTP (for remote/cloud deployments):**
```bash
META_ACCESS_TOKEN=your_token TRANSPORT=http PORT=3000 node dist/index.js
```

## Claude Desktop Config

```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "node",
      "args": ["/path/to/meta-ads-mcp/dist/index.js"],
      "env": {
        "META_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `META_ACCESS_TOKEN` | ✅ Yes | Meta User or System User access token |
| `TRANSPORT` | No | `stdio` (default) or `http` |
| `PORT` | No | HTTP port (default: 3000) |

## API Version

Uses **Marketing API v21.0** (stable as of 2025).

> ⚠️ Meta deprecated legacy Advantage Shopping/App Campaign APIs in v25.0 (Q1 2026). This server uses the v21.0 stable endpoints compatible with standard campaign objectives.

## Notes

- Budgets are always specified in the **account's currency** (e.g. HUF, EUR), NOT in cents
- Internally the API stores budgets in cents — this server handles the conversion automatically
- All optimization tools default to `dry_run: true` for safety — set to `false` to apply changes
- `reach` breakdown data is limited to the past 13 months by Meta (as of June 2025)
