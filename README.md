# Pantry Chef

A mobile-first meal planning and recipe management app with AI-powered recipe generation and Walmart shopping integration.

## Features

- **AI Recipe Generation** - GPT-5-nano powered recipe creation with dietary preferences
- **Smart Meal Planning** - Weekly meal plans with nutrition tracking
- **Walmart Integration** - Direct shopping cart creation with Walmart Affiliate API
- **Ingredient Management** - Searchable ingredient database with category filtering
- **Shopping Lists** - Automatic ingredient aggregation with smart merging
- **Chat Assistant** - AI-powered cooking assistant
- **User Preferences** - Dietary restrictions, cuisine preferences, and nutrition goals
- **Inventory Tracking** - Track what you have on hand

## Tech Stack

### Backend
- **Runtime:** Node.js 20
- **Framework:** Express 5.0.1
- **Language:** TypeScript 5.7.2
- **Database:** PostgreSQL with pgvector extension
- **ORM:** Prisma 7.2.0
- **AI:** OpenAI GPT-5-nano-2025-08-07
- **E-commerce:** Walmart Affiliate API v2
- **Auth:** JWT with bcrypt

### Frontend
- **Framework:** React Native 0.81.5
- **Platform:** Expo 54.0.23
- **Routing:** Expo Router 6.0.14
- **Language:** TypeScript 5.9.2
- **State:** React Context API

## Project Structure

```
pantry-chef/
├── backend/
│   ├── src/
│   │   ├── routes/          # API endpoints (13 files)
│   │   ├── services/        # Business logic (10 files)
│   │   ├── utils/           # Helper functions (4 files)
│   │   ├── middleware/      # Auth middleware
│   │   ├── config/          # Configuration
│   │   └── index.ts         # Server entry point
│   ├── prisma/
│   │   └── schema.prisma    # Database schema (20+ tables)
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── frontend/
│   ├── app/                 # Expo Router screens
│   ├── contexts/            # React contexts
│   ├── src/
│   │   ├── api/            # API clients
│   │   └── types/          # TypeScript types
│   ├── config.ts           # API configuration
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml
├── init-db.sql
└── README.md
```

## Getting Started

### Prerequisites

- Docker Desktop (for running PostgreSQL)
- Node.js 20+ (for local development)
- Expo CLI (for frontend development)
- OpenAI API key
- Walmart Affiliate API credentials

### Environment Variables

You need to create a `.env` file in the root directory. This single file is used by both Docker and local development.

**IMPORTANT:** Copy the example file and fill in your actual credentials:

```bash
# In the root directory
cp .env.example .env
```

Then edit `.env` and add your API keys:

```bash
# Database Configuration
# For Docker: use "postgres" as hostname (default in .env.example)
# For local dev: change to "localhost"
DATABASE_URL="postgresql://pantrychef:pantrychef_dev_password@postgres:5432/pantrychef"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"

# OpenAI API Configuration
OPENAI_API_KEY="sk-proj-your-actual-openai-api-key-here"

# Walmart Affiliate API Configuration
WALMART_CONSUMER_ID="your-consumer-id-uuid-here"
WALMART_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-key-here\n-----END PRIVATE KEY-----"
WALMART_KEY_VERSION="1"
WALMART_PUBLISHER_ID="your-publisher-id-here"

# Host Configuration
HOST_IP="localhost"
PORT="3000"
NODE_ENV="development"
```

**For local development only:** If you're running the backend locally (not in Docker), change the DATABASE_URL hostname from `postgres` to `localhost`:
```bash
DATABASE_URL="postgresql://pantrychef:pantrychef_dev_password@localhost:5432/pantrychef"
```

### Installation & Setup

#### Quick Start with Docker (Recommended)

The easiest way to get started is to run everything with Docker:

```bash
# 1. Setup environment
cp .env.example .env
# Edit .env and add your OpenAI API key and Walmart credentials

# 2. Start backend and database
docker-compose up -d

# 3. Check logs to ensure it's running
docker-compose logs -f backend

# Backend is now running on http://localhost:3000
```

That's it for the backend! Docker handles all dependencies, database setup, and Prisma migrations automatically.

#### Frontend Setup

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Create frontend .env file
cp .env.example .env
# Edit .env and add your computer's IP address
# Find it with 'ipconfig' (Windows) or 'ifconfig' (Mac/Linux)

