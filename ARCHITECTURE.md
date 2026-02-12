# Pantry Chef Architecture

## Overview
Pantry Chef is a React Native (Expo) meal planning app with AI-powered recipe generation and Walmart shopping integration. Built for a hackathon.

## Tech Stack

### Frontend
- **React Native**: 0.81.5
- **Expo**: 54.0.23
- **Expo Router**: 6.0.14 (file-based routing)
- **TypeScript**: Latest
- **Metro Bundler**: React Native's bundler (requires .tsx for React components, needs index.ts for directory imports)

### Backend
- **Node.js/Express**: 5.0.1
- **TypeScript**: 5.7.2
- **Prisma ORM**: 7.2.0
- **PostgreSQL**: with pgvector extension for embeddings
- **Docker**: Containerized backend (rebuild/restart: `docker-compose build backend && docker-compose up -d backend`)

### AI & External Services
- **OpenAI**: GPT-5-nano-2025-08-07 for recipe generation
- **Walmart Open API**: Product search, pricing, affiliate links
- **JWT**: Authentication with Bearer tokens stored in AsyncStorage
- **RevenueCat**: Subscription management, credit purchases, consumables (iOS/Android)

## Core Architecture Pattern: Unified Cart System

**Key Principle**: Shopping cart and shopping list are THE SAME THING. All cart operations (recipe selection, meal plan shopping lists) converge to the unified `/shopping-cart` route with persistent Walmart integration.

### Cart Generation Flow
```
1. User selects recipes (/select-recipes) OR generates from meal plan
2. POST /api/cart/generate (auth required) OR POST /api/meal-plans/:id/shopping-list
3. Both endpoints create a persistent ShoppingList DB record (isActive=true, deactivates previous)
4. Auto-merges ingredients (≥95% similarity)
5. Returns: {shoppingListId, ingredients, potentialMerges (70-95% similarity), recipes}
6. If potentialMerges exist → Merge Review (/merge-review) with shoppingListId preserved
7. Unified Shopping Cart (/shopping-cart) with Walmart pricing
   - Loads from URL params (navigation chain) or GET /api/cart/active (direct access)
8. Full product selection with 3-tab modal (Similar/Quality/Replacements)
9. Cart actions: Clear Cart, Add Recipes, Add from Meal Plans
```

### Key Backend Endpoints

#### Cart Routes (`/api/cart/*`)
- `POST /generate` - Generate cart from recipes with auto-merge (auth required, creates ShoppingList DB record)
- `GET /active` - Get user's currently active cart from DB (auth required)
- `POST /enrich-walmart` - Add Walmart product data
- `POST /apply-merges` - Apply user merge decisions
- `POST /checkout` - Create Walmart consolidated cart

#### Meal Planning Routes (`/api/meal-plans/*`)
- `POST /:id/shopping-list` - Generate shopping list from meal plan (uses cart flow internally)
- `GET /shopping-lists/:id` - Get shopping list
- `PATCH /shopping-lists/:id/items/:itemId` - Mark item purchased
- `POST /shopping-lists/:id/merge-decisions` - Save merge decisions to DB

#### Walmart Routes (`/api/walmart/*`)
- `POST /recipe-pricing` - Batch pricing for ingredients
- `GET /similar/:ingredientName` - Similar products search
- `POST /substitutes` - Get ingredient substitutes
- `POST /quality-tiers` - Get quality tier options
- `POST /checkout` - Record Walmart checkout, grant declining credits (15→10→5), mark recipe usages eligible for payout
- `GET /checkout/info` - Get next checkout credit reward amount

#### Credit Routes (`/api/credits/*`)
- `GET /balance` - Get user's current credit balance
- `GET /status` - Comprehensive status (balance, Pro status, Walmart checkouts, recent transactions)
- `GET /transactions` - Paginated transaction history
- `GET /creator/earnings` - Creator earnings summary (free vs paid user breakdown)
- `POST /purchase` - Record credit purchase from RevenueCat consumable

#### Recipe Routes (`/api/recipes/*`)
- `GET /` - Get all recipes with pagination (personal or all public recipes)
- `GET /:id` - Get recipe by ID with ingredients
- `POST /` - Create new recipe
- `PUT /:id` - Update recipe
- `DELETE /:id` - Delete recipe
- `POST /:id/use` - Record recipe usage (charges 2 credits for community recipes)
- `POST /import-url` - Import recipe from external URL (charges 1 credit)

#### Webhook Routes (`/api/webhooks/*`)
- `POST /revenuecat` - Handle subscription events (purchases, renewals, cancellations, expirations)

## File Structure

### Frontend Key Files
```
frontend/
├── app/
│   ├── shopping-cart.tsx           # Unified cart with Walmart pricing (main cart view)
│   ├── select-recipes.tsx          # Recipe selection for cart
│   ├── merge-review.tsx            # Ingredient merge review
│   ├── meal-planner.tsx            # AI meal plan generation (869 lines)
│   ├── settings/
│   │   └── meal-preferences.tsx    # User dietary preferences (432 lines)
│   └── meal-plan/
│       └── [id].tsx                # Meal plan detail with "Generate Shopping List"
├── contexts/
│   ├── AuthContext.tsx             # User authentication state
│   ├── SubscriptionContext.tsx     # RevenueCat subscription management
│   └── CreditContext.tsx           # Credit balance state management
├── services/
│   └── revenueCat.ts               # RevenueCat SDK wrapper
├── src/
│   ├── components/
│   │   └── WalmartProductsModal.tsx # 3-tab modal (Similar/Quality/Replacements)
│   ├── hooks/
│   │   ├── index.ts                # Export barrel for hooks
│   │   └── useWalmartProducts.tsx  # Walmart product search hook
│   └── api/
│       ├── mealPlanning.ts         # API client for meal planning
│       └── credits.ts              # Credit API client (balance, status, transactions)
└── utils/
    ├── cartGeneration.ts           # Shared cart generation logic
    └── creditErrors.ts             # Credit error handling (402 insufficient credits)
```

