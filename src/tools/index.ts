/**
 * Master registration entrypoint.
 *
 * Cada tool exporta `register(): void` e e chamada aqui.
 * Total esperado: 40 tools (7+5+6+4+3+5+4+6).
 */

// Performance (7)
import { register as regGetRevenue } from './performance/get-revenue.js';
import { register as regGetAov } from './performance/get-aov.js';
import { register as regGetOrdersCount } from './performance/get-orders-count.js';
import { register as regGetConversionRate } from './performance/get-conversion-rate.js';
import { register as regGetLtvByCohort } from './performance/get-ltv-by-cohort.js';
import { register as regGetRepeatPurchaseRate } from './performance/get-repeat-purchase-rate.js';
import { register as regGetRevenueConcentrationIndex } from './performance/get-revenue-concentration-index.js';

// CRO (5)
import { register as regGetFunnelMetrics } from './cro/get-funnel-metrics.js';
import { register as regGetCartAbandonment } from './cro/get-cart-abandonment.js';
import { register as regGetCheckoutDropoff } from './cro/get-checkout-dropoff.js';
import { register as regGetSessionQuality } from './cro/get-session-quality.js';
import { register as regGetLandingPagePerformance } from './cro/get-landing-page-performance.js';

export function registerAllTools(): void {
  // Performance
  regGetRevenue();
  regGetAov();
  regGetOrdersCount();
  regGetConversionRate();
  regGetLtvByCohort();
  regGetRepeatPurchaseRate();
  regGetRevenueConcentrationIndex();

  // CRO
  regGetFunnelMetrics();
  regGetCartAbandonment();
  regGetCheckoutDropoff();
  regGetSessionQuality();
  regGetLandingPagePerformance();

  // Tarefas 5-7 vao popular as outras 28 tools
}
