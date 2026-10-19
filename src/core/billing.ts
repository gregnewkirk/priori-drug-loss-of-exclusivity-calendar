import { Actor, log } from 'apify';

// Priori operational scaffold: pay-per-event billing. Under Apify PPE an event is
// billed only when we call Actor.charge(). The caller charges BEFORE delivering
// and delivers only what was actually charged, so nothing unpaid ships. Delivery
// (`charged`) and continuation (`stop`) are reported separately so a charge that
// succeeds AND simultaneously reaches the spend limit still delivers its record
// and only then stops.

export const EVENTS = {
  DRUG_LOE_RECORD: 'drug-loe-record',
  COMPANY_LOE_CALENDAR: 'company-loe-calendar',
} as const;

export type BillableEvent = (typeof EVENTS)[keyof typeof EVENTS];

export interface ChargeOutcome {
  charged: boolean; // this unit was actually billed, so it may be delivered
  stop: boolean; // do not attempt any further charges (limit reached or error)
}

export async function chargeForResult(
  eventName: BillableEvent,
  count = 1,
): Promise<ChargeOutcome> {
  try {
    const result = (await Actor.charge({ eventName, count })) as
      | { eventChargeLimitReached?: boolean; chargedCount?: number }
      | undefined;

    const reported = result?.chargedCount;
    // Charged when the SDK confirms the full count, or when it reports no count
    // at all (e.g. local PPE test mode) and did not otherwise reject.
    const charged = typeof reported === 'number' ? reported >= count : true;
    const stop =
      result?.eventChargeLimitReached === true ||
      (typeof reported === 'number' && reported < count);

    if (!charged) {
      log.warning(`Charge not applied for "${eventName}" (charged ${reported ?? 'n/a'}/${count}); stopping.`);
    } else if (stop) {
      log.info(`Charged "${eventName}"; spend limit now reached, stopping after this unit.`);
    }
    return { charged, stop };
  } catch (err) {
    log.exception(err as Error, `Charge failed for "${eventName}"; stopping delivery (nothing charged).`);
    return { charged: false, stop: true };
  }
}