### Backend Key Files
```
backend/src/
├── routes/
│   ├── cart.ts                     # Cart generation routes
│   ├── mealPlanning.ts             # Meal plan & shopping list routes (charges 1 credit)
│   ├── walmart.ts                  # Walmart API integration routes (checkout grants credits)
│   ├── credits.ts                  # Credit balance, transactions, earnings routes
│   ├── recipes.ts                  # Recipe CRUD + usage tracking (charges 2 credits for community)
│   └── webhooks/
│       └── revenuecat.ts           # Subscription & consumable purchase webhooks
├── services/
│   ├── recipeAgent.ts              # AI recipe generation (line 414: protein diversity)
│   ├── ingredientSimilarity.ts     # Auto-merge detection
│   ├── walmart.ts                  # Walmart API client
│   ├── unitConversionService.ts    # Package quantity calculations
│   ├── credit.ts                   # Credit granting, spending, recipe usage, creator payouts
│   └── urlRecipeImporter.ts        # URL recipe import with structured data extraction & AI fallback
└── middleware/
    ├── auth.ts                     # JWT validation (NO dev bypass!)
    └── creditCheck.ts              # Credit balance validation (requireCredits, attachCreditBalance)
```

## Important Patterns & Rules

### 1. Authentication
- **NO hardcoded dev users** - Always validate JWT tokens
- User rejected dev bypass: "Since we have the db, just have the test use the server correctly"

### 2. Recipe Generation (recipeAgent.ts:414)
- **Must vary protein sources** - Not just pescatarian!
- Dynamic prompt: "Protein sources (vary between chicken, beef, pork, fish, seafood, tofu, beans, eggs, etc. - respect any dietary restrictions mentioned above)"

### 3. API Route Structure
- Shopping list routes are at `/api/meal-plans/shopping-lists/*` NOT `/api/shopping-lists/*`
- Always use full route paths in frontend API calls

### 4. Property Access
Backend returns nested structures:
```typescript
// CORRECT
item.ingredient.name
item.totalAmount
item.ingredient.category

// WRONG
item.ingredientName
item.amount
item.category
```

### 5. Metro Bundler Requirements
- React components with hooks MUST use `.tsx` extension
- Directory imports require `index.ts` export barrel
- Example: `import { useWalmartProducts } from '../../src/hooks'` resolves to `hooks/index.ts` → `useWalmartProducts.tsx`

### 6. Complete Implementations
- User expectation: **Full features, never truncated or simplified**
- User feedback: "dude stop doing this, I asked for the full feature, why are you truncating?"
- Always implement complete components with all tabs, features, and functionality

### 7. AI Security Constraints
- **NEVER read .env files** - AI assistants should not access environment variables or secrets
- Protect sensitive configuration from AI introspection

## Data Flow Example

### Meal Planning → Shopping Cart Flow
```
1. User creates meal plan → POST /api/meal-plans (generates plan with recipes)
2. Generate shopping list → POST /api/meal-plans/:id/shopping-list
   - Internally uses shopping list generation with merge detection
   - Auto-merges high-confidence ingredients (≥95%)
   - Returns {shoppingListId, items, potentialMerges}
   - Items transformed to cart ingredient format
3. Toggle: "Clear cart upon entry" (default: true)
   - Allows adding to existing cart OR replacing
4. User reviews merges → /merge-review with shoppingListId
   - Saves decisions → POST /meal-plans/shopping-lists/:id/merge-decisions
5. Unified Shopping Cart → /shopping-cart
   - Batch pricing → POST /walmart/recipe-pricing
   - Full product modal with 3 tabs (Similar/Quality/Replacements)
   - "Change Product" and "View on Walmart" buttons
   - Persistent storage via shoppingListId
   - Actions: Clear Cart, Add Recipes, Add from Meal Plans
```

### Standalone Recipe Selection → Cart Flow
```
1. Navigate to cart → /shopping-cart
   - If empty: Shows empty state with 3-second auto-redirect to /select-recipes
   - Actions: "Add Recipes" or "Add from Meal Plans" buttons
2. Select recipes → /select-recipes
   - Browse available recipes
   - Select recipes + quantities
3. Generate cart → POST /api/cart/generate
   - Auto-merges ingredients
4. If merges → /merge-review (no shoppingListId, transient)
5. Shopping Cart → /shopping-cart
   - Walmart pricing integration
   - Actions: Clear Cart, Add More Recipes, Add from Meal Plans
6. Checkout → POST /api/cart/checkout (optional)
```

## Key Business Logic

### Ingredient Merging
- **≥95% similarity**: Auto-merge (backend)
- **70-95% similarity**: Suggest to user (merge-review)
- **40-70% similarity**: AI verification → suggest
- **<40%**: Keep separate

### Walmart Integration
- Product search uses ingredient name + amount + unit
- Package quantity calculation: `calculatePurchaseCount()` service
- Supports product substitution (quality tiers, replacements)
- Affiliate links with optional Impact Radius Publisher ID

