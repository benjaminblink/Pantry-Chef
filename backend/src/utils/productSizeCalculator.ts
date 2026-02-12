// Product size calculator for determining package quantities
import { convertToPounds, convertToCups, getUnitType } from './unitConversion.js';

export interface ProductSize {
  amount: number;
  unit: string;
  originalSize: string;
}

export interface QuantityCalculation {
  packageCount: number;
  packageSize: string;
  totalAmount: number;
  totalUnit: string;
  requiredAmount: number;
  requiredUnit: string;
}

/**
 * Parse a product size string from Walmart
 * Examples: "16 oz", "1 lb", "2.5 lbs", "32 fl oz", "1 gallon", "12 count"
 */
export function parseProductSize(sizeString: string): ProductSize | null {
  if (!sizeString) return null;

  const cleaned = sizeString.toLowerCase().trim();

  const patterns = [
    { regex: /(\d+\.?\d*)\s*(oz|ounce|ounces)/i, unit: 'oz' },
    { regex: /(\d+\.?\d*)\s*(lb|lbs|pound|pounds)/i, unit: 'lbs' },
    { regex: /(\d+\.?\d*)\s*(g|gram|grams)/i, unit: 'g' },
    { regex: /(\d+\.?\d*)\s*(kg|kilogram|kilograms)/i, unit: 'kg' },
    { regex: /(\d+\.?\d*)\s*(fl\.?\s*oz|fluid\s*ounce|fluid\s*ounces)/i, unit: 'fl oz' },
    { regex: /(\d+\.?\d*)\s*(cup|cups)/i, unit: 'cup' },
    { regex: /(\d+\.?\d*)\s*(qt|quart|quarts)/i, unit: 'quart' },
    { regex: /(\d+\.?\d*)\s*(gal|gallon|gallons)/i, unit: 'gallon' },
    { regex: /(\d+\.?\d*)\s*(ml|milliliter|milliliters)/i, unit: 'ml' },
    { regex: /(\d+\.?\d*)\s*(l|liter|liters)/i, unit: 'liter' },
    { regex: /(\d+\.?\d*)\s*(ct|count)/i, unit: 'count' },
    { regex: /(\d+\.?\d*)\s*pack/i, unit: 'count' },
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern.regex);
    if (match) {
      const amount = parseFloat(match[1]);
      return {
        amount,
        unit: pattern.unit,
        originalSize: sizeString,
      };
    }
  }

  return null;
}

/**
 * Calculate how many packages are needed to meet the required amount
 */
export function calculatePackageQuantity(
  requiredAmount: number,
  requiredUnit: string,
  packageSize: ProductSize
): QuantityCalculation {
  const requiredType = getUnitType(requiredUnit);
  const packageType = getUnitType(packageSize.unit);

  if (requiredType !== packageType) {
    return {
      packageCount: 1,
      packageSize: packageSize.originalSize,
      totalAmount: packageSize.amount,
      totalUnit: packageSize.unit,
      requiredAmount,
      requiredUnit,
    };
  }

  let packageCount = 1;

  if (requiredType === 'weight') {
    const requiredPounds = convertToPounds(requiredAmount, requiredUnit);
    const packagePounds = convertToPounds(packageSize.amount, packageSize.unit);

    packageCount = Math.ceil(requiredPounds / packagePounds);
  } else if (requiredType === 'volume') {
    const requiredCups = convertToCups(requiredAmount, requiredUnit);
    const packageCups = convertToCups(packageSize.amount, packageSize.unit);

    packageCount = Math.ceil(requiredCups / packageCups);
  } else {
    packageCount = Math.ceil(requiredAmount);
  }

  packageCount = Math.max(1, packageCount);

  return {
    packageCount,
    packageSize: packageSize.originalSize,
    totalAmount: packageSize.amount * packageCount,
    totalUnit: packageSize.unit,
    requiredAmount,
    requiredUnit,
  };
}

/**
 * Format a quantity calculation for display
 */
export function formatQuantityDisplay(calc: QuantityCalculation): string {
  return `${calc.packageCount}× ${calc.packageSize}`;
}
