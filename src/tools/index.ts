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

  // CRM
  regGetRfmDistribution();
  regGetRfmShifts();
  regGetAtRiskCustomers();
  regGetReactivationCandidates();
  regGetNewVsReturning();
  regGetCustomerConcentration();

  // Growth
  regGetRevenueMix();
  regGetGrowthDecomposition();
  regGetAcquisitionBySource();
  regComparePeriods();

  // Tarefas 6-7 vao popular as outras 18 tools
}