### Unit Conversion
- Normalizes units during cart generation
- Handles incompatible unit types (creates separate entries)
- Conversion ratios stored in `potentialMerges` for dynamic recalculation

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://user:pass@localhost:5432/pantry_chef
JWT_SECRET=your-secret-key
OPENAI_API_KEY=sk-...
WALMART_CONSUMER_ID=...
WALMART_PRIVATE_KEY=...
WALMART_PUBLISHER_ID=... (optional)
```

### Frontend (config.ts)
```
API_URL=http://localhost:3000/api
```

## RevenueCat Integration

### Subscription Management
- **Service**: `frontend/services/revenueCat.ts` - SDK wrapper with initialize, login, logout, purchase functions
- **Context**: `frontend/contexts/SubscriptionContext.tsx` - Global subscription state management
- **Entitlement IDs**: `pantry-chef Pro` (Pro tier), `pantry-chef Power` (Power tier)
- **Subscription Product IDs**: `pro_monthly`, `power_monthly` (grants 40/100 monthly credits)
- **Consumable Product IDs**: `credits_10`, `credits_30`, `credits_75` (one-time credit purchases)

### Critical Pattern: Prevent Concurrent API Calls
**Issue**: RevenueCat returns 429 error (code 7638) if multiple API calls to the same endpoint happen simultaneously

**Root Causes**:
1. `Purchases.logIn()` and `Purchases.logOut()` automatically trigger the customer info update listener
2. If code manually calls `getCustomerInfo()` after `logIn()`/`logOut()`, it creates concurrent calls
3. The update listener firing during sync operations causes race conditions

**Solution**: Use `useRef` guards and rely on the automatic listener instead of manual calls:
```typescript
const syncingRef = useRef(false);              // Prevent concurrent login/logout/sync
const loadingCustomerInfoRef = useRef(false);  // Prevent concurrent getCustomerInfo()
const initializingRef = useRef(false);         // Prevent concurrent initialization

// Run sequential instead of Promise.all() to avoid overlapping calls
const initRevenueCat = async () => {
  if (initializingRef.current) return;
  initializingRef.current = true;
  try {
    await initializeRevenueCat();
    await loadCustomerInfo();  // Sequential, not parallel
    await loadOfferings();
  } finally {
    initializingRef.current = false;
  }
};

// CRITICAL: Don't call getCustomerInfo() after logIn - the listener handles it
const syncUserWithRevenueCat = async (userId: string) => {
  if (syncingRef.current) return;
  syncingRef.current = true;
  try {
    await loginRevenueCatUser(userId);  // Triggers listener automatically
    await new Promise(resolve => setTimeout(resolve, 100)); // Let listener process
  } finally {
    syncingRef.current = false;
  }
};

