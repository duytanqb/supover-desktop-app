/**
 * Parser Service — parse listing data FROM HTML FILES (not from live DOM).
 * Requires cheerio package: npm install cheerio
 *
 * Uses multiple strategies to extract listings from Etsy HTML:
 *   Strategy 1: data-listing-id / data-listing-card-v2 attributes
 *   Strategy 2: JSON-LD / __INITIAL_STATE__ structured data
 *   Strategy 3: CSS selectors for listing card elements
 *   Strategy 4: Regex fallback for listing IDs
 *
 * Reference: /reference/etsy-spy/scripts/etsy_search.py _extract_listing_details()
 */

import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface ListingFromParse {
  etsyListingId: string;
  title: string;
  price: number | null;
  salePrice: number | null;
  currency: string;
  imageUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  isBestseller: boolean;
  isAd: boolean;
  isFreeShipping: boolean;
  shopName?: string;
  position: number;
}

export interface ShopIndexData {
  shopInfo: {
    shopName: string;
    totalSales?: number;
    totalReviews?: number;
  };
  listings: ListingFromParse[];
}

export interface SearchIndexData {
  keyword: string;
  page: number;
  listings: ListingFromParse[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parsePrice(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.,]/g, '').replace(',', '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseNumber(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function deduplicateListings(listings: ListingFromParse[]): ListingFromParse[] {
  const seen = new Map<string, ListingFromParse>();
  for (const listing of listings) {
    const existing = seen.get(listing.etsyListingId);
    if (!existing) {
      seen.set(listing.etsyListingId, listing);
    } else {
      // Merge: prefer the entry with more data
      if (!existing.title && listing.title) existing.title = listing.title;
      if (existing.price === null && listing.price !== null) existing.price = listing.price;
      if (!existing.imageUrl && listing.imageUrl) existing.imageUrl = listing.imageUrl;
      if (!existing.shopName && listing.shopName) existing.shopName = listing.shopName;
    }
  }
  return Array.from(seen.values());
}

// ─── Strategy 1: data-listing-id attribute ─────────────────────────────────────

function parseByDataAttribute($: cheerio.CheerioAPI): ListingFromParse[] {
  const listings: ListingFromParse[] = [];
  let position = 0;

  // Elements with data-listing-id (main strategy from reference Python code)
  $('[data-listing-id]').each((_i, el) => {
    const $el = $(el);
    const listingId = $el.attr('data-listing-id');
    if (!listingId || !/^\d{6,}$/.test(listingId)) return;

    position++;

    // Title: try multiple selectors (reference: h3.v2-listing-card__title)
    const titleEl =
      $el.find('h3.v2-listing-card__title').first() ||
      $el.find('h3').first() ||
      $el.find('.v2-listing-card__info h3').first() ||
      $el.find('.listing-card .listing-title').first();
    const title = titleEl.text().trim();

    // Price
    const priceEl =
      $el.find('.currency-value').first() ||
      $el.find('span[data-currency-value]').first() ||
      $el.find('.lc-price').first();
    const price = parsePrice(
      priceEl.attr('data-currency-value') || priceEl.text()
    );

    // Sale price (original price when on sale)
    const salePriceEl = $el.find('.sale-price .currency-value').first();
    const salePrice = parsePrice(
      salePriceEl.attr('data-currency-value') || salePriceEl.text()
    );

    // Currency
    const currency = $el.find('.currency-symbol').text().trim() === '$' ? 'USD' : 'USD';

    // Image (reference: card.querySelector('img') || card.querySelector('source'))
    const imgEl = $el.find('img').first();
    let imageUrl = imgEl.attr('src') || null;
    if (!imageUrl) {
      const srcset = imgEl.attr('srcset') || $el.find('source').first().attr('srcset');
      if (srcset) {
        imageUrl = srcset.split(',')[0].trim().split(' ')[0];
      }
    }

    // Rating
    const ratingEl = $el.find('[data-rating]').first();
    const rating = parseNumber(ratingEl.attr('data-rating'));

    // Review count
    const reviewText = $el.find('.review-count').text() ||
      $el.find('[aria-label*="star"]').text();
    const reviewCount = parseNumber(reviewText);

    // Bestseller
    const isBestseller =
      $el.find('.bestseller-badge').length > 0 ||
      $el.text().toLowerCase().includes('bestseller');

    // Ad
    const isAd =
      $el.find('.promoted-tag').length > 0 ||
      $el.attr('data-is-ad') === 'true' ||
      $el.find('[data-is-ad]').length > 0;

    // Free shipping
    const isFreeShipping =
      $el.text().toLowerCase().includes('free shipping');

    // Shop name
    const shopName =
      $el.find('.v2-listing-card__shop').text().trim() ||
      $el.find('.shop-name').text().trim() ||
      undefined;

    listings.push({
      etsyListingId: listingId,
      title,
      price,
      salePrice,
      currency,
      imageUrl,
      rating,
      reviewCount,
      isBestseller,
      isAd,
      isFreeShipping,
      shopName,
      position,
    });
  });

  return listings;
}

// ─── Strategy 2: JSON-LD / __INITIAL_STATE__ ──────────────────────────────────

function parseByStructuredData($: cheerio.CheerioAPI): ListingFromParse[] {
  const listings: ListingFromParse[] = [];

  // Try JSON-LD
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const json = JSON.parse($(el).html() || '{}');

      // ItemList format
      if (json['@type'] === 'ItemList' && Array.isArray(json.itemListElement)) {
        json.itemListElement.forEach((item: any, index: number) => {
          const product = item.item || item;
          const urlMatch = product.url?.match(/listing\/(\d{6,})/);
          if (!urlMatch) return;

          listings.push({
            etsyListingId: urlMatch[1],
            title: product.name || '',
            price: parsePrice(product.offers?.price?.toString()),
            salePrice: null,
            currency: product.offers?.priceCurrency || 'USD',
            imageUrl: product.image || null,
            rating: parseNumber(product.aggregateRating?.ratingValue?.toString()),
            reviewCount: parseNumber(product.aggregateRating?.reviewCount?.toString()),
            isBestseller: false,
            isAd: false,
            isFreeShipping: false,
            position: item.position || index + 1,
          });
        });
      }

      // Product format
      if (json['@type'] === 'Product') {
        const urlMatch = json.url?.match(/listing\/(\d{6,})/);
        if (urlMatch) {
          listings.push({
            etsyListingId: urlMatch[1],
            title: json.name || '',
            price: parsePrice(json.offers?.price?.toString()),
            salePrice: null,
            currency: json.offers?.priceCurrency || 'USD',
            imageUrl: json.image || null,
            rating: null,
            reviewCount: null,
            isBestseller: false,
            isAd: false,
            isFreeShipping: false,
            position: 0,
          });
        }
      }
    } catch {
      // Skip unparseable JSON-LD blocks
    }
  });

  // Try window.__INITIAL_STATE__
  $('script').each((_i, el) => {
    const text = $(el).html() || '';
    const stateMatch = text.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});?\s*(?:<\/script>|$)/s);
    if (!stateMatch) return;

    try {
      const state = JSON.parse(stateMatch[1]);

      // Look for listings in various possible paths
      const listingData =
        state?.listings?.data ||
        state?.search?.listings ||
        state?.shopListings?.data;

      if (Array.isArray(listingData)) {
        listingData.forEach((item: any, index: number) => {
          const id = item.listing_id?.toString() || item.listingId?.toString();
          if (!id || !/^\d{6,}$/.test(id)) return;

          listings.push({
            etsyListingId: id,
            title: item.title || '',
            price: parsePrice(item.price?.amount?.toString() || item.price?.toString()),
            salePrice: null,
            currency: item.price?.currency || 'USD',
            imageUrl: item.Images?.[0]?.url_570xN || item.image_url || null,
            rating: item.rating || null,
            reviewCount: item.num_favorers || null,
            isBestseller: false,
            isAd: item.is_ad || false,
            isFreeShipping: false,
            position: index + 1,
          });
        });
      }
    } catch {
      // Skip unparseable state blocks
    }
  });

  return listings;
}

