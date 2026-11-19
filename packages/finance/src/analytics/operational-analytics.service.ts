import { DailyOperationsInput, DerivedOperationalMetrics } from '@prozo/shared';

/**
 * Calculates deterministic operational throughput and efficiency metrics.
 * Does not calculate any ratio when its denominator is zero or required input is unavailable.
 */
export function calculateOperationalMetrics(
  input: DailyOperationsInput | null | undefined
): DerivedOperationalMetrics {
  if (!input) {
    return {
      averageOrderLines: null,
      unitsPerOrder: null,
      ordersPerOperatingHour: null,
      returnsRate: null
    };
  }

  const outboundOrders = Number(input.outboundOrders);
  const orderLinesProcessed = Number(input.orderLinesProcessed);
  const unitsProcessed = Number(input.unitsProcessed);
  const operatingHours = Number(input.operatingHours);
  const returnsProcessed = Number(input.returnsProcessed);

  const averageOrderLines =
    outboundOrders > 0 && !isNaN(orderLinesProcessed)
      ? Number((orderLinesProcessed / outboundOrders).toFixed(4))
      : null;

  const unitsPerOrder =
    outboundOrders > 0 && !isNaN(unitsProcessed)
      ? Number((unitsProcessed / outboundOrders).toFixed(4))
      : null;

  const ordersPerOperatingHour =
    operatingHours > 0 && !isNaN(outboundOrders)
      ? Number((outboundOrders / operatingHours).toFixed(4))
      : null;

  const returnsRate =
    outboundOrders > 0 && !isNaN(returnsProcessed)
      ? Number(((returnsProcessed / outboundOrders) * 100).toFixed(4))
      : null;

  return {
    averageOrderLines,
    unitsPerOrder,
    ordersPerOperatingHour,
    returnsRate
  };
}