// Prevent listener updates during sync operations to avoid race conditions
const handleCustomerInfoUpdate = (info: CustomerInfo) => {
  if (syncingRef.current) return;  // Defer if sync in progress
  // ... update state
};
```

### User Sync Flow
1. `SubscriptionProvider` initializes RevenueCat on mount
2. When user authenticates, `useEffect` triggers `syncUserWithRevenueCat(user.id)`
3. Calls `Purchases.logIn(userId)` to link anonymous → identified user
4. Loads customer info and subscription status
5. On logout, calls `Purchases.logOut()` to revert to anonymous

## Credit System Architecture

### Overview
Pantry Chef uses a dual-revenue model:
1. **Walmart affiliate revenue** - The primary revenue stream. Every user (free or paid) who checks out through Walmart generates affiliate commission. Free users who shop are highly valuable.
2. **Subscriptions** - Gate premium features (pantry tracking, cookbook scanning, analytics) and provide monthly credits.
3. **Credit purchases** - A la carte option for free users who want AI features without subscribing.

Credits gate AI-powered features that cost real money to run (OpenAI API calls). Non-AI features like recipe browsing, shopping lists, and Walmart checkout are free for everyone to maximize Walmart affiliate revenue.

### Database Schema

#### User Model Extensions
```prisma
model User {
  credits                Int      @default(25)         // Current balance
  totalWalmartCheckouts  Int      @default(0)          // Tracks declining rewards
  subscriptionTier       String?                       // null (free), 'pro', or 'power'
  isProUser              Boolean  @default(false)      // true for Pro OR Power tier
  isPowerUser            Boolean  @default(false)      // true for Power tier only
  proStatusLastChecked   DateTime?                     // 24-hour cache
  revenueCatCustomerId   String?  @unique             // Links to RevenueCat user
}
```

#### CreditTransaction Model
Tracks every credit movement with transaction types:
- `SIGNUP_BONUS` - Initial 25 credits on registration
- `WALMART_CHECKOUT` - Declining rewards: 15→10→5 credits
- `SUBSCRIPTION_GRANT` - Monthly credits: 40/100 based on tier
- `CREDIT_PURCHASE` - One-time consumable purchases
- `AI_MEAL_PLAN` - AI meal plan generation (-1 credit)
- `AI_RECIPE` - AI recipe generation (-1 credit)
- `CHAT_SESSION` - Chat session start (-1 credit)
- `URL_IMPORT` - URL recipe import (-1 credit)
- `ADMIN_ADJUSTMENT` - Manual balance corrections

**Note:** `RECIPE_USE` transaction type exists in code but is not currently charged. Will be re-enabled when creator economy launches (post-competition). See "Future: Creator Economy" section.

#### RecipeUsage Model (Exists, Not Active)
```prisma
model RecipeUsage {
  userId           String
  recipeId         String
  creatorId        String
  creatorEarning   Float          // $0.05 (free) or $0.20 (pro)
  userWasProUser   Boolean        // Pro status at time of use
  walmartCheckoutId String?       // Links to triggering checkout
  isEligibleForPayout Boolean @default(false)  // True after Walmart checkout
  createdAt        DateTime
}
```
**Status:** Schema exists but recipe use charges are disabled for competition. No credits are charged when a user adds a recipe to cart. This maximizes engagement and Walmart checkouts.

#### CreatorEarning Model (Exists, Not Active)
Monthly batch payouts tracked per creator:
```prisma
model CreatorEarning {
  creatorId    String
  month        String     // Format: "YYYY-MM"
  totalAmount  Float      // Sum of all earnings
  isPaid       Boolean    @default(false)
  paidAt       DateTime?
  batchId      String?    // Payment processor batch ID
}
```
**Status:** Schema exists but not in use for competition. Will be activated when creator economy launches.

### Credit Costs

Credits only gate features that cost real money to run (AI/API calls):

| Feature | Cost | Status |
|---------|------|--------|
| **AI Meal Plan** | 1 credit | ✅ Implemented |
| **URL Import (extraction)** | 1 credit | ✅ Implemented |
| **Chat Session** | 1 credit | ✅ Implemented |
| **AI Recipe Generation** | 1 credit | ⚠️ Not yet charged |
| **Recipe Use (add to cart)** | 0 credits | ✅ Free (was 2 credits, disabled for competition) |
| **AI-Generated Recipe Use** | 0 credits | ✅ Free (user owns it) |

**Design Principle:** Never gate the path to a Walmart checkout. Recipe browsing, shopping list generation, Walmart integration, and ingredient merging are always free. Credits only gate AI features that have per-use costs.

### Credit Earning

#### Signup Bonus
- **Amount**: 25 credits (one-time)
- **Implementation**: `grantSignupBonus()` called in `/api/auth/register`
- **File**: `backend/src/services/credit.ts`

#### Walmart Checkout Rewards
- **Declining Schedule**: 15 → 10 → 5 credits (steady state after 2nd checkout)
- **Trigger**: `POST /api/walmart/checkout`
- **Logic**:
  ```typescript
  const checkoutCount = user.totalWalmartCheckouts;
  const creditsGranted = checkoutCount === 0 ? 15 : checkoutCount === 1 ? 10 : 5;
  ```
- **Key Insight**: A free user who shops weekly at Walmart earns ~20 credits/month via checkouts. This covers ~20 AI meal plans, making the free tier genuinely useful while generating affiliate revenue.

#### Subscription Monthly Credits
- **Pro**: 40 credits/month ($4.99/month or $49.99/year)
- **Implementation**: RevenueCat webhook triggers `grantSubscriptionCredits()`
- **Product IDs**: `Pro_Tier_Monthly_499`, `Pro_Tier_Annual_499`

#### Credit Purchases (Consumables)
- **Packages**: $1.99 (10 credits), $4.99 (30 credits), $9.99 (75 credits)
- **Product IDs**: `credits_10`, `credits_30`, `credits_75`
- **Implementation**: RevenueCat `NON_RENEWING_PURCHASE` webhook event
- **Parsing**: Credits extracted from product ID (e.g., `credits_30` → 30)

### Credit Service (`backend/src/services/credit.ts`)

#### Core Functions

**Granting Credits:**
```typescript
grantSignupBonus(userId: string)                    // +25 credits
grantWalmartCheckoutCredits(userId: string)         // +15/10/5 credits
grantSubscriptionCredits(userId, tier)              // +40/100 credits
grantPurchasedCredits(userId, amount)               // Variable amount
```

**Spending Credits:**
```typescript
hasEnoughCredits(userId, amount): Promise<boolean>  // Check balance
getBalance(userId): Promise<number>                 // Get current balance
chargeCredits(userId, amount, type, metadata)       // Deduct credits
```

**Subscription Tier Management:**
```typescript
updateProStatus(userId, isPro)                      // Set from RevenueCat
updateSubscriptionTier(userId, tier)                // 'pro', 'power', or null
refreshProStatusIfStale(userId)                     // 24-hour cache validation
```

**Recipe Usage & Creator Earnings (Inactive for Competition):**
```typescript
recordRecipeUsage(userId, recipeId, creatorId)      // Exists but charges disabled
markUsagesEligibleForPayout(userId, checkoutId)     // After Walmart checkout
processCreatorPayouts(month)                        // Monthly batch job
getCreatorEarningsSummary(creatorId)                // Free vs Pro breakdown
```

### API Endpoints

#### Credit Routes (`/api/credits/*`)
```typescript
GET  /balance           // Returns { balance: number }
GET  /status            // Returns { balance, isProUser, isPowerUser, subscriptionTier, totalWalmartCheckouts, recentTransactions }
GET  /transactions      // Paginated transaction history
GET  /creator/earnings  // Creator earnings summary (inactive for competition)
POST /purchase          // Record credit purchase (called by RevenueCat webhook)
```

#### Recipe Usage
```typescript
POST /api/recipes/:id/use  // Currently free (no credit charge). Tracks usage for analytics only.
```

#### Walmart Integration
```typescript
POST /api/walmart/checkout     // Records checkout, grants declining credits
GET  /api/walmart/checkout/info // Returns next checkout credit reward (15/10/5)
```

#### RevenueCat Webhook
```typescript
POST /api/webhooks/revenuecat  // Handles subscription & consumable events
```

**Event Handling:**
- `INITIAL_PURCHASE` → Grant monthly credits + set tier (Pro/Power)
- `RENEWAL` → Grant monthly credits
- `CANCELLATION` → Keep tier until expiration (user keeps credits)
- `EXPIRATION` → Remove tier + feature access (user keeps credits)
- `NON_RENEWING_PURCHASE` → Grant consumable credits

**⚠️ Security Issue**: Webhook signature verification is commented out (line 30-33 in `revenuecat.ts`)

### Credit Middleware (`backend/src/middleware/creditCheck.ts`)

```typescript
requireCredits(amount: number)  // Returns 402 if insufficient balance
attachCreditBalance()           // Optionally attaches balance to req.user
```

**Usage Example:**
```typescript
router.post('/meal-plans', authenticateToken, requireCredits(1), async (req, res) => {
  // Handler only runs if user has ≥1 credit
});
```

### Feature Gate Middleware

Features are gated by subscription tier, not credits:

```typescript
requireTier('pro')    // Returns 403 if user is not Pro or Power
requireTier('power')  // Returns 403 if user is not Power
```

See "Subscription Tiers & Feature Gating" section for full tier breakdown.

### Frontend Integration

#### CreditContext (`frontend/contexts/CreditContext.tsx`)
Global state management for credit balance:
```typescript
interface CreditContextType {
  balance: number | null;
  loading: boolean;
  refreshBalance: () => Promise<void>;
}
```

**Auto-refresh on:**
- User authentication
- Navigation to credit-dependent screens
- After purchase/spend operations

#### Credit API Client (`frontend/src/api/credits.ts`)
```typescript
getCreditBalance(): Promise<number>
getCreditStatus(): Promise<CreditStatus>
getTransactions(page: number): Promise<Transaction[]>
```

#### Error Handling (`frontend/utils/creditErrors.ts`)
```typescript
handleInsufficientCredits(navigation)  // Shows alert with "Buy Credits" / "Upgrade"
checkCreditError(response)             // Response interceptor for 402 errors
handleFeatureGateError(response, navigation)  // Response interceptor for 403 tier-gated errors
```

**User Experience (Insufficient Credits - 402):**
1. User attempts AI action requiring credits
2. Backend returns 402 status if insufficient
3. Frontend shows alert: "Insufficient credits. You need X more credits."
4. Options: "Buy Credits" / "Subscribe for monthly credits" / "Cancel"

**User Experience (Feature Gated - 403):**
1. User attempts premium feature (pantry, cookbook scan, etc.)
2. Backend returns 403 with required tier
3. Frontend shows upgrade paywall: "This feature requires [Pro/Power]"
4. Options: "Upgrade to [tier]" (navigate to paywall) / "Cancel"

### RevenueCat Product Configuration

#### Offering
- Offering ID: `Pro_Tier_499`
- Paywall: "Pantry-Chef Paywall" (configured in RevenueCat dashboard)

#### Subscription Products
- `Pro_Tier_Monthly_499` → $4.99/month, 40 credits/month, entitlement: `pantry-chef Pro`
- `Pro_Tier_Annual_499` → $49.99/year, 40 credits/month, entitlement: `pantry-chef Pro`

**Note**: Currently single-tier (Pro only). Power tier ($12.99) removed as too expensive for market.

#### Consumables
- `credits_10` → $1.99, 10 credits (one-time)
- `credits_30` → $4.99, 30 credits (one-time)
- `credits_75` → $9.99, 75 credits (one-time)

#### Entitlement Usage
```typescript
// Check tier status
const isPro = customerInfo.entitlements.active['pantry-chef Pro']?.isActive ?? false;
const isPower = customerInfo.entitlements.active['pantry-chef Power']?.isActive ?? false;
```

### Subscription Tiers & Feature Gating

#### Tier Comparison

| Feature | Free | Pro ($4.99/mo) |
|---------|------|----------------|
| **Credits** | Earn only (signup + Walmart) | 40/mo |
| **Credit purchases** | ✅ | ✅ |
| **Manual recipe entry** | ✅ | ✅ |
| **Recipe browsing** | ✅ | ✅ |
| **Shopping list + Walmart** | ✅ | ✅ |
| **Ingredient merging** | ✅ | ✅ |
| **Basic dietary preferences** | ✅ | ✅ |
| **AI features (via credits)** | ✅ | ✅ |
| **Advanced settings/macros** | ❌ | ✅ |
| **Cookbook page scanning** | ❌ | ✅ |
| **Grocery cost tracking** | ❌ | ✅ |
| **Recipe recommendations** | ❌ | ✅ |
| **Nutrition analytics** | ❌ | ✅ |
| **Full pantry tracking** | ❌ | ✅ |
| **Cook from pantry AI** | ❌ | ✅ |
| **Family profiles** | ❌ | ✅ |

#### Design Principles

1. **Never gate the path to Walmart checkout** - Recipe browsing, shopping lists, Walmart integration are always free. Free users generate affiliate revenue.
2. **Credits gate AI costs** - Every tier uses credits for AI features. Higher tiers get more monthly credits. Free users earn credits via Walmart checkouts.
3. **Subscription gates premium features** - Features that are expensive to run (AI vision for cookbook scanning, extra AI calls for pantry suggestions) or that provide power-user value (analytics, advanced settings) require a subscription.
4. **Simplified single-tier model:**
   - **Free**: "I cook from recipes and shop at Walmart" (generates affiliate revenue)
   - **Pro ($4.99)**: "I want all the features" (unlimited AI features, pantry tracking, cookbook scanning, analytics, family profiles)
   - Affordable pricing ($4.99) maximizes subscription adoption while keeping Walmart affiliate revenue as primary monetization

#### Upgrade Moments

Natural points where free users encounter the paywall:
1. Tap "Settings" → advanced dietary options locked → "Unlock with Pro"
2. Tap "Scan Cookbook" → "Pro feature"
3. See cost tracking or recommendations → "Pro feature"
4. Tap "Pantry" → "Track your pantry with Power"
5. Run out of credits → "Subscribe for 40 credits/month + premium features, or buy a credit pack"

#### Feature Details

**Pro Features:**
- **Advanced settings/macros** - Detailed macro targets (protein/carb/fat grams), ingredient exclusion lists, meal timing preferences, portion size defaults
- **Cookbook page scanning** - Photograph a cookbook page → GPT vision extracts recipe → saves to personal library (uses AI vision = real cost per scan)
- **Grocery cost tracking** - Track weekly/monthly grocery spending from Walmart checkouts, spending trends over time
- **Recipe recommendations** - "People who cooked this also made..." based on aggregate usage patterns across all users
- **Nutrition analytics** - Weekly/monthly macro and calorie tracking across meal plans, nutrient gap identification

**Power Features:**
- **Full pantry tracking** - Inventory management for fridge/pantry/freezer. Log items, quantities, expiration dates. Auto-deduct after cooking.
- **Cook from pantry AI** - "What can I make tonight?" AI analyzes pantry contents and suggests recipes that use what you already have, minimizing waste
- **Family profiles** - Multiple household members with individual dietary preferences sharing a pantry. Meal plans consider everyone's needs.

### Data Flow Examples

#### Free User: Signup → Meal Plan → Walmart Checkout → Earn Credits
```
1. POST /api/auth/register
   └─ grantSignupBonus() → User.credits = 25
   └─ CreditTransaction(type: SIGNUP_BONUS, amount: 25)

2. POST /api/meal-plans (AI meal plan generation)
   └─ chargeCredits(userId, 1, AI_MEAL_PLAN)
   └─ User.credits = 24

3. POST /api/cart/generate (add recipes to cart - FREE, no credits)
   └─ Shopping list generated with ingredient merging

4. POST /api/walmart/checkout
   └─ grantWalmartCheckoutCredits() → User.credits = 39 (+15)
   └─ User.totalWalmartCheckouts = 1
   └─ CreditTransaction(type: WALMART_CHECKOUT, amount: 15)

Net: User spent 1 credit, earned 15. Has 39 credits. You earned affiliate commission.
```

#### Pro Subscription Purchase
```
1. User purchases "Pro Monthly" via RevenueCat

2. POST /api/webhooks/revenuecat (event: INITIAL_PURCHASE, product: pro_monthly)
   └─ grantSubscriptionCredits(userId, 'pro') → +40 credits
   └─ updateSubscriptionTier(userId, 'pro')
   └─ User.isProUser = true, User.subscriptionTier = 'pro'
   └─ CreditTransaction(type: SUBSCRIPTION_GRANT, amount: 40)

3. User now has access to: advanced settings, cookbook scanning,
   cost tracking, recommendations, nutrition analytics
```

#### Power User: Cook from Pantry
```
1. User (Power tier) opens Pantry screen
   └─ GET /api/pantry → returns inventory items

2. User taps "What can I make?"
   └─ POST /api/pantry/suggestions (requireTier('power'))
   └─ AI analyzes pantry contents vs recipe database
   └─ Returns ranked recipes using available ingredients
   └─ chargeCredits(userId, 1, AI_RECIPE) for AI suggestion call

3. User selects recipe → adds to cart → Walmart checkout
   └─ Shopping list only includes items NOT in pantry
```

### Known Limitations & TODOs

#### ❌ Not Implemented (Competition Priority)
1. **Pantry Tracking System** - Full CRUD for pantry items, expiration tracking, auto-deduction
2. **Cook from Pantry AI** - AI suggestions based on pantry contents
3. **Cookbook Page Scanning** - Camera/photo → GPT vision → recipe extraction
4. **Grocery Cost Tracking** - Spending history from Walmart checkouts
5. **Recipe Recommendations** - "People also cooked..." based on usage patterns
6. **Nutrition Analytics** - Macro/calorie tracking across meal plans
7. **Advanced Settings/Macros** - Granular dietary controls behind Pro gate
8. **Family Profiles** - Multiple users sharing a pantry
9. **Feature Gate Middleware** - `requireTier('pro')` / `requireTier('power')` middleware
10. **AI Recipe Generation Charging** - Model supports it, not wired to charge
11. **Credit Balance UI** - No prominent counter in app header/navigation
12. **Transaction History Screen** - API exists, no frontend view

#### ❌ Not Implemented (Post-Competition)
1. **Creator Economy** - Recipe use charges (2 credits), creator payouts, creator dashboard UI
2. **Creator Dashboard UI** - Backend API exists (`GET /api/credits/creator/earnings`), frontend missing
3. **Referral System** - No database model or endpoints
4. **Actual Payout Processing** - Creates batch records but doesn't send money

#### ⚠️ Trust-Based Systems
1. **Walmart Checkout Verification** - "Click to checkout" button grants credits immediately (no API verification)
2. **Fraud Detection** - No rate limiting or abuse prevention on credit grants

#### 🔐 Security Concerns
1. Webhook signature verification disabled → Any caller can forge events
2. No rate limiting on credit-granting endpoints
3. Trust-based Walmart checkout rewards (could be exploited)

### Testing Flow
```bash
# 1. Register user
POST /api/auth/register → Receives 25 credits

# 2. Check balance
GET /api/credits/balance → { balance: 25 }

# 3. Generate AI meal plan
POST /api/meal-plans → Charges 1 credit, balance: 24

# 4. Add recipe to cart (FREE - no credit charge)
POST /api/cart/generate → Shopping list created

# 5. Simulate Walmart checkout
POST /api/walmart/checkout → Grants 15 credits, balance: 39

# 6. Check next checkout reward
GET /api/walmart/checkout/info → { nextReward: 10 }

# 7. View transaction history
GET /api/credits/transactions?page=1 → List of all transactions

# 8. Import recipe from URL
POST /api/recipes/import-url → { url: "https://allrecipes.com/..." } → Charges 1 credit, returns recipe

# 9. Test feature gating (Pro feature without subscription)
GET /api/pantry → 403 "Requires Power subscription"
POST /api/nutrition/analytics → 403 "Requires Pro subscription"
```

## URL Import System

### Overview
Allows users to import recipes from external websites by pasting a URL. Uses intelligent extraction (structured data first, AI fallback) with caching to minimize costs. Imported recipes are private-only to respect copyright.

### Database Schema

#### Recipe Model Extensions
```prisma
model Recipe {
  // ... existing fields ...

  isImported    Boolean  @default(false)  // Imported from external URL
  sourceUrl     String?                   // Original recipe URL
  sourceWebsite String?                   // Domain name (e.g., "allrecipes.com")
  importedAt    DateTime?                 // When it was imported
  canBePublic   Boolean  @default(true)   // False for imported recipes (copyright protection)
}
```

#### UrlRecipeCache Model
Caches extraction results to avoid re-scraping and reduce AI costs:
```prisma
model UrlRecipeCache {
  id               String   @id
  url              String   @unique
  rawData          Json     // Original structured data or cleaned HTML
  parsedData       Json     // AI-cleaned recipe data
  extractionMethod String   // "json-ld", "microdata", "ai-full", "ai-partial"
  wasSuccessful    Boolean
  errorMessage     String?
  timesUsed        Int      @default(1)
  lastUsedAt       DateTime
  createdAt        DateTime
}
```

#### UnitAlias Model
Caches unit conversions to standardize variant unit names:
```prisma
model UnitAlias {
  id               String  @id
  variantName      String  @unique  // "T", "Tbsp", "tablespoon"
  standardUnit     String            // "tbsp"
  conversionFactor Float   @default(1.0)
  isVerified       Boolean @default(false)
  confidence       Float?  // AI confidence if discovered by AI
  createdAt        DateTime
}
```

### Extraction Pipeline

**Multi-Layered Approach (Cost-Optimized):**

1. **Check Cache** (Free)
   - Lookup URL in `UrlRecipeCache`
   - If found and successful → Return cached data
   - Eliminates redundant scraping/AI calls

2. **Fetch HTML** (Free)
   - HTTP GET with user-agent: `PantryChef/1.0`
   - 15-second timeout, 5MB limit
   - Respects standard web practices

3. **Structured Data Extraction** (Free, ~70% success rate)
   - Parse JSON-LD `<script type="application/ld+json">` tags
   - Look for `schema.org/Recipe` structured data
   - Major sites (AllRecipes, Food Network, NYT Cooking, etc.) use this
   - If successful → Skip AI entirely

4. **AI Extraction** (Fallback, ~$0.002-0.003/recipe)
   - Clean HTML (remove nav, ads, scripts, etc.)
   - Extract recipe-relevant sections only
   - Send to GPT-4o-mini with strict extraction prompt
   - Normalize units using cached `UnitAlias` mappings

5. **Save & Cache**
   - Store in `UrlRecipeCache` for future use
   - Create recipe with `isImported=true`, `canBePublic=false`
   - Link to existing ingredients or create new ones
   - Charge 1 credit ONLY after successful import

### Copyright Protection

**What We Import (Legal):**
- ✅ Ingredient lists (factual data, not copyrightable)
- ✅ Basic cooking steps (functional instructions)
- ✅ Cooking times, servings, nutrition
- ✅ Source URL attribution

**What We DON'T Import (Risky):**
- ❌ Descriptions/stories (creative writing, copyrightable)
- ❌ Photos (copyrighted images)
- ❌ Brand names/trademarks
- `description` field is always set to `null` for imports

**Restrictions:**
- `isPublic` forced to `false` (user's private copy)
- `canBePublic` set to `false` (cannot be published later)
- No creator payouts (user is the owner)

**Cost Structure:**
- **Import cost:** 1 credit (one-time, covers extraction/caching)
- **Usage cost:** Free (add to cart costs no credits)
- **Subsequent uses:** Free (already imported)
- **Rationale:** Import costs 1 credit because it may trigger an AI call. Using the recipe afterwards is free to encourage Walmart checkouts.

**Legal Basis:**
- Recipes (ingredient lists + basic instructions) are NOT copyrightable in the US
- User-initiated, one-at-a-time import (not bulk scraping)
- Private use only (not redistribution)
- Attribution preserved via `sourceUrl`

### API Endpoint

**POST /api/recipes/import-url**

**Authentication:** Required (JWT token)

**Credit Check:** 1 credit required (checked BEFORE work, charged AFTER success)

**Request:**
```json
{
  "url": "https://allrecipes.com/recipe/12345/grilled-salmon/"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Recipe imported successfully (1 credit)",
  "data": {
    "recipe": { /* full recipe object */ },
    "extractionMethod": "json-ld",  // or "ai-full"
    "usedCache": false,
    "balance": 24
  }
}
```

**Response (Insufficient Credits - 402):**
```json
{
  "success": false,
  "message": "Insufficient credits",
  "data": {
    "required": 1,
    "current": 0,
    "shortfall": 1
  }
}
```

**Response (Extraction Failed - 400):**
```json
{
  "success": false,
  "message": "Failed to extract recipe from URL"
}
```

### Frontend Integration

**Location:** Home page (`frontend/app/index.tsx`)

**Component:** `ImportRecipeModal` (`frontend/src/components/ImportRecipeModal.tsx`)

**Features:**
- Simple URL input field
- Credit balance display
- Cost notification (1 credit)
- Disclaimer text about personal use only
- Loading indicator during import
- Error handling with user-friendly alerts
- Navigation to recipe detail on success

**User Flow:**
1. User taps "Import from URL" button on home page
2. Modal opens with URL input
3. User pastes recipe URL
4. Frontend checks credit balance (shows "Buy Credits" if insufficient)
5. User taps "Import Recipe"
6. Backend fetches, extracts, saves (with loading spinner)
7. Success → Navigate to recipe detail page
8. Failure → Show error alert

### Cost Economics

**Per-Import Cost Breakdown:**
- Cache hit: $0.000 (instant return)
- Structured data extraction: $0.000 (no AI needed)
- AI extraction: ~$0.002-0.003 (GPT-4o-mini)
- User pays: 1 credit (~$0.07-0.20 value depending on how credits were obtained)

**Profit Margin:** High even with AI fallback

**Cache Effectiveness:**
- First import of a URL: May use AI (~$0.003)
- Subsequent imports: Cached ($0.000)
- Popular recipes (imported by multiple users): Shared cache benefit

### Service Functions

**Core Service:** `backend/src/services/urlRecipeImporter.ts`

```typescript
importRecipeFromUrl(url: string): Promise<ImportResult>
// Main import function, returns { recipe, extractionMethod, usedCache }