// ─── Strategy 3: CSS selectors for listing cards ──────────────────────────────

function parseByCssSelectors($: cheerio.CheerioAPI): ListingFromParse[] {
  const listings: ListingFromParse[] = [];
  let position = 0;

  // Common card selectors
  const cardSelectors = [
    '.v2-listing-card',
    '.listing-link',
    '.listing-card',
    '[data-listing-card-v2]',
  ];

  for (const selector of cardSelectors) {
    $(selector).each((_i, el) => {
      const $el = $(el);

      // Try to find listing ID from link href
      const href = $el.attr('href') || $el.find('a').first().attr('href') || '';
      const idMatch = href.match(/listing\/(\d{6,})/);
      const listingId = idMatch
        ? idMatch[1]
        : $el.attr('data-listing-id') || $el.closest('[data-listing-id]').attr('data-listing-id');

      if (!listingId || !/^\d{6,}$/.test(listingId)) return;

      position++;

      const title =
        $el.find('h3').first().text().trim() ||
        $el.find('.listing-title').text().trim() ||
        $el.attr('title') ||
        '';

      const priceText =
        $el.find('.currency-value').first().text() ||
        $el.find('span[data-currency-value]').first().attr('data-currency-value') ||
        $el.find('.lc-price').first().text() ||
        '';

      const imgEl = $el.find('img').first();
      let imageUrl = imgEl.attr('src') || null;
      if (!imageUrl) {
        const srcset = imgEl.attr('srcset');
        if (srcset) imageUrl = srcset.split(',')[0].trim().split(' ')[0];
      }

      const shopName =
        $el.find('.v2-listing-card__shop').text().trim() ||
        $el.find('.shop-name').text().trim() ||
        undefined;

      listings.push({
        etsyListingId: listingId,
        title,
        price: parsePrice(priceText),
        salePrice: null,
        currency: 'USD',
        imageUrl,
        rating: null,
        reviewCount: null,
        isBestseller: $el.text().toLowerCase().includes('bestseller'),
        isAd: $el.find('.promoted-tag').length > 0 || $el.find('[data-is-ad]').length > 0,
        isFreeShipping: $el.text().toLowerCase().includes('free shipping'),
        shopName,
        position,
      });
    });

    // If this selector found results, don't try the next one
    if (listings.length > 0) break;
  }

  return listings;
}

