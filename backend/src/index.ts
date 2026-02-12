import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { networkInterfaces } from 'os';
import authRoutes from './routes/auth.js';
import recipeRoutes from './routes/recipes.js';
import healthRoutes from './routes/health.js';
import demoRoutes from './routes/demo.js';
import ingredientsRoutes from './routes/ingredients.js';
import walmartRoutes from './routes/walmart.js';
import cartRoutes from './routes/cart.js';
import chatRoutes from './routes/chat.js';
import recipeAgentRoutes from './routes/recipeAgent.js';
import preferencesRoutes from './routes/preferences.js';
import inventoryRoutes from './routes/inventory.js';
import mealPlanningRoutes from './routes/mealPlanning.js';
import recipeCustomizationRoutes from './routes/recipeCustomization.js';
import creditRoutes from './routes/credits.js';
import revenuecatWebhookRoutes from './routes/webhooks/revenuecat.js';

// Load environment variables from root directory
dotenv.config({ path: '../.env' });

// Initialize PostgreSQL connection pool
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);

// Initialize Prisma Client with PostgreSQL adapter
export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Initialize Express app
const app: Application = express();
const PORT = Number(process.env.PORT) || 3000;

// Trust proxy - needed for rate limiting and IP detection behind proxies/load balancers
// Set to 1 to trust only the first proxy hop (secure for Docker/Railway deployments)
app.set('trust proxy', 1);

// Helper function to get local network IP
function getLocalNetworkIP(): string {
  const nets = networkInterfaces();
  const candidates: string[] = [];

  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (!netList) continue;

    for (const net of netList) {
      // Skip internal (loopback) and non-IPv4 addresses
      const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4;
      if (net.family === familyV4Value && !net.internal) {
        candidates.push(net.address);
      }
    }
  }

  // Prioritize common local network IP ranges
  // 192.168.x.x (most common home networks)
  const preferred192 = candidates.find(ip => ip.startsWith('192.168.'));
  if (preferred192) return preferred192;

  // 10.x.x.x (common in larger networks)
  const preferred10 = candidates.find(ip => ip.startsWith('10.'));
  if (preferred10) return preferred10;

  // 172.16.x.x - 172.31.x.x (less common)
  const preferred172 = candidates.find(ip => {
    const parts = ip.split('.');
    return parts[0] === '172' && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31;
  });
  if (preferred172) return preferred172;

  // Fallback to first candidate or localhost
  return candidates[0] || 'localhost';
}

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging - Always log in production to debug Railway issues
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`📨 ${new Date().toISOString()} - ${req.method} ${req.path} from ${req.ip}`);
  next();
});

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/ingredients', ingredientsRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/walmart', walmartRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/agent', recipeAgentRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/meal-plans', mealPlanningRoutes);
app.use('/api', recipeCustomizationRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/webhooks/revenuecat', revenuecatWebhookRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Pantry Chef API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      recipes: '/api/recipes',
      agent: '/api/agent',
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// Start server - Listen on all network interfaces (0.0.0.0)
const server = app.listen(PORT, '0.0.0.0', () => {
  const networkIP = process.env.HOST_IP || getLocalNetworkIP();
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Local: http://localhost:${PORT}`);
  console.log(`🌐 Network: http://${networkIP}:${PORT}`);
  console.log(`🌐 Listening on: 0.0.0.0:${PORT}`);
  console.log(`📱 Use network URL for mobile devices`);
  console.log(`✅ Server is ready to accept connections`);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('✅ Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;
