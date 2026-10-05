import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// A standalone script run via the CLI (see prisma.config.ts's
// migrations.seed and package.json's "seed" script), not part of the
// running app - so it builds its own short-lived PrismaClient rather than
// importing src/lib/prisma.ts's long-lived singleton.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * The initial industry list. `sortOrder` is seeded in steps of 10 so a new
 * industry can be inserted between two existing ones later (via the admin
 * screen) without renumbering everything else. Upserted by `slug`, so
 * re-running this script (e.g. after adding a row here) is always safe -
 * it never duplicates or overwrites an admin's later edits to `name` or
 * `isActive` for an industry that already exists.
 */
const INDUSTRIES: ReadonlyArray<{ name: string; slug: string }> = [
  { name: 'Textiles & Fabrics', slug: 'textiles-fabrics' },
  { name: 'Garments & Apparel', slug: 'garments-apparel' },
  { name: 'Yarn & Fibers', slug: 'yarn-fibers' },
  { name: 'Hosiery & Knitwear', slug: 'hosiery-knitwear' },
  { name: 'Steel & Metal Products', slug: 'steel-metal-products' },
  { name: 'Iron & Foundry', slug: 'iron-foundry' },
  { name: 'Industrial Machinery & Equipment', slug: 'industrial-machinery-equipment' },
  { name: 'Hardware & Tools', slug: 'hardware-tools' },
  { name: 'Electrical Equipment', slug: 'electrical-equipment' },
  { name: 'Food & Beverages', slug: 'food-beverages' },
  { name: 'Agricultural Produce', slug: 'agricultural-produce' },
  { name: 'Spices & Condiments', slug: 'spices-condiments' },
  { name: 'Packaged & Processed Foods', slug: 'packaged-processed-foods' },
  { name: 'Dairy Products', slug: 'dairy-products' },
  { name: 'Chemicals & Dyes', slug: 'chemicals-dyes' },
  { name: 'Plastics & Polymers', slug: 'plastics-polymers' },
  { name: 'Paints & Coatings', slug: 'paints-coatings' },
  { name: 'Pharmaceuticals', slug: 'pharmaceuticals' },
  { name: 'Building Materials', slug: 'building-materials' },
  { name: 'Furniture & Woodwork', slug: 'furniture-woodwork' },
  { name: 'Ceramics & Tiles', slug: 'ceramics-tiles' },
  { name: 'Paper & Packaging', slug: 'paper-packaging' },
  { name: 'Electronics & Electricals', slug: 'electronics-electricals' },
  { name: 'Computer Hardware & IT Equipment', slug: 'computer-hardware-it-equipment' },
  { name: 'FMCG & Consumer Goods', slug: 'fmcg-consumer-goods' },
  { name: 'Cosmetics & Personal Care', slug: 'cosmetics-personal-care' },
  { name: 'Jewellery & Gems', slug: 'jewellery-gems' },
  { name: 'Leather & Footwear', slug: 'leather-footwear' },
  { name: 'Automobiles & Auto Parts', slug: 'automobiles-auto-parts' },
  { name: 'Other', slug: 'other' },
];

async function main(): Promise<void> {
  for (const [index, industry] of INDUSTRIES.entries()) {
    await prisma.industry.upsert({
      where: { slug: industry.slug },
      create: { ...industry, sortOrder: (index + 1) * 10 },
      // Never overwrite name/sortOrder on re-run - an admin may have already
      // renamed or reordered this row via the management screen.
      update: {},
    });
  }
  // console.log is disallowed by this project's lint rule (see eslint.config.js) -
  // console.error is the established convention for CLI script output here (see
  // scripts/create-admin.ts), even for a non-error status line like this one.
  console.error(`Seeded ${INDUSTRIES.length} industries (existing rows left untouched).`);
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
