# 📊 Strategy → Feature Mapping → Impact

| Strategy                      | Feature Changes                                                           | What It Does (Logic)                        | Expected Impact                   |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------- |
| **offer_discount**            | `discount_percent ↑`, `marketing_channel = Email`, `user_type = 1`        | Gives incentive to user via email targeting | ↑ Conversion, ↓ Profit margin     |
| **retargeting_campaign**      | `pages_viewed ↑ (1.3x)`, `time_on_site ↑ (1.2x)`, `marketing_channel`     | Brings back users and increases engagement  | ↑↑ Engagement, ↑ Conversion       |
| **increase_ad_budget**        | `pages_viewed ↑`, `time_on_site ↑` (scaled by budget)                     | More ads → more traffic                     | ↑ Traffic, moderate ↑ Conversion  |
| **improve_checkout_ux**       | `pages_viewed ↑ (1.25x)`, `time_on_site ↑ (1.15x)`, `discount = 0`        | Smooth user journey, no friction            | ↑ Conversion, ↑ ROI               |
| **add_urgency_signals**       | `pages_viewed ↑`, `time_on_site ↓`, `discount applied`                    | Forces faster decisions (scarcity/urgency)  | Faster conversion, impulse buying |
| **reallocate_channel_budget** | `marketing_channel = Referral`, `pages_viewed ↑`, `time_on_site ↑`        | Shifts to better-performing channel         | ↑ Better quality traffic          |
| **improve_ad_creative**       | `pages_viewed ↑`, `engagement_score ↑`, `marketing_channel = Ads`         | Better ads attract more interaction         | ↑ CTR, ↑ Engagement               |
| **optimize_targeting**        | `user_type = 1`, `pages_viewed ↑`, `time_on_site ↑`, `engagement_score ↑` | Targets high-intent users                   | ↑↑ Conversion probability         |
| **user_strategy**             | Dynamic: `discount`, `budget`, `channel`, `segment features`              | Custom user-defined strategy                | Depends on inputs                 |

---

# 📊 Feature Definitions

| Feature               | What It Represents                    | Effect on Model                |
| --------------------- | ------------------------------------- | ------------------------------ |
| **pages_viewed**      | Number of pages user visits           | ↑ Interest, ↑ Conversion       |
| **time_on_site_sec**  | Time spent on website                 | ↑ Engagement                   |
| **discount_percent**  | Discount offered                      | ↑ Conversion, ↓ Revenue        |
| **marketing_channel** | Traffic source (Ads, Email, Referral) | Affects user quality           |
| **user_type**         | New vs Returning user                 | Returning → higher conversion  |
| **unit_price**        | Product price                         | Used for revenue calculation   |
| **engagement_score**  | Combined engagement metric            | Strong predictor of conversion |
| **discount_impact**   | `discount × price`                    | Measures revenue loss          |
| **price_per_page**    | `price / pages_viewed`                | Measures engagement efficiency |

---

# ⚡ Core Idea