findOrCreateIngredient(name: string): Promise<string>
// Find existing ingredient by exact name or create new one

cacheUnitAlias(variant: string, standard: string, confidence: number)
// Cache unit conversion mapping for future use
```

**Helper Functions:**
- `extractStructuredData(html)` - Parse JSON-LD/microdata
- `parseJsonLd(jsonLd)` - Convert schema.org to our format
- `cleanHtmlForAI(html)` - Strip irrelevant content for AI
- `extractWithAI(content)` - GPT-4o-mini extraction
- `normalizeUnit(unit)` - Standardize using UnitAlias cache

### Caching Strategy

**URL Cache:**
- Cache successful AND failed extractions
- Update `timesUsed` counter on each access
- Permanent storage (no expiration)
- Reduces costs by eliminating redundant work

**Unit Alias Cache:**
- Pre-populated with common variants:
  - "T" → "tbsp"
  - "Tbsp" → "tbsp"
  - "tablespoon" → "tbsp"
  - "c" → "cup"
- AI-discovered mappings cached with confidence score
- Verified mappings marked with `isVerified=true`

### Error Handling

**Common Errors:**
1. **Invalid URL** → 400 error before credit check
2. **Insufficient credits** → 402 error, prompt to buy credits
3. **Fetch timeout** → Cached as failed, user notified
4. **No recipe found** → AI returns `{"error": "..."}`, user notified
5. **Paywall site** → Cannot access, cached as failed

**User Experience:**
- Clear error messages
- No credit charged on failure
- Failed attempts cached to avoid retry costs
- Alternative suggestion: "Try manual entry"

### Testing

```bash
# Test URL import
curl -X POST http://localhost:3000/api/recipes/import-url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://allrecipes.com/recipe/12345/"}'

