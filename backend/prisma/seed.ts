import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Default test credentials:
//   Email:    test@pantrychef.com
//   Password: password123
const DEFAULT_USER_EMAIL = 'test@pantrychef.com';
const DEFAULT_USER_NAME = 'Test User';
// bcrypt hash of "password123" with 12 rounds
const DEFAULT_USER_PASSWORD_HASH = '$2b$12$mmPw77E12tzloZa9az8DpebzFWqOgGLXi3jWCmFIdqbyagzT5quNq';

async function main() {
  console.log('🌱 Seeding database...');

  // Check if data already exists (idempotent)
  const existingUser = await prisma.user.findUnique({ where: { email: DEFAULT_USER_EMAIL } });
  if (existingUser) {
    console.log('Database already seeded (test user exists). Skipping.');
    return;
  }

  // ============================================
  // 1. Create default test user
  // ============================================
  const user = await prisma.user.create({
    data: {
      email: DEFAULT_USER_EMAIL,
      password: DEFAULT_USER_PASSWORD_HASH,
      name: DEFAULT_USER_NAME,
      termsAcceptedAt: new Date(),
      credits: 25,
    },
  });
  console.log(`  Created test user: ${user.email}`);

  // ============================================
  // 2. Create ingredients
  // ============================================
  const ingredientData: { name: string; category: string }[] = [
    { name: 'salmon fillet', category: 'Seafood' },
    { name: 'olive oil', category: 'Condiments' },
    { name: 'lemon juice', category: 'Other' },
    { name: 'dill', category: 'Other' },
    { name: 'lemon zest', category: 'Other' },
    { name: 'salt', category: 'Spices' },
    { name: 'black pepper', category: 'Vegetables' },
    { name: 'butter', category: 'Dairy' },
    { name: 'beef tenderloin', category: 'Meat' },
    { name: 'garlic', category: 'Spices' },
    { name: 'mustard', category: 'Other' },
    { name: 'thyme', category: 'Other' },
    { name: 'sea salt', category: 'Spices' },
    { name: 'shallot', category: 'Other' },
    { name: 'heavy cream', category: 'Dairy' },
    { name: 'red wine', category: 'Other' },
    { name: 'beef stock', category: 'Meat' },
    { name: 'tofu', category: 'Other' },
    { name: 'sesame seeds, toasted', category: 'Other' },
    { name: 'neutral oil', category: 'Condiments' },
    { name: 'soy sauce', category: 'Condiments' },
    { name: 'rice vinegar', category: 'Grains' },
    { name: 'honey', category: 'Other' },
    { name: 'ginger, grated', category: 'Other' },
    { name: 'sesame oil', category: 'Condiments' },
    { name: 'cornstarch', category: 'Other' },
    { name: 'green onion', category: 'Vegetables' },
    { name: 'water', category: 'Other' },
    { name: 'bell pepper', category: 'Vegetables' },
    { name: 'broccoli', category: 'Vegetables' },
    { name: 'ginger', category: 'Other' },
    { name: 'carrot', category: 'Vegetables' },
    { name: 'brown sugar', category: 'Other' },
    { name: 'chicken thigh', category: 'Meat' },
    { name: 'smoked paprika', category: 'Other' },
    { name: 'garlic powder', category: 'Spices' },
    { name: 'apple cider vinegar', category: 'Fruits' },
  ];

  const ingredients: Record<string, string> = {};
  for (const ing of ingredientData) {
    const created = await prisma.ingredient.upsert({
      where: { name: ing.name },
      update: {},
      create: ing,
    });
    ingredients[ing.name] = created.id;
  }
  console.log(`  Created ${ingredientData.length} ingredients`);

  // ============================================
  // 3. Create recipes
  // ============================================

  // Recipe 1: Grilled Salmon with Lemon Dill Butter
  const recipe1 = await prisma.recipe.create({
    data: {
      title: 'Grilled Salmon with Lemon Dill Butter',
      description: 'Juicy salmon grilled to smoky perfection and finished with a bright lemon dill butter for a fresh, tangy finish.',
      instructions: [
        'Preheat the grill to medium-high heat.',
        'Pat salmon dry and brush with olive oil; season with salt and pepper.',
        'Grill salmon, skin side down if present, for 6–8 minutes until opaque about three-quarters done.',
        'Meanwhile, in a small saucepan melt butter over low heat. Stir in lemon juice, lemon zest, and dill to create the lemon dill butter.',
        'Flip salmon (if desired) and cook 1–3 minutes more until just flaky.',
        'Remove salmon from grill and spoon or brush the lemon dill butter over the top before serving.',
      ],
      prepTime: 15,
      cookTime: 20,
      servings: 4,
      calories: 420,
      protein: 34,
      carbs: 4,
      fat: 28,
      isPublic: true,
      isAiGenerated: false,
      mealType: ['dinner'],
      createdById: user.id,
    },
  });

  // Recipe 2: Baked Beef Tenderloin with Garlic-Mustard Crust (French)
  const recipe2 = await prisma.recipe.create({
    data: {
      title: 'Baked Beef Tenderloin with Garlic-Mustard Crust (French)',
      description: 'Lean beef tenderloin baked with a crisp garlic-mustard crust and a luxurious red wine pan sauce for a rich, savory dinner.',
      instructions: [
        'Step 1: Preheat oven to 425°F. Pat the beef tenderloin dry and season with salt and pepper.',
        'Step 2: In a small bowl, mix minced garlic, mustard, olive oil, and thyme to form a paste. Rub the paste evenly over the surface of the beef.',
        'Step 3: Sear the tenderloin in a hot skillet 2 minutes per side to form a crust, then transfer to a roasting pan.',
        'Step 4: Roast in the oven for 15-20 minutes for medium-rare, or until a thermometer reads 125-130°F. Remove from oven and let rest 10 minutes.',
        'Step 5: While the beef rests, prepare the pan sauce: In the same skillet, melt butter over medium heat. Add minced shallot and sauté until translucent. Deglaze with red wine, scraping up browned bits.',
        'Step 6: Add beef stock and simmer 5 minutes. Stir in heavy cream and simmer until slightly thickened. Adjust seasoning with salt and pepper to taste.',
        'Step 7: Slice beef tenderloin and serve with the garlic-mustard crust and red wine pan sauce.',
        'Step 8: Optional: spoon extra sauce over slices and garnish with thyme leaves for presentation.',
      ],
      prepTime: 15,
      cookTime: 30,
      servings: 4,
      calories: 420,
      protein: 40,
      carbs: 8,
      fat: 25,
      isPublic: true,
      isAiGenerated: false,
      mealType: ['dinner'],
      createdById: user.id,
    },
  });

  // Recipe 3: Pan-Seared Tofu with Sesame-Ginger Glaze
  const recipe3 = await prisma.recipe.create({
    data: {
      title: 'Pan-Seared Tofu with Sesame-Ginger Glaze',
      description: 'Crisp-tender tofu pan-seared and lacquered in a salty-sweet sesame-ginger glaze for a savory, comforting Asian-inspired plate.',
      instructions: [
        'Press the tofu between clean towels or paper towels to remove excess moisture for 10 minutes.',
        'Cut tofu into 1-inch thick slices or rectangles for even searing.',
        'Season tofu lightly with salt.',
        'Heat a large nonstick skillet over medium-high heat and add 1 tablespoon of neutral oil. Sear tofu until golden on both sides, about 2-3 minutes per side. Remove from pan and set aside.',
        'In the same pan, add sesame seeds and toast 1 minute until fragrant. Return tofu to the pan.',
        'In a small bowl whisk together soy sauce, rice vinegar, honey, grated ginger, garlic, sesame oil, cornstarch, and water until smooth.',
        'Pour glaze into the pan with tofu. Simmer gently, turning tofu to coat evenly, until the glaze thickens and becomes glossy, about 2-3 minutes.',
        'Garnish with chopped green onions and additional sesame seeds if desired.',
      ],
      prepTime: 15,
      cookTime: 15,
      servings: 4,
      calories: 350,
      protein: 20,
      carbs: 20,
      fat: 14,
      isPublic: true,
      isAiGenerated: false,
      mealType: ['dinner'],
      createdById: user.id,
    },
  });

  // Recipe 4: Tofu Stir-Fry with Ginger-Soy Glaze
  const recipe4 = await prisma.recipe.create({
    data: {
      title: 'Tofu Stir-Fry with Ginger-Soy Glaze',
      description: 'Firm tofu stir-fried with crisp vegetables in a gingery soy glaze for a savory, aromatic Asian-inspired dish.',
      instructions: [
        'Step 1: Press the tofu to remove excess moisture, then cut into 1-inch cubes.',
        'Step 2: In a small bowl, whisk together soy sauce, brown sugar, cornstarch, and water to make the ginger-soy glaze.',
        'Step 3: Heat sesame oil in a large skillet over medium-high heat. Add tofu cubes and cook until golden on all sides, about 6–8 minutes. Remove tofu and set aside.',
        'Step 4: In the same skillet, add minced garlic and grated ginger; sauté 30 seconds until fragrant.',
        'Step 5: Add broccoli, bell pepper, and carrot; stir-fry for 4–5 minutes until vegetables are crisp-tender.',
        'Step 6: Return tofu to the skillet. Pour in the glaze and toss to coat. Cook 1–2 minutes until sauce thickens and glossy.',
        'Step 7: Remove from heat and serve hot with steamed rice or noodles, if desired.',
      ],
      prepTime: 15,
      cookTime: 15,
      servings: 4,
      calories: 420,
      protein: 22,
      carbs: 40,
      fat: 18,
      isPublic: true,
      isAiGenerated: false,
      mealType: ['dinner'],
      createdById: user.id,
    },
  });

  // Recipe 5: Pan-Seared Chicken Thighs with Smoky Paprika Glaze
  const recipe5 = await prisma.recipe.create({
    data: {
      title: 'Pan-Seared Chicken Thighs with Smoky Paprika Glaze',
      description: 'Succulent chicken thighs seared and glazed with smoky paprika and honey for a savory, slightly sweet finish.',
      instructions: [
        'Pat dry the chicken thighs and season with salt, pepper, and half of the smoked paprika.',
        'Heat olive oil in a heavy skillet over medium-high heat. Add the chicken thighs skin-side down and cook until deeply golden and crisp, about 6-8 minutes. Flip and cook until the internal temperature reaches 165°F (74°C), about 5-7 minutes more.',
        'Meanwhile, whisk together honey, remaining smoked paprika, garlic powder, and apple cider vinegar in a small bowl to make the glaze.',
        'Pour the glaze over the chicken in the pan during the last 2 minutes of cooking and spoon it over the thighs to coat evenly. Allow the glaze to reduce slightly and glossy, 1-2 minutes.',
        'Remove from heat and let rest for 2 minutes before serving.',
      ],
      prepTime: 15,
      cookTime: 20,
      servings: 4,
      calories: 520,
      protein: 40,
      carbs: 10,
      fat: 28,
      isPublic: true,
      isAiGenerated: false,
      mealType: ['dinner'],
      createdById: user.id,
    },
  });

  // Recipe 6: Grilled Salmon with Lemon-Dill Butter (variant, serves 2)
  const recipe6 = await prisma.recipe.create({
    data: {
      title: 'Grilled Salmon with Lemon-Dill Butter',
      description: 'Juicy salmon grilled to perfection and finished with a bright lemon-dill butter for a tangy, herbaceous profile.',
      instructions: [
        'Preheat the grill to medium-high heat.',
        'Brush the salmon fillet with olive oil and season with salt and black pepper on both sides.',
        'Grill the salmon for about 4-5 minutes per side, until just opaque and flaky.',
        'Meanwhile, in a small pan, melt butter over low heat; stir in lemon juice, lemon zest, and chopped dill to make the lemon-dill butter.',
        'Remove the salmon from the grill, spoon the lemon-dill butter over the top, and serve immediately.',
      ],
      prepTime: 15,
      cookTime: 15,
      servings: 2,
      calories: 580,
      protein: 34,
      carbs: 3,
      fat: 40,
      isPublic: true,
      isAiGenerated: false,
      mealType: ['dinner'],
      createdById: user.id,
    },
  });

  console.log('  Created 6 recipes');

  // ============================================
  // 4. Create recipe ingredients (links)
  // ============================================
  const recipeIngredients = [
    // Recipe 1: Grilled Salmon with Lemon Dill Butter
    { recipeId: recipe1.id, ingredientName: 'salmon fillet', amount: 24, unit: 'oz', sortOrder: 0 },
    { recipeId: recipe1.id, ingredientName: 'olive oil', amount: 2, unit: 'tbsp', sortOrder: 1 },
    { recipeId: recipe1.id, ingredientName: 'salt', amount: 0.5, unit: 'tsp', sortOrder: 2 },
    { recipeId: recipe1.id, ingredientName: 'black pepper', amount: 0.25, unit: 'tsp', sortOrder: 3 },
    { recipeId: recipe1.id, ingredientName: 'lemon juice', amount: 1, unit: 'tbsp', sortOrder: 4 },
    { recipeId: recipe1.id, ingredientName: 'lemon zest', amount: 1, unit: 'tsp', sortOrder: 5 },
    { recipeId: recipe1.id, ingredientName: 'butter', amount: 2, unit: 'tbsp', sortOrder: 6 },
    { recipeId: recipe1.id, ingredientName: 'dill', amount: 1, unit: 'tbsp', sortOrder: 7 },

    // Recipe 2: Baked Beef Tenderloin
    { recipeId: recipe2.id, ingredientName: 'beef tenderloin', amount: 2.5, unit: 'lb', sortOrder: 0 },
    { recipeId: recipe2.id, ingredientName: 'olive oil', amount: 2, unit: 'tbsp', sortOrder: 1 },
    { recipeId: recipe2.id, ingredientName: 'garlic', amount: 3, unit: 'clove', sortOrder: 2 },
    { recipeId: recipe2.id, ingredientName: 'mustard', amount: 1, unit: 'tbsp', sortOrder: 3 },
    { recipeId: recipe2.id, ingredientName: 'thyme', amount: 1, unit: 'sprig', sortOrder: 4 },
    { recipeId: recipe2.id, ingredientName: 'sea salt', amount: 1, unit: 'tsp', sortOrder: 5 },
    { recipeId: recipe2.id, ingredientName: 'black pepper', amount: 0.5, unit: 'tsp', sortOrder: 6 },
    { recipeId: recipe2.id, ingredientName: 'butter', amount: 2, unit: 'tbsp', sortOrder: 7 },
    { recipeId: recipe2.id, ingredientName: 'red wine', amount: 1, unit: 'cup', sortOrder: 8 },
    { recipeId: recipe2.id, ingredientName: 'beef stock', amount: 0.5, unit: 'cup', sortOrder: 9 },
    { recipeId: recipe2.id, ingredientName: 'shallot', amount: 1, unit: 'piece', sortOrder: 10 },
    { recipeId: recipe2.id, ingredientName: 'heavy cream', amount: 0.25, unit: 'cup', sortOrder: 11 },

    // Recipe 3: Pan-Seared Tofu with Sesame-Ginger Glaze
    { recipeId: recipe3.id, ingredientName: 'tofu', amount: 14, unit: 'oz', sortOrder: 0 },
    { recipeId: recipe3.id, ingredientName: 'neutral oil', amount: 1, unit: 'tbsp', sortOrder: 1 },
    { recipeId: recipe3.id, ingredientName: 'sesame seeds, toasted', amount: 1, unit: 'tbsp', sortOrder: 2 },
    { recipeId: recipe3.id, ingredientName: 'soy sauce', amount: 3, unit: 'tbsp', sortOrder: 3 },
    { recipeId: recipe3.id, ingredientName: 'rice vinegar', amount: 1, unit: 'tbsp', sortOrder: 4 },
    { recipeId: recipe3.id, ingredientName: 'honey', amount: 1, unit: 'tbsp', sortOrder: 5 },
    { recipeId: recipe3.id, ingredientName: 'ginger, grated', amount: 1, unit: 'tbsp', sortOrder: 6 },
    { recipeId: recipe3.id, ingredientName: 'garlic', amount: 2, unit: 'clove', sortOrder: 7 },
    { recipeId: recipe3.id, ingredientName: 'sesame oil', amount: 1, unit: 'tsp', sortOrder: 8 },
    { recipeId: recipe3.id, ingredientName: 'cornstarch', amount: 1, unit: 'tsp', sortOrder: 9 },
    { recipeId: recipe3.id, ingredientName: 'water', amount: 1, unit: 'tbsp', sortOrder: 10 },
    { recipeId: recipe3.id, ingredientName: 'salt', amount: 0.5, unit: 'tsp', sortOrder: 11 },
    { recipeId: recipe3.id, ingredientName: 'green onion', amount: 2, unit: 'count', sortOrder: 12 },

    // Recipe 4: Tofu Stir-Fry with Ginger-Soy Glaze
    { recipeId: recipe4.id, ingredientName: 'tofu', amount: 14, unit: 'oz', sortOrder: 0 },
    { recipeId: recipe4.id, ingredientName: 'broccoli', amount: 2, unit: 'cup', sortOrder: 1 },
    { recipeId: recipe4.id, ingredientName: 'bell pepper', amount: 1, unit: 'piece', sortOrder: 2 },
    { recipeId: recipe4.id, ingredientName: 'carrot', amount: 1, unit: 'piece', sortOrder: 3 },
    { recipeId: recipe4.id, ingredientName: 'garlic', amount: 2, unit: 'clove', sortOrder: 4 },
    { recipeId: recipe4.id, ingredientName: 'ginger', amount: 1, unit: 'tbsp', sortOrder: 5 },
    { recipeId: recipe4.id, ingredientName: 'soy sauce', amount: 3, unit: 'tbsp', sortOrder: 6 },
    { recipeId: recipe4.id, ingredientName: 'sesame oil', amount: 1, unit: 'tsp', sortOrder: 7 },
    { recipeId: recipe4.id, ingredientName: 'brown sugar', amount: 1, unit: 'tbsp', sortOrder: 8 },
    { recipeId: recipe4.id, ingredientName: 'cornstarch', amount: 1, unit: 'tbsp', sortOrder: 9 },
    { recipeId: recipe4.id, ingredientName: 'water', amount: 2, unit: 'tbsp', sortOrder: 10 },

    // Recipe 5: Pan-Seared Chicken Thighs with Smoky Paprika Glaze
    { recipeId: recipe5.id, ingredientName: 'chicken thigh', amount: 4, unit: 'piece', sortOrder: 0 },
    { recipeId: recipe5.id, ingredientName: 'olive oil', amount: 2, unit: 'tbsp', sortOrder: 1 },
    { recipeId: recipe5.id, ingredientName: 'salt', amount: 0.5, unit: 'tsp', sortOrder: 2 },
    { recipeId: recipe5.id, ingredientName: 'black pepper', amount: 0.25, unit: 'tsp', sortOrder: 3 },
    { recipeId: recipe5.id, ingredientName: 'smoked paprika', amount: 1, unit: 'tbsp', sortOrder: 4 },
    { recipeId: recipe5.id, ingredientName: 'honey', amount: 1, unit: 'tbsp', sortOrder: 5 },
    { recipeId: recipe5.id, ingredientName: 'garlic powder', amount: 0.5, unit: 'tsp', sortOrder: 6 },
    { recipeId: recipe5.id, ingredientName: 'apple cider vinegar', amount: 1, unit: 'tsp', sortOrder: 7 },

    // Recipe 6: Grilled Salmon with Lemon-Dill Butter (serves 2)
    { recipeId: recipe6.id, ingredientName: 'salmon fillet', amount: 6, unit: 'oz', sortOrder: 0 },
    { recipeId: recipe6.id, ingredientName: 'olive oil', amount: 1, unit: 'tbsp', sortOrder: 1 },
    { recipeId: recipe6.id, ingredientName: 'salt', amount: 0.5, unit: 'tsp', sortOrder: 2 },
    { recipeId: recipe6.id, ingredientName: 'black pepper', amount: 0.25, unit: 'tsp', sortOrder: 3 },
    { recipeId: recipe6.id, ingredientName: 'lemon juice', amount: 1, unit: 'tbsp', sortOrder: 4 },
    { recipeId: recipe6.id, ingredientName: 'butter', amount: 2, unit: 'tbsp', sortOrder: 5 },
    { recipeId: recipe6.id, ingredientName: 'lemon zest', amount: 1, unit: 'tsp', sortOrder: 6 },
    { recipeId: recipe6.id, ingredientName: 'dill', amount: 1, unit: 'tbsp', sortOrder: 7 },
  ];

  for (const ri of recipeIngredients) {
    const ingredientId = ingredients[ri.ingredientName];
    if (!ingredientId) {
      console.warn(`  WARNING: Ingredient "${ri.ingredientName}" not found, skipping`);
      continue;
    }
    await prisma.recipeIngredient.create({
      data: {
        recipeId: ri.recipeId,
        ingredientId,
        amount: ri.amount,
        unit: ri.unit,
        notes: '',
        sortOrder: ri.sortOrder,
      },
    });
  }
  console.log(`  Created ${recipeIngredients.length} recipe-ingredient links`);

  // ============================================
  // 5. Create meal plans with slots
  // ============================================
  await prisma.mealPlan.create({
    data: {
      userId: user.id,
      name: 'Sample Meal Plan - Week 1',
      startDate: new Date(),
      endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      mealsPerDay: 1,
      isActive: true,
      mealSlots: {
        create: [
          { recipeId: recipe1.id, dayOfWeek: 6, mealType: 'dinner', date: new Date(), sortOrder: 0 },
          { recipeId: recipe2.id, dayOfWeek: 0, mealType: 'dinner', date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), sortOrder: 0 },
          { recipeId: recipe3.id, dayOfWeek: 1, mealType: 'dinner', date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), sortOrder: 0 },
        ],
      },
    },
  });

  await prisma.mealPlan.create({
    data: {
      userId: user.id,
      name: 'Sample Meal Plan - Week 2',
      startDate: new Date(),
      endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      mealsPerDay: 1,
      isActive: true,
      mealSlots: {
        create: [
          { recipeId: recipe6.id, dayOfWeek: 6, mealType: 'dinner', date: new Date(), sortOrder: 0 },
          { recipeId: recipe5.id, dayOfWeek: 0, mealType: 'dinner', date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), sortOrder: 0 },
          { recipeId: recipe4.id, dayOfWeek: 1, mealType: 'dinner', date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), sortOrder: 0 },
        ],
      },
    },
  });
  console.log('  Created 2 meal plans with 6 meal slots');

  // ============================================
  // 6. Create user preference
  // ============================================
  await prisma.userPreference.create({
    data: {
      userId: user.id,
      key: 'lifestyle_days_to_plan',
      label: 'Days to Plan',
      category: 'lifestyle',
      value: 3,
      controlType: 'slider',
      controlConfig: { max: 14, min: 1, step: 1, unit: 'days' },
      sortOrder: 1,
      isActive: true,
      isPinned: false,
      timesUsed: 1,
    },
  });
  console.log('  Created user preferences');

  // ============================================
  // 7. Seed ingredient comparisons cache
  //    (saves AI API calls on fresh installs)
  // ============================================
  const ingredientNames = [
    'apple cider vinegar', 'bell pepper', 'black pepper', 'broccoli', 'brown sugar',
    'butter', 'carrot', 'chicken thigh', 'cornstarch', 'dill',
    'garlic', 'garlic powder', 'ginger', 'honey', 'lemon juice',
    'lemon zest', 'olive oil', 'salmon fillet', 'salt', 'sesame oil',
    'smoked paprika', 'soy sauce', 'tofu', 'water',
  ];

  // Generate all pairwise "different" comparisons, then override the one "similar" pair
  const comparisons: { ingredient1: string; ingredient2: string; status: string }[] = [];
  for (let i = 0; i < ingredientNames.length; i++) {
    for (let j = i + 1; j < ingredientNames.length; j++) {
      const a = ingredientNames[i];
      const b = ingredientNames[j];
      // brown sugar + honey are "similar", everything else is "different"
      const status = (a === 'brown sugar' && b === 'honey') ? 'similar' : 'different';
      comparisons.push({ ingredient1: a, ingredient2: b, status });
    }
  }

  // Batch create for performance
  await prisma.ingredientComparison.createMany({ data: comparisons, skipDuplicates: true });
  console.log(`  Created ${comparisons.length} ingredient comparisons`);

  console.log('');
  console.log('Seeding complete!');
  console.log('');
  console.log('Default test account:');
  console.log(`  Email:    ${DEFAULT_USER_EMAIL}`);
  console.log('  Password: password123');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
