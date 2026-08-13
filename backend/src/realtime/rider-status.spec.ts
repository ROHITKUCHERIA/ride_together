import { computeRiderStatus, RiderStatus } from './rider-status';

const LIVE = 15_000;
const DELAYED = 60_000;

describe('computeRiderStatus', () => {
  it('is LIVE when the fix is fresh', () => {
    expect(computeRiderStatus(0, LIVE, DELAYED)).toBe(RiderStatus.LIVE);
    expect(computeRiderStatus(5_000, LIVE, DELAYED)).toBe(RiderStatus.LIVE);
    expect(computeRiderStatus(14_999, LIVE, DELAYED)).toBe(RiderStatus.LIVE);
  });

  it('is DELAYED between the live and delayed thresholds', () => {
    expect(computeRiderStatus(15_000, LIVE, DELAYED)).toBe(RiderStatus.DELAYED);
    expect(computeRiderStatus(45_000, LIVE, DELAYED)).toBe(RiderStatus.DELAYED);
    expect(computeRiderStatus(59_999, LIVE, DELAYED)).toBe(RiderStatus.DELAYED);
  });

  it('is OFFLINE beyond the delayed threshold', () => {
    expect(computeRiderStatus(60_000, LIVE, DELAYED)).toBe(RiderStatus.OFFLINE);
    expect(computeRiderStatus(300_000, LIVE, DELAYED)).toBe(
      RiderStatus.OFFLINE,
    );
  });

  it('treats small negative age (clock skew) as LIVE', () => {
    expect(computeRiderStatus(-1, LIVE, DELAYED)).toBe(RiderStatus.LIVE);
  });
});