# Check cache
SELECT * FROM "UrlRecipeCache" WHERE url = 'https://allrecipes.com/...';

# Check imported recipe
SELECT * FROM "Recipe" WHERE "isImported" = true;

# Verify cannot make public
UPDATE "Recipe" SET "isPublic" = true WHERE "canBePublic" = false;
-- Should fail or be ignored by business logic
```

## Common Issues & Solutions

### 1. Metro Bundler Import Errors
**Problem**: "Unable to resolve ./useWalmartProducts"
**Solution**:
- Rename file to `.tsx` if it uses React hooks
- Create `index.ts` export barrel in directory
- Import from directory path, not file

### 2. Route Not Found (404)
**Problem**: POST to shopping list endpoint fails
**Solution**: Use `/api/meal-plans/shopping-lists/:id` not `/api/shopping-lists/:id`

### 3. Property Access Errors
**Problem**: `Cannot read property 'name'`
**Solution**: Use nested access `item.ingredient.name` not `item.ingredientName`

### 4. All Recipes are Fish
**Problem**: AI generates only pescatarian recipes
**Solution**: Check `recipeAgent.ts:414` for hardcoded protein sources, ensure dynamic variation

### 5. Authentication Fails in Dev
**Problem**: Foreign key constraint violation
**Solution**: Remove dev bypass, use proper JWT tokens from `/api/auth/login`

### 6. Insufficient Credits Error (402)
**Problem**: User gets 402 error when attempting action
**Solution**:
- Check balance: `GET /api/credits/balance`
- View transaction history: `GET /api/credits/transactions`
- Frontend should catch 402 and show "Buy Credits" alert
- Test Walmart checkout to grant credits: `POST /api/walmart/checkout`

### 7. Subscription Tier Not Updating
**Problem**: User subscribed but still treated as free user
**Solution**:
- Check RevenueCat webhook delivery (logs in RevenueCat dashboard)
- Verify entitlement IDs: `pantry-chef Pro` (Pro tier), `pantry-chef Power` (Power tier)
- Check `User.isProUser`, `User.isPowerUser`, `User.subscriptionTier` in database
- Refresh stale status: `refreshProStatusIfStale(userId)` (24-hour cache)
- Test webhook manually: `POST /api/webhooks/revenuecat`

### 8. Feature Gate Returns 403
**Problem**: User gets 403 error when accessing premium feature
**Solution**:
- Verify user's subscription tier in database
- Check `requireTier()` middleware is checking correct tier level
- Pro features need `isProUser = true` (Pro OR Power users)
- Power features need `isPowerUser = true` (Power users only)
- Frontend should catch 403 and show upgrade paywall

### 9. URL Import Fails to Extract Recipe
**Problem**: Import returns "Failed to extract recipe from URL"
**Solution**:
- Check if URL is paywalled (NYT Cooking, America's Test Kitchen require login)
- Verify site uses standard recipe markup (JSON-LD, Microdata)
- Check `UrlRecipeCache` table for cached error messages
- Test structured data: View page source → search for `"@type": "Recipe"`
- If AI extraction fails, content may not contain recipe (blog post, video page, etc.)
- Alternative: Manually enter recipe using "Add Recipe" feature

## Development Workflow

### Backend Changes
```bash
# After code changes
docker-compose build backend
docker-compose up -d backend