# 3. Start Expo development server
npm start
```

Choose your platform:
- Press `a` for Android emulator
- Press `i` for iOS simulator
- Scan QR code with Expo Go app on your phone

---

#### Alternative: Local Development (Backend)

If you prefer to run the backend outside Docker (for easier debugging):

```bash
# 1. Setup environment
cp .env.example .env
# Edit .env and add your API keys
# IMPORTANT: Change DATABASE_URL from "postgres" to "localhost"

# 2. Start only the database with Docker
docker-compose up -d postgres

# 3. Setup backend
cd backend
npm install
npx prisma generate
npx prisma db push
npm run build

# 4. Start backend in development mode
npm run dev

# Backend runs on http://localhost:3000
```

Frontend setup is the same as above.

## API Documentation

### Authentication
- `POST /api/auth/register` - Create new user account
- `POST /api/auth/login` - Login with email/password
- `GET /api/auth/me` - Get current user profile

### Recipes
- `GET /api/recipes` - List recipes (with pagination, filtering)
- `POST /api/recipes` - Create new recipe
- `GET /api/recipes/:id` - Get recipe details
- `PATCH /api/recipes/:id` - Update recipe
- `DELETE /api/recipes/:id` - Delete recipe

### Ingredients
- `GET /api/ingredients` - List ingredients (with search, category filter)
- `POST /api/ingredients` - Add new ingredient
- `GET /api/ingredients/:id` - Get ingredient details

### Meal Planning
- `POST /api/meal-plans/generate-ideas` - Generate recipe ideas
- `POST /api/meal-plans/generate-week` - Generate weekly meal plan
- `GET /api/meal-plans` - List user's meal plans
- `GET /api/meal-plans/:id` - Get meal plan details
- `POST /api/meal-plans/:id/shopping-list` - Generate shopping list

### Shopping Cart
- `POST /api/cart/generate` - Generate cart from recipes
- `POST /api/cart/enrich-walmart` - Add Walmart product data
- `POST /api/cart/checkout` - Create Walmart checkout URL

### Chat
- `POST /api/chat` - Send message to AI assistant

## Database Schema

The app uses PostgreSQL with 20+ tables including:

- **Users** - User accounts with authentication
- **Recipes** - Recipe data with ingredients and instructions
- **Ingredients** - Master ingredient list
- **RecipeIngredients** - Junction table for recipe-ingredient relationships
- **MealPlans** - Weekly meal plans
- **MealSlots** - Individual meal slots in plans
- **ShoppingLists** - Generated shopping lists
- **UserPreferences** - User dietary preferences
- **UserInventory** - User's ingredient inventory
- **RecipeEmbeddings** - Vector embeddings for semantic search (pgvector)

## Development Notes

### Backend Architecture

- **Routes** handle HTTP requests and validation
- **Services** contain business logic and external API calls
- **Utils** provide helper functions for unit conversion, ingredient matching, etc.
- **Middleware** handles authentication and request validation

### Key Features

**Ingredient Similarity Detection:**
- Uses Levenshtein distance for fuzzy matching
- Three-tier strategy: auto-merge (≥95%), suggest (70-95%), AI verify (40-70%)
- Caches user decisions to avoid re-asking

**Unit Conversion:**
- Ingredient-specific conversions (e.g., 1 lemon = 0.25 cup juice)
- Generic unit conversions (volume, weight, count)
- Smart package quantity calculation for Walmart products

**AI Recipe Generation:**
- Strict validation rules (no "or" in ingredients, every ingredient needs a unit)
- Dietary restriction enforcement
- Nutrition target adherence
- Learning from user's recipe history

### Walmart Integration

The app uses Walmart Affiliate API v2 with RSA-SHA256 signature authentication:
- Product search with relevance scoring
- Price and availability checking
- Consolidated cart creation with affiliate tracking

## Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## Deployment

### Railway (Recommended for Backend)

1. Connect your GitHub repo to Railway
2. Add environment variables in Railway dashboard
3. Railway will auto-deploy on push

### Expo EAS Build (Frontend)

```bash
cd frontend

# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios
```

## License

MIT

## Contributing

This is a hackathon project rebuilt from scratch. All code was manually written (no copy-paste) to ensure clean git history and compliance with hackathon rules.

## Credits

Built with:
- OpenAI GPT-5-nano for AI features
- Walmart Affiliate API for e-commerce
- Expo for mobile development
- Prisma for database ORM
- PostgreSQL with pgvector for vector search

---

**Note:** This app is provided "as is" for educational and personal use. Always verify recipes and ingredients for safety and dietary compatibility.
