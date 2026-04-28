/**
 * Master registration entrypoint.
 *
 * Cada tool exporta `register(): void` e e chamada aqui.
 * Total: 40 tools (7+5+6+4+3+5+4+6).
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

// CRM (6)
import { register as regGetRfmDistribution } from './crm/get-rfm-distribution.js';
import { register as regGetRfmShifts } from './crm/get-rfm-shifts.js';
import { register as regGetAtRiskCustomers } from './crm/get-at-risk-customers.js';
import { register as regGetReactivationCandidates } from './crm/get-reactivation-candidates.js';
import { register as regGetNewVsReturning } from './crm/get-new-vs-returning.js';
import { register as regGetCustomerConcentration } from './crm/get-customer-concentration.js';

// Growth (4)
import { register as regGetRevenueMix } from './growth/get-revenue-mix.js';
import { register as regGetGrowthDecomposition } from './growth/get-growth-decomposition.js';
import { register as regGetAcquisitionBySource } from './growth/get-acquisition-by-source.js';
import { register as regComparePeriods } from './growth/compare-periods.js';

// Regional (3)
import { register as regGetOrdersByState } from './regional/get-orders-by-state.js';
import { register as regGetRegionShareShifts } from './regional/get-region-share-shifts.js';
import { register as regGetStatePerformance } from './regional/get-state-performance.js';

// Products (5)
import { register as regGetTopProducts } from './products/get-top-products.js';
import { register as regGetProductVelocityChanges } from './products/get-product-velocity-changes.js';
import { register as regGetDeadInventory } from './products/get-dead-inventory.js';
import { register as regGetProductSeasonality } from './products/get-product-seasonality.js';
import { register as regGetBasketAnalysis } from './products/get-basket-analysis.js';

// Traffic (4)
import { register as regGetRoasByChannel } from './traffic/get-roas-by-channel.js';
import { register as regGetSpendEfficiency } from './traffic/get-spend-efficiency.js';
import { register as regGetAttributionSummary } from './traffic/get-attribution-summary.js';
import { register as regGetCreativeTopPerformers } from './traffic/get-creative-top-performers.js';

// Cross-cutting (6)
import { register as regQueryAnomalies } from './cross/query-anomalies.js';
import { register as regGetCorrelation } from './cross/get-correlation.js';
import { register as regCohortAnalysis } from './cross/cohort-analysis.js';
import { register as regForecastSimple } from './cross/forecast-simple.js';
import { register as regCompareShares } from './cross/compare-shares.js';
import { register as regGetRecentInsights } from './cross/get-recent-insights.js';

export function registerAllTools(): void {
  // Performance (7)
  regGetRevenue();
  regGetAov();
  regGetOrdersCount();
  regGetConversionRate();
  regGetLtvByCohort();
  regGetRepeatPurchaseRate();
  regGetRevenueConcentrationIndex();

  // CRO (5)
  regGetFunnelMetrics();
  regGetCartAbandonment();
  regGetCheckoutDropoff();
  regGetSessionQuality();
  regGetLandingPagePerformance();

  // CRM (6)
  regGetRfmDistribution();
  regGetRfmShifts();
  regGetAtRiskCustomers();
  regGetReactivationCandidates();
  regGetNewVsReturning();
  regGetCustomerConcentration();

  // Growth (4)
  regGetRevenueMix();
  regGetGrowthDecomposition();
  regGetAcquisitionBySource();
  regComparePeriods();

  // Regional (3)
  regGetOrdersByState();
  regGetRegionShareShifts();
  regGetStatePerformance();

  // Products (5)
  regGetTopProducts();
  regGetProductVelocityChanges();
  regGetDeadInventory();
  regGetProductSeasonality();
  regGetBasketAnalysis();

  // Traffic (4)
  regGetRoasByChannel();
  regGetSpendEfficiency();
  regGetAttributionSummary();
  regGetCreativeTopPerformers();

  // Cross-cutting (6)
  regQueryAnomalies();
  regGetCorrelation();
  regCohortAnalysis();
  regForecastSimple();
  regCompareShares();
  regGetRecentInsights();
}