# View logs
docker-compose logs -f backend
```

### Frontend Changes
```bash
# Metro bundler hot-reloads automatically
# For clean start:
npx expo start -c
```

## Testing Flow
1. Register user → `/api/auth/register`
2. Login → `/api/auth/login` (returns JWT)
3. Store token in AsyncStorage
4. All subsequent requests include `Authorization: Bearer <token>`

## Future Considerations
- Old shopping-list/merge-review.tsx should be removed in favor of root-level pages
- Checkout flow needs Walmart cart consolidation API (may require Publisher ID)

### Future: Creator Economy (Post-Competition)
When community features are ready:
1. **Re-enable recipe use charges** - 2 credits per community recipe use (add to cart)
2. **Creator payouts** - $0.05/use (free users), $0.20/use (Pro/Power users)
3. **Payout eligibility** - Only after user completes Walmart checkout (prevents gaming)
4. **Creator dashboard** - Frontend UI for earnings, usage stats, popular recipes
5. **Community recipe discovery** - Search, filter, trending, creator profiles
6. **Recipe reviews/ratings** - Aggregate star ratings on public recipes

The creator economy aligns with the Walmart affiliate model: creators are incentivized to share recipes that drive grocery purchases, which generates affiliate revenue. Creator payouts are funded by the 2-credit recipe use charge.
