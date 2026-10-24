import { describe, it, expect } from 'vitest';
import { SALE_STATUSES, netOrderTotal, fetchRefundedQuantities } from '../src/tools/util.js';

describe('regra de venda com reembolso parcial', () => {
  it('conta PARTIALLY_REFUNDED como venda', () => {
    expect(SALE_STATUSES).toEqual(['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED']);
  });

  it('valor do pedido sai sem o devolvido', () => {
    expect(netOrderTotal({ total_price: '242.41', refunded_amount: '99.90' })).toBeCloseTo(142.51, 2);
    expect(netOrderTotal({ total_price: 100 })).toBe(100);
    expect(netOrderTotal({ total_price: null, refunded_amount: null })).toBe(0);
  });

  it('unidades devolvidas por item vem da view do gestor', async () => {
    const calls: Array<{ table: string; ids: number[] }> = [];
    const sb = {
      from: (table: string) => ({
        select: () => ({
          in: async (_col: string, ids: number[]) => {
            calls.push({ table, ids });
            return {
              data: [{ order_id: 7, shopify_line_item_id: 'gid://shopify/LineItem/1', refunded_quantity: 2 }],
              error: null,
            };
          },
        }),
      }),
    };
    const m = await fetchRefundedQuantities(sb, [7]);
    expect(calls).toEqual([{ table: 'v_line_item_refunds', ids: [7] }]);
    expect(m.get('7|gid://shopify/LineItem/1')).toBe(2);
    expect((await fetchRefundedQuantities(sb, [])).size).toBe(0);
  });
});