// ─── Strategy 4: Regex fallback ────────────────────────────────────────────────

function parseByRegex(html: string): ListingFromParse[] {
  const ids = new Set<string>();

  // data-listing-id patterns
  const dataIdPattern = /data-listing-id=["']?(\d{6,})/g;
  for (const match of html.matchAll(dataIdPattern)) {
    ids.add(match[1]);
  }

  // /listing/ URL patterns
  const urlPattern = /\/listing\/(\d{6,})/g;
  for (const match of html.matchAll(urlPattern)) {
    ids.add(match[1]);
  }

  let position = 0;
  return Array.from(ids).map((id) => {
    position++;
    return {
      etsyListingId: id,
      title: '',
      price: null,
      salePrice: null,
      currency: 'USD',
      imageUrl: null,
      rating: null,
      reviewCount: null,
      isBestseller: false,
      isAd: false,
      isFreeShipping: false,
      position,
    };
  });
}

// ─── Shop info extraction ──────────────────────────────────────────────────────

function extractShopInfo($: cheerio.CheerioAPI): ShopIndexData['shopInfo'] {
  // Shop name from various possible selectors
  const shopName =
    $('h1.shop-name-and-title-container').text().trim() ||
    $('[data-shop-name]').attr('data-shop-name') ||
    $('h1').first().text().trim() ||
    $('.shop-name').text().trim() ||
    'Unknown Shop';

  // Total sales
  const salesText =
    $('[data-appears-component-name="shop_sales_count"]').text() ||
    $('.shop-sales-count').text() ||
    '';
  const totalSales = parseNumber(salesText.replace(/sales/i, ''));

  // Total reviews
  const reviewsText =
    $('[data-appears-component-name="shop_reviews_count"]').text() ||
    $('.shop-reviews-count').text() ||
    '';
  const totalReviews = parseNumber(reviewsText.replace(/reviews/i, ''));

  return {
    shopName: shopName.replace(/\n/g, ' ').trim(),
    totalSales: totalSales ?? undefined,
    totalReviews: totalReviews ?? undefined,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a shop index page HTML → ShopIndexData.
 * Runs all 4 strategies and merges/deduplicates results.
 */
export function parseShopIndex(html: string): ShopIndexData {
  const $ = cheerio.load(html);

  // Extract shop info from page header
  const shopInfo = extractShopInfo($);

  // Run all strategies
  const strategy1 = parseByDataAttribute($);
  const strategy2 = parseByStructuredData($);
  const strategy3 = parseByCssSelectors($);
  const strategy4 = parseByRegex(html);

  logger.info('Shop index parse strategies', {
    shopName: shopInfo.shopName,
    strategy1: strategy1.length,
    strategy2: strategy2.length,
    strategy3: strategy3.length,
    strategy4: strategy4.length,
  });

  // Merge all results, deduplicate by etsyListingId
  const allListings = [
    ...strategy1,
    ...strategy2,
    ...strategy3,
    ...strategy4,
  ];
  const deduplicated = deduplicateListings(allListings);

  // Re-assign positions based on deduplicated order
  deduplicated.forEach((listing, index) => {
    if (listing.position === 0) listing.position = index + 1;
  });

  logger.info('Shop index parsed', {
    shopName: shopInfo.shopName,
    totalListings: deduplicated.length,
  });

  return {
    shopInfo,
    listings: deduplicated,
  };
}

/**
 * Parse a search index page HTML → SearchIndexData.
 * Similar to shop parsing but also extracts shopName per listing.
 */
export function parseSearchIndex(
  html: string,
  keyword: string,
  page: number = 1
): SearchIndexData {
  const $ = cheerio.load(html);

  // Run all strategies
  const strategy1 = parseByDataAttribute($);
  const strategy2 = parseByStructuredData($);
  const strategy3 = parseByCssSelectors($);
  const strategy4 = parseByRegex(html);

  logger.info('Search index parse strategies', {
    keyword,
    page,
    strategy1: strategy1.length,
    strategy2: strategy2.length,
    strategy3: strategy3.length,
    strategy4: strategy4.length,
  });

  const allListings = [
    ...strategy1,
    ...strategy2,
    ...strategy3,
    ...strategy4,
  ];
  const deduplicated = deduplicateListings(allListings);

  // Re-assign positions
  deduplicated.forEach((listing, index) => {
    if (listing.position === 0) listing.position = index + 1;
  });

  logger.info('Search index parsed', {
    keyword,
    page,
    totalListings: deduplicated.length,
  });

  return {
    keyword,
    page,
    listings: deduplicated,
  };
}

/**
 * Fast extraction of listing IDs from HTML using regex only.
 * No DOM parsing — used for quick ID extraction when full parse is not needed.
 */
export function extractListingIds(html: string): string[] {
  const ids = new Set<string>();

  // data-listing-id patterns
  const dataIdPattern = /data-listing-id=["']?(\d{6,})/g;
  for (const match of html.matchAll(dataIdPattern)) {
    ids.add(match[1]);
  }

  // /listing/ URL patterns
  const urlPattern = /\/listing\/(\d{6,})/g;
  for (const match of html.matchAll(urlPattern)) {
    ids.add(match[1]);
  }

  return Array.from(ids);
}
